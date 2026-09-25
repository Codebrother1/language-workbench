import { describe, expect, it, vi } from "vitest";
import { getSchema, type Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Fragment, Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { closeHistory, history, redo, undo } from "@tiptap/pm/history";
import type { EditorView } from "@tiptap/pm/view";
import {
  WritingDocument,
  WritingSectionNode,
  targetRange,
  toEditor,
} from "./editor";
import { newDocument, newSection, targetFor } from "./domain";
import {
  allowSectionTopologyChange,
  allowSectionLocalEdit,
  createSectionBoundaryPlugin,
  sectionContentRange,
  sectionTopology,
} from "./section-boundary";

const schema = getSchema([
  StarterKit.configure({ document: false, trailingNode: false }),
  WritingDocument,
  WritingSectionNode,
]);
function fixture() {
  const document = newDocument("Boundary regression");
  document.sections = [
    "Reveal",
    "Segue",
    "Point",
    "Point",
    "Callback",
    "Closer",
  ].map((kind, i) =>
    newSection(
      kind as any,
      i === 0
        ? "First sentence. Second sentence."
        : `Section ${i + 1} stays intact.`,
    ),
  );
  const doc = schema.nodeFromJSON(toEditor(document));
  const onBlocked = vi.fn();
  const plugin = createSectionBoundaryPlugin({ onBlocked });
  let state = EditorState.create({ doc, schema, plugins: [plugin, history()] });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  } as EditorView;
  const select = (from: number, to = from) =>
    view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, from, to)),
    );
  return {
    document,
    doc,
    plugin,
    onBlocked,
    view,
    select,
    ids: sectionTopology(doc)!,
  };
}
function locations(state: EditorState) {
  const result: { pos: number; start: number; end: number; size: number }[] =
    [];
  state.doc.forEach((node, pos) =>
    result.push({
      pos,
      start: pos + 2,
      end: pos + node.nodeSize - 2,
      size: node.nodeSize,
    }),
  );
  return result;
}
function key(f: ReturnType<typeof fixture>, name: string) {
  return f.plugin.props.handleKeyDown!.call(f.plugin, f.view, {
    key: name,
  } as KeyboardEvent);
}
function paste(f: ReturnType<typeof fixture>, slice: Slice) {
  return f.plugin.props.handlePaste!.call(
    f.plugin,
    f.view,
    {} as ClipboardEvent,
    slice,
  );
}
function text(
  f: ReturnType<typeof fixture>,
  from: number,
  to: number,
  value: string,
) {
  return f.plugin.props.handleTextInput!.call(
    f.plugin,
    f.view,
    from,
    to,
    value,
    () => f.view.state.tr.insertText(value, from, to),
  );
}

describe("section boundary guard: stable six-section identity independent of formatting", () => {
  it("rejects destructive whole-first-paragraph deleteRange before append-transaction repair", () => {
    const f = fixture();
    // A browser selection with an outer slice edge, not an inline text position.
    const specialSliceEdge = 0;
    f.view.dispatch(
      f.view.state.tr.deleteRange(specialSliceEdge, f.doc.child(0).nodeSize),
    );
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
    expect(f.onBlocked).toHaveBeenCalled();
    expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
  });

  it.each([0, 5])(
    "clamps selection replacement at section %i's outer edges without widening authority",
    (index) => {
      const f = fixture();
      const p = locations(f.view.state)[index];
      const from = index === 0 ? p.pos : p.end - 6;
      const to = index === 0 ? p.start + 5 : p.pos + p.size;
      const expected = sectionContentRange(f.doc, from, to);
      expect(expected.kind).toBe("single");
      expect(text(f, from, to, "Fresh")).toBe(true);
      expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
      expect(f.view.state.doc.child(index).textContent).toContain("Fresh");
      f.doc.forEach((node, _pos, i) => {
        if (i !== index) expect(f.view.state.doc.child(i).eq(node)).toBe(true);
      });
      expect(f.onBlocked).not.toHaveBeenCalled();
    },
  );

  it("treats a previous wrapper edge plus the next section's sentence as one local selection", () => {
    const f = fixture();
    const p = locations(f.view.state);
    const from = p[2].end; // after Point prose, before its wrapper closes
    const to = p[3].start + "Section".length;
    expect(f.view.state.doc.textBetween(from, to)).toBe("Section");
    expect(sectionContentRange(f.doc, from, to)).toMatchObject({
      kind: "single",
      sectionId: f.ids[3],
      from: p[3].start,
      to,
      clamped: true,
    });
    expect(text(f, from, to, "Revised")).toBe(true);
    expect(f.view.state.doc.child(3).textContent).toBe(
      "Revised 4 stays intact.",
    );
    expect(f.view.state.doc.child(2).eq(f.doc.child(2))).toBe(true);
    expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
    expect(f.onBlocked).not.toHaveBeenCalled();
  });

  it("still refuses a selection containing prose from two sections", () => {
    const f = fixture();
    const p = locations(f.view.state);
    const from = p[2].end - 1;
    const to = p[3].start + 7;
    expect(sectionContentRange(f.doc, from, to).kind).toBe("cross");
    expect(text(f, from, to, "Unsafe")).toBe(true);
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
    expect(f.onBlocked).toHaveBeenCalledWith("cross-section-selection");
  });

  it("allows normal typing, Enter-style block changes, marks and semantic conversions", () => {
    const f = fixture();
    expect(text(f, 2, 2, "Hi ")).toBe(false); // native input retains its normal path
    f.view.dispatch(f.view.state.tr.insertText("Hi ", 2));
    f.view.dispatch(f.view.state.tr.addMark(2, 4, schema.marks.bold.create()));
    f.view.dispatch(
      f.view.state.tr.setBlockType(2, 4, schema.nodes.heading, { level: 2 }),
    );
    f.view.dispatch(f.view.state.tr.split(4));
    f.view.dispatch(
      f.view.state.tr.setNodeMarkup(0, undefined, {
        ...f.doc.child(0).attrs,
        kind: "Callback",
      }),
    );
    expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
    expect(f.view.state.doc.child(0).attrs.kind).toBe("Callback");
    expect(f.onBlocked).not.toHaveBeenCalled();
  });

  it("pastes rich section-wrapped content at a special slice edge without creating instances", () => {
    const f = fixture();
    // Simulates an outer section edge selected with keyboard/browser selection.
    f.select(0, 17);
    const heading = schema.nodes.heading.create(
      { level: 2 },
      schema.text("Pasted", [schema.marks.bold.create()]),
    );
    const wrapper = schema.nodes.writingSection.create(
      { id: f.ids[1] },
      heading,
    );
    expect(paste(f, new Slice(Fragment.from(wrapper), 2, 2))).toBe(true);
    expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
    expect(f.view.state.doc.child(0).textContent).toContain("Pasted");
    let bold = false;
    f.view.state.doc.child(0).descendants((node) => {
      if (node.marks.some((mark) => mark.type.name === "bold")) bold = true;
    });
    expect(bold).toBe(true);
    expect(f.view.state.doc.child(1).eq(f.doc.child(1))).toBe(true);
    expect(f.onBlocked).not.toHaveBeenCalled();
  });

  it.each(["Backspace", "Delete"])(
    "clamps outer-edge %s without removing the wrapper",
    (name) => {
      const f = fixture();
      f.select(0, 17);
      expect(key(f, name)).toBe(true);
      expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
      expect(f.view.state.doc.child(0).textContent).toBe(" Second sentence.");
      expect(f.onBlocked).not.toHaveBeenCalled();
    },
  );

  it.each(["Backspace", "Delete"])(
    "blocks adjacent %s at empty first/last paragraphs",
    (name) => {
      const f = fixture();
      const middle = locations(f.view.state)[1];
      f.view.dispatch(f.view.state.tr.delete(middle.start, middle.end));
      f.select(middle.start);
      const before = f.view.state.doc;
      expect(key(f, name)).toBe(true);
      expect(f.view.state.doc.eq(before)).toBe(true);
      expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
      expect(f.onBlocked).toHaveBeenCalledWith("section-topology-change");
    },
  );

  it("rejects cross-section input/paste/delete/cut but permits selection and native copy", () => {
    const f = fixture();
    const p = locations(f.view.state);
    f.select(p[0].end - 4, p[1].start + 4);
    expect(f.onBlocked).not.toHaveBeenCalled();
    expect(text(f, p[0].end - 4, p[1].start + 4, "unsafe")).toBe(true);
    expect(
      paste(f, new Slice(Fragment.from(schema.text("unsafe")), 0, 0)),
    ).toBe(true);
    expect(key(f, "Delete")).toBe(true);
    const event = { preventDefault: vi.fn() } as unknown as ClipboardEvent;
    expect(
      f.plugin.props.handleDOMEvents!.cut!.call(f.plugin, f.view, event),
    ).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(f.plugin.props.handleDOMEvents!.copy).toBeUndefined();
    // Also fail closed for transforms that leave IDs intact but edit across selection.
    f.view.dispatch(f.view.state.tr.insertText("unsafe", p[0].start));
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
    expect(f.onBlocked).toHaveBeenCalledWith("cross-section-selection");
  });

  it("rejects local deletion/reordering/ID replacement and invalid authorized IDs", () => {
    const f = fixture();
    const nodes = Array.from({ length: 6 }, (_, i) => f.doc.child(i));
    for (const next of [
      nodes.slice(1),
      [...nodes].reverse(),
      [nodes[1], ...nodes.slice(1)],
    ]) {
      f.view.dispatch(
        f.view.state.tr.replaceWith(0, f.view.state.doc.content.size, next),
      );
      expect(f.view.state.doc.eq(f.doc)).toBe(true);
    }
    f.view.dispatch(
      f.view.state.tr.setNodeMarkup(0, undefined, {
        ...nodes[0].attrs,
        id: "changed",
      }),
    );
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
    f.view.dispatch(
      allowSectionTopologyChange(
        f.view.state.tr.setNodeMarkup(0, undefined, {
          ...nodes[0].attrs,
          id: null,
        }),
      ),
    );
    expect(f.onBlocked).toHaveBeenCalledWith("invalid-section-ids");
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
  });

  it("permits explicitly authorized insert/delete/merge/reorder and library undo/redo, with no leaking bypass", () => {
    const f = fixture();
    const original = Array.from({ length: 6 }, (_, i) => f.doc.child(i));
    const added = schema.nodes.writingSection.create(
      { id: "fresh-id" },
      schema.nodes.paragraph.create(null, schema.text("New")),
    );
    const merged = original[0].copy(
      original[0].content.append(original[1].content),
    );
    for (const next of [
      [added, ...original],
      original.slice(1),
      [merged, ...original.slice(2)],
      [...original].reverse(),
    ]) {
      f.view.dispatch(closeHistory(f.view.state.tr));
      const before = f.view.state.doc;
      f.view.dispatch(
        allowSectionTopologyChange(
          f.view.state.tr.replaceWith(0, before.content.size, next),
        ),
      );
      expect(sectionTopology(f.view.state.doc)).toEqual(
        next.map((node) => node.attrs.id),
      );
      const after = f.view.state.doc;
      expect(undo(f.view.state, (tr) => f.view.dispatch(tr))).toBe(true);
      expect(f.view.state.doc.eq(before)).toBe(true);
      expect(redo(f.view.state, (tr) => f.view.dispatch(tr))).toBe(true);
      expect(f.view.state.doc.eq(after)).toBe(true);
      const attempted = f.view.state.tr.setNodeMarkup(0, undefined, {
        ...after.child(0).attrs,
        id: "unauthorized",
      });
      f.view.dispatch(
        attempted.setMeta("history", true).setMeta("addToHistory", false),
      );
      expect(f.view.state.doc.eq(after)).toBe(true);
    }
  });

  it.each(["word", "sentence"] as const)(
    "Word Lens / AI %s replacement at first sentence stays local and undoable",
    (scope) => {
      const f = fixture();
      const end = scope === "word" ? 5 : 15;
      const target = targetFor(
        f.document,
        f.ids[0],
        scope === "word" ? "word" : "selection",
        0,
        end,
      );
      const range = targetRange({ state: f.view.state } as Editor, target)!;
      expect(range.from).toBe(2);
      f.view.dispatch(
        f.view.state.tr.insertText("Changed", range.from, range.to),
      );
      expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
      expect(f.view.state.doc.child(1).eq(f.doc.child(1))).toBe(true);
      expect(f.view.state.doc.child(0).textContent).toContain("Changed");
      undo(f.view.state, (tr) => f.view.dispatch(tr));
      expect(f.view.state.doc.eq(f.doc)).toBe(true);
      redo(f.view.state, (tr) => f.view.dispatch(tr));
      expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
      expect(f.onBlocked).not.toHaveBeenCalled();
    },
  );
});

describe("explicit local application authority", () => {
  it("allows an exact section-local app edit after a cross-section copy selection", () => {
    const f = fixture();
    const ranges = locations(f.view.state);
    f.select(ranges[0].start, ranges[5].end);
    f.view.dispatch(
      allowSectionLocalEdit(
        f.view.state.tr.insertText("Local.", ranges[3].start, ranges[3].end),
        f.document.sections[3].id,
      ),
    );
    expect(sectionTopology(f.view.state.doc)).toEqual(f.ids);
    expect(f.view.state.doc.child(3).textContent).toBe("Local.");
    expect(f.view.state.doc.child(2).eq(f.doc.child(2))).toBe(true);
  });
  it("does not let local application authority change a neighbor or remove a boundary", () => {
    const f = fixture();
    const ranges = locations(f.view.state);
    const tr = f.view.state.tr.insertText(
      "Changed neighbor",
      ranges[2].start,
      ranges[2].end,
    );
    f.view.dispatch(allowSectionLocalEdit(tr, f.document.sections[3].id));
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
    expect(f.onBlocked).toHaveBeenCalled();
    f.view.dispatch(
      allowSectionLocalEdit(
        f.view.state.tr.delete(ranges[3].pos, ranges[3].pos + ranges[3].size),
        f.document.sections[3].id,
      ),
    );
    expect(f.view.state.doc.eq(f.doc)).toBe(true);
  });
});
