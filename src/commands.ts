import * as vscode from "vscode";

import * as fs from "fs/promises";
import * as path from "path";

const strftime = (
  date: Date | undefined = undefined,
  format: string,
): string => {
  if (!date) {
    date = new Date();
  }

  format = format.replaceAll("%Y", date.getFullYear().toString());
  format = format.replaceAll(
    "%m",
    (date.getMonth() + 1).toString().padStart(2, "0"),
  );
  format = format.replaceAll("%d", date.getDate().toString().padStart(2, "0"));
  format = format.replaceAll("%H", date.getHours().toString().padStart(2, "0"));
  format = format.replaceAll(
    "%M",
    date.getMinutes().toString().padStart(2, "0"),
  );
  format = format.replaceAll(
    "%S",
    date.getSeconds().toString().padStart(2, "0"),
  );
  format = format.replaceAll("%z", date.getTimezoneOffset().toString());

  return format;
};

const createImage = async (
  textEditor: vscode.TextEditor,
  config: vscode.WorkspaceConfiguration,
  fileExtension: String,
) => {
  if (textEditor.document.isUntitled) {
    vscode.window.showErrorMessage("Current file is not saved to a folder");
    return;
  }

  const fileName = await vscode.window.showInputBox({
    prompt: "Please specify a filename",
    value: strftime(new Date(), config.get("defaultName") ?? ""),
  });

  if (!fileName) {
    vscode.window.showInformationMessage("Aborted image creation");
    return;
  }

  const currentFileDirectory = path.dirname(textEditor.document.uri.fsPath);
  const targetFilePath = path.resolve(
    currentFileDirectory,
    path.normalize(
      `${config.get("imageLocation")}/${fileName}.${fileExtension}`,
    ),
  );

  await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
  await fs.writeFile(targetFilePath, "");
  const insertPath = path
    .normalize(`${config.get("imageLocation")}/${fileName}.${fileExtension}`)
    .replaceAll("\\", "/");

  if (textEditor.document.languageId === "typst") {
    await textEditor.insertSnippet(
      new vscode.SnippetString(`#image("${insertPath}", alt: "\${1:alt}")$0`),
    );
    return;
  }

  await textEditor.insertSnippet(
    new vscode.SnippetString(`![\${1:alt}](${insertPath})$0`),
  );
};

export function activate(context: vscode.ExtensionContext) {
  const createExcalidraw = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.createExcalidraw",
    async (textEditor) => {
      const config = vscode.workspace.getConfiguration(
        "testPDFExtractor.excalidraw",
      );

      await createImage(textEditor, config, "excalidraw.png");
    },
  );

  const createDrawIO = vscode.commands.registerTextEditorCommand(
    "testPDFExtractor.createDrawIO",
    async (textEditor) => {
      const config = vscode.workspace.getConfiguration(
        "testPDFExtractor.drawio",
      );

      await createImage(textEditor, config, "drawio.png");
    },
  );

  context.subscriptions.push(createExcalidraw);
  context.subscriptions.push(createDrawIO);
}
