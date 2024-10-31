// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const fs = require("fs/promises");
const pdf = require("pdf-parse");

const p = require("path");
const { WorkspaceCache } = require("./cache");

const normalizeWord = (word) => {
  return word.toLowerCase().replaceAll(/\W/g, "");
};

const padLeft = (string, targetLength, paddingChar) => {
  let padStr = "";

  for (let i = 0; i < targetLength - string.length; i++) {
    padStr += paddingChar;
  }

  return padStr + string;
};

const strftime = (date = undefined, format) => {
  if (!date) date = new Date();

  format = format.replaceAll("%Y", date.getFullYear());
  format = format.replaceAll("%m", date.getMonth() + 1);
  format = format.replaceAll("%d", date.getDate());
  format = format.replaceAll("%H", date.getHours());
  format = format.replaceAll(
    "%M",
    padLeft(date.getMinutes().toString(), 2, "0")
  );
  format = format.replaceAll(
    "%S",
    padLeft(date.getSeconds().toString(), 2, "0")
  );
  format = format.replaceAll("%z", date.getTimezoneOffset());

  return format;
};

const readPDFFile = async (path) => {
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
      ["̈\no", "ö"],
      ["̈\nu", "ü"],
      ["̈\na", "ä"],
      ["̈\nO", "Ö"],
      ["̈\nU", "Ü"],
      ["̈\nA", "Ä"],
      [/\n\n+/g, "\n"],
      [/  +/g, " "],
      ["\n \n", "\n"],
      ["\n ö", "ö"],
      ["\n ü", "ü"],
      ["\n ä", "ä"],
      ["\n Ö", "Ö"],
      ["\n Ü", "Ü"],
      ["\n Ä", "Ä"],
      [/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2"],
      [/([0-9]+)/g, " $1 "],
      [/(\W)/g, " $1 "],
      ["\n", " "],
    ];

    let words = pdfData.text;
    const wordCount = {};
    replacements.forEach((replacement) => {
      words = words.replaceAll(replacement[0], replacement[1]);
    });

    if (config.get("generateProcessingOutput")) {
      await fs.writeFile(
        path + ".modified.json",
        JSON.stringify({ text: words })
      );
    }

    words = words.split(" ").filter((v) => {
      return !!v && v.length > 0;
    });

    words.forEach((word) => {
      const normalized = normalizeWord(word);
      if (normalized.length > 0) {
        wordCount[normalized] = (wordCount[normalized] ?? 0) + 1;
      }
    });

    return { words: [...new Set(words)], wordCount: wordCount };
  } catch (err) {
    console.log(err);
  }
};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const createExcalidraw = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.createExcalidraw",
    async (textEditor) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        textEditor.document.uri
      );

      if (!workspaceFolder) {
        vscode.window.showErrorMessage("Current file is not saved to a folder");
        return;
      }

      const fileName = await vscode.window.showInputBox({
        prompt: "Please specify a filename for your Excalidraw file",
        value: strftime(
          new Date(),
          vscode.workspace.getConfiguration(
            "testPDFExtractor.defaultExcalidrawName"
          )
        ),
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

  let autoComplete = vscode.languages.registerCompletionItemProvider(
    vscode.workspace
      .getConfiguration("testPDFExtractor")
      .get("supportedLanguages"),
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
            config.get("pdfPath")
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
          command: "testPDFExtractor.createExcalidraw",
        };
        completionItems.push(excalidrawCompletion);

        return completionItems;
      },
    }
  );

  context.subscriptions.push(autoComplete);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
