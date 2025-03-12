import * as vscode from "vscode";

import * as commands from "./commands";
import * as completions from "./completions";
import * as typstFormatting from "./typstFormatting";

export function activate(context: vscode.ExtensionContext) {
  commands.activate(context);
  completions.activate(context);
  typstFormatting.activate(context);
}

export function deactivate() {}
