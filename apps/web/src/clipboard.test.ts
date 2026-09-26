import { describe, it, expect } from "vitest";
import { Schema, Slice, Fragment } from "@tiptap/pm/model";
import { clipboardPlainText } from "./editor";
const schema = new Schema({
  nodes: {
    doc: { content: "writingSection+" },
    writingSection: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    bulletList: { group: "block", content: "listItem+" },
    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { start: { default: 1 } },
    },
    listItem: { content: "paragraph+" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
  marks: { bold: {} },
});
const p = (text: string) =>
  schema.node("paragraph", null, text ? schema.text(text) : undefined);
const section = (...nodes: ReturnType<typeof p>[]) =>
  schema.node("writingSection", null, nodes);
describe("native clipboard serializer for section wrappers", () => {
  it("does not create leading blank lines around a single selected section", () => {
    expect(
      clipboardPlainText(
        new Slice(Fragment.from(section(p("My thought."))), 0, 0),
      ),
    ).toBe("My thought.");
  });
  it("keeps authored leading and trailing whitespace rather than trimming it", () => {
    expect(
      clipboardPlainText(
        new Slice(Fragment.from(section(p("  My thought.  "))), 0, 0),
      ),
    ).toBe("  My thought.  ");
  });
  it("preserves intentional empty paragraphs", () => {
    expect(
      clipboardPlainText(
        new Slice(Fragment.from(section(p(""), p("My thought."))), 0, 0),
      ),
    ).toBe("\nMy thought.");
  });
  it("separates paragraphs within a section and sections within the piece", () => {
    const slice = new Slice(
      Fragment.fromArray([section(p("A"), p("B")), section(p("C"))]),
      0,
      0,
    );
    expect(clipboardPlainText(slice)).toBe("A\nB\n\nC");
  });
  it("copies bullets and numbered items with readable list markers", () => {
    const item = (text: string) => schema.node("listItem", null, p(text));
    const slice = new Slice(
      Fragment.from(
        schema.node("writingSection", null, [
          schema.node("bulletList", null, [item("A"), item("B")]),
          schema.node("orderedList", { start: 3 }, [item("C"), item("D")]),
        ]),
      ),
      0,
      0,
    );
    expect(clipboardPlainText(slice)).toBe("- A\n- B\n3. C\n4. D");
  });
  it("does not separate adjacent inline text marks, but keeps real hard breaks", () => {
    const slice = new Slice(
      Fragment.fromArray([
        schema.text("bold", [schema.mark("bold")]),
        schema.text(" words"),
        schema.node("hardBreak"),
        schema.text("next"),
      ]),
      0,
      0,
    );
    expect(clipboardPlainText(slice)).toBe("bold words\nnext");
  });
});
