// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
const pdf = require("pdf-parse");

import { WorkspaceCache } from "./cache";

const normalizeWord = (word: string): string => {
  return word.toLowerCase().replaceAll(/\W/g, "");
};

const padLeft = (
  string: string,
  targetLength: number,
  paddingChar: string
): string => {
  let padStr = "";

  for (let i = 0; i < targetLength - string.length; i++) {
    padStr += paddingChar;
  }

  return padStr + string;
};

const strftime = (
  date: Date | undefined = undefined,
  format: string
): string => {
  if (!date) date = new Date();

  format = format.replaceAll("%Y", date.getFullYear().toString());
  format = format.replaceAll(
    "%m",
    padLeft((date.getMonth() + 1).toString(), 2, "0")
  );
  format = format.replaceAll("%d", padLeft(date.getDate().toString(), 2, "0"));
  format = format.replaceAll("%H", padLeft(date.getHours().toString(), 2, "0"));
  format = format.replaceAll(
    "%M",
    padLeft(date.getMinutes().toString(), 2, "0")
  );
  format = format.replaceAll(
    "%S",
    padLeft(date.getSeconds().toString(), 2, "0")
  );
  format = format.replaceAll("%z", date.getTimezoneOffset().toString());

  return format;
};

const readPDFFile = async (
  path: string
): Promise<{ words: string[]; wordCount: Record<string, number> }> => {
  try {
    const config = vscode.workspace.getConfiguration("testPDFExtractor.debug");
    console.time("fs.readFile");
    const data = await fs.readFile(path);
    console.timeEnd("fs.readFile");
    console.time("pdf");
    const pdfData = await pdf(data);
    console.timeEnd("pdf");

    if (config.get("generateProcessingOutput")) {
      await fs.writeFile(path + ".rawdata.json", JSON.stringify(pdfData));
    }

    const replacements = [
      ["̈\no", "ö"], // LaTeX Formatting weirdness
      ["̈\nu", "ü"], // LaTeX Formatting weirdness
      ["̈\na", "ä"], // LaTeX Formatting weirdness
      ["̈\nO", "Ö"], // LaTeX Formatting weirdness
      ["̈\nU", "Ü"], // LaTeX Formatting weirdness
      ["̈\nA", "Ä"], // LaTeX Formatting weirdness
      [/▶\n+/g, "- "], // LaTeX Formatting weirdness
      [/[„“]/g, '"'], // Normalize Quotes
      ["’", "'"], // Normalize Apostrophes
      ["–", "-"], // Normalize Dashes
      [/\n\n+/g, "\n\n"], // Remove duplicate blank lines
      [/  +/g, " "], // Remove duplicate whitespace
      ["\n \n", "\n"],
      ["\n ö", "ö"],
      ["\n ü", "ü"],
      ["\n ä", "ä"],
      ["\n Ö", "Ö"],
      ["\n Ü", "Ü"],
      ["\n Ä", "Ä"],
      [/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2"],
      [/([0-9]+)/g, " $1 "],
      // [/([^a-zA-ZäöüßÄÖÜß@/:\n])/g, " $1 "], // Macht Probleme
    ];

    let words: string = pdfData.text;
    const wordCount: Record<string, number> = {};
    replacements.forEach((replacement) => {
      words = words.replaceAll(replacement[0], replacement[1].toString());
    });
    words = words.trim();

    if (config.get("generateProcessingOutput")) {
      await fs.writeFile(
        path + ".modified.json",
        JSON.stringify({ text: words })
      );
    }

    let splitLines: string[] = words.split("\n");

    if (config.get("generateProcessingOutput")) {
      await fs.writeFile(
        path + ".lines.json",
        JSON.stringify({ text: splitLines })
      );
    }

    let splitWords: string[] = [];

    splitLines.forEach((line) => {
      let words: string[] = line.split(" ").filter((v) => {
        return !!v && v.length > 0;
      });

      words.forEach((word) => {
        const normalized = normalizeWord(word);
        splitWords.push(word);
        if (normalized.length > 0) {
          wordCount[normalized] = (wordCount[normalized] ?? 0) + 1;
        }
      });
    });

    return { words: [...new Set(splitWords)], wordCount: wordCount };
  } catch (err) {
    console.log(err);
  }

  return { words: [], wordCount: {} };
};

const toggleEmphasis = async (
  textEditor: vscode.TextEditor,
  symbol: string
) => {
  await textEditor.edit((editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const sourceText = textEditor.document.getText(selection);

      if (sourceText.startsWith(symbol) || sourceText.endsWith(symbol)) {
        editBuilder.replace(
          selection,
          sourceText.substring(1, sourceText.length - 1)
        );
      } else {
        editBuilder.replace(selection, symbol + sourceText + symbol);
      }
    });
  });
};

export function activate(context: vscode.ExtensionContext) {
  /* Remove duplicate blank lines and add newline at the end of the document in Typst files */
  vscode.workspace.onWillSaveTextDocument(async (e) => {
    if (vscode.window.activeTextEditor?.document !== e.document) return;
    if (e.document.languageId !== "typst") return;

    await vscode.window.activeTextEditor.edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(
          e.document.lineAt(0).range.start,
          e.document.lineAt(e.document.lineCount - 1).range.end
        ),
        e.document
          .getText()
          .replaceAll(/(\r?\n)(\r?\n)+/g, "\n\n")
          .replace(/(\r?\n)+$/, "") + "\n"
      );
    });
  });

  const toggleBold = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.typst.toggleBold",
    async (textEditor) => {
      await toggleEmphasis(textEditor, "*");
    }
  );

  const toggleItalic = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.typst.toggleItalic",
    async (textEditor) => {
      await toggleEmphasis(textEditor, "_");
    }
  );

  const createExcalidraw = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.createExcalidraw",
    async (textEditor) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        textEditor.document.uri
      );
      const config = vscode.workspace.getConfiguration("testPDFExtractor");

      if (!workspaceFolder) {
        vscode.window.showErrorMessage("Current file is not saved to a folder");
        return;
      }

      const fileName = await vscode.window.showInputBox({
        prompt: "Please specify a filename for your Excalidraw file",
        value: strftime(new Date(), config.get("defaultExcalidrawName") ?? ""),
      });

      const imgFolder = workspaceFolder.uri.with({
        path: workspaceFolder.uri.path + `/img/${fileName}.excalidraw.png`,
      }).fsPath;

      await fs.writeFile(imgFolder, "");

      if (textEditor.document.languageId === "typst") {
        await textEditor.insertSnippet(
          new vscode.SnippetString(
            `#image("./img/${fileName}.excalidraw.png", alt: "\${1:alt}")$0`
          )
        );
        return;
      }

      await textEditor.insertSnippet(
        new vscode.SnippetString(
          `![\${1:alt}](./img/${fileName}.excalidraw.png)$0`
        )
      );
    }
  );

  const autoComplete = vscode.languages.registerCompletionItemProvider(
    vscode.workspace
      .getConfiguration("testPDFExtractor")
      .get("supportedLanguages") ?? ["markdown", "typst"],
    {
      provideCompletionItems: async (document, position) => {
        const config = vscode.workspace.getConfiguration("testPDFExtractor");
        const cache = new WorkspaceCache(context, "testPDFExtractor_cache");

        /*
          let t = new vscode.CompletionItem("Less or equal"); // Needed for later
          t.insertText = new vscode.SnippetString("$$1 \\leq $2$$0");
        */

        const loadingTimerName =
          "Loading Document - " +
          (config.get("debug.disableCache") ? "No cache" : "Cache enabled");
        console.time(loadingTimerName);
        if (
          cache.isExpired() ||
          config.get("pdfPath") !== cache.get("cachedPath") ||
          config.get("debug.disableCache")
        ) {
          let { words: w, wordCount } = await readPDFFile(
            config.get("pdfPath") ?? ""
          );

          w = w.filter((v) => {
            return v.length > 1 && v.length > wordCount[normalizeWord(v)];
          });

          await cache.update({
            words: w,
            wordCount: wordCount,
            cachedPath: config.get("pdfPath"),
          });
        }

        const completionItems = [];
        const words = cache.get("words");

        console.timeEnd(loadingTimerName);

        for (let i = 0; i < words.length; i++) {
          const element = words[i];

          const completion = new vscode.CompletionItem(element);
          // testCompletion.kind = vscode.CompletionItemKind.Value; // For Sentences
          completion.kind = vscode.CompletionItemKind.Text;

          completionItems.push(completion);
        }

        const excalidrawCompletion = new vscode.CompletionItem(
          "Excalidraw Image"
        );
        excalidrawCompletion.insertText = "";
        excalidrawCompletion.command = {
          title: "Create Excalidraw Image",
          command: "testPDFExtractor.createExcalidraw",
        };
        completionItems.push(excalidrawCompletion);

        return completionItems;
      },
    }
  );

  context.subscriptions.push(
    autoComplete,
    toggleBold,
    toggleItalic,
    createExcalidraw
  );
}

export function deactivate() {}
