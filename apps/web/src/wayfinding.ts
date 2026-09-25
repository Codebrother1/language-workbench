import { useEffect, useRef, useState } from "react";
import {
  sectionKinds,
  sectionText,
  documentText,
  type WritingSection,
} from "./domain";
import type { Workspace } from "./useWorkspace";
export type ToolDestination =
  | "structure"
  | "thoughts"
  | "models"
  | "compare"
  | "variants"
  | "save"
  | "word"
  | "sentence"
  | "help"
  | "sections"
  | "technical";
export type LibraryNavigation = { token: number; query: string; kind: string };
export type ToolNavigation = {
  token: number;
  tool: ToolDestination;
  focus?: string;
};
const selectorFor: Record<ToolDestination, string> = {
  structure: ".structure-tool",
  thoughts: ".structure-tool",
  models: ".model-controls",
  compare: ".model-controls",
  variants: ".variants",
  save: ".inspector > .quick-save",
  word: ".word-lens",
  sentence: ".lab-head",
  help: ".context-help",
  sections: ".structure",
  technical: ".all-actions",
};
/** UI-only routing. No document/library/provider state is owned here. */
export function useWayfinding(w: Workspace) {
  const [paletteOpen, setPaletteOpen] = useState(false),
    [initialQuery, setInitialQuery] = useState("");
  const [toolNavigation, setToolNavigation] = useState<ToolNavigation | null>(
    null,
  );
  const [libraryNavigation, setLibraryNavigation] = useState<LibraryNavigation>(
    { token: 0, query: "", kind: "all" },
  );
  const nextToken = useRef(0);
  const activeDocument = useRef(w.doc.id);
  const openCommands = (query = "") => {
    setInitialQuery(query);
    setPaletteOpen(true);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.altKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setInitialQuery("");
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, []);
  useEffect(() => {
    if (activeDocument.current !== w.doc.id) {
      activeDocument.current = w.doc.id;
      setToolNavigation(null);
      setPaletteOpen(false);
    }
  }, [w.doc.id]);
  useEffect(() => {
    if (!toolNavigation) return;
    const frame = requestAnimationFrame(() => {
      let element = document.querySelector<HTMLElement>(
        selectorFor[toolNavigation.tool],
      );
      if (toolNavigation.tool === "word" && !element) {
        element = document.querySelector<HTMLElement>(".context-help");
        if (element instanceof HTMLDetailsElement) element.open = true;
        w.setNotice(
          "Select a word or short phrase in your page. Word Lens appears for that exact selection.",
        );
      }
      if (!element) return;
      if (element instanceof HTMLDetailsElement) element.open = true;
      if (toolNavigation.tool === "thoughts")
        element
          .querySelector<HTMLDetailsElement>("details")
          ?.setAttribute("open", "");
      if (toolNavigation.tool === "compare")
        element
          .querySelector<HTMLDetailsElement>(".model-controls-body details")
          ?.setAttribute("open", "");
      const panel = element.closest<HTMLElement>(".inspector");
      if (panel && panel.scrollHeight > panel.clientHeight)
        panel.scrollTo({
          top:
            panel.scrollTop +
            element.getBoundingClientRect().top -
            panel.getBoundingClientRect().top -
            16,
          behavior: "smooth",
        });
      else if (panel)
        element.scrollIntoView({ block: "start", behavior: "smooth" });
      const field = toolNavigation.focus
        ? element.querySelector<HTMLElement>(toolNavigation.focus)
        : null;
      field?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [toolNavigation]);
  const showTool = (tool: ToolDestination, focus?: string) => {
    w.setPanel(null);
    if (tool !== "sections") void w.setInspectorVisible(true);
    if (
      [
        "word",
        "variants",
        "save",
        "structure",
        "thoughts",
        "technical",
        "compare",
      ].includes(tool)
    )
      w.showLocalWorkbench();
    setToolNavigation({ token: ++nextToken.current, tool, focus });
  };
  const active = () =>
    w.doc.sections.find((s) => s.id === w.target?.sectionId) ??
    (w.doc.sections.length === 1 ? w.doc.sections[0] : null);
  const requireSection = () => {
    const s = active();
    if (!s) w.setNotice("Click inside one part of your writing first.");
    return s;
  };
  const findLibrary = (query = "", kind = "all") => {
    setLibraryNavigation({ token: ++nextToken.current, query, kind });
    w.setPanel("library");
  };
  const runCommand = (id: string) => {
    const section = active();
    const add = (kind: WritingSection["kind"]) => {
      if (!w.ready) return;
      const s = requireSection();
      if (s) w.addSectionAfter(s.id, kind);
    };
    if (id.startsWith("insert:")) {
      const kind = id.slice(7);
      if (sectionKinds.includes(kind as WritingSection["kind"]))
        add(kind as WritingSection["kind"]);
      return;
    }
    switch (id) {
      case "write":
        w.setPanel(null);
        void w.setPreviewVisible(true);
        setToolNavigation(null);
        w.editor?.commands.focus();
        return;
      case "paste": {
        if (!w.ready) return;
        const sourceId = w.addSource();
        w.setPanel("sources");
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLTextAreaElement>(
              `[data-source-id="${sourceId}"] [data-source-text]`,
            )
            ?.focus(),
        );
        return;
      }
      case "brief":
        w.setPanel("brief");
        return;
      case "sources":
        w.setPanel("sources");
        return;
      case "style":
        w.setPanel("style");
        return;
      case "guides":
        w.setPanel("guides");
        return;
      case "radar":
        w.setPanel("radar");
        return;
      case "providers":
        w.setPanel("providers");
        return;
      case "history":
        w.setPanel("history");
        return;
      case "library":
        findLibrary();
        return;
      case "library-snippets":
        findLibrary("", "snippet");
        return;
      case "library-patterns":
        findLibrary("", "pattern");
        return;
      case "library-moves":
        findLibrary("", "move");
        return;
      case "library-hooks":
        findLibrary("Hook");
        return;
      case "sentence":
        w.focusSentence();
        showTool("sentence");
        return;
      case "section":
        if (section) w.focusSection(section.id);
        showTool("sentence");
        return;
      case "word":
        showTool("word");
        return;
      case "make-hook": {
        const s = requireSection();
        if (!s) return;
        w.patchSection(s.id, {
          kind: "Hook",
          ...(s.label === s.kind ? { label: "Hook" } : {}),
        });
        w.focusSection(s.id);
        w.setNotice("This part is now a Hook. Every word is unchanged.");
        return;
      }
      case "thoughts": {
        const text =
          (w.editor?.state.selection.empty && section
            ? sectionText(section)
            : w.target?.text) ?? "";
        if (!text.trim()) {
          w.setNotice(
            "Write or select a thought first, or type raw notes into Structure.",
          );
        } else if (!w.structure.raw.trim()) {
          w.setStructure((d) => ({ ...d, raw: text }));
        } else {
          w.setNotice(
            "Your earlier raw notes are preserved. Use Copy target into raw notes if you want to replace them.",
          );
        }
        w.segmentThoughts();
        showTool("thoughts", "[data-structure-raw]");
        return;
      }
      case "structure":
        showTool("structure", '[data-structure-slot="a"]');
        return;
      case "sections":
        w.setWorkbenchVisible(true);
        showTool("sections");
        w.setNotice(
          "Drag parts in the left-hand view, or put the cursor at a split point and use the scissors in the toolbar. Nothing was reorganized.",
        );
        return;
      case "models":
        if (!w.target?.text.trim()) {
          w.setPanel("providers");
          return;
        }
        showTool("models");
        return;
      case "compare":
        if (!w.target?.text.trim()) {
          w.setPanel("providers");
          return;
        }
        showTool("compare");
        return;
      case "variants":
        if (!w.target?.text.trim() && section) w.focusSection(section.id);
        showTool("variants");
        return;
      case "save":
        if (!w.target?.text.trim()) {
          w.setNotice(
            "Select the words you want to keep, then choose Save this language.",
          );
          return;
        }
        showTool("save");
        return;
      case "technical":
        if (!w.target?.text.trim()) {
          w.setPanel("brief");
          return;
        }
        if (w.isLensTarget) {
          w.setLens((l) => ({ ...l, technical: true }));
          showTool("word");
        } else {
          w.setAction("technical");
          showTool("technical");
        }
        return;
      case "critique":
        if (!documentText(w.doc).trim()) {
          w.setNotice(
            "Write a thought first; critique reads the piece you supply.",
          );
          return;
        }
        void w.ask("diagnose", "critique");
        return;
      case "copy-document":
        void w.copy(documentText(w.doc));
        return;
      case "insert": {
        if (!w.ready) return;
        w.setPanel(null);
        const index = w.doc.sections.findIndex((s) => s.id === section?.id);
        const before =
          index >= 0 ? (w.doc.sections[index + 1]?.id ?? null) : null;
        const element = (document.querySelector(".command-trigger") ??
          w.editor?.view.dom) as HTMLElement | undefined;
        if (element) w.requestSectionInsertion(before, element);
        return;
      }
      case "next-thought":
        add("Freeform");
        return;
      case "add-point":
        add("Point");
        return;
      case "add-setup":
        add("Setup");
        return;
      case "add-example":
        add("Example");
        return;
      case "add-segue":
        add("Segue");
        return;
      case "help":
        showTool("help");
        return;
    }
  };
  return {
    paletteOpen,
    initialQuery,
    openCommands,
    closeCommands: () => setPaletteOpen(false),
    runCommand,
    toolNavigation,
    libraryNavigation,
  };
}
export type Wayfinding = ReturnType<typeof useWayfinding>;
