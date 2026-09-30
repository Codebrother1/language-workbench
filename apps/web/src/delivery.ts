import {
  assemblePiece,
  renderPieceMarkdown,
  renderPieceText,
  type AssembledPiece,
  type Document,
  type RichNode,
} from "./domain";
import latinFontURL from "@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url";

export function deliveryPiece(doc: Document): AssembledPiece {
  return assemblePiece(doc);
}
export function deliveryFilename(
  piece: AssembledPiece,
  extension: string,
): string {
  const name =
    piece.title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, 120) || "Untitled";
  return `${name}.${extension}`;
}
export function deliveryText(piece: AssembledPiece): string {
  return renderPieceText(piece, true);
}
export function deliveryMarkdown(piece: AssembledPiece): string {
  return renderPieceMarkdown(piece);
}
const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
export function deliveryLink(href: unknown): string | null {
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function deliveryHTML(piece: AssembledPiece): string {
  const render = (node: RichNode): string => {
    if (node.type === "hardBreak") return "<br>";
    if (node.text !== undefined) {
      let text = escapeHTML(node.text);
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `<strong>${text}</strong>`;
        if (mark.type === "italic") text = `<em>${text}</em>`;
        if (mark.type === "code") text = `<code>${text}</code>`;
        if (mark.type === "link") {
          const href = deliveryLink(mark.attrs?.href);
          if (href) text = `<a href="${escapeHTML(href)}">${text}</a>`;
        }
      }
      return text;
    }
    const children = (node.content ?? []).map(render).join("");
    if (node.type === "heading") {
      const level = Math.min(
        6,
        Math.max(1, Number(node.attrs?.level ?? 2) || 2),
      );
      return `<h${level}>${children}</h${level}>`;
    }
    const tags: Record<string, string> = {
      paragraph: "p",
      blockquote: "blockquote",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      codeBlock: "pre",
    };
    const tag = tags[node.type];
    if (!tag) return children;
    if (node.type === "codeBlock") return `<pre><code>${children}</code></pre>`;
    const start =
      node.type === "orderedList" &&
      Number.isInteger(Number(node.attrs?.start)) &&
      Number(node.attrs?.start) > 1
        ? ` start="${Number(node.attrs?.start)}"`
        : "";
    return `<${tag}${start}>${children}</${tag}>`;
  };
  return `<article><h1>${escapeHTML(piece.title)}</h1>${piece.sections.map((section) => section.map(render).join("")).join("")}</article>`;
}
type DeliveryRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  href: string | null;
};
type DeliveryBlock = {
  kind: "paragraph" | "heading" | "quote" | "code" | "bullet" | "numbered";
  runs: DeliveryRun[];
  level: number;
  index?: number;
  listId?: string;
};
function deliveryBlocks(piece: AssembledPiece): DeliveryBlock[] {
  const runs = (node: RichNode): DeliveryRun[] => {
    if (node.type === "hardBreak")
      return [
        { text: "\n", bold: false, italic: false, code: false, href: null },
      ];
    if (node.text !== undefined)
      return [
        {
          text: node.text,
          bold: !!node.marks?.some((mark) => mark.type === "bold"),
          italic: !!node.marks?.some((mark) => mark.type === "italic"),
          code: !!node.marks?.some((mark) => mark.type === "code"),
          href: deliveryLink(
            node.marks?.find((mark) => mark.type === "link")?.attrs?.href,
          ),
        },
      ];
    return (node.content ?? []).flatMap(runs);
  };
  const blocks: DeliveryBlock[] = [];
  let listCounter = 0;
  const visit = (
    node: RichNode,
    kind: DeliveryBlock["kind"] = "paragraph",
    level = 0,
    index?: number,
  ) => {
    if (node.type === "bulletList" || node.type === "orderedList") {
      const listId = `delivery-list-${listCounter++}`;
      (node.content ?? []).forEach((item, position) => {
        const nested = (item.content ?? []).filter(
          (child) =>
            child.type === "bulletList" || child.type === "orderedList",
        );
        const body = (item.content ?? []).filter(
          (child) =>
            child.type !== "bulletList" && child.type !== "orderedList",
        );
        blocks.push({
          kind: node.type === "bulletList" ? "bullet" : "numbered",
          runs: body.flatMap(runs),
          level,
          index: Number(node.attrs?.start ?? 1) + position,
          listId,
        });
        nested.forEach((child) => visit(child, "paragraph", level + 1));
      });
    } else if (node.type === "blockquote")
      (node.content ?? []).forEach((child) => visit(child, "quote", level));
    else if (node.type === "codeBlock")
      blocks.push({ kind: "code", runs: runs(node), level });
    else if (["paragraph", "heading"].includes(node.type))
      blocks.push({
        kind: node.type === "heading" ? "heading" : kind,
        runs: runs(node),
        level: node.type === "heading" ? Number(node.attrs?.level ?? 2) : level,
      });
    else (node.content ?? []).forEach((child) => visit(child, kind, level));
  };
  piece.sections.forEach((section, index) => {
    if (index) blocks.push({ kind: "paragraph", runs: [], level: 0 });
    section.forEach((node) => visit(node));
  });
  return blocks;
}
export async function deliveryPDF(
  piece: AssembledPiece,
  fontData?: Uint8Array,
): Promise<Blob> {
  const [{ PDFDocument, StandardFonts, PDFString, rgb }, { default: fontkit }] =
    await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit")]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const bytes =
    fontData ?? new Uint8Array(await (await fetch(latinFontURL)).arrayBuffer());
  const supported = new Set(
    (fontkit.create(bytes) as { characterSet: number[] }).characterSet,
  );
  for (const character of deliveryText(piece))
    if (
      !/[\r\n\t]/.test(character) &&
      !supported.has(character.codePointAt(0)!)
    )
      throw new Error(
        "PDF cannot represent some characters with the available font. Download DOCX or Markdown instead.",
      );
  const font = await pdf.embedFont(bytes, { subset: true });
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const faceFor = (run: DeliveryRun, kind: string) => {
    const face =
      run.code || kind === "code"
        ? mono
        : run.bold
          ? bold
          : run.italic
            ? italic
            : font;
    try {
      face.encodeText(run.text);
      return face;
    } catch {
      return font;
    }
  };
  const pageWidth = 595.28,
    pageHeight = 841.89,
    margin = 58,
    bottom = 58;
  let page = pdf.addPage([pageWidth, pageHeight]),
    y = pageHeight - margin;
  const nextLine = (height: number) => {
    if (y - height < bottom) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    y -= height;
  };
  const write = (
    block:
      DeliveryBlock | { kind: "title"; runs: DeliveryRun[]; level: number },
  ) => {
    const size =
      block.kind === "title"
        ? 22
        : block.kind === "heading"
          ? Math.max(12, 18 - block.level)
          : block.kind === "code"
            ? 9.5
            : 11;
    const lineHeight = size * (block.kind === "code" ? 1.6 : 1.55);
    const indent =
      block.kind === "quote"
        ? 20
        : block.kind === "bullet" || block.kind === "numbered"
          ? 16 + block.level * 18
          : block.kind === "code"
            ? 12
            : 0;
    const left = margin + indent;
    const prefix =
      block.kind === "bullet"
        ? "• "
        : block.kind === "numbered"
          ? `${block.index}. `
          : "";
    const tokens = [
      { text: prefix, bold: false, italic: false, code: false, href: null },
      ...block.runs,
    ].flatMap((run) =>
      run.text.split(/(\s+)/).map((text) => ({ ...run, text })),
    );
    let line: typeof tokens = [],
      width = 0;
    const draw = () => {
      nextLine(lineHeight);
      if (block.kind === "code")
        page.drawRectangle({
          x: margin,
          y: y - 4,
          width: pageWidth - margin * 2,
          height: lineHeight + 3,
          color: rgb(0.95, 0.95, 0.95),
        });
      let x = left;
      for (const run of line) {
        if (!run.text) continue;
        const face = faceFor(run, block.kind);
        const color = run.href ? rgb(0.1, 0.3, 0.5) : rgb(0.15, 0.17, 0.2);
        page.drawText(run.text, { x, y, size, font: face, color });
        if (run.href) {
          const end = x + face.widthOfTextAtSize(run.text, size);
          page.drawLine({
            start: { x, y: y - 1 },
            end: { x: end, y: y - 1 },
            thickness: 0.5,
            color,
          });
          page.node.addAnnot(
            pdf.context.register(
              pdf.context.obj({
                Type: "Annot",
                Subtype: "Link",
                Rect: [x, y - 2, end, y + size],
                Border: [0, 0, 0],
                A: { Type: "Action", S: "URI", URI: PDFString.of(run.href) },
              }),
            ),
          );
        }
        x += face.widthOfTextAtSize(run.text, size);
      }
      line = [];
      width = 0;
    };
    for (const token of tokens) {
      if (token.text.includes("\n")) {
        for (const [index, part] of token.text.split("\n").entries()) {
          if (index) draw();
          if (part) {
            const next = { ...token, text: part };
            line.push(next);
            width += faceFor(next, block.kind).widthOfTextAtSize(part, size);
          }
        }
        continue;
      }
      const face = faceFor(token, block.kind);
      const tokenWidth = face.widthOfTextAtSize(token.text, size);
      if (width + tokenWidth > pageWidth - margin - left && line.length) draw();
      if (tokenWidth > pageWidth - margin - left) {
        for (const char of token.text) {
          const charWidth = face.widthOfTextAtSize(char, size);
          if (width + charWidth > pageWidth - margin - left && line.length)
            draw();
          line.push({ ...token, text: char });
          width += charWidth;
        }
      } else if (token.text || line.length) {
        line.push(token);
        width += tokenWidth;
      }
    }
    if (line.length || !tokens.some((token) => token.text)) draw();
    y -=
      block.kind === "title"
        ? 18
        : block.kind === "paragraph" && !block.runs.length
          ? 8
          : 7;
  };
  write({
    kind: "title",
    runs: [
      { text: piece.title, bold: true, italic: false, code: false, href: null },
    ],
    level: 0,
  });
  deliveryBlocks(piece).forEach(write);
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
export async function deliveryDOCX(piece: AssembledPiece): Promise<Blob> {
  const {
    Document: WordDocument,
    Paragraph,
    TextRun,
    ExternalHyperlink,
    HeadingLevel,
    LevelFormat,
    AlignmentType,
    Packer,
  } = await import("docx");
  const blocks = deliveryBlocks(piece);
  const numbered = new Map<string, number>();
  for (const block of blocks)
    if (
      block.kind === "numbered" &&
      block.listId &&
      !numbered.has(block.listId)
    )
      numbered.set(block.listId, block.index ?? 1);
  const numbering = [...numbered].map(([reference, start]) => ({
    reference,
    levels: [
      {
        level: 0,
        format: LevelFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.START,
        start,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      },
    ],
  }));
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: piece.title, bold: true, size: 34 })],
      spacing: { after: 320 },
    }),
  ];
  for (const block of blocks) {
    const runs = block.runs.flatMap((run) =>
      run.text
        .split("\n")
        .map((part, index) => ({ ...run, text: part, break: index ? 1 : 0 })),
    );
    const inlines = runs.map((run) => {
      const text = new TextRun({
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        font: run.code || block.kind === "code" ? "Consolas" : undefined,
        break: run.break || undefined,
        color: run.href ? "225D87" : undefined,
        underline: run.href ? { color: "225D87" } : undefined,
      });
      return run.href
        ? new ExternalHyperlink({ link: run.href, children: [text] })
        : text;
    });
    const heading =
      block.kind === "heading"
        ? [
            HeadingLevel.HEADING_1,
            HeadingLevel.HEADING_2,
            HeadingLevel.HEADING_3,
            HeadingLevel.HEADING_4,
            HeadingLevel.HEADING_5,
            HeadingLevel.HEADING_6,
          ][Math.min(6, Math.max(1, block.level)) - 1]
        : undefined;
    children.push(
      new Paragraph({
        children: inlines,
        heading,
        bullet:
          block.kind === "bullet"
            ? { level: Math.min(8, block.level) }
            : undefined,
        numbering:
          block.kind === "numbered" && block.listId
            ? { reference: block.listId, level: 0 }
            : undefined,
        indent: block.kind === "quote" ? { left: 600 } : undefined,
        shading: block.kind === "code" ? { fill: "F3F3F3" } : undefined,
        spacing: { after: block.kind === "heading" ? 140 : 180 },
      }),
    );
  }
  const doc = new WordDocument({
    title: piece.title,
    numbering: { config: numbering },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
