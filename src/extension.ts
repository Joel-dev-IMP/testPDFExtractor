// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

import { WorkspaceCache } from "./cache";
import { readPDF, normalizeWord } from "./readPDF";

interface PDFExtractorCache {
  date: number;
  cachedPath: string;
  words: string[];
  lines: string[];
  wordCount: Record<string, number>;
}

const strftime = (
  date: Date | undefined = undefined,
  format: string
): string => {
  if (!date) {
    date = new Date();
  }

  format = format.replaceAll("%Y", date.getFullYear().toString());
  format = format.replaceAll(
    "%m",
    (date.getMonth() + 1).toString().padStart(2, "0")
  );
  format = format.replaceAll("%d", date.getDate().toString().padStart(2, "0"));
  format = format.replaceAll("%H", date.getHours().toString().padStart(2, "0"));
  format = format.replaceAll(
    "%M",
    date.getMinutes().toString().padStart(2, "0")
  );
  format = format.replaceAll(
    "%S",
    date.getSeconds().toString().padStart(2, "0")
  );
  format = format.replaceAll("%z", date.getTimezoneOffset().toString());

  return format;
};

const toggleEmphasis = async (
  textEditor: vscode.TextEditor,
  symbol: string
) => {
  await textEditor.edit((editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const sourceText = textEditor.document.getText(selection);

      if (
        selection.isEmpty &&
        selection.start.isEqual(textEditor.selection.active)
      ) {
        textEditor.insertSnippet(
          new vscode.SnippetString(symbol + "$1" + symbol + "$0"),
          selection.start
        );
        return;
      }

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

/**
 * Given an original string, find the first index in a target string, such that
 * all characters of the original string have appeared in order.
 * @param original The original string
 * @param target The target string
 */
const determineSubstringIndex = (original: string, target: string): number => {
  let substringIndex = 0;

  let i = 0;
  while (i < original.length && substringIndex < target.length) {
    if (original[i] == target[substringIndex]) {
      i++;
    }
    substringIndex++;
  }
  return substringIndex;
};

export function activate(context: vscode.ExtensionContext) {
  const configuredLanguages: string[] = vscode.workspace
    .getConfiguration("testPDFExtractor")
    .get("supportedLanguages") ?? ["markdown", "typst"];

  /* Remove duplicate blank lines and add newline at the end of the document in Typst files */
  vscode.workspace.onWillSaveTextDocument(async (e) => {
    if (vscode.window.activeTextEditor?.document !== e.document) {
      return;
    }

    if (e.document.languageId !== "typst") {
      return;
    }

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
      const config = vscode.workspace.getConfiguration(
        "testPDFExtractor.excalidraw"
      );

      if (textEditor.document.isUntitled) {
        vscode.window.showErrorMessage("Current file is not saved to a folder");
        return;
      }

      const fileName = await vscode.window.showInputBox({
        prompt: "Please specify a filename for your Excalidraw file",
        value: strftime(new Date(), config.get("defaultName") ?? ""),
      });

      if (!fileName) {
        vscode.window.showInformationMessage(
          "Aborted Excalidraw image creation"
        );
        return;
      }

      const currentFileDirectory = path.dirname(textEditor.document.uri.fsPath);
      const targetFilePath = path.resolve(
        currentFileDirectory,
        path.normalize(
          `${config.get("imageLocation")}/${fileName}.excalidraw.png`
        )
      );

      await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
      await fs.writeFile(targetFilePath, "");
      const insertPath = path
        .normalize(`${config.get("imageLocation")}/${fileName}.excalidraw.png`)
        .replaceAll("\\", "/");

      if (textEditor.document.languageId === "typst") {
        await textEditor.insertSnippet(
          new vscode.SnippetString(
            `#image("${insertPath}", alt: "\${1:alt}")$0`
          )
        );
        return;
      }

      await textEditor.insertSnippet(
        new vscode.SnippetString(`![\${1:alt}](${insertPath})$0`)
      );
    }
  );

  const autoComplete = vscode.languages.registerCompletionItemProvider(
    configuredLanguages,
    {
      provideCompletionItems: async (_document, _position) => {
        const config = vscode.workspace.getConfiguration("testPDFExtractor");
        const cache = new WorkspaceCache<PDFExtractorCache>(
          context,
          "testPDFExtractor_cache"
        );

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
          let {
            words: w,
            // eslint-disable-next-line prefer-const
            wordCount,
            // eslint-disable-next-line prefer-const
            lines,
          } = await readPDF(config.get("pdfPath") ?? "");

          w = w.filter((v) => {
            return v.length > 1 && v.length > wordCount[normalizeWord(v)];
          });

          await cache.update({
            words: w,
            wordCount: wordCount,
            lines: lines,
            cachedPath: config.get("pdfPath") ?? "",
          });
        }

        const completionItems = [];
        const words = cache.get("words") ?? [];

        console.timeEnd(loadingTimerName);

        for (const element of words) {
          const completion = new vscode.CompletionItem(element);
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

  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, _context, _token) {
      const config = vscode.workspace.getConfiguration(
        "testPDFExtractor.experimental"
      );
      const result: vscode.InlineCompletionList = {
        items: [],
      };

      if (!config.get("enableLineCompletion")) {
        return result;
      }

      let lineContent: string = document.getText(
        new vscode.Range(position.line, 0, position.line, Infinity)
      );

      lineContent = lineContent.replaceAll(/(\d)\./g, "$1__DOT__");
      const sentences: string[] = lineContent.split(".");
      const lastSentence = sentences[sentences.length - 1].replaceAll(
        "__DOT__",
        "."
      );
      const lastFewWords = lineContent.match(/((?:\S+? ){3})$/g)?.[0] ?? "";

      let compareString = lastSentence;

      if (
        lastFewWords.length !== 0 &&
        lastFewWords.length < compareString.length
      ) {
        compareString = lastFewWords;
      }

      console.log(compareString);
      // TODO: Better detection

      // Avoid triggering autocompletion too fast
      if (compareString.trim().length < 2) {
        return result;
      }

      const cache = new WorkspaceCache<PDFExtractorCache>(
        context,
        "testPDFExtractor_cache"
      );

      for (const line of cache.get("lines") ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _t = line
          .replaceAll(" ", "")
          .toLowerCase()
          .indexOf(compareString.replaceAll(" ", "").toLowerCase());

        if (
          line
            .replaceAll(" ", "")
            .toLowerCase()
            .indexOf(compareString.replaceAll(" ", "").toLowerCase()) >= 0
        ) {
          result.items.push({
            insertText: line
              .substring(
                determineSubstringIndex(
                  compareString.trimEnd().toLowerCase(),
                  line.toLowerCase()
                )
              )
              .trimStart(),
          });
        }
      }

      return result;
    },
  };

  for (const language of configuredLanguages) {
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**", language: language },
      provider
    );
  }

  context.subscriptions.push(
    autoComplete,
    toggleBold,
    toggleItalic,
    createExcalidraw
  );
}

export function deactivate() {}
