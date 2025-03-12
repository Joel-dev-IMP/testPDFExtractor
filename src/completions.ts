import * as vscode from "vscode";

import { WorkspaceCache } from "./cache";
import { normalizeWord, readPDF } from "./readPDF";

interface PDFExtractorCache {
  date: number;
  cachedPath: string;
  words: string[];
  lines: string[];
  wordCount: Record<string, number>;
}

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

  const autoComplete = vscode.languages.registerCompletionItemProvider(
    configuredLanguages,
    {
      provideCompletionItems: async (_document, _position) => {
        const config = vscode.workspace.getConfiguration("testPDFExtractor");
        const cache = new WorkspaceCache<PDFExtractorCache>(
          context,
          "testPDFExtractor_cache",
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
          "Excalidraw Image",
        );
        excalidrawCompletion.insertText = "";
        excalidrawCompletion.command = {
          title: "Create Excalidraw Image",
          command: "testPDFExtractor.createExcalidraw",
        };
        completionItems.push(excalidrawCompletion);

        return completionItems;
      },
    },
  );

  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, _context, _token) {
      const config = vscode.workspace.getConfiguration(
        "testPDFExtractor.experimental",
      );
      const result: vscode.InlineCompletionList = {
        items: [],
      };

      if (!config.get("enableLineCompletion")) {
        return result;
      }

      let lineContent: string = document.getText(
        new vscode.Range(position.line, 0, position.line, Infinity),
      );

      lineContent = lineContent.replaceAll(/(\d)\./g, "$1__DOT__");
      const sentences: string[] = lineContent.split(".");
      const lastSentence = sentences[sentences.length - 1].replaceAll(
        "__DOT__",
        ".",
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
        "testPDFExtractor_cache",
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
                  line.toLowerCase(),
                ),
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
      provider,
    );
  }

  context.subscriptions.push(autoComplete);
}
