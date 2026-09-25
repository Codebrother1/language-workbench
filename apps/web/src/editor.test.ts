import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import { newDocument, newSection, targetFor } from "./domain";
import { toEditor, positionMap, targetRange, cursorTarget } from "./editor";
const schema = new Schema({
  nodes: {
    doc: { content: "writingSection+" },
    writingSection: {
      content: "block+",
      attrs: {
        id: { default: null },
        kind: { default: "Freeform" },
        label: { default: "Freeform" },
      },
    },
    paragraph: { group: "block", content: "inline*" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 2 } },
    },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
  marks: { bold: {}, italic: {} },
});
function fixture(text: string, from = 2, to = from) {
  const doc = newDocument("Test", text),
    pm = schema.nodeFromJSON(toEditor(doc));
  const state = EditorState.create({
    schema,
    doc: pm,
    selection: TextSelection.create(pm, from, to),
  });
  return { doc, pm, editor: { state } as Editor };
}
describe("plain text / ProseMirror target boundary", () => {
  it("maps block separators without pretending PM structural positions are plain offsets", () => {
    const { pm } = fixture("A\nB");
    expect(positionMap(pm.child(0), 0)).toMatchObject({
      text: "A\nB",
      starts: [2, 3, 5],
      ends: [3, 5, 6],
    });
  });
  it("maps an exact selected word", () => {
    const { doc, editor } = fixture("Hello world.", 2, 7);
    const target = cursorTarget(editor, doc)!;
    expect(target.scope).toBe("word");
    expect(target.text).toBe("Hello");
    expect(targetRange(editor, target)).toEqual({ from: 2, to: 7 });
  });
  it("targets the sentence containing the cursor", () => {
    const { doc, editor } = fixture("First one. Second one.", 15);
    expect(cursorTarget(editor, doc)?.text).toBe("Second one.");
  });
  it("keeps inter-sentence whitespace outside the editable sentence", () => {
    const { doc, editor } = fixture("First one. Second one.", 3);
    expect(cursorTarget(editor, doc)?.text).toBe("First one.");
  });
  it("targets the last sentence at the end of a section", () => {
    const text = "First one. Second one.";
    const { doc, editor } = fixture(text, text.length + 2);
    expect(cursorTarget(editor, doc)?.text).toBe("Second one.");
  });
  it("does not permit a cross-section selection as a local target", () => {
    const doc = newDocument("Test", "A");
    doc.sections.push(newSection("Freeform", "B"));
    const pm = schema.nodeFromJSON(toEditor(doc));
    const state = EditorState.create({
      schema,
      doc: pm,
      selection: TextSelection.create(pm, 2, 8),
    });
    expect(cursorTarget({ state } as Editor, doc)).toBeNull();
  });
  it("keeps a sentence local when the native selection includes only the previous wrapper edge", () => {
    const doc = newDocument("Test", "Previous.");
    doc.sections.push(
      newSection("Reveal", "The next sentence. Another remains."),
    );
    const pm = schema.nodeFromJSON(toEditor(doc));
    const previousContentEnd = pm.child(0).nodeSize - 2;
    const nextContentStart = pm.child(0).nodeSize + 2;
    const state = EditorState.create({
      schema,
      doc: pm,
      selection: TextSelection.create(
        pm,
        previousContentEnd,
        nextContentStart + "The next sentence.".length,
      ),
    });
    const target = cursorTarget({ state } as Editor, doc)!;
    expect(target.sectionId).toBe(doc.sections[1].id);
    expect(target.text).toBe("The next sentence.");
  });
  it("rejects a stale editor snapshot instead of guessing an offset", () => {
    const { doc, editor } = fixture("Changed");
    const t = targetFor(doc, doc.sections[0].id);
    t.sectionSnapshot = "Original";
    expect(targetRange(editor, t)).toBeNull();
  });
  it("keeps heading and mark text offset-compatible", () => {
    const doc = newDocument("Test");
    doc.sections[0].content = [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "next" },
        ],
      },
    ];
    const pm = schema.nodeFromJSON(toEditor(doc));
    expect(positionMap(pm.child(0), 0).text).toBe("Bold\nnext");
  });
});
