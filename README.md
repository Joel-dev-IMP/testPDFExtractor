# testPDFExtractor

Early WIP version for a VSCode extension that allows to extract words from lecture slides.

## Features

> Warning: Features are still in development and not yet fully functional. Breaking changes are possible, without prior notice.
> Use at your own risk.

testPDFExtractor (Name will be changed to something more meaningful later) is an extension for suggesting words from PDF files. The goal of this extension is to speed up taking notes in Markdown or Typst documents during lectures.

Currently, the extension offers the following features:

- Suggest words from PDF files
- Quickly create new Excalidraw diagrams and insert them as images
- Add enhancements to editing Typst documents like easy bold and italic toggling or automatically removing duplicate blank lines and adding a newline at the end of the file on save.
- Updating the Markdown and Typst language configurations to allow sourrounding text with code and math blocks

## Planned Features

- Extract whole sentences from lecture slides (WIP)
- Extract and suggest Math blocks from lecture slides and from the current document
- Add enhancements for creating lists in Typst documents

## Extension Settings

- `testPDFExtractor.supportedLanguages`: Languages, where Test PDF Extractor will be enabled.
- `testPDFExtractor.pdfPath`: Path to the PDF, where the completion items should be extracted from.
- `testPDFExtractor.excalidraw.defaultName`: The default file name for new Excalidraw Files (will be suggested). Supports dates using Python strftime syntax.
- `testPDFExtractor.excalidraw.imageFolder`: The folder, where the Excalidraw images should be saved to.
- `testPDFExtractor.experimental.enableLineCompletion`: Enable the completion of entire lines of text.

Debug options:

- `testPDFExtractor.debug.generateProcessingOutput`: Write the output of the PDF processing to a JSON file
- `testPDFExtractor.debug.disableCache`: Disable Cache for debugging purposes
