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

const readPDFFile = async (path) => {
  try {
    const data = await fs.readFile(path);
    const pdfData = await pdf(data);

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
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "testPDFExtractor" is now active!'
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

        console.log(document);
        console.log(vscode.window.activeTextEditor.selection);

        if (
          cache.isExpired() ||
          config.get("pdfPath") !== cache.get("cachedPath")
        ) {
          let { words: w, wordCount } = await readPDFFile(
            config.get("pdfPath")
          );

          w = w.filter((v) => {
            return v.length > 1 && v.length > wordCount[normalizeWord(v)];
          });

          console.log(w);

          await cache.update({
            words: w,
            wordCount: wordCount,
            cachedPath: config.get("pdfPath"),
          });
        }

        const completionItems = [];
        const words = cache.get("words");

        for (let i = 0; i < words.length; i++) {
          const element = words[i];

          const completion = new vscode.CompletionItem(element);
          // testCompletion.kind = vscode.CompletionItemKind.Value; // For Sentences
          completion.kind = vscode.CompletionItemKind.Text;

          completionItems.push(completion);
        }

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
