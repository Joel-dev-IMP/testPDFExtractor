import * as vscode from "vscode";
import * as fs from "fs/promises";
const pdf = require("pdf-parse");

export const normalizeWord = (word: string): string => {
  return word.toLowerCase().replaceAll(/\W/g, "");
};

class PreprocessingReplacements {
  static latexFormatting = [
    ["̈\no", "ö"],
    ["̈\nu", "ü"],
    ["̈\na", "ä"],
    ["̈\nO", "Ö"],
    ["̈\nU", "Ü"],
    ["̈\nA", "Ä"],
    [/▶\n+/g, "- "],
    [/▷\n*/g, "- "],
    ["\n ö", "ö"],
    ["\n ü", "ü"],
    ["\n ä", "ä"],
    ["\n Ö", " Ö"],
    ["\n Ü", " Ü"],
    ["\n Ä", " Ä"],
    ["↵", "ff"],
    ["", " lt.eq "],
    ["✓", " subset.eq "],
    ["⇥", " times "],
    ["\n⇤", "^*"],
  ];
  static normalization = [
    [/[„“”]/g, '"'],
    ["’", "'"],
    ["–", "-"],
  ];
  static whitespace = [
    [/\n\n+/g, "\n\n"], // Remove duplicate blank lines
    [/\n +\n/g, "\n"], // Remove lines with only spaces
    [/  +/g, " "], // Remove duplicate whitespace
    [/\"\n+/g, '"'],
  ];

  static wordSplitting = [
    [/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2"],
    [/([0-9]+)/g, " $1 "],
    [/([^a-zA-ZäöüßÄÖÜß@/:\n0-9])/g, " $1 "], // Macht Probleme, verbessern!
  ];

  static preprocessLatex(text: string): string {
    return this.preprocessingHelper(text, this.latexFormatting);
  }

  static preprocessNormalization(text: string): string {
    return this.preprocessingHelper(text, this.normalization);
  }

  static preprocessWhitespace(text: string): string {
    return this.preprocessingHelper(text, this.whitespace);
  }

  static preprocessWordSplitting(text: string): string {
    return this.preprocessingHelper(text, this.wordSplitting);
  }

  private static preprocessingHelper(
    text: string,
    replacements: (string | RegExp)[][]
  ): string {
    replacements.forEach((replacement) => {
      text = text.replaceAll(replacement[0], replacement[1].toString());
    });
    return text;
  }
}

export const readPDF = async (
  path: string
): Promise<{
  words: string[];
  wordCount: Record<string, number>;
  lines: string[];
}> => {
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

    let words: string = pdfData.text;
    const wordCount: Record<string, number> = {};

    words = PreprocessingReplacements.preprocessLatex(words);
    words = PreprocessingReplacements.preprocessNormalization(words);
    words = PreprocessingReplacements.preprocessWhitespace(words);
    words = PreprocessingReplacements.preprocessWordSplitting(words);
    words = PreprocessingReplacements.preprocessWhitespace(words);
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

    return {
      words: [...new Set(splitWords)],
      lines: [...new Set(splitLines)],
      wordCount: wordCount,
    };
  } catch (err) {
    console.log(err);
  }

  return { words: [], lines: [], wordCount: {} };
};
