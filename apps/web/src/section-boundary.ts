import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { isHistoryTransaction } from "@tiptap/pm/history";
import {
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export type SectionBoundaryReason =
  "cross-section-selection" | "section-topology-change" | "invalid-section-ids";
export type SectionBoundaryOptions = {
  /** Notification only: do not synchronously dispatch another editor transaction here. */
  onBlocked: (reason: SectionBoundaryReason) => void;
};
const topologyAuthorization = new PluginKey("section-topology-authorization");
const authorization = Object.freeze({});
const localEditAuthorization = new PluginKey(
  "section-local-edit-authorization",
);
/** Explicit local app edits may ignore the browser selection, but never change neighbors or topology. */
export function allowSectionLocalEdit(
  tr: Transaction,
  sectionId: string,
): Transaction {
  return tr.setMeta(localEditAuthorization, {
    token: authorization,
    sectionId,
  });
}

/** Only structural application commands may opt in. Never mark native/AI text edits. */
export function allowSectionTopologyChange(tr: Transaction): Transaction {
  return tr.setMeta(topologyAuthorization, authorization);
}

/** One transaction, one authorization; no mutable/global bypass window.
 * The caller supplies unique nonempty IDs (new instances must receive fresh IDs).
 * Load callers should still reset history; structural edits should retain history.
 */
export function authorizedSetContent(
  editor: Editor,
  doc: JSONContent,
  options: { emitUpdate?: boolean; addToHistory?: boolean } = {},
): boolean {
  const parsed = editor.schema.nodeFromJSON(doc);
  parsed.check();
  if (!sectionTopology(parsed))
    throw new Error("Every section must have a unique, nonempty ID.");
  return editor
    .chain()
    .command(({ tr }) => {
      allowSectionTopologyChange(tr);
      if (options.addToHistory !== undefined)
        tr.setMeta("addToHistory", options.addToHistory);
      return true;
    })
    .setContent(doc, { emitUpdate: options.emitUpdate ?? false })
    .run();
}

/** Null means invalid, never an invitation to repair unsafe paste/deletion. */
export function sectionTopology(doc: PMNode): string[] | null {
  const ids: string[] = [];
  let valid = true;
  doc.forEach((node) => {
    const id: unknown = node.attrs.id;
    if (
      node.type.name !== "writingSection" ||
      typeof id !== "string" ||
      !id.trim() ||
      ids.includes(id)
    )
      valid = false;
    else ids.push(id);
  });
  return valid && ids.length ? ids : null;
}

/** Structural edge positions can surround a single section without selecting another.
 * Clamp only those edges, never reinterpret an actual cross-section selection.
 */
export function sectionContentRange(
  doc: PMNode,
  from: number,
  to: number,
):
  | { kind: "single"; from: number; to: number; clamped: boolean }
  | { kind: "cross" | "outside" } {
  const sections: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== "writingSection") return;
    const start = pos + 1,
      end = pos + node.nodeSize - 1;
    if (from === to ? from >= start && from <= end : to > start && from < end)
      sections.push({ node, pos });
  });
  if (sections.length !== 1)
    return { kind: sections.length > 1 ? "cross" : "outside" };
  const { node, pos } = sections[0];
  const first = Selection.findFrom(doc.resolve(pos + 1), 1, true);
  const last = Selection.findFrom(
    doc.resolve(pos + node.nodeSize - 1),
    -1,
    true,
  );
  if (
    !first ||
    !last ||
    first.from < pos + 1 ||
    last.to > pos + node.nodeSize - 1
  )
    return { kind: "outside" };
  const a = Math.max(first.from, Math.min(last.to, from));
  const b = Math.max(a, Math.min(last.to, to));
  return { kind: "single", from: a, to: b, clamped: a !== from || b !== to };
}

function sameTopology(a: string[] | null, b: string[] | null): boolean {
  return !!a && !!b && a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Clipboard sections are content, not authority to create section instances. */
function contentSlice(slice: Slice): Slice {
  const nodes: PMNode[] = [];
  let unwrapped = false;
  slice.content.forEach((node) => {
    if (node.type.name === "writingSection") {
      unwrapped = true;
      node.content.forEach((child) => nodes.push(child));
    } else nodes.push(node);
  });
  return unwrapped ? Slice.maxOpen(Fragment.fromArray(nodes), true) : slice;
}

export function createSectionBoundaryPlugin(
  options: Partial<SectionBoundaryOptions> = {},
): Plugin {
  const blocked = (reason: SectionBoundaryReason) => {
    options.onBlocked?.(reason);
    return true;
  };
  const replace = (
    view: EditorView,
    from: number,
    to: number,
    value: string | Slice,
  ): boolean => {
    const range = sectionContentRange(view.state.doc, from, to);
    if (range.kind !== "single")
      return blocked(
        range.kind === "cross"
          ? "cross-section-selection"
          : "section-topology-change",
      );
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, range.from, range.to),
    );
    if (typeof value === "string") {
      if (value) tr.insertText(value, range.from, range.to);
      else tr.deleteSelection();
    } else
      tr.replaceSelection(contentSlice(value))
        .setMeta("paste", true)
        .setMeta("uiEvent", "paste");
    view.dispatch(tr.scrollIntoView());
    return true;
  };
  return new Plugin({
    key: new PluginKey("section-boundary-guard"),
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;
      const after = sectionTopology(tr.doc);
      if (!after) {
        blocked("invalid-section-ids");
        return false;
      }
      if (
        tr.getMeta(topologyAuthorization) === authorization ||
        isHistoryTransaction(tr)
      )
        return true;
      if (!sameTopology(sectionTopology(state.doc), after)) {
        blocked("section-topology-change");
        return false;
      }
      const local = tr.getMeta(localEditAuthorization);
      if (local?.token === authorization) {
        let valid =
          sectionTopology(state.doc)?.includes(local.sectionId) ?? false;
        state.doc.forEach((node, _pos, index) => {
          if (
            node.attrs.id !== local.sectionId &&
            !node.eq(tr.doc.child(index))
          )
            valid = false;
        });
        if (!valid) {
          blocked("cross-section-selection");
          return false;
        }
        return true;
      }
      // Cross-section native editing is not a local edit, even if a transform happens
      // to retain the wrappers. Selection/copy/navigation transactions remain free.
      if (
        sectionContentRange(state.doc, state.selection.from, state.selection.to)
          .kind === "cross"
      ) {
        blocked("cross-section-selection");
        return false;
      }
      return true;
    },
    props: {
      handleTextInput(view, from, to, text) {
        const range = sectionContentRange(view.state.doc, from, to);
        if (range.kind === "single" && !range.clamped) return false;
        return replace(view, from, to, text);
      },
      handlePaste(view, _event, slice) {
        const { from, to } = view.state.selection;
        return replace(view, from, to, slice);
      },
      handleKeyDown(view, event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return false;
        const { from, to, empty } = view.state.selection;
        const range = sectionContentRange(view.state.doc, from, to);
        if (range.kind !== "single")
          return blocked(
            range.kind === "cross"
              ? "cross-section-selection"
              : "section-topology-change",
          );
        if (!empty && range.clamped) return replace(view, from, to, "");
        // Native join/lift commands must not consume a neighboring empty section.
        if (empty) {
          const $pos = view.state.doc.resolve(from);
          if ($pos.depth >= 1) {
            const bounds = sectionContentRange(
              view.state.doc,
              $pos.before(1),
              $pos.after(1),
            );
            if (
              bounds.kind === "single" &&
              (event.key === "Backspace"
                ? from <= bounds.from
                : from >= bounds.to)
            )
              return blocked("section-topology-change");
          }
        }
        return false;
      },
      handleDOMEvents: {
        beforeinput(view, raw) {
          const event = raw as InputEvent;
          const { from, to } = view.state.selection;
          const range = sectionContentRange(view.state.doc, from, to);
          const editing = /^(insert|delete)/.test(event.inputType);
          if (!editing) return false;
          if (range.kind === "cross") {
            event.preventDefault();
            return blocked("cross-section-selection");
          }
          if (
            range.kind === "single" &&
            range.clamped &&
            (event.inputType === "insertText" ||
              event.inputType.startsWith("delete"))
          ) {
            event.preventDefault();
            return replace(
              view,
              from,
              to,
              event.inputType === "insertText" ? (event.data ?? "") : "",
            );
          }
          return false;
        },
        cut(view, event) {
          const { from, to } = view.state.selection;
          const range = sectionContentRange(view.state.doc, from, to);
          if (range.kind === "cross") {
            // A cut across sections would be destructive. Copy stays entirely native.
            event.preventDefault();
            return blocked("cross-section-selection");
          }
          if (range.kind === "single" && range.clamped) {
            // Let the native cut serializer run, but give its deletion only content.
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, range.from, range.to),
              ),
            );
          }
          return false;
        },
      },
    },
  });
}

export const SectionBoundaryGuard = Extension.create<SectionBoundaryOptions>({
  name: "sectionBoundaryGuard",
  priority: 1000,
  addOptions() {
    return { onBlocked: () => {} };
  },
  addProseMirrorPlugins() {
    return [createSectionBoundaryPlugin(this.options)];
  },
});
