import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newDocument, newSection } from "./domain";
import { assemblePiece } from "./domain";
import { unzipSync } from "fflate";
import {
  deliveryFilename,
  deliveryHTML,
  deliveryMarkdown,
  deliveryPDF,
  deliveryDOCX,
  deliveryText,
} from "./delivery";

function fixture() {
  const doc = newDocument("Nothing Important", "First paragraph.");
  doc.sections[0].content = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "The opening" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "A linked claim",
          marks: [
            { type: "bold" },
            { type: "link", attrs: { href: "https://example.com/path" } },
          ],
        },
        { type: "hardBreak" },
        { type: "text", text: "Second line", marks: [{ type: "italic" }] },
      ],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "An authored quote." }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A list item" }],
            },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "An ordered item" }],
            },
          ],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "js" },
      content: [{ type: "text", text: "const value = 1;" }],
    },
  ];
  doc.sections.push(newSection("Point", "Last section."));
  doc.sections.push(newSection("Freeform", ""));
  const parked = newSection("Freeform", "Private parked material.");
  parked.placement = "parked";
  doc.sections.push(parked);
  doc.sections[0].notes = "Secret revision note";
  doc.brief.destination = "Private Brief destination";
  return doc;
}

describe("assembled delivery formats", () => {
  it("shares one canonical assembly for copy, Markdown and safe filenames", () => {
    const doc = fixture();
    const before = structuredClone(doc);
    const piece = assemblePiece(doc);
    const html = deliveryHTML(piece),
      plain = deliveryText(piece),
      markdown = deliveryMarkdown(piece);
    for (const output of [html, plain, markdown]) {
      expect(output).toContain("Nothing Important");
      expect(output).toContain("Last section.");
      expect(output).not.toMatch(
        /Private parked material|Secret revision note|Private Brief destination|Freeform|Point/,
      );
    }
    expect(html).toMatch(
      /<h2>The opening<\/h2>|<strong>A linked claim<\/strong>/,
    );
    expect(html).toContain('href="https://example.com/path"');
    expect(plain).toMatch(/^Nothing Important\n\n/);
    expect(markdown).toContain(
      "[**A linked claim**](https://example.com/path)",
    );
    expect(markdown).toContain("3. An ordered item");
    expect(markdown).toContain("```js\nconst value = 1;\n```");
    expect(deliveryFilename(piece, "pdf")).toBe("Nothing Important.pdf");
    expect(deliveryFilename(assemblePiece({ ...doc, title: "" }), "md")).toBe(
      "Untitled.md",
    );
    expect(
      deliveryFilename({ ...piece, title: "../Unsafe:<Name> " }, "docx"),
    ).toBe("Unsafe Name.docx");
    const unsafe = {
      title: "<script>",
      sections: [
        [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "<private>",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      ],
    };
    expect(deliveryHTML(unsafe)).not.toMatch(
      /<script>|<private>|href="javascript:/,
    );
    expect(deliveryMarkdown(unsafe)).toContain("# \\<script\\>");
    expect(deliveryMarkdown(unsafe)).not.toContain("(javascript:");
    expect(doc).toEqual(before);
  });
  it("creates a real multipage PDF containing only reading prose", async () => {
    const doc = fixture();
    doc.sections[1].content = [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Long page marker " + "Words flow across the page. ".repeat(220),
          },
        ],
      },
    ];
    const font = readFileSync(
      new URL(
        "../node_modules/@fontsource-variable/literata/files/literata-latin-wght-normal.woff2",
        import.meta.url,
      ),
    );
    const blob = await deliveryPDF(assemblePiece(doc), font);
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({
      data: bytes,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    expect(pdf.numPages).toBeGreaterThan(1);
    const first = (await (await pdf.getPage(1)).getTextContent()).items
      .map((item: any) => item.str)
      .join(" ")
      .replace(/\s+/g, " ");
    expect(first).toContain("Nothing Important");
    expect(first).toContain("A linked claim");
    expect(
      (await (await pdf.getPage(1)).getAnnotations()).some(
        (annotation) => annotation.url === "https://example.com/path",
      ),
    ).toBe(true);
    expect(first).not.toMatch(/Private parked material|Secret revision note/);
    const last = (
      await (await pdf.getPage(pdf.numPages)).getTextContent()
    ).items
      .map((item: any) => item.str)
      .join(" ")
      .replace(/\s+/g, " ");
    expect(last).toContain("Words flow across the page");
    await pdf.destroy();
    await expect(
      deliveryPDF({ title: "中文", sections: [] }, font),
    ).rejects.toThrow(/cannot represent some characters/);
  }, 20_000);
  it("creates a valid DOCX archive with authored structure and no Workbench metadata", async () => {
    const doc = fixture();
    const blob = await deliveryDOCX(assemblePiece(doc));
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = new TextDecoder().decode(archive["word/document.xml"]);
    const links = new TextDecoder().decode(
      archive["word/_rels/document.xml.rels"],
    );
    expect(xml).toContain("Nothing Important");
    expect(xml).toContain("The opening");
    expect(xml).toMatch(/w:pStyle w:val="Heading2"/);
    expect(xml).toContain("A linked claim");
    expect(xml).toContain("<w:numPr>");
    expect(xml).toContain("An ordered item");
    expect(new TextDecoder().decode(archive["word/numbering.xml"])).toMatch(
      /w:start w:val="3"/,
    );
    expect(xml).toContain("Consolas");
    expect(xml).toContain("An authored quote.");
    expect(xml).toContain("<w:br/>");
    expect(xml).toContain("Last section.");
    expect(links).toContain("https://example.com/path");
    expect(xml).not.toMatch(
      /Private parked material|Secret revision note|Private Brief destination|My observation/,
    );
  });
});
