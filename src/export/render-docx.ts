/**
 * ExportDocument → Word document (.docx), built with real Word headings and
 * styles so it can be edited, restyled or turned into a table of contents.
 * Browser only; the docx library is loaded on demand.
 */
import type { ExportDocument, Run } from "./report-document";

const INK = "3B2F2A";
const MUTED = "7A6D66";
const ACCENT = "2F6AA8";
const GOLD = "B08D3C";

export async function buildDocx(doc: ExportDocument): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    ImageRun,
    Packer,
    PageNumber,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const textRuns = (runs: readonly Run[]) =>
    runs.map((run) => new TextRun({ text: run.text, bold: run.bold === true, italics: run.italic === true }));

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: doc.wheelImage !== undefined ? 600 : 3200, after: 240 },
      children: [new TextRun({ text: "BIRTH CHART READING", bold: true, color: ACCENT, size: 18, characterSpacing: 60 })],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: doc.title })],
    }),
    ...doc.subtitle.map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: line, color: MUTED, size: 24 })],
        }),
    ),
  ];
  if (doc.highlights.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: doc.highlights.flatMap((h, i) => [
          ...(i > 0 ? [new TextRun({ text: "    ·    ", color: GOLD })] : []),
          new TextRun({ text: `${h.label} `, color: MUTED, size: 20 }),
          new TextRun({ text: h.value, bold: true, size: 24 }),
        ]),
      }),
    );
  }
  if (doc.wheelImage !== undefined) {
    const base64 = doc.wheelImage.slice(doc.wheelImage.indexOf(",") + 1);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [new ImageRun({ type: "png", data: bytes, transformation: { width: 380, height: 380 } })],
      }),
    );
  }

  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        children.push(
          new Paragraph({
            heading: block.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            pageBreakBefore: block.pageBreakBefore === true,
            keepNext: true,
            children: [new TextRun({ text: block.text })],
          }),
        );
        break;
      case "paragraph":
        children.push(new Paragraph({ style: "Body", children: textRuns(block.runs) }));
        break;
      case "quote":
        children.push(
          new Paragraph({
            style: "PullQuote",
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 12 } },
            children: textRuns(block.runs),
          }),
        );
        break;
      case "definitions":
        for (const item of block.items) {
          children.push(
            new Paragraph({
              style: "Body",
              children: [new TextRun({ text: `${item.term}  `, bold: true }), new TextRun({ text: item.definition })],
            }),
          );
        }
        break;
      case "table":
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(block.title)] }));
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: block.rows.map(
              ([a, b]) =>
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 35, type: WidthType.PERCENTAGE },
                      children: [new Paragraph({ children: [new TextRun({ text: a, color: MUTED })] })],
                    }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun(b)] })] }),
                  ],
                }),
            ),
          }),
        );
        break;
    }
  }

  const document = new Document({
    title: `${doc.title} — Birth chart reading`,
    styles: {
      default: {
        document: { run: { font: "Georgia", size: 22, color: INK } },
        title: { run: { font: "Georgia", size: 64, bold: true, color: INK } },
        heading1: {
          run: { font: "Georgia", size: 36, bold: true, color: INK },
          paragraph: {
            spacing: { after: 240 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 6 } },
          },
        },
        heading2: {
          run: { font: "Georgia", size: 25, bold: true, color: ACCENT },
          paragraph: { spacing: { before: 240, after: 100 } },
        },
      },
      paragraphStyles: [
        {
          id: "Body",
          name: "Body",
          basedOn: "Normal",
          run: { font: "Georgia", size: 22 },
          paragraph: { spacing: { after: 160, line: 320 }, alignment: AlignmentType.JUSTIFIED },
        },
        {
          id: "PullQuote",
          name: "Pull Quote",
          basedOn: "Normal",
          run: { font: "Georgia", size: 26, italics: true },
          paragraph: { spacing: { before: 120, after: 240 }, indent: { left: 360 } },
        },
      ],
    },
    sections: [
      {
        properties: { titlePage: true },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${doc.title}    `, color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
          first: new Footer({ children: [] }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(document);
}
