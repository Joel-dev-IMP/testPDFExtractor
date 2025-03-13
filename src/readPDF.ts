import * as vscode from "vscode";

import * as fs from "fs/promises";

import * as pdf from "pdf-parse";

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
    [/■\n*/g, "- "],
    [/□\n*/g, "- "],
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
    [/"\n+/g, '"'],
  ];

  static wordSplitting = [
    [/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2"],
    [/([0-9]+)/g, " $1 "],
    [/([^a-zA-ZäöüßÄÖÜß@/:\n0-9])/g, " $1 "], // Macht Probleme, verbessern!
  ];

  static preprocessWordSplitting(text: string): string {
    this.wordSplitting.forEach((replacement) => {
      text = text.replaceAll(replacement[0], replacement[1].toString());
    });
    return text;
  }
}

export class TextProcessor {
  private text: string;
  private lines: string[];
  private words: string[];
  private wordCount: Record<string, number>;

  constructor(text: string) {
    this.text = text;
    this.preprocessingHelper(PreprocessingReplacements.latexFormatting);
    this.preprocessingHelper(PreprocessingReplacements.normalization);
    this.preprocessingHelper(PreprocessingReplacements.whitespace);
    this.text = this.text.trim();

    this.lines = this.text.split("\n");

    this.words = [];
    this.wordCount = {};

    this.lines.forEach((line) => {
      const words: string[] = PreprocessingReplacements.preprocessWordSplitting(
        line,
      )
        .split(" ")
        .filter((v) => {
          return !!v && v.length > 0;
        });

      words.forEach((word) => {
        const normalized = normalizeWord(word);
        this.words.push(word);
        if (normalized.length > 0) {
          this.wordCount[normalized] = (this.wordCount[normalized] ?? 0) + 1;
        }
      });
    });
  }

  public getText(): string {
    return this.text;
  }

  public getLines(): string[] {
    return this.lines;
  }

  public getWords(): string[] {
    return this.words;
  }

  public getWordCount(): Record<string, number> {
    return this.wordCount;
  }

  public getProcessedData(): {
    words: string[];
    wordCount: Record<string, number>;
    lines: string[];
  } {
    return {
      words: [...new Set(this.words)],
      lines: [...new Set(this.lines)],
      wordCount: this.wordCount,
    };
  }

  private preprocessingHelper(replacements: (string | RegExp)[][]) {
    replacements.forEach((replacement) => {
      this.text = this.text.replaceAll(
        replacement[0],
        replacement[1].toString(),
      );
    });
  }
}

export const readPDF = async (
  path: string,
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

    const processor: TextProcessor = new TextProcessor(pdfData.text);

    if (config.get("generateProcessingOutput")) {
      await fs.writeFile(path + ".rawdata.json", JSON.stringify(pdfData));

      await fs.writeFile(
        path + ".modified.json",
        JSON.stringify({ text: processor.getText() }),
      );

      await fs.writeFile(
        path + ".lines.json",
        JSON.stringify({ text: processor.getLines() }),
      );
    }

    return processor.getProcessedData();
  } catch (err) {
    console.log(err);
  }

  return { words: [], lines: [], wordCount: {} };
};
