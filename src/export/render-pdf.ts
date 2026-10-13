/**
 * ExportDocument → typeset PDF (browser only; pdfmake is loaded on demand so
 * it never weighs on normal page loads).
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { ExportDocument, Run } from "./report-document";

const INK = "#3b2f2a";
const MUTED = "#7a6d66";
const ACCENT = "#2f6aa8";
const GOLD = "#b08d3c";

/** Roboto has no astrology symbols: spell them out or drop them. */
function clean(text: string): string {
  return text.replace(/℞/g, "Rx").replace(/[☀-⛿]︎?/g, "").replace(/\s{2,}/g, " ");
}

function runs(list: readonly Run[]): Content[] {
  return list.map((run) => ({ text: clean(run.text), bold: run.bold === true, italics: run.italic === true }));
}

function rule(width: number, color: string): Content {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.8, lineColor: color }] };
}

export function toPdfDefinition(doc: ExportDocument): TDocumentDefinitions {
  const content: Content[] = [
    {
      text: (doc.kindLabel ?? "Birth chart reading").toUpperCase(),
      style: "eyebrow",
      margin: [0, doc.wheelImage !== undefined ? 40 : 170, 0, 14],
    },
    { text: clean(doc.title), style: "title" },
    { stack: [rule(80, GOLD)], alignment: "center", margin: [0, 16, 0, 16] },
    ...doc.subtitle.map((line): Content => ({ text: clean(line), style: "subtitle" })),
  ];
  if (doc.highlights.length > 0) {
    content.push({
      margin: [60, 40, 60, 0],
      columns: doc.highlights.map((h) => ({
        stack: [
          { text: h.label.toUpperCase(), style: "highlightLabel" },
          { text: clean(h.value), style: "highlightValue" },
        ],
      })),
    });
  }
  if (doc.wheelImage !== undefined) {
    content.push({ image: doc.wheelImage, width: 300, alignment: "center", margin: [0, 28, 0, 0] });
  }

  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        if (block.level === 2) {
          content.push({
            stack: [{ text: clean(block.text), style: "h2" }, rule(60, GOLD)],
            pageBreak: block.pageBreakBefore === true ? "before" : undefined,
            margin: [0, 0, 0, 14],
          });
        } else {
          content.push({ text: clean(block.text), style: "h3", headlineLevel: 1 });
        }
        break;
      case "paragraph":
        content.push({ text: runs(block.runs), style: "body" });
        break;
      case "quote":
        content.push({
          table: { widths: [3, "*"], body: [[{ text: "", fillColor: GOLD }, { text: runs(block.runs), style: "quote" }]] },
          layout: "noBorders",
          margin: [0, 6, 0, 14],
        });
        break;
      case "definitions":
        for (const item of block.items) {
          content.push({
            text: [{ text: `${clean(item.term)}  `, bold: true, color: INK }, { text: clean(item.definition) }],
            style: "definition",
          });
        }
        break;
      case "table":
        content.push({ text: block.title, style: "h3" });
        content.push({
          table: {
            widths: ["auto", "*"],
            body: block.rows.map(([a, b]) => [
              { text: clean(a), color: MUTED },
              { text: clean(b) },
            ]),
          },
          layout: "lightHorizontalLines",
          fontSize: 10,
          margin: [0, 0, 0, 16],
        });
        break;
    }
  }

  return {
    info: { title: `${doc.title} — ${doc.kindLabel ?? "Birth chart reading"}` },
    pageSize: "A4",
    pageMargins: [64, 64, 64, 72],
    content,
    // Keep a sub-heading with the paragraph that follows it.
    pageBreakBefore: (node, following) =>
      node.headlineLevel === 1 && following.getFollowingNodesOnPage().length === 0,
    footer: (currentPage, pageCount) =>
      currentPage === 1
        ? null
        : {
            columns: [
              { text: clean(doc.title), color: MUTED },
              { text: `${currentPage} / ${pageCount}`, alignment: "right", color: MUTED },
            ],
            fontSize: 8.5,
            margin: [64, 28, 64, 0],
          },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.45, color: INK },
    styles: {
      eyebrow: { fontSize: 9, characterSpacing: 3, color: ACCENT, alignment: "center", bold: true },
      title: { fontSize: 32, bold: true, alignment: "center", lineHeight: 1.1 },
      subtitle: { fontSize: 12, alignment: "center", color: MUTED },
      highlightLabel: { fontSize: 8, characterSpacing: 1.5, color: MUTED, alignment: "center" },
      highlightValue: { fontSize: 13, bold: true, alignment: "center", margin: [0, 3, 0, 0] },
      h2: { fontSize: 20, bold: true, color: INK, margin: [0, 0, 0, 6] },
      h3: { fontSize: 12.5, bold: true, color: ACCENT, margin: [0, 10, 0, 5] },
      body: { alignment: "justify", margin: [0, 0, 0, 9] },
      quote: { italics: true, fontSize: 12, color: INK, margin: [12, 4, 0, 4] },
      definition: { margin: [0, 0, 0, 6] },
    },
  };
}

export async function buildPdf(doc: ExportDocument): Promise<Blob> {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const vfs = (await import("pdfmake/build/vfs_fonts")).default;
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(toPdfDefinition(doc)).getBlob();
}
