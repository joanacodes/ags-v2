/**
 * Save the report as PDF, Word, Markdown or plain text (browser only).
 *
 * On iPhone and iPad the file goes through the system share sheet ("Save to
 * Files", AirDrop, Mail…): iOS ignores normal downloads, and a home-screen
 * app can't download at all. Everywhere else, Android included, it is a
 * normal download that lands in Downloads (Android's share sheet has no
 * "save" option, only apps).
 */
import { confirmDialog } from "@/components/common/confirm-dialog";
import { isIOS } from "@/lib/browser-env";
import { toMarkdown, toPlainText, type ExportDocument } from "./report-document";

export type DocumentFormat = "pdf" | "docx" | "md" | "txt";

const MIME: Readonly<Record<DocumentFormat, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  txt: "text/plain",
};

function browserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Save a file the way the device supports best. */
export async function saveFile(blob: Blob, fileName: string, title: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  const canShareFile =
    isIOS(navigator.userAgent, navigator.maxTouchPoints) &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  if (!canShareFile) {
    browserDownload(blob, fileName);
    return;
  }
  try {
    await navigator.share({ files: [file], title });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return; // closed the sheet
    // Building the file took too long for the browser to treat the share as
    // a direct tap: ask for one more tap, which re-opens the share sheet.
    const ok = await confirmDialog({
      title: "Your file is ready",
      message: `${fileName}\n\nTap Save, then choose "Save to Files" (or any app) in the menu.`,
      confirmLabel: "Save",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      await navigator.share({ files: [file], title });
    } catch (second) {
      if (second instanceof DOMException && second.name === "AbortError") return;
      browserDownload(blob, fileName);
    }
  }
}

export async function downloadDocument(doc: ExportDocument, format: DocumentFormat): Promise<void> {
  const fileName = `${doc.fileBase}.${format}`;
  let blob: Blob;
  switch (format) {
    case "pdf": {
      const { buildPdf } = await import("./render-pdf");
      blob = await buildPdf(doc);
      break;
    }
    case "docx": {
      const { buildDocx } = await import("./render-docx");
      blob = await buildDocx(doc);
      break;
    }
    case "md":
      blob = new Blob([toMarkdown(doc)], { type: `${MIME.md};charset=utf-8` });
      break;
    case "txt":
      blob = new Blob([toPlainText(doc)], { type: `${MIME.txt};charset=utf-8` });
      break;
  }
  const typed = blob.type === "" ? new Blob([blob], { type: MIME[format] }) : blob;
  await saveFile(typed, fileName, doc.title);
}
