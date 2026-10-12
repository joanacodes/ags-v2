/**
 * Download the report as PDF, Word, Markdown or plain text (browser only).
 */
import { toMarkdown, toPlainText, type ExportDocument } from "./report-document";

export type DocumentFormat = "pdf" | "docx" | "md" | "txt";

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadDocument(doc: ExportDocument, format: DocumentFormat): Promise<void> {
  switch (format) {
    case "pdf": {
      const { downloadPdf } = await import("./render-pdf");
      await downloadPdf(doc);
      return;
    }
    case "docx": {
      const { buildDocx } = await import("./render-docx");
      saveBlob(await buildDocx(doc), `${doc.fileBase}.docx`);
      return;
    }
    case "md":
      saveBlob(new Blob([toMarkdown(doc)], { type: "text/markdown;charset=utf-8" }), `${doc.fileBase}.md`);
      return;
    case "txt":
      saveBlob(new Blob([toPlainText(doc)], { type: "text/plain;charset=utf-8" }), `${doc.fileBase}.txt`);
      return;
  }
}
