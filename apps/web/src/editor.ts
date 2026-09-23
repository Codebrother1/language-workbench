import { Node, Extension, type Editor, type JSONContent } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  Selection,
  type EditorState,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode, Slice } from "@tiptap/pm/model";
import {
  type Document,
  type EditTarget,
  type WritingSection,
  sectionText,
  targetFor,
} from "./domain";
export {
  SectionBoundaryGuard,
  allowSectionTopologyChange,
  authorizedSetContent,
  type SectionBoundaryReason,
} from "./section-boundary";
export const WritingDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "writingSection+",
  addKeyboardShortcuts() {
    // Commit native start/end navigation before a following input event can race
    // the browser's asynchronous selectionchange and React Inspector render.
    const edge = (end: boolean, extend = false) => {
      if (this.editor.view.composing) return false;
      const state = this.editor.state;
      const pos = (
        end ? Selection.atEnd(state.doc) : Selection.atStart(state.doc)
      ).from;
      const changed = this.editor
        .chain()
        .setTextSelection(
          extend ? { from: state.selection.anchor, to: pos } : pos,
        )
        .scrollIntoView()
        .run();
      if (changed) {
        const view = this.editor.view;
        view.focus();
        // Keep the native selection in step even when a recent mouse selection
        // has queued selectionchange; the next paste must use the same anchor.
        const anchor = view.domAtPos(extend ? state.selection.anchor : pos);
        const head = view.domAtPos(pos);
        view.dom.ownerDocument
          .getSelection()
          ?.setBaseAndExtent(
            anchor.node,
            anchor.offset,
            head.node,
            head.offset,
          );
      }
      return changed;
    };
    return {
      "Mod-Home": () => edge(false),
      "Mod-End": () => edge(true),
      "Mod-Shift-Home": () => edge(false, true),
      "Mod-Shift-End": () => edge(true, true),
    };
  },
});

export const WritingSectionNode = Node.create({
  name: "writingSection",
  content: "block+",
  defining: true,
  isolating: true,
  // Identity is assigned by explicit document/section commands, never repaired
  // after native input. A repair could turn unsafe paste into new section instances.
  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "Freeform" },
      label: { default: "Freeform" },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-writing-section]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      {
        ...HTMLAttributes,
        "data-writing-section": "",
        "data-testid": "writing-section",
      },
      0,
    ];
  },
});
type HighlightRange = { from: number; to: number };
const highlightKey = new PluginKey<HighlightRange | null>("target-highlight");
export const TargetHighlight = Extension.create({
  name: "targetHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightKey,
        state: {
          init: () => null,
          apply(tr, previous) {
            const explicit = tr.getMeta(highlightKey);
            if (explicit !== undefined) return explicit;
            // User movement returns to sentence/selection scope. No nested dispatch
            // from selectionUpdate: that races the browser's native caret/clipboard.
            return tr.selectionSet || tr.docChanged ? null : previous;
          },
        },
        props: {
          decorations(state) {
            const info = selectionInfo(state);
            const range =
              highlightKey.getState(state) ??
              (info
                ? {
                    from: info.map.starts[info.start] ?? info.map.empty,
                    to: info.map.ends[info.end - 1] ?? info.map.empty,
                  }
                : null);
            return range && range.to > range.from
              ? DecorationSet.create(state.doc, [
                  Decoration.inline(range.from, range.to, {
                    class: "target-highlight",
                  }),
                ])
              : DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
export function toEditor(doc: Document): JSONContent {
  return {
    type: "doc",
    content: doc.sections.map((s) => ({
      type: "writingSection",
      attrs: { id: s.id, kind: s.kind, label: s.label },
      content: s.content,
    })),
  };
}
export function fromEditor(
  editor: Editor,
  sections: WritingSection[],
): WritingSection[] {
  return (editor.getJSON().content ?? []).map((n) => {
    const prior = sections.find((s) => s.id === n.attrs?.id);
    return {
      ...prior!,
      id: n.attrs!.id,
      kind: n.attrs!.kind,
      label: n.attrs!.label,
      notes: prior?.notes ?? "",
      variants: prior?.variants ?? [],
      content: (n.content ?? [
        { type: "paragraph" },
      ]) as WritingSection["content"],
    };
  });
}
export function sectionLocation(editor: Editor, id: string) {
  let found: { node: PMNode; pos: number } | null = null;
  editor.state.doc.forEach((node, pos) => {
    if (node.attrs.id === id) found = { node, pos };
  });
  return found as { node: PMNode; pos: number } | null;
}
/** Mirrors domain sectionText exactly, including only top-level block separators. */
export function positionMap(node: PMNode, pos: number) {
  const starts: number[] = [],
    ends: number[] = [];
  let text = "";
  let previousEnd = pos + 2;
  const append = (value: string, at: number, width = 1) => {
    for (let i = 0; i < value.length; i++) {
      starts.push(at + i * width);
      ends.push(at + (i + 1) * width);
      text += value[i];
    }
  };
  node.forEach((block, offset, index) => {
    const bp = pos + 1 + offset;
    if (index) {
      starts.push(previousEnd);
      ends.push(bp + 1);
      text += "\n";
    }
    let nestedEnd: number | null = null;
    if (block.isText) append(block.text ?? "", bp);
    else
      block.descendants((child, relative) => {
        if (child.isTextblock) {
          const childPos = bp + 1 + relative;
          if (nestedEnd !== null) {
            starts.push(nestedEnd);
            ends.push(childPos + 1);
            text += "\n";
          }
          nestedEnd = childPos + child.nodeSize - 1;
        }
        if (child.isText) append(child.text ?? "", bp + 1 + relative);
        else if (child.type.name === "hardBreak")
          append("\n", bp + 1 + relative);
      });
    previousEnd = bp + block.nodeSize - 1;
  });
  return { text, starts, ends, empty: pos + 2 };
}
export function targetRange(editor: Editor, target: EditTarget) {
  if (!target.sectionId) return null;
  const found = sectionLocation(editor, target.sectionId);
  if (!found) return null;
  const map = positionMap(found.node, found.pos);
  if (map.text !== target.sectionSnapshot) return null;
  return {
    from: map.starts[target.start] ?? map.ends.at(-1) ?? map.empty,
    to:
      target.end > target.start
        ? (map.ends[target.end - 1] ?? map.empty)
        : (map.starts[target.start] ?? map.ends.at(-1) ?? map.empty),
  };
}
export function highlight(editor: Editor, target: EditTarget | null) {
  const range = target ? targetRange(editor, target) : null;
  editor.view.dispatch(
    editor.state.tr.setMeta(
      highlightKey,
      range && range.to > range.from ? range : null,
    ),
  );
}
function selectionInfo(state: EditorState) {
  const { from, to } = state.selection;
  const a = state.doc.resolve(from),
    b = state.doc.resolve(to);
  if (
    a.depth < 1 ||
    b.depth < 1 ||
    a.node(1).type.name !== "writingSection" ||
    a.node(1) !== b.node(1)
  )
    return null;
  const map = positionMap(a.node(1), a.before(1));
  let start = map.starts.findIndex((p) => p >= from);
  if (start < 0) start = map.text.length;
  let end = map.ends.findIndex((p) => p > to);
  if (end < 0) end = map.text.length;
  let scope: EditTarget["scope"] = "selection";
  if (from !== to) {
    if (start >= end) return null;
    scope = /^\S+$/u.test(map.text.slice(start, end).trim())
      ? "word"
      : "selection";
  } else {
    const segments = [
      ...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(
        map.text,
      ),
    ];
    const segment =
      segments.find(
        (s) => start >= s.index && start < s.index + s.segment.length,
      ) ?? segments.at(-1);
    if (segment) {
      // Whitespace between sentences belongs to neither editable sentence.
      start =
        segment.index +
        (segment.segment.length - segment.segment.trimStart().length);
      end = segment.index + segment.segment.trimEnd().length;
    }
  }
  return { id: a.node(1).attrs.id as string, map, start, end, scope };
}
export function cursorTarget(editor: Editor, doc: Document): EditTarget | null {
  const info = selectionInfo(editor.state);
  if (!info || !doc.sections.some((s) => s.id === info.id)) return null;
  return targetFor(doc, info.id, info.scope, info.start, info.end);
}

/** Native ProseMirror clipboard serialization without wrapper-generated leading breaks.
 * Preserve authored whitespace and newlines; never trim the selected text. */
export function clipboardPlainText(slice: Slice): string {
  const render = (node: PMNode): string => {
    if (node.isText) return node.text ?? "";
    if (node.type.name === "hardBreak") return "\n";
    const children: string[] = [];
    node.forEach((child) => children.push(render(child)));
    return children.join(node.isTextblock ? "" : "\n");
  };
  const nodes: PMNode[] = [];
  slice.content.forEach((node) => nodes.push(node));
  const separator = nodes.every((node) => node.isInline)
    ? ""
    : nodes.some((node) => node.type.name === "writingSection")
      ? "\n\n"
      : "\n";
  return nodes.map(render).join(separator);
}

export { allowSectionLocalEdit } from "./section-boundary";
