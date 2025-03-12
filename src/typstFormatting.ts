import * as vscode from "vscode";

const toggleEmphasis = async (
  textEditor: vscode.TextEditor,
  symbol: string,
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
          selection.start,
        );
        return;
      }

      if (sourceText.startsWith(symbol) || sourceText.endsWith(symbol)) {
        editBuilder.replace(
          selection,
          sourceText.substring(1, sourceText.length - 1),
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
          e.document.lineAt(e.document.lineCount - 1).range.end,
        ),
        e.document
          .getText()
          .replaceAll(/(\r?\n)(\r?\n)+/g, "\n\n")
          .replace(/(\r?\n)+$/, "") + "\n",
      );
    });
  });

  const toggleBold = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.typst.toggleBold",
    async (textEditor) => {
      await toggleEmphasis(textEditor, "*");
    },
  );

  const toggleItalic = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.typst.toggleItalic",
    async (textEditor) => {
      await toggleEmphasis(textEditor, "_");
    },
  );

  context.subscriptions.push(toggleBold, toggleItalic);
}
