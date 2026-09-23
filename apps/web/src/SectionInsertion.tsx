import type { Editor } from "@tiptap/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sectionKinds, type WritingSection } from "./domain";
import { Button, Field, Select } from "./ui";
export type InsertionAnchor = {
  documentId: string;
  beforeSectionId: string | null;
  x: number;
  y: number;
  returnFocus?: HTMLElement;
};
export function SectionInsertionPicker({
  anchor,
  sections,
  onInsert,
  onClose,
}: {
  anchor: InsertionAnchor;
  sections: WritingSection[];
  onInsert: (kind: WritingSection["kind"]) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState<WritingSection["kind"]>("Freeform");
  const index =
    anchor.beforeSectionId === null
      ? sections.length
      : sections.findIndex((s) => s.id === anchor.beforeSectionId);
  const prior = sections[index - 1],
    next = sections[index];
  const suggested: WritingSection["kind"][] =
    index === 0
      ? ["Hook", "Headline", "Point", "Freeform"]
      : prior?.kind === "Hook" || prior?.kind === "Cold Open"
        ? ["Setup", "Point", "Segue", "Freeform"]
        : ["Point", "Example", "Segue", "Freeform"];
  const available = sectionKinds.filter((k) =>
    k.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>("input")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        anchor.returnFocus?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, []);
  const left = Math.max(12, Math.min(anchor.x, window.innerWidth - 332));
  const top = Math.max(12, Math.min(anchor.y, window.innerHeight - 440));
  return (
    <div
      ref={root}
      className="section-insertion-picker"
      role="dialog"
      aria-label="Insert section"
      style={{ left, top, maxHeight: window.innerHeight - top - 12 }}
    >
      <div className="row between">
        <h3>Insert a section</h3>
        <Button aria-label="Close insertion menu" onClick={onClose}>
          ×
        </Button>
      </div>
      <p className="small muted">Position {index + 1} of {sections.length + 1}</p>
      <p className="small muted">
        {prior ? `After ${prior.label}` : "At the beginning"}
        {next ? ` · before ${next.label}` : " · at the end"}
      </p>
      <p className="small muted">
        Any type, any number. These choices are suggestions, not a template.
      </p>
      <div className="insertion-suggestions">
        {suggested.map((k) => (
          <Button key={k} onClick={() => onInsert(k)}>
            Insert {k}
          </Button>
        ))}
      </div>
      <Field label="Search section types">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            const match = sectionKinds.find((k) =>
              k.toLowerCase().includes(e.target.value.toLowerCase()),
            );
            if (match) setKind(match);
          }}
          placeholder="All section types remain available"
        />
      </Field>
      <Field label="All section types">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {available.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </Field>
      <Button
        className="primary full"
        disabled={!available.length}
        onClick={() => onInsert(kind)}
      >
        Insert selected type
      </Button>
    </div>
  );
}

/** Sibling overlay: never place buttons in contenteditable or its clipboard DOM. */
export function SectionInsertionGaps({
  editor,
  sections,
  onInsert,
}: {
  editor: Editor | null;
  sections: WritingSection[];
  onInsert: (id: string | null, button: HTMLElement) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  type Gap = { beforeId: string | null; top: number; label: string };
  const [gaps, setGaps] = useState<Gap[]>([]);
  useLayoutEffect(() => {
    if (!editor || !layer.current) return;
    const host = layer.current.parentElement!;
    let frame = 0,
      alive = true;
    let measured: Gap[] = [];
    const measure = () => {
      if (!alive) return;
      const rect = host.getBoundingClientRect();
      const nodes = Array.from(
        editor.view.dom.querySelectorAll<HTMLElement>(
          ":scope > section[data-writing-section]",
        ),
      );
      const next: Gap[] = [];
      nodes.forEach((node, index) => {
        const bounds = node.getBoundingClientRect();
        const previous = index
          ? nodes[index - 1].getBoundingClientRect()
          : null;
        const top =
          (previous
            ? (previous.bottom + bounds.top) / 2 - 12
            : bounds.top - 24) - rect.top;
        const section = sections.find((s) => s.id === node.id);
        if (section)
          next.push({
            beforeId: section.id,
            top,
            label: `Insert section at position ${index + 1}, before ${section.label}`,
          });
      });
      const last = nodes.at(-1);
      if (last)
        next.push({
          beforeId: null,
          top: last.getBoundingClientRect().bottom - rect.top,
          label: "Insert section at end",
        });
      measured = next;
      setGaps((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const pointer = (event: PointerEvent) => {
      const y = event.clientY - host.getBoundingClientRect().top;
      const gap = measured.find((g) => Math.abs(g.top + 12 - y) <= 14);
      setHovered(gap ? (gap.beforeId ?? "end") : null);
    };
    const leave = () => setHovered(null);
    const resize = new ResizeObserver(schedule);
    resize.observe(editor.view.dom);
    resize.observe(host);
    const mutations = new MutationObserver(schedule);
    mutations.observe(editor.view.dom, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    host.addEventListener("pointermove", pointer);
    host.addEventListener("pointerleave", leave);
    editor.on("transaction", schedule);
    void document.fonts.ready.then(() => {
      if (alive) schedule();
    });
    measure();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      editor.off("transaction", schedule);
      host.removeEventListener("pointermove", pointer);
      host.removeEventListener("pointerleave", leave);
    };
  }, [editor, sections]);
  return (
    <div className="section-gap-layer" ref={layer}>
      {gaps.map((gap) => (
        <div
          className="section-gap"
          key={gap.beforeId ?? "end"}
          style={{ top: gap.top }}
          data-testid="section-gap"
          data-active={hovered === (gap.beforeId ?? "end")}
        >
          <button
            type="button"
            className="section-gap-button"
            data-testid="insert-at-gap"
            data-before-section-id={gap.beforeId ?? ""}
            aria-label={gap.label}
            title={gap.label}
            aria-haspopup="dialog"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => onInsert(gap.beforeId, event.currentTarget)}
          />
        </div>
      ))}
    </div>
  );
}
