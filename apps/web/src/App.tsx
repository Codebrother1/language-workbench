import { RelationalContext, RelationalCompare } from "./RelationalWorkspace";
import { modelLabel } from "./ModelControls";
import { FirstMove } from "./FirstMove";
import { useWayfinding } from "./wayfinding";
import { CommandPalette } from "./CommandPalette";
import {
  SectionInsertionPicker,
  SectionInsertionGaps,
} from "./SectionInsertion";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DockDivider, type PaneWidths } from "./DockDivider";
import { EditorContent } from "@tiptap/react";
import { Selection, TextSelection } from "@tiptap/pm/state";
import {
  sectionLocation,
  scrollPreviewToSection,
  scrollPreviewToTarget,
  revealScrollContainer,
} from "./editor";
import { resolveHistoricalTarget } from "./target-drafts";
import { sectionContentRange } from "./section-boundary";
import {
  PanelLeft,
  Plus,
  MoreHorizontal,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Copy,
  Download,
  Upload,
  Files,
  Trash2,
  Settings2,
  Radio,
  BookOpen,
  History,
  Sun,
  Moon,
  Scissors,
  Combine,
  Check,
  FileText,
  X,
} from "lucide-react";
import { useWorkspace, type Workspace } from "./useWorkspace";
import {
  documentText,
  draftSections,
  parkedSections,
  toMarkdown,
  sectionText,
  contentTypeConfig,
  type ParkedGroup,
  type WritingSection,
} from "./domain";
import {
  Button,
  ConfirmDelete,
  Select,
  Field,
  Dialog,
  GrowingTextarea,
  download,
} from "./ui";
import { WritingLabShell } from "./WritingLabShell";
import { UtilityPanel } from "./UtilityPanel";
import { SectionConceptSelect } from "./SectionConceptHelp";
import {
  customSectionLabel,
  sectionReference,
  sectionMentions,
  duplicateDocumentCue,
  hasPieceMemoryContent,
} from "./workspace-helpers";

function draftPositionLabel(section: WritingSection, index: number): string {
  const opening = sectionText(section).replace(/\s+/g, " ").trim();
  const name =
    section.label.trim() && section.label !== section.kind
      ? section.label.trim()
      : opening || section.label;
  const short = name.length > 52 ? name.slice(0, 49).trimEnd() + "…" : name;
  return `After “${short}” · section ${index + 1} ${section.kind}`;
}

function scrollWorkbenchToSection(
  id: string,
  force = false,
  allowPageScroll = false,
  behavior: ScrollBehavior = "smooth",
): boolean {
  const card = Array.from(
    document.querySelectorAll<HTMLElement>(".structure-item"),
  ).find((element) => element.dataset.sectionId === id);
  const pane = card?.closest<HTMLElement>(".structure");
  if (!card || !pane || getComputedStyle(card).display === "none") return false;
  const bounds = pane.getBoundingClientRect(),
    target = card.getBoundingClientRect();
  const header = pane
    .querySelector<HTMLElement>(".area-jump")
    ?.getBoundingClientRect();
  const lab = document
    .querySelector<HTMLElement>(".dock-inspector:not(.pane-hidden)")
    ?.getBoundingClientRect();
  const labOverlaps =
    lab &&
    lab.left < bounds.right &&
    lab.right > bounds.left &&
    lab.top < bounds.bottom &&
    lab.bottom > bounds.top;
  const usableTop = Math.max(bounds.top + 12, header?.bottom ?? bounds.top) + 8;
  const usableBottom =
    Math.min(
      bounds.bottom,
      window.innerHeight,
      labOverlaps ? lab.top : bounds.bottom,
    ) - 12;
  const controls = card
    .querySelector<HTMLElement>(".card-essential")
    ?.getBoundingClientRect();
  const delta =
    controls && controls.bottom > usableBottom
      ? controls.bottom - usableBottom
      : target.top < usableTop
        ? target.top - usableTop
        : target.top > usableBottom - 60 || force
          ? target.top - usableTop
          : 0;
  if (!["auto", "scroll"].includes(getComputedStyle(pane).overflowY)) {
    if (
      allowPageScroll &&
      (target.bottom < 60 ||
        (controls?.bottom ?? target.top) > window.innerHeight - 90)
    )
      card.scrollIntoView({ block: "nearest", behavior });
    return true;
  }
  if (delta && usableBottom > usableTop)
    pane.scrollTo({ top: pane.scrollTop + delta, behavior });
  if (allowPageScroll) revealScrollContainer(pane, behavior);
  return true;
}

function ShortLabelEditor({
  section,
  number,
  onSave,
}: {
  section: WritingSection;
  number: number;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const cancelled = useRef(false);
  const finish = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    onSave(value.trim() || section.kind);
    setEditing(false);
  };
  return editing ? (
    <input
      className="short-label-input"
      aria-label={`Short label for section ${number}`}
      placeholder="Short label (optional)"
      value={value}
      maxLength={80}
      onChange={(event) => setValue(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          cancelled.current = true;
          setEditing(false);
        }
      }}
      autoFocus
    />
  ) : (
    <Button
      className="short-label-action"
      aria-label={`${customSectionLabel(section) ? "Rename" : "Name"} section ${number}`}
      onClick={() => {
        cancelled.current = false;
        setValue(customSectionLabel(section) ?? "");
        setEditing(true);
      }}
    >
      {customSectionLabel(section) ? "Rename" : "Name"}
    </Button>
  );
}

function ParkedGroupHeading({
  group,
  count,
  onToggle,
  onRename,
  onDelete,
}: {
  group: ParkedGroup;
  count: number;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(group.name);
  const finish = () => {
    if (name.trim()) onRename(name);
    else setName(group.name);
    setEditing(false);
  };
  return (
    <div className="parked-group-heading" data-parked-group-heading={group.id}>
      <button
        aria-label={`${group.collapsed ? "Expand" : "Collapse"} ${group.name}`}
        aria-expanded={!group.collapsed}
        onClick={onToggle}
      >
        <ChevronDown size={14} className={group.collapsed ? "closed" : ""} />
        {group.name} · {count}
      </button>
      {editing ? (
        <input
          aria-label={`Rename ${group.name}`}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish();
            if (event.key === "Escape") {
              setName(group.name);
              setEditing(false);
            }
          }}
          autoFocus
        />
      ) : (
        <Button
          onClick={() => {
            setName(group.name);
            setEditing(true);
          }}
        >
          Rename
        </Button>
      )}
      <Button
        aria-label={`Delete parked group ${group.name}`}
        title={`Delete parked group ${group.name}`}
        onClick={() => {
          if (count) onDelete();
          else setDeleting(true);
        }}
      >
        <Trash2 size={13} />
      </Button>
      {deleting && (
        <ConfirmDelete
          title={`Delete empty parked group “${group.name}”?`}
          confirmLabel="Delete group"
          ariaLabel="Delete parked group"
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            onDelete();
            setDeleting(false);
          }}
        />
      )}
    </div>
  );
}
type SavedWorkKind = "variants" | "structure" | "history";
function savedWorkLabel(section: WritingSection): string {
  const count = section.variants.length;
  return `${count} ${count === 1 ? "take" : "takes"}`;
}
function Structure({
  w,
  onRemove,
  editorCard,
  onWriteCard,
  onEditPreview,
  onReadParked,
  onOpenSavedWork,
}: {
  w: Workspace;
  onRemove: (id: string) => void;
  editorCard: string | null;
  onWriteCard: (id: string, point?: { x: number; y: number }) => void;
  onEditPreview: (id: string) => void;
  onReadParked: (id: string) => void;
  onOpenSavedWork: (id: string, kind: SavedWorkKind) => void;
}) {
  const drag = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [thought, setThought] = useState("");
  const [captureDestination, setCaptureDestination] = useState<
    "draft" | "parked"
  >("draft");
  const [parkedThought, setParkedThought] = useState("");
  const parkedThoughtRef = useRef<HTMLTextAreaElement>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [includeId, setIncludeId] = useState<string | null>(null);
  const [includePosition, setIncludePosition] = useState("");
  const [saveTakeId, setSaveTakeId] = useState<string | null>(null);
  const [takeName, setTakeName] = useState("");
  const takeNameInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (saveTakeId && w.selectedSectionId === saveTakeId)
      takeNameInput.current?.focus({ preventScroll: true });
  }, [saveTakeId, w.selectedSectionId]);
  const structureRef = useRef<HTMLElement>(null);
  const thoughtRef = useRef<HTMLTextAreaElement>(null);
  const draftStart = useRef<HTMLDivElement>(null);
  const parkedStart = useRef<HTMLDivElement>(null);
  const jumpTo = (target: HTMLElement | null) => {
    const pane = structureRef.current;
    if (!target || !pane) return;
    if (
      pane.scrollHeight > pane.clientHeight + 2 &&
      ["auto", "scroll"].includes(getComputedStyle(pane).overflowY)
    ) {
      pane.scrollTo({
        top:
          pane.scrollTop +
          target.getBoundingClientRect().top -
          pane.getBoundingClientRect().top -
          62,
        behavior: "smooth",
      });
    } else target.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const draft = draftSections(w.doc);
  const parked = parkedSections(w.doc);
  const visibleSections =
    w.layout.primaryView === "workbench" ? w.doc.sections : draft;
  const finishDrag = () => {
    drag.current = null;
    setDraggingId(null);
    setDropGap(null);
  };
  const gapFor = (source: string, targetIndex: number) => {
    const sourceIndex = w.doc.sections.findIndex(
      (section) => section.id === source,
    );
    return sourceIndex < targetIndex ? targetIndex + 1 : targetIndex;
  };
  const drop = (source: string, gap: number) => {
    const from = w.doc.sections.findIndex((section) => section.id === source);
    if (from >= 0) {
      const to = gap > from ? gap - 1 : gap;
      if (
        to !== from &&
        w.doc.sections[from]?.placement === w.doc.sections[to]?.placement
      )
        w.moveSection(source, to);
    }
    finishDrag();
  };
  const capture = () => {
    if (!w.captureThought(thought, captureDestination)) return;
    setThought("");
    requestAnimationFrame(() => thoughtRef.current?.focus());
  };
  const captureParked = () => {
    if (!w.captureThought(parkedThought, "parked")) return;
    setParkedThought("");
    requestAnimationFrame(() => parkedThoughtRef.current?.focus());
  };
  const jumpToGroup = (group: ParkedGroup) => {
    if (group.collapsed) w.setParkedGroupCollapsed(group.id, false);
    requestAnimationFrame(() => {
      const heading = Array.from(
        structureRef.current?.querySelectorAll<HTMLElement>(
          "[data-parked-group-heading]",
        ) ?? [],
      ).find((element) => element.dataset.parkedGroupHeading === group.id);
      jumpTo(heading ?? null);
    });
  };
  const groupHeading = (group: ParkedGroup) => (
    <ParkedGroupHeading
      key={group.id}
      group={group}
      count={parked.filter((item) => item.parkedGroupId === group.id).length}
      onToggle={() => w.setParkedGroupCollapsed(group.id, !group.collapsed)}
      onRename={(name) => w.renameParkedGroup(group.id, name)}
      onDelete={() => w.deleteParkedGroup(group.id)}
    />
  );
  const addDraftButton = (
    <Button
      className="add-section"
      onClick={(event) =>
        w.requestSectionInsertion(parked[0]?.id ?? null, event.currentTarget)
      }
    >
      <Plus size={14} /> Add draft section
    </Button>
  );
  const parkedBeginning = (
    <>
      <div
        ref={parkedStart}
        className="parked-area-heading"
        data-testid="parked-area"
      >
        <b>PARKED THOUGHTS · {parked.length}</b>
        <span>Still in this project. Outside the reader draft.</span>
      </div>
      {w.doc.parkedGroups.length > 0 && (
        <div
          className="parked-group-jump"
          role="group"
          aria-label="Parked groups"
        >
          {w.doc.parkedGroups.map((group) => (
            <Button key={group.id} onClick={() => jumpToGroup(group)}>
              {group.name} ·{" "}
              {
                parked.filter((section) => section.parkedGroupId === group.id)
                  .length
              }
            </Button>
          ))}
        </div>
      )}
      <div className="parked-ungrouped-heading">
        Ungrouped · {parked.filter((section) => !section.parkedGroupId).length}
      </div>
    </>
  );
  return (
    <nav
      ref={structureRef}
      className={
        "structure " +
        (w.layout.primaryView === "workbench" ? "timeline" : "") +
        " density-" +
        w.layout.density
      }
      aria-label="Document structure"
    >
      <div className="row between">
        <span className="eyebrow">
          {w.layout.primaryView === "workbench" ? "WORKBENCH" : "STRUCTURE"}
        </span>
        <span className="count">
          {draft.length} draft
          {parked.length ? ` · ${parked.length} parked` : ""}
        </span>
      </div>
      <p className="small muted structure-hint">
        Write, then move parts into order.
      </p>
      {w.layout.primaryView === "workbench" && (
        <div className="area-jump" role="group" aria-label="Thought areas">
          <Button onClick={() => jumpTo(draftStart.current)}>
            Draft · {draft.length}
          </Button>
          <Button
            disabled={!parked.length}
            onClick={() => jumpTo(parkedStart.current)}
          >
            Parked · {parked.length}
          </Button>
        </div>
      )}
      {w.layout.primaryView === "workbench" && (
        <div
          className="row density-controls"
          role="group"
          aria-label="Card density"
        >
          <Button
            aria-pressed={w.layout.density === "comfortable"}
            onClick={() => w.setDensity("comfortable")}
          >
            Comfortable
          </Button>
          <Button
            aria-pressed={w.layout.density === "overview"}
            onClick={() => w.setDensity("overview")}
          >
            Overview
          </Button>
        </div>
      )}
      {w.layout.primaryView === "workbench" && (
        <div className="thought-capture">
          <div className="row between">
            <label htmlFor="new-thought">NEW THOUGHT · CAPTURE FIRST</label>
            <select
              aria-label="Thought destination"
              value={captureDestination}
              onChange={(event) =>
                setCaptureDestination(event.target.value as "draft" | "parked")
              }
            >
              <option value="draft">Draft</option>
              <option value="parked">Parked</option>
            </select>
          </div>
          <textarea
            id="new-thought"
            ref={thoughtRef}
            aria-label="New thought"
            rows={2}
            value={thought}
            onChange={(event) => setThought(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                capture();
              }
            }}
            placeholder="Talk or type a thought…"
          />
          <Button onClick={capture} disabled={!thought.trim()}>
            <Plus size={14} /> Add thought
          </Button>
          <small>
            Enter adds a Freeform card to {captureDestination}. Shift+Enter adds
            a line.
          </small>
        </div>
      )}
      <div className="section-list">
        <div ref={draftStart} className="section-group-label">
          DRAFT · reader order
        </div>
        {visibleSections.map((s, i) => (
          <Fragment key={s.id}>
            {w.layout.primaryView === "workbench" && i === draft.length && (
              <>
                {addDraftButton}
                {parkedBeginning}
              </>
            )}
            {w.layout.primaryView === "workbench" &&
              s.placement === "parked" &&
              s.parkedGroupId &&
              w.doc.sections[i - 1]?.parkedGroupId !== s.parkedGroupId &&
              w.doc.parkedGroups
                .slice(
                  w.doc.parkedGroups.findIndex(
                    (group) =>
                      group.id === w.doc.sections[i - 1]?.parkedGroupId,
                  ) + 1,
                  w.doc.parkedGroups.findIndex(
                    (group) => group.id === s.parkedGroupId,
                  ) + 1,
                )
                .map(groupHeading)}
            {dropGap === i && draggingId && (
              <div
                className="drop-marker"
                data-testid="drop-marker"
                data-drop-index={i}
                aria-label={`Drop before section ${i + 1}`}
              />
            )}
            <div
              className={
                "structure-item " +
                (s.placement === "parked" ? "parked " : "") +
                (s.placement === "parked" &&
                w.doc.parkedGroups.find((group) => group.id === s.parkedGroupId)
                  ?.collapsed
                  ? "group-collapsed "
                  : "") +
                (w.target?.sectionId === s.id ? "active " : "") +
                (draggingId === s.id ? "dragging" : "")
              }
              data-testid="structure-item"
              data-section-id={s.id}
              data-placement={s.placement}
              onClick={(event) => {
                if (
                  (event.target as HTMLElement).closest(
                    "button,input,textarea,select,details,a,.card-writing",
                  ) ||
                  window.getSelection()?.toString()
                )
                  return;
                w.focusSection(s.id);
              }}
              draggable
              onDragEnd={finishDrag}
              onDragStart={(e) => {
                if (
                  (e.target as HTMLElement).closest(
                    ".card-editor-host,textarea,input",
                  )
                ) {
                  e.preventDefault();
                  return;
                }
                drag.current = s.id;
                setDraggingId(s.id);
                e.dataTransfer.setData("text/plain", s.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (
                  !drag.current ||
                  w.doc.sections.find((item) => item.id === drag.current)
                    ?.placement !== s.placement
                )
                  return;
                if (
                  s.placement === "parked" &&
                  w.doc.sections.find((item) => item.id === drag.current)
                    ?.parkedGroupId !== s.parkedGroupId
                )
                  return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropGap(gapFor(drag.current, i));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const source =
                  e.dataTransfer.getData("text/plain") || drag.current || "";
                if (
                  w.doc.sections.find((item) => item.id === source)
                    ?.placement === s.placement &&
                  (s.placement !== "parked" ||
                    w.doc.sections.find((item) => item.id === source)
                      ?.parkedGroupId === s.parkedGroupId)
                )
                  drop(source, gapFor(source, i));
                else finishDrag();
              }}
            >
              <div className="structure-line">
                <GripVertical
                  size={13}
                  className="grip"
                  aria-label="Drag to reorder"
                />
                <button
                  className="section-focus"
                  onClick={() => w.focusSection(s.id)}
                >
                  <span
                    className="section-number"
                    title={
                      s.placement === "parked"
                        ? "Parked · outside reader order"
                        : undefined
                    }
                    aria-label={s.placement === "parked" ? "Parked" : undefined}
                  >
                    {s.placement === "parked"
                      ? "P"
                      : String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    title={
                      customSectionLabel(s) ??
                      sectionText(s).replace(/\s+/g, " ")
                    }
                  >
                    {customSectionLabel(s) ??
                      (w.layout.primaryView === "workbench" &&
                      w.layout.density === "overview"
                        ? sectionText(s).replace(/\s+/g, " ").slice(0, 58) ||
                          s.kind
                        : s.kind)}
                  </span>
                </button>
                {w.layout.primaryView === "workbench" && (
                  <ShortLabelEditor
                    section={s}
                    number={i + 1}
                    onSave={(label) => w.patchSection(s.id, { label })}
                  />
                )}
              </div>
              {w.layout.primaryView === "workbench" && (
                <>
                  <span className="section-role">ROLE · {s.kind}</span>
                  {s.placement === "parked" && (
                    <span className="parked-status">
                      Parked · excluded from draft
                    </span>
                  )}
                  {(s.variants.length > 0 ||
                    Boolean(
                      s.workbench?.structure?.thoughtA ||
                      s.workbench?.structure?.thoughtB ||
                      s.workbench?.structure?.raw,
                    ) ||
                    Boolean(s.workbench?.runs.length)) && (
                    <div
                      className="card-saved-work"
                      aria-label="Saved Lab work"
                    >
                      {s.variants.length > 0 && (
                        <Button
                          onClick={() => onOpenSavedWork(s.id, "variants")}
                        >
                          {savedWorkLabel(s)}
                        </Button>
                      )}
                      {(s.workbench?.structure?.thoughtA ||
                        s.workbench?.structure?.thoughtB ||
                        s.workbench?.structure?.raw) && (
                        <Button
                          onClick={() => onOpenSavedWork(s.id, "structure")}
                        >
                          Structure work
                        </Button>
                      )}
                      {Boolean(s.workbench?.runs.length) && (
                        <Button
                          onClick={() => onOpenSavedWork(s.id, "history")}
                        >
                          {s.workbench!.runs.length}{" "}
                          {s.workbench!.runs.length === 1
                            ? "Lab run"
                            : "Lab runs"}
                        </Button>
                      )}
                    </div>
                  )}
                  {w.layout.density === "comfortable" &&
                  w.target?.sectionId === s.id ? (
                    <div className="card-writing" data-testid="card-writing">
                      <div className="card-layer-label">
                        WRITING{" "}
                        <span>
                          ·{" "}
                          {s.placement === "parked"
                            ? "currently parked"
                            : "reader-facing prose"}
                        </span>
                      </div>
                      <div
                        className="card-editor-host"
                        data-card-editor-host={s.id}
                        onKeyDownCapture={(event) => {
                          if (
                            editorCard !== s.id ||
                            !(event.metaKey || event.ctrlKey) ||
                            event.key.toLowerCase() !== "a" ||
                            !w.editor
                          )
                            return;
                          const located = sectionLocation(w.editor, s.id);
                          if (!located) return;
                          const doc = w.editor.state.doc;
                          const first = Selection.findFrom(
                            doc.resolve(located.pos + 1),
                            1,
                            true,
                          );
                          const last = Selection.findFrom(
                            doc.resolve(
                              located.pos + located.node.nodeSize - 1,
                            ),
                            -1,
                            true,
                          );
                          if (!first || !last) return;
                          event.preventDefault();
                          event.stopPropagation();
                          w.editor.view.dispatch(
                            w.editor.state.tr.setSelection(
                              TextSelection.create(doc, first.from, last.to),
                            ),
                          );
                        }}
                        onClick={() => {
                          if (editorCard !== s.id) onWriteCard(s.id);
                        }}
                      >
                        {editorCard !== s.id && (
                          <div
                            className="section-excerpt card-write-prompt"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              onWriteCard(s.id, {
                                x: event.clientX - rect.left,
                                y: event.clientY - rect.top,
                              });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onWriteCard(s.id);
                              }
                            }}
                          >
                            {sectionText(s) || "Click to write this section…"}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    (w.layout.density !== "overview" ||
                      customSectionLabel(s)) && (
                      <div className="section-excerpt">
                        {sectionText(s) || "No prose yet."}
                      </div>
                    )
                  )}
                  {s.modelOverride && (
                    <small className="card-model">
                      {modelLabel(w.catalog, s.modelOverride)}
                    </small>
                  )}
                  {w.layout.density === "comfortable" &&
                  w.target?.sectionId === s.id ? (
                    <Field label="STORYBOARD · private note / AI context">
                      <GrowingTextarea
                        aria-label="Section notes · AI context"
                        rows={3}
                        value={s.notes}
                        onFocus={() => w.prepareSectionTarget(s.id)}
                        onChange={(e) =>
                          w.update((d) => ({
                            ...d,
                            sections: d.sections.map((x) =>
                              x.id === s.id
                                ? { ...x, notes: e.target.value }
                                : x,
                            ),
                          }))
                        }
                        placeholder="What should this beat do? What should it hold back?"
                      />
                    </Field>
                  ) : (
                    s.notes && <p className="card-note">{s.notes}</p>
                  )}
                  {w.target?.sectionId === s.id && (
                    <div className="card-essential row wrap">
                      {s.placement === "parked" ? (
                        <>
                          <Button onClick={() => onReadParked(s.id)}>
                            Read parked thought in Preview
                          </Button>
                          <Button
                            onClick={() => {
                              setIncludeId(s.id);
                              setIncludePosition("");
                            }}
                          >
                            Include in draft
                          </Button>
                          <label className="parked-group-select">
                            Group
                            <select
                              aria-label={`Group for ${s.label}`}
                              value={s.parkedGroupId ?? ""}
                              onChange={(event) =>
                                w.moveParkedToGroup(
                                  s.id,
                                  event.target.value || null,
                                )
                              }
                            >
                              <option value="">Ungrouped</option>
                              {w.doc.parkedGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={(e) =>
                              w.requestSectionInsertion(s.id, e.currentTarget)
                            }
                          >
                            + Add before
                          </Button>
                          <Button
                            onClick={(e) =>
                              w.requestSectionInsertion(
                                w.doc.sections[i + 1]?.id ?? null,
                                e.currentTarget,
                              )
                            }
                          >
                            + Add after
                          </Button>
                          <Button
                            onClick={() => onEditPreview(s.id)}
                            aria-label="Edit in preview"
                            title="Places the cursor at the start of this section in the assembled preview. Select text to replace it."
                          >
                            Edit in preview
                          </Button>
                          <Button onClick={() => w.parkThought(s.id)}>
                            Park thought
                          </Button>
                        </>
                      )}
                      <Button
                        onClick={() => {
                          setSaveTakeId(s.id);
                          setTakeName("");
                        }}
                      >
                        Save take
                      </Button>
                    </div>
                  )}
                  {saveTakeId === s.id && w.target?.sectionId === s.id && (
                    <form
                      className="save-take-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (w.saveTake(s.id, takeName)) {
                          setSaveTakeId(null);
                          setTakeName("");
                        }
                      }}
                    >
                      <label>
                        Take name (optional)
                        <input
                          ref={takeNameInput}
                          value={takeName}
                          maxLength={80}
                          onChange={(event) => setTakeName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              event.stopPropagation();
                              setSaveTakeId(null);
                              setTakeName("");
                            }
                          }}
                          placeholder="Calm, Before cut…"
                        />
                      </label>
                      <div className="row wrap">
                        <Button type="submit" className="primary">
                          Save this take
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setSaveTakeId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                  {s.placement === "parked" && includeId === s.id && (
                    <div
                      className="include-picker"
                      role="group"
                      aria-label="Include thought position"
                    >
                      <label htmlFor={`include-${s.id}`}>Place in draft</label>
                      <select
                        id={`include-${s.id}`}
                        aria-label="Draft position"
                        value={includePosition}
                        onChange={(event) =>
                          setIncludePosition(event.target.value)
                        }
                      >
                        <option value="">Choose an exact position…</option>
                        {draft.length > 0 && (
                          <option value={draft[0].id}>
                            At beginning of draft
                          </option>
                        )}
                        {draft.slice(0, -1).map((item, index) => (
                          <option key={item.id} value={draft[index + 1].id}>
                            {draftPositionLabel(item, index)}
                          </option>
                        ))}
                        <option value="__end__">At end of draft</option>
                      </select>
                      <div className="row wrap">
                        <Button
                          className="primary"
                          disabled={!includePosition}
                          onClick={() => {
                            w.includeThought(
                              s.id,
                              includePosition === "__end__"
                                ? null
                                : includePosition,
                            );
                            setIncludeId(null);
                          }}
                        >
                          Include here
                        </Button>
                        <Button onClick={() => setIncludeId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {w.layout.primaryView !== "workbench" && (
                <div className="section-excerpt">
                  {sectionText(s).slice(0, 64) || "Start writing…"}
                </div>
              )}
              {w.target?.sectionId === s.id && (
                <details key={w.layout.density} className="section-options">
                  <summary>
                    Section options <ChevronDown size={12} />
                  </summary>
                  <Field label="Label">
                    <input
                      value={s.label}
                      onChange={(e) =>
                        w.patchSection(s.id, { label: e.target.value })
                      }
                    />
                  </Field>
                  <SectionConceptSelect
                    label="Semantic kind"
                    value={s.kind}
                    onChange={(kind) =>
                      w.patchSection(s.id, {
                        kind,
                        ...(s.label === s.kind ? { label: kind } : {}),
                      })
                    }
                  />
                  {(w.layout.primaryView !== "workbench" ||
                    w.layout.density === "overview") && (
                    <>
                      <Field label="Section notes · AI context">
                        <textarea
                          rows={2}
                          value={s.notes}
                          onChange={(e) =>
                            w.update((d) => ({
                              ...d,
                              sections: d.sections.map((x) =>
                                x.id === s.id
                                  ? { ...x, notes: e.target.value }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </Field>
                    </>
                  )}
                  {s.placement !== "parked" && (
                    <div className="instance-actions">
                      <Button
                        onClick={(e) =>
                          w.requestSectionInsertion(s.id, e.currentTarget)
                        }
                      >
                        Insert above
                      </Button>
                      <Button
                        onClick={(e) =>
                          w.requestSectionInsertion(
                            w.doc.sections[i + 1]?.id ?? null,
                            e.currentTarget,
                          )
                        }
                      >
                        Insert below
                      </Button>
                      <Button onClick={() => w.duplicateSection(s.id)}>
                        Duplicate section
                      </Button>
                    </div>
                  )}
                  <div className="row wrap">
                    <Button
                      aria-label="Move section up"
                      title="Move section up"
                      disabled={
                        i === 0 ||
                        w.doc.sections[i - 1]?.placement !== s.placement ||
                        (s.placement === "parked" &&
                          w.doc.sections[i - 1]?.parkedGroupId !==
                            s.parkedGroupId)
                      }
                      onClick={() => w.moveSection(s.id, i - 1)}
                    >
                      <ArrowUp size={13} />
                    </Button>
                    <Button
                      aria-label="Move section down"
                      title="Move section down"
                      disabled={
                        i === w.doc.sections.length - 1 ||
                        w.doc.sections[i + 1]?.placement !== s.placement ||
                        (s.placement === "parked" &&
                          w.doc.sections[i + 1]?.parkedGroupId !==
                            s.parkedGroupId)
                      }
                      onClick={() => w.moveSection(s.id, i + 1)}
                    >
                      <ArrowDown size={13} />
                    </Button>
                    <Button
                      aria-label="Merge with next section"
                      title="Merge with next section"
                      disabled={
                        i === w.doc.sections.length - 1 ||
                        w.doc.sections[i + 1]?.placement !== s.placement ||
                        (s.placement === "parked" &&
                          w.doc.sections[i + 1]?.parkedGroupId !==
                            s.parkedGroupId)
                      }
                      onClick={() => w.mergeSection(s.id)}
                    >
                      <Combine size={13} />
                    </Button>
                    <Button
                      aria-label="Remove section"
                      title="Remove section"
                      onClick={() => onRemove(s.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </details>
              )}
            </div>
          </Fragment>
        ))}
        {w.layout.primaryView === "workbench" && parked.length === 0 && (
          <>
            {addDraftButton}
            {parkedBeginning}
          </>
        )}
        {w.layout.primaryView !== "workbench" && addDraftButton}
        {w.layout.primaryView === "workbench" &&
          w.doc.parkedGroups
            .slice(
              w.doc.parkedGroups.findIndex(
                (group) => group.id === parked.at(-1)?.parkedGroupId,
              ) + 1,
            )
            .map(groupHeading)}
        {dropGap === w.doc.sections.length && draggingId && (
          <div
            className="drop-marker"
            data-testid="drop-marker"
            data-drop-index={dropGap}
            aria-label="Drop at end"
          />
        )}
      </div>
      {w.layout.primaryView === "workbench" && (
        <div className="parked-capture">
          <label htmlFor="parked-thought">PARKED · QUICK CAPTURE</label>
          <textarea
            id="parked-thought"
            ref={parkedThoughtRef}
            aria-label="Parked thought"
            rows={2}
            value={parkedThought}
            onChange={(event) => setParkedThought(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                captureParked();
              }
            }}
            placeholder="Keep a thought nearby…"
          />
          <Button onClick={captureParked} disabled={!parkedThought.trim()}>
            <Plus size={14} /> Add parked thought
          </Button>
          {creatingGroup ? (
            <div className="row parked-new-group">
              <input
                aria-label="New parked group name"
                maxLength={80}
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (w.createParkedGroup(newGroupName)) {
                      setNewGroupName("");
                      setCreatingGroup(false);
                    }
                  }
                  if (event.key === "Escape") setCreatingGroup(false);
                }}
                autoFocus
              />
              <Button
                disabled={!newGroupName.trim()}
                onClick={() => {
                  if (w.createParkedGroup(newGroupName)) {
                    setNewGroupName("");
                    setCreatingGroup(false);
                  }
                }}
              >
                Create group
              </Button>
              <Button onClick={() => setCreatingGroup(false)}>Cancel</Button>
            </div>
          ) : (
            <Button onClick={() => setCreatingGroup(true)}>
              + New parked group
            </Button>
          )}
        </div>
      )}
      <div className="structure-bottom">
        <span className="eyebrow">CONTEXT</span>
        <Button
          aria-label="Writing brief"
          title="What are you making? Optional Writing Brief"
          onClick={() => w.setPanel("brief")}
        >
          <FileText size={15} />
          What are you making?
        </Button>
        <Button onClick={() => w.setPanel("sources")}>
          <BookOpen size={15} />
          Sources <span className="count">{w.doc.sources.length}</span>
        </Button>
        <Button onClick={() => w.setPanel("library")}>
          <BookOpen size={15} />
          Personal library
        </Button>
        <Button onClick={() => w.setPanel("guides")}>
          <Settings2 size={15} />
          Style guides
        </Button>
        <Button onClick={() => w.setPanel("history")}>
          <History size={15} />
          History
        </Button>
      </div>
    </nav>
  );
}
function Toolbar({ w }: { w: Workspace }) {
  const ed = w.editor;
  const formatBlock = (kind: "heading" | "bulletList" | "orderedList") => {
    if (!ed) return;
    const { doc, selection } = ed.state;
    const range = sectionContentRange(doc, selection.from, selection.to);
    if (range.kind !== "single") {
      w.setNotice(
        "Section boundaries are protected. Format within one section.",
      );
      return;
    }
    if (range.clamped)
      ed.view.dispatch(
        ed.state.tr.setSelection(
          TextSelection.create(doc, range.from, range.to),
        ),
      );
    const chain = ed.chain().focus();
    if (kind === "heading") chain.toggleHeading({ level: 2 }).run();
    else if (kind === "bulletList") chain.toggleBulletList().run();
    else chain.toggleOrderedList().run();
  };
  return (
    <div className="format-toolbar" aria-label="Formatting toolbar">
      <div className="row">
        <Button
          aria-label="Bold"
          title="Bold (⌘/Ctrl B)"
          className={ed?.isActive("bold") ? "on" : ""}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ed?.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </Button>
        <Button
          aria-label="Italic"
          title="Italic (⌘/Ctrl I)"
          className={ed?.isActive("italic") ? "on" : ""}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ed?.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </Button>
        <Button
          aria-label="Heading"
          title="Heading"
          className={ed?.isActive("heading") ? "on" : ""}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatBlock("heading")}
        >
          <Heading2 size={17} />
        </Button>
        <details className="format-list-menu">
          <summary aria-label="List" title="List formatting">
            <List size={15} /> List
          </summary>
          <div>
            <Button
              aria-label="Bullet list"
              className={ed?.isActive("bulletList") ? "on" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(event) => {
                formatBlock("bulletList");
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <List size={15} /> Bullets
            </Button>
            <Button
              aria-label="Numbered list"
              className={ed?.isActive("orderedList") ? "on" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(event) => {
                formatBlock("orderedList");
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <ListOrdered size={15} /> Numbers
            </Button>
          </div>
        </details>
        <span className="divider" />
        <Button
          aria-label="Undo"
          title="Undo"
          disabled={!ed?.can().undo()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ed?.chain().focus().undo().run()}
        >
          <Undo2 size={15} />
        </Button>
        <Button
          aria-label="Redo"
          title="Redo"
          disabled={!ed?.can().redo()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ed?.chain().focus().redo().run()}
        >
          <Redo2 size={15} />
        </Button>
        <span className="divider" />
        <Button
          aria-label="Split section at cursor"
          title="Split section at cursor"
          onMouseDown={(e) => e.preventDefault()}
          onClick={w.splitSection}
        >
          <Scissors size={14} />
        </Button>
      </div>
      <span className="small muted">
        {contentTypeConfig[w.doc.brief.contentType].label}
      </span>
    </div>
  );
}
export default function App() {
  const w = useWorkspace();
  const navigation = useWayfinding(w);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorHome = useRef<HTMLElement | null>(null);
  const pendingCardCaret = useRef<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [editorCard, setEditorCard] = useState<string | null>(null);
  const previewSelectionIntent = useRef(false);
  const previewSectionContext = useRef<{
    documentId: string;
    sectionId: string | null;
  }>({ documentId: w.doc.id, sectionId: w.selectedSectionId });
  const [confirmation, setConfirmation] = useState<{
    kind: "document" | "section" | "archive";
    id?: string;
  } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (menu)
      requestAnimationFrame(() =>
        menuRef.current
          ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
          ?.focus(),
      );
  }, [menu]);
  const layoutMenu = useRef<HTMLDetailsElement>(null);
  const [dragWidths, setDragWidths] = useState<PaneWidths | null>(null);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [hideNextMove, setHideNextMove] = useState(false);
  useEffect(() => setHideNextMove(false), [w.doc.id]);
  const [readingMode, setReadingMode] = useState(false);
  const [parkedFocusId, setParkedFocusId] = useState<string | null>(null);
  const lastDraftId = useRef<string | null>(null);
  const focusContext = useRef<{
    documentId: string;
    sectionId: string | null;
    runId: string | null;
    workbenchScroll: number;
    previewScroll: number;
    inspectorScroll: number;
  } | null>(null);
  const [documentPreviewOverride, setDocumentPreviewOverride] = useState<
    boolean | null
  >(null);
  const [compareSection, setCompareSection] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [labOrigin, setLabOrigin] = useState<{
    documentId: string;
    sectionId: string;
    runId: string;
    inspectorScrollTop: number;
  } | null>(null);
  const [restoreLabRun, setRestoreLabRun] = useState<{
    runId: string;
    inspectorScrollTop: number;
    token: number;
  } | null>(null);
  const [findingVisit, setFindingVisit] = useState<{
    documentId: string;
    sectionId: string;
    runId: string;
    findingIndex: number;
    findingId: string;
    referencedSectionIds: string[];
    inspectorScrollTop: number;
  } | null>(null);
  const [restoreFinding, setRestoreFinding] = useState<{
    runId: string;
    findingIndex: number;
    inspectorScrollTop: number;
    token: number;
  } | null>(null);
  const [openWork, setOpenWork] = useState<{
    sectionId: string;
    kind: SavedWorkKind;
    token: number;
  } | null>(null);
  const [takeReturn, setTakeReturn] = useState<{
    documentId: string;
    sectionId: string;
    pageScroll: number;
    cardTop: number;
    workbenchScroll: number;
    previewScroll: number;
    inspectorVisible: boolean;
  } | null>(null);
  useEffect(() => {
    setTakeReturn(null);
    setEditorCard(null);
  }, [w.doc.id]);
  const draft = draftSections(w.doc);
  const parked = parkedSections(w.doc);
  const text = documentText(w.doc);
  const wordCount = draft.flatMap((section) =>
    sectionText(section).trim().split(/\s+/).filter(Boolean),
  ).length;
  const memoryDraftChanged =
    hasPieceMemoryContent(w.doc.pieceMemory) &&
    w.doc.pieceMemory.reviewedDraftRevision !== w.draftRevision;
  const filename =
    w.doc.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "writing";
  const widths = dragWidths ?? w.layout.paneWidths;
  const workbenchShown = w.layout.workbenchVisible && !previewFocused;
  const inspectorShown = w.layout.inspectorVisible && !previewFocused;
  const previewShown =
    previewFocused ||
    (w.layout.primaryView === "document" && documentPreviewOverride !== null
      ? documentPreviewOverride
      : w.layout.previewVisible);
  const paneCount =
    Number(workbenchShown) + Number(previewShown) + Number(inspectorShown);
  useLayoutEffect(() => {
    const run = w.activeRun;
    if (
      run?.target.scope !== "document" &&
      run?.target.sectionId === w.selectedSectionId
    )
      setLabOrigin((previous) =>
        previous?.documentId === w.doc.id && previous.runId === run.id
          ? previous
          : {
              documentId: w.doc.id,
              sectionId: run.target.sectionId!,
              runId: run.id,
              inspectorScrollTop:
                document.querySelector<HTMLElement>(".inspector")?.scrollTop ??
                0,
            },
      );
  }, [w.activeRun?.id, w.selectedSectionId, w.doc.id]);
  useLayoutEffect(() => {
    const selected = w.doc.sections.find(
      (section) => section.id === w.selectedSectionId,
    );
    if (selected?.placement === "draft") lastDraftId.current = selected.id;
  }, [w.doc.sections, w.selectedSectionId]);
  const orientationToken = useRef(0);
  const interactionGeneration = useRef(0);
  const switchGeneration = useRef<number | null>(null);
  const orientationStarted = useRef(false);
  useLayoutEffect(() => {
    const record = () => {
      interactionGeneration.current++;
    };
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
      window.addEventListener(event, record, true);
    return () => {
      for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
        window.removeEventListener(event, record, true);
    };
  }, []);
  useLayoutEffect(() => {
    if (w.documentSwitching && switchGeneration.current === null)
      switchGeneration.current = interactionGeneration.current;
  }, [w.documentSwitching]);
  const orientationInteracted = useRef(false);
  const orientedPanes = useRef({
    documentId: "",
    sectionId: "",
    workbench: false,
    preview: false,
  });
  useLayoutEffect(() => {
    if (!w.ready) return;
    const id =
      w.selectedSectionId &&
      w.doc.sections.some((section) => section.id === w.selectedSectionId)
        ? w.selectedSectionId
        : w.doc.selectedSectionId;
    if (!id || !w.doc.sections.some((section) => section.id === id)) return;
    const current = orientedPanes.current;
    if (current.documentId !== w.doc.id) {
      const takenOver =
        switchGeneration.current !== null
          ? interactionGeneration.current > switchGeneration.current
          : !orientationStarted.current && interactionGeneration.current > 0;
      switchGeneration.current = null;
      orientationStarted.current = true;
      orientedPanes.current = {
        documentId: w.doc.id,
        sectionId: id,
        workbench: takenOver,
        preview: takenOver,
      };
      orientationInteracted.current = takenOver;
    } else if (current.sectionId !== id) {
      current.sectionId = id;
      if (
        orientationInteracted.current ||
        (current.workbench && current.preview)
      )
        return;
      current.workbench = false;
      current.preview = false;
    }
    if (orientationInteracted.current) return;
    const token = ++orientationToken.current;
    const workspace = document.querySelector<HTMLElement>(".dock-workspace");
    const workbench = document.querySelector<HTMLElement>(
      ".dock-workbench .structure",
    );
    const preview = document.querySelector<HTMLElement>(
      ".dock-preview .writing",
    );
    if (!workspace || !workbench || !preview) return;
    let frame = 0,
      focusFrame = 0,
      focusPending = false,
      geometry = "",
      cancelled = false;
    const stillCurrent = () =>
      !cancelled &&
      !focusPending &&
      token === orientationToken.current &&
      orientedPanes.current.documentId === w.doc.id &&
      orientedPanes.current.sectionId === id &&
      !orientationInteracted.current;
    const orient = () => {
      if (!stillCurrent()) return;
      const state = orientedPanes.current;
      if (workbenchShown && !state.workbench && workbench.clientHeight > 0)
        state.workbench = scrollWorkbenchToSection(id, false, true, "instant");
      if (previewShown && !state.preview && preview.clientHeight > 0) {
        const passage = preview.querySelector<HTMLElement>(
          `[data-preview-section-id="${CSS.escape(id)}"], .writing-editor > section[id="${CSS.escape(id)}"]`,
        );
        if (passage) {
          scrollPreviewToSection(id, false, window.innerWidth > 900, "instant");
          state.preview = true;
        }
      }
    };
    const schedule = () => {
      if (!stillCurrent()) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(orient);
    };
    const observer = new ResizeObserver(() => {
      if (!stillCurrent()) return;
      const next = [workspace, workbench, preview]
        .map((pane) => `${pane.clientWidth}x${pane.clientHeight}`)
        .join("|");
      if (next !== geometry) {
        geometry = next;
        orientedPanes.current.workbench = false;
        orientedPanes.current.preview = false;
        schedule();
      }
    });
    for (const pane of [workspace, workbench, preview]) observer.observe(pane);
    const onScrollEnd = () => {
      if (!stillCurrent()) return;
      const state = orientedPanes.current;
      const card = workbench.querySelector<HTMLElement>(
        `.structure-item[data-section-id="${CSS.escape(id)}"]`,
      );
      const passage = preview.querySelector<HTMLElement>(
        `[data-preview-section-id="${CSS.escape(id)}"], .writing-editor > section[id="${CSS.escape(id)}"]`,
      );
      if (
        workbenchShown &&
        card &&
        (card.getBoundingClientRect().bottom <
          workbench.getBoundingClientRect().top + 60 ||
          card.getBoundingClientRect().top >
            workbench.getBoundingClientRect().bottom - 90)
      )
        state.workbench = false;
      if (
        previewShown &&
        passage &&
        (passage.getBoundingClientRect().bottom <
          preview.getBoundingClientRect().top + 30 ||
          passage.getBoundingClientRect().top >
            preview.getBoundingClientRect().bottom - 90)
      )
        state.preview = false;
      if (!state.workbench || !state.preview) schedule();
    };
    workbench.addEventListener("scrollend", onScrollEnd);
    preview.addEventListener("scrollend", onScrollEnd);
    const cancelNow = () => {
      if (cancelled) return;
      for (const pane of [workbench, preview])
        pane.scrollTo({ top: pane.scrollTop, behavior: "instant" });
      window.scrollTo({ top: window.scrollY, behavior: "instant" });
      orientationInteracted.current = true;
      orientedPanes.current.workbench = true;
      orientedPanes.current.preview = true;
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
    };
    const cancel = (event: Event) => {
      if (cancelled) return;
      if (event.type === "focusin") {
        const owner = event.target;
        if (
          !(owner instanceof HTMLElement) ||
          !owner.closest(".writing-editor")
        )
          return;
        focusPending = true;
        cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => {
          focusPending = false;
          if (!stillCurrent()) return;
          if (
            owner === document.activeElement ||
            owner.contains(document.activeElement)
          )
            cancelNow();
          else schedule();
        });
        return;
      }
      cancelNow();
    };
    for (const event of [
      "wheel",
      "pointerdown",
      "keydown",
      "touchstart",
      "focusin",
    ])
      window.addEventListener(event, cancel, true);
    schedule();
    void document.fonts.ready.then(schedule);
    return () => {
      cancelled = true;
      ++orientationToken.current;
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      workbench.removeEventListener("scrollend", onScrollEnd);
      preview.removeEventListener("scrollend", onScrollEnd);
      for (const event of [
        "wheel",
        "pointerdown",
        "keydown",
        "touchstart",
        "focusin",
      ])
        window.removeEventListener(event, cancel, true);
    };
  }, [
    w.ready,
    w.doc.id,
    w.selectedSectionId,
    w.doc.selectedSectionId,
    workbenchShown,
    previewShown,
  ]);
  const restorePanes = () => {
    const previous = focusContext.current;
    setPreviewFocused(false);
    setReadingMode(false);
    setParkedFocusId(null);
    if (previous?.documentId !== w.doc.id) return;
    if (
      previous.runId &&
      previous.sectionId &&
      previous.sectionId !== w.selectedSectionId &&
      w.doc.sections.some((section) => section.id === previous.sectionId)
    )
      setLabOrigin({
        documentId: w.doc.id,
        sectionId: previous.sectionId,
        runId: previous.runId,
        inspectorScrollTop: previous.inspectorScroll,
      });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const [pane, top] of [
          [".structure", previous.workbenchScroll],
          [".writing", previous.previewScroll],
          [".inspector", previous.inspectorScroll],
        ] as const) {
          const node = document.querySelector<HTMLElement>(
            `.dock-workspace ${pane}`,
          );
          if (node) node.scrollTop = top;
        }
        const selected = w.selectedSectionId ?? previous.sectionId;
        if (
          selected &&
          w.doc.sections.some((section) => section.id === selected)
        )
          requestAnimationFrame(() => {
            scrollWorkbenchToSection(selected, false, false);
            scrollPreviewToSection(selected, false, true);
          });
      }),
    );
  };
  const focusPreview = (parkedId?: string) => {
    focusContext.current = {
      documentId: w.doc.id,
      sectionId: w.selectedSectionId,
      runId: w.activeRun?.id ?? null,
      workbenchScroll:
        document.querySelector<HTMLElement>(".structure")?.scrollTop ?? 0,
      previewScroll:
        document.querySelector<HTMLElement>(".writing")?.scrollTop ?? 0,
      inspectorScroll:
        document.querySelector<HTMLElement>(".inspector")?.scrollTop ?? 0,
    };
    const parked =
      parkedId ??
      w.doc.sections.find(
        (section) =>
          section.id === w.selectedSectionId && section.placement === "parked",
      )?.id;
    if (parked) setEditorCard(null);
    setParkedFocusId(parked ?? null);
    setReadingMode(true);
    setPreviewFocused(true);
  };
  const commitWidths = (next: PaneWidths) => {
    setDragWidths(null);
    void w.setPaneWidths(next);
  };
  const preset = (
    name: "writing" | "review" | "workbench" | "all" | "reset",
  ) => {
    layoutMenu.current?.removeAttribute("open");
    setDragWidths(null);
    setDocumentPreviewOverride(null);
    setPreviewFocused(false);
    void w.applyLayoutPreset(name);
  };
  const jumpToSection = (
    id: string,
    anchor?: { runId: string; findingIndex: number },
  ) => {
    const section = w.doc.sections.find((item) => item.id === id);
    if (!section) return;
    if (w.activeRun?.target.sectionId === w.selectedSectionId)
      setLabOrigin({
        documentId: w.doc.id,
        sectionId: w.selectedSectionId!,
        runId: w.activeRun.id,
        inspectorScrollTop:
          document.querySelector<HTMLElement>(".inspector")?.scrollTop ?? 0,
      });
    const run = w.doc.workbench?.runs.find((item) => item.id === anchor?.runId);
    const finding = run?.response.findings[anchor?.findingIndex ?? -1];
    if (run && finding && anchor) {
      w.noteRevisionContext(run.id, id, anchor.findingIndex);
      const referencedSectionIds = [
        ...new Set([
          finding.sectionId,
          ...sectionMentions(w.doc, finding.title + " " + finding.detail).map(
            (part) => part.sectionId,
          ),
        ]),
      ].filter(
        (value): value is string =>
          !!value && w.doc.sections.some((s) => s.id === value),
      );
      setFindingVisit({
        documentId: w.doc.id,
        sectionId: id,
        runId: run.id,
        findingIndex: anchor.findingIndex,
        findingId: `${run.id}:${anchor.findingIndex}`,
        referencedSectionIds,
        inspectorScrollTop:
          document.querySelector<HTMLElement>(".inspector")?.scrollTop ?? 0,
      });
    }
    if (section.parkedGroupId)
      w.setParkedGroupCollapsed(section.parkedGroupId, false);
    if (!w.layout.workbenchVisible) void w.setWorkbenchVisible(true);
    if (w.layout.primaryView !== "workbench")
      void w.setPrimaryView("workbench");
    setPreviewFocused(false);
    setParkedFocusId(null);
    setReadingMode(false);
    w.focusSection(id);
    setPendingJump(id);
  };
  const returnToTakeSection = () => {
    const origin = takeReturn;
    if (
      !origin ||
      origin.documentId !== w.doc.id ||
      !w.doc.sections.some((section) => section.id === origin.sectionId)
    ) {
      setTakeReturn(null);
      return;
    }
    w.prepareSectionTarget(origin.sectionId);
    if (!origin.inspectorVisible) void w.setInspectorVisible(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(".dock-workbench .structure")
          ?.scrollTo({ top: origin.workbenchScroll, behavior: "instant" });
        document
          .querySelector<HTMLElement>(".dock-preview .writing")
          ?.scrollTo({ top: origin.previewScroll, behavior: "instant" });
        window.scrollTo({ top: origin.pageScroll, behavior: "instant" });
        const card = document.querySelector<HTMLElement>(
          `[data-section-id="${CSS.escape(origin.sectionId)}"]`,
        );
        if (card) {
          window.scrollBy({
            top: card.getBoundingClientRect().top - origin.cardTop,
            behavior: "instant",
          });
          if (
            card.getBoundingClientRect().bottom < 0 ||
            card.getBoundingClientRect().top > window.innerHeight
          )
            card.scrollIntoView({ block: "center", behavior: "instant" });
        }
      }),
    );
    setTakeReturn(null);
  };
  const openTrailFinding = (runId: string, findingIndex: number) => {
    w.inspectDocumentRun(runId);
    setRestoreFinding({
      runId,
      findingIndex,
      inspectorScrollTop:
        document.querySelector<HTMLElement>(".inspector")?.scrollTop ?? 0,
      token: Date.now(),
    });
  };
  const returnToSection = (sectionId: string, runId: string) => {
    const section = w.doc.sections.find((item) => item.id === sectionId);
    if (!section) return;
    w.noteRevisionContext(runId, sectionId);
    if (section.parkedGroupId)
      w.setParkedGroupCollapsed(section.parkedGroupId, false);
    if (!w.layout.workbenchVisible) void w.setWorkbenchVisible(true);
    if (w.layout.primaryView !== "workbench")
      void w.setPrimaryView("workbench");
    setPreviewFocused(false);
    w.prepareSectionTarget(sectionId);
    setPendingJump(sectionId);
  };
  const returnToSelection = (sectionId: string, runId: string) => {
    const section = w.doc.sections.find((item) => item.id === sectionId);
    const run = section?.workbench?.runs.find((item) => item.id === runId);
    if (!section || !run || run.target.documentId !== w.doc.id) return;
    w.noteRevisionContext(runId, sectionId);
    const resolution = resolveHistoricalTarget(w.doc, run.target);
    if (section.parkedGroupId)
      w.setParkedGroupCollapsed(section.parkedGroupId, false);
    if (!w.layout.workbenchVisible) void w.setWorkbenchVisible(true);
    if (w.layout.primaryView !== "workbench")
      void w.setPrimaryView("workbench");
    setPreviewFocused(false);
    setParkedFocusId(null);
    setReadingMode(false);
    w.inspectSectionRun(sectionId, runId);
    if (w.editor?.view.hasFocus()) w.editor.view.dom.blur();
    if (resolution.status === "exact")
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!w.editor || !scrollPreviewToTarget(w.editor, resolution.current))
            scrollPreviewToSection(sectionId, false, true);
        }),
      );
  };
  const returnToLab = (sectionId: string, runId: string) => {
    if (!w.doc.sections.some((section) => section.id === sectionId)) return;
    w.noteRevisionContext(runId, sectionId);
    const section = w.doc.sections.find((item) => item.id === sectionId)!;
    if (section.parkedGroupId)
      w.setParkedGroupCollapsed(section.parkedGroupId, false);
    if (!w.layout.workbenchVisible) void w.setWorkbenchVisible(true);
    if (w.layout.primaryView !== "workbench")
      void w.setPrimaryView("workbench");
    setPreviewFocused(false);
    setParkedFocusId(null);
    setReadingMode(false);
    w.inspectSectionRun(sectionId, runId);
    if (w.editor?.view.hasFocus()) w.editor.view.dom.blur();
    setRestoreLabRun({
      runId,
      inspectorScrollTop:
        labOrigin?.runId === runId ? labOrigin.inspectorScrollTop : 0,
      token: Date.now(),
    });
    setPendingJump(sectionId);
  };
  const returnToFinding = () => {
    if (!findingVisit || findingVisit.documentId !== w.doc.id) return;
    w.inspectDocumentRun(findingVisit.runId);
    setRestoreFinding({
      runId: findingVisit.runId,
      findingIndex: findingVisit.findingIndex,
      inspectorScrollTop: findingVisit.inspectorScrollTop,
      token: Date.now(),
    });
  };
  useLayoutEffect(() => {
    if (!pendingJump || !workbenchShown || w.layout.primaryView !== "workbench")
      return;
    if (!scrollWorkbenchToSection(pendingJump, true)) return;
    setPendingJump(null);
  }, [
    pendingJump,
    workbenchShown,
    w.layout.primaryView,
    w.doc.parkedGroups,
    w.doc.sections,
  ]);
  const activeEditorCard =
    !parkedFocusId &&
    workbenchShown &&
    w.layout.primaryView === "workbench" &&
    w.layout.density === "comfortable" &&
    editorCard &&
    w.doc.sections.some((section) => section.id === editorCard) &&
    w.doc.sections.some((section) => section.id === w.selectedSectionId) &&
    (w.doc.sections.find((section) => section.id === editorCard)?.placement !==
      "parked" ||
      w.doc.sections.find((section) => section.id === w.selectedSectionId)
        ?.placement === "parked")
      ? w.selectedSectionId
      : null;
  const previewCard = w.doc.sections.find(
    (section) => section.id === activeEditorCard,
  );
  const previewCardName =
    previewCard && sectionReference(w.doc, previewCard.id);
  const previewCardIdentity =
    previewCard &&
    customSectionLabel(previewCard) &&
    w.doc.sections.filter(
      (section) =>
        customSectionLabel(section) === customSectionLabel(previewCard),
    ).length > 1
      ? `${previewCardName} · Section ${w.doc.sections.indexOf(previewCard) + 1}`
      : previewCardName;
  useLayoutEffect(() => {
    const dom = w.editor?.view.dom as HTMLElement | undefined;
    if (!dom) return;
    if (!editorHome.current) editorHome.current = dom.parentElement;
    const host = activeEditorCard
      ? Array.from(
          document.querySelectorAll<HTMLElement>("[data-card-editor-host]"),
        ).find((element) => element.dataset.cardEditorHost === activeEditorCard)
      : editorHome.current;
    if (!host) return;
    if (dom.parentElement !== host) {
      host.appendChild(dom);
      if (activeEditorCard) {
        w.focusSection(activeEditorCard, true);
        const point = pendingCardCaret.current;
        pendingCardCaret.current = null;
        if (point?.id === activeEditorCard) {
          const section = Array.from(dom.children).find(
            (child) => (child as HTMLElement).id === activeEditorCard,
          ) as HTMLElement | undefined;
          if (section) {
            const rect = section.getBoundingClientRect();
            const hit = w.editor.view.posAtCoords({
              left: rect.left + point.x,
              top: rect.top + point.y,
            });
            if (hit) {
              w.editor.commands.setTextSelection(hit.pos);
              w.editor.view.focus();
            }
          }
        }
      }
    }
    dom.classList.toggle("in-card", Boolean(activeEditorCard));
    dom.classList.toggle(
      "in-parked-focus",
      Boolean(parkedFocusId && previewFocused),
    );
  }, [
    w.editor,
    w.doc.sections,
    activeEditorCard,
    parkedFocusId,
    previewFocused,
  ]);
  useLayoutEffect(() => {
    const previous = previewSectionContext.current;
    previewSectionContext.current = {
      documentId: w.doc.id,
      sectionId: w.selectedSectionId,
    };
    if (previous.documentId !== w.doc.id) {
      previewSelectionIntent.current = false;
      return;
    }
    if (
      !w.ready ||
      !w.selectedSectionId ||
      previous.sectionId === w.selectedSectionId ||
      !previewSelectionIntent.current ||
      activeEditorCard ||
      previewFocused ||
      !w.editor?.view.hasFocus() ||
      !w.editor.view.dom.closest(".dock-preview")
    )
      return;
    previewSelectionIntent.current = false;
    scrollWorkbenchToSection(w.selectedSectionId);
  }, [
    w.ready,
    w.doc.id,
    w.selectedSectionId,
    activeEditorCard,
    previewFocused,
  ]);
  useLayoutEffect(() => {
    if (!previewFocused) return;
    const id = parkedFocusId ?? w.selectedSectionId;
    if (id) requestAnimationFrame(() => scrollPreviewToSection(id, true, true));
  }, [previewFocused, parkedFocusId, w.selectedSectionId]);
  const removing =
    confirmation?.kind === "section"
      ? w.doc.sections.find((section) => section.id === confirmation.id)
      : null;
  const writeInCard = (id: string, point?: { x: number; y: number }) => {
    pendingCardCaret.current = point ? { id, ...point } : null;
    w.prepareSectionTarget(id);
    setEditorCard(id);
  };
  const editInPreview = (id: string) => {
    setEditorCard(null);
    void w.setPreviewVisible(true);
    requestAnimationFrame(() => w.focusSection(id, true));
  };
  return (
    <div
      className={
        "app " +
        (w.layout.primaryView === "workbench"
          ? "workbench-mode"
          : "document-mode") +
        " " +
        (w.layout.density === "overview" ? "overview-mode" : "") +
        (previewFocused && readingMode ? " preview-reading" : "") +
        (parkedFocusId && previewFocused ? " parked-preview-mode" : "") +
        " dock-shell"
      }
    >
      {activeEditorCard && (
        <style>{`.card-editor-host .writing-editor > section { display: none !important; }
.card-editor-host .writing-editor > section#${CSS.escape(activeEditorCard)} { display: block !important; }`}</style>
      )}
      {previewFocused && parkedFocusId && (
        <style>{`.dock-preview .writing-editor > section { display: none !important; }
.dock-preview .writing-editor > section#${CSS.escape(parkedFocusId)} { display: block !important; }`}</style>
      )}
      <header className="topbar">
        <div className="topbar-main">
          <Button
            className="icon nav-toggle"
            aria-label="Toggle structure"
            aria-pressed={workbenchShown}
            disabled={workbenchShown && paneCount === 1}
            onClick={() => {
              setPreviewFocused(false);
              void w.setWorkbenchVisible(!w.layout.workbenchVisible);
            }}
          >
            <PanelLeft size={19} />
          </Button>
          <div className="app-mark" aria-label="Language Workbench">
            w<span>.</span>
          </div>
          <div className="document-title">
            <input
              aria-label="Document title"
              value={w.doc.title}
              maxLength={240}
              onChange={(e) =>
                w.update((d) => ({ ...d, title: e.target.value }))
              }
              onBlur={() => {
                if (!w.doc.title.trim())
                  w.update((d) => ({ ...d, title: "Untitled" }));
              }}
            />
            <Select
              aria-label="Switch document"
              value={w.doc.id}
              onChange={(e) => {
                switchGeneration.current = interactionGeneration.current;
                void w.navigate(e.target.value);
              }}
              disabled={!w.ready || w.documentSwitching}
            >
              {w.documents.length ? (
                w.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id === w.doc.id ? w.doc.title : d.title}
                    {duplicateDocumentCue(
                      d.id === w.doc.id ? w.doc : d,
                      w.documents,
                    )
                      ? ` · ${duplicateDocumentCue(d.id === w.doc.id ? w.doc : d, w.documents)}`
                      : ""}
                  </option>
                ))
              ) : (
                <option value={w.doc.id}>Untitled</option>
              )}
            </Select>
            <ChevronDown
              className="document-chevron"
              size={15}
              aria-hidden="true"
            />
          </div>
          <button
            data-testid="save-state"
            className={
              "save-state " + (w.saveState === "Not saved" ? "save-error" : "")
            }
            onClick={() => w.flush().catch(() => {})}
            title={
              w.saveState === "Connecting"
                ? "Connecting to the local workspace; your text remains here"
                : "Save now"
            }
          >
            {w.saveState === "Saved" ? (
              <Check size={12} />
            ) : (
              <span className="status-dot" />
            )}
            {w.saveState}
          </button>
          {w.running && (
            <span
              className="model-progress"
              role="status"
              data-testid="model-progress"
              title={w.running.models
                .map((model) => modelLabel(w.catalog, model))
                .join(" + ")}
            >
              {w.running.label} ·{" "}
              {w.running.models
                .map((model) => modelLabel(w.catalog, model))
                .join(" + ")}
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <Button
            className="top-action document-sources"
            aria-label="Document sources"
            title="Sources belong to the whole document"
            onClick={() => w.setPanel("sources")}
          >
            Sources · {w.doc.sources.length}
          </Button>
          <Button
            className="piece-memory-entry"
            data-testid="piece-memory-entry"
            aria-label={
              memoryDraftChanged
                ? "Piece memory, draft changed"
                : "Piece memory"
            }
            aria-expanded={w.panel === "memory"}
            title={
              memoryDraftChanged
                ? "Piece memory · Draft changed"
                : "Piece memory"
            }
            disabled={!w.ready}
            onClick={() => w.setPanel("memory")}
          >
            <FileText size={14} aria-hidden="true" />
            <span className="memory-entry-label">Piece memory</span>
            {memoryDraftChanged && (
              <>
                <span className="memory-entry-separator">·</span>
                <span>Draft changed</span>
              </>
            )}
          </Button>
          <Button
            className="top-action command-trigger"
            aria-label="Find a tool"
            title="Find a tool (Cmd/Ctrl+K)"
            onClick={() => navigation.openCommands()}
          >
            Find a tool <kbd>⌘ / Ctrl K</kbd>
          </Button>
          <Button
            className="top-action"
            onClick={() => w.setPanel("style")}
            title="Style DNA and knowledge packs"
          >
            <Settings2 size={16} />
            <span>Style DNA</span>
          </Button>
          <Button
            className="top-action"
            onClick={() => w.setPanel("radar")}
            title="Language radar"
          >
            <Radio size={16} />
            <span>Radar</span>
          </Button>
          <Button
            className="icon"
            aria-label="Toggle color theme"
            onClick={() =>
              w.saveSettings({
                ...w.settings,
                theme: w.settings.theme === "light" ? "dark" : "light",
              })
            }
          >
            {w.settings.theme === "light" ? (
              <Moon size={16} />
            ) : (
              <Sun size={16} />
            )}
          </Button>
          <div className="menu-anchor">
            <button
              type="button"
              className="button"
              ref={menuTrigger}
              aria-label="Document actions"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <div
                ref={menuRef}
                className="document-menu"
                role="group"
                aria-label="Document commands"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMenu(false);
                    requestAnimationFrame(() => menuTrigger.current?.focus());
                  }
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const buttons = Array.from(
                      menuRef.current?.querySelectorAll<HTMLButtonElement>(
                        "button:not(:disabled)",
                      ) ?? [],
                    );
                    const index = buttons.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    buttons[
                      (index +
                        (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                        buttons.length
                    ]?.focus();
                  }
                }}
              >
                <Button
                  onClick={() => {
                    w.setPanel("providers");
                    setMenu(false);
                  }}
                >
                  <Settings2 size={15} />
                  AI providers
                </Button>
                <Button
                  onClick={() => {
                    w.setPanel("library");
                    setMenu(false);
                  }}
                >
                  <BookOpen size={15} />
                  Personal library
                </Button>
                <Button
                  disabled={!w.ready}
                  onClick={() => {
                    w.create();
                    setMenu(false);
                  }}
                >
                  <Plus size={15} />
                  New document
                </Button>
                <Button
                  disabled={!w.ready}
                  onClick={() => {
                    w.create(true);
                    setMenu(false);
                  }}
                >
                  <Files size={15} />
                  Duplicate
                </Button>
                <Button
                  disabled={!w.ready}
                  onClick={() => {
                    setConfirmation({ kind: "archive" });
                    setMenu(false);
                  }}
                >
                  Archive document
                </Button>
                <Button
                  disabled={!w.ready}
                  onClick={() => {
                    w.setPanel("documents");
                    setMenu(false);
                  }}
                >
                  Manage documents
                </Button>
                <Button
                  disabled={!w.ready}
                  onClick={() => {
                    w.setPanel("memory");
                    setMenu(false);
                  }}
                >
                  Piece memory
                </Button>
                <hr />
                <Button
                  onClick={() => {
                    w.copyDocument();
                    setMenu(false);
                  }}
                >
                  <Copy size={14} />
                  Copy document
                </Button>
                <Button
                  onClick={() => {
                    w.copy(text);
                    setMenu(false);
                  }}
                >
                  <Copy size={14} />
                  Copy plain text
                </Button>
                <Button
                  onClick={() => {
                    w.copy(toMarkdown(w.doc));
                    setMenu(false);
                  }}
                >
                  <Copy size={14} />
                  Copy Markdown
                </Button>
                <Button
                  onClick={() => {
                    download(
                      filename + ".md",
                      toMarkdown(w.doc),
                      "text/markdown",
                    );
                    setMenu(false);
                  }}
                >
                  <Download size={14} />
                  Export Markdown
                </Button>
                <Button
                  onClick={() => {
                    download(
                      filename + ".json",
                      JSON.stringify(w.doc, null, 2),
                      "application/json",
                    );
                    setMenu(false);
                  }}
                >
                  <Download size={14} />
                  Export JSON
                </Button>
                <Button
                  disabled={!w.ready}
                  onClick={() => {
                    fileRef.current?.click();
                    setMenu(false);
                  }}
                >
                  <Upload size={14} />
                  Import JSON
                </Button>
                <hr />
                <Button
                  className="danger"
                  title="Delete document"
                  disabled={!w.ready}
                  onClick={() => {
                    setConfirmation({ kind: "document" });
                    setMenu(false);
                  }}
                >
                  <Trash2 size={14} />
                  Delete document
                </Button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) w.importDoc(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      {(w.error || w.notice) && (
        <div
          className={"notification " + (w.error ? "error" : "")}
          role={w.error ? "alert" : "status"}
        >
          <span>{w.error || w.notice}</span>
          <Button
            aria-label="Dismiss message"
            onClick={() => {
              w.setError("");
              w.setNotice("");
            }}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      <div className="viewbar">
        <div className="row" role="group" aria-label="Primary view">
          <Button
            aria-pressed={w.layout.primaryView === "workbench"}
            onClick={() => {
              setDocumentPreviewOverride(null);
              setPreviewFocused(false);
              w.setPrimaryView("workbench");
            }}
          >
            Workbench
          </Button>
          <Button
            aria-pressed={w.layout.primaryView === "document"}
            onClick={() => {
              setDocumentPreviewOverride(w.layout.previewVisible ? null : true);
              setPreviewFocused(false);
              w.setPrimaryView("document");
            }}
          >
            Document View
          </Button>
        </div>
        <div className="row pane-controls">
          {previewShown && (
            <Button
              aria-pressed={previewFocused}
              onClick={() => (previewFocused ? restorePanes() : focusPreview())}
            >
              {previewFocused ? "Restore panes" : "Focus preview"}
            </Button>
          )}
          <details ref={layoutMenu} className="layout-menu">
            <summary>Layout</summary>
            <div role="group" aria-label="Layout presets">
              <Button onClick={() => preset("writing")}>Writing</Button>
              <Button onClick={() => preset("review")}>Review</Button>
              <Button onClick={() => preset("workbench")}>
                Workbench only
              </Button>
              <Button onClick={() => preset("all")}>All panes</Button>
              <Button onClick={() => preset("reset")}>Reset layout</Button>
            </div>
          </details>
          {!previewFocused && (
            <>
              <Button
                onClick={() =>
                  void w.setWorkbenchVisible(!w.layout.workbenchVisible)
                }
                disabled={workbenchShown && paneCount === 1}
              >
                {w.layout.workbenchVisible
                  ? "Hide Workbench"
                  : "Show Workbench"}
              </Button>
              <Button
                onClick={() => {
                  setDocumentPreviewOverride(null);
                  w.setPreviewVisible(!w.layout.previewVisible);
                }}
                disabled={previewShown && paneCount === 1}
              >
                {previewShown ? "Hide preview" : "Show preview"}
              </Button>
              <Button
                onClick={() =>
                  void w.setInspectorVisible(!w.layout.inspectorVisible)
                }
                disabled={inspectorShown && paneCount === 1}
              >
                {w.layout.inspectorVisible
                  ? "Hide Inspector"
                  : "Show Inspector"}
              </Button>
            </>
          )}
        </div>
      </div>
      {!hideNextMove && w.doc.pieceMemory.nextMove.trim() && (
        <div className="piece-next-move" role="note">
          <span>
            <b>{memoryDraftChanged ? "Earlier next move:" : "Next move:"}</b>{" "}
            {w.doc.pieceMemory.nextMove.trim()}
            {memoryDraftChanged && (
              <small>Draft changed since this was saved.</small>
            )}
          </span>
          <Button onClick={() => w.setPanel("memory")}>
            {memoryDraftChanged ? "Review Piece memory" : "Open Piece memory"}
          </Button>
          <Button
            aria-label="Dismiss next move"
            title="Dismiss next move for now"
            onClick={() => setHideNextMove(true)}
          >
            Dismiss
          </Button>
        </div>
      )}
      <div
        className={
          "workspace dock-workspace " + (paneCount === 3 ? "dock-three" : "")
        }
        onPointerDownCapture={(event) => {
          previewSelectionIntent.current = Boolean(
            (event.target as HTMLElement).closest(
              ".dock-preview .writing-editor",
            ),
          );
        }}
        onKeyDownCapture={(event) => {
          if (
            (event.target as HTMLElement).closest(
              ".dock-preview .writing-editor",
            )
          )
            previewSelectionIntent.current = true;
        }}
      >
        <div
          className={
            "dock-pane dock-workbench " + (!workbenchShown ? "pane-hidden" : "")
          }
          data-pane="workbench"
          style={{ flexGrow: widths.workbench }}
        >
          <Structure
            w={w}
            onRemove={(id) => setConfirmation({ kind: "section", id })}
            editorCard={activeEditorCard}
            onWriteCard={writeInCard}
            onEditPreview={editInPreview}
            onReadParked={(id) => {
              w.prepareSectionTarget(id);
              focusPreview(id);
            }}
            onOpenSavedWork={(sectionId, kind) => {
              if (kind === "variants") {
                setTakeReturn({
                  documentId: w.doc.id,
                  sectionId,
                  pageScroll: window.scrollY,
                  cardTop:
                    document
                      .querySelector<HTMLElement>(
                        `[data-section-id="${CSS.escape(sectionId)}"]`,
                      )
                      ?.getBoundingClientRect().top ?? 0,
                  workbenchScroll:
                    document.querySelector<HTMLElement>(
                      ".dock-workbench .structure",
                    )?.scrollTop ?? 0,
                  previewScroll:
                    document.querySelector<HTMLElement>(
                      ".dock-preview .writing",
                    )?.scrollTop ?? 0,
                  inspectorVisible: w.layout.inspectorVisible,
                });
                w.prepareSectionTarget(sectionId);
              } else w.focusSection(sectionId);
              void w.setInspectorVisible(true);
              setOpenWork({ sectionId, kind, token: Date.now() });
            }}
          />
        </div>
        {workbenchShown && (previewShown || inspectorShown) && (
          <DockDivider
            left="workbench"
            right={previewShown ? "preview" : "inspector"}
            widths={widths}
            onResize={setDragWidths}
            onCommit={commitWidths}
          />
        )}
        <div
          className={
            "dock-pane dock-preview " + (!previewShown ? "pane-hidden" : "")
          }
          data-pane="preview"
          style={{ flexGrow: widths.preview }}
        >
          <main
            className="writing"
            onPointerDownCapture={(event) => {
              if (
                readingMode &&
                (event.target as HTMLElement).closest(
                  ".writing-editor,.format-toolbar",
                )
              )
                setReadingMode(false);
            }}
          >
            <Toolbar w={w} />
            <div
              className={
                "selected-preview-heading" +
                (activeEditorCard && !previewFocused
                  ? " reading-preview-heading"
                  : "")
              }
            >
              <span className="eyebrow">
                {parkedFocusId
                  ? "PARKED THOUGHT · outside the reader draft"
                  : w.layout.primaryView === "workbench"
                    ? "Assembled preview · same writing"
                    : "Document View"}
              </span>
              <b>
                {(w.layout.primaryView === "workbench" || parkedFocusId
                  ? w.doc.sections
                  : draft
                ).find((s) => s.id === w.selectedSectionId)?.label ??
                  "Your document"}
              </b>
              {activeEditorCard && !previewFocused && (
                <div
                  className="preview-reading-state"
                  data-testid="preview-reading-state"
                  role="status"
                >
                  <span>
                    Reading preview · Editing “{previewCardIdentity}” in
                    Workbench
                    {previewCard?.placement === "parked"
                      ? " (parked thought)."
                      : "."}
                  </span>
                  {previewCard?.placement === "parked" && !draft.length ? (
                    <span>
                      Include a thought or add a draft section to edit in
                      Preview.
                    </span>
                  ) : (
                    <Button
                      onClick={() => {
                        const next =
                          previewCard?.placement === "parked"
                            ? (draft.find(
                                (section) => section.id === lastDraftId.current,
                              )?.id ?? draft[0]?.id)
                            : previewCard?.id;
                        if (next) editInPreview(next);
                      }}
                    >
                      {previewCard?.placement === "parked"
                        ? "Edit draft in preview"
                        : "Edit this section in preview"}
                    </Button>
                  )}
                </div>
              )}
              {parkedFocusId && (
                <Button
                  onClick={() => {
                    restorePanes();
                    const id = lastDraftId.current ?? draft[0]?.id;
                    if (id) w.focusSection(id);
                  }}
                >
                  Return to draft
                </Button>
              )}
            </div>
            {w.layout.primaryView === "workbench" && (
              <RelationalContext
                w={w}
                onCompare={() => setCompareSection(w.selectedSectionId)}
              />
            )}
            <div className="page">
              <div className="page-caption">
                <span className="eyebrow">YOUR WORDS, FIRST</span>
                <button
                  aria-label="Writing brief"
                  title="Optional: audience, purpose and format"
                  onClick={() => w.setPanel("brief")}
                >
                  What are you making? <ArrowUp size={11} className="rotate" />
                </button>
              </div>
              <div className={"editor-wrap " + (!text ? "empty" : "")}>
                <EditorContent editor={w.editor} />
                {activeEditorCard && (
                  <div
                    className="assembled-readout"
                    aria-label="Assembled preview"
                  >
                    {draft.map((section) => (
                      <section
                        key={section.id}
                        data-preview-section-id={section.id}
                      >
                        {sectionText(section) || (
                          <span className="muted">Unwritten section</span>
                        )}
                      </section>
                    ))}
                  </div>
                )}
                {!activeEditorCard && !parkedFocusId && (
                  <SectionInsertionGaps
                    editor={w.editor}
                    sections={draft}
                    onInsert={w.requestSectionInsertion}
                  />
                )}
                {!activeEditorCard && !parkedFocusId && !text.trim() && (
                  <FirstMove w={w} onCommand={navigation.runCommand} />
                )}
              </div>
            </div>
            <footer className="writing-footer">
              <span>
                {wordCount.toLocaleString()} words{" "}
                <span className="dot-separator">·</span>{" "}
                {wordCount === 0
                  ? "No reading time yet"
                  : `${Math.max(1, Math.ceil(wordCount / 200))} min read`}
              </span>
              <span>
                {draft.length} {draft.length === 1 ? "section" : "sections"}{" "}
                {parked.length ? `· ${parked.length} parked ` : ""}
                <span className="dot-separator">·</span> Human-led writing
              </span>
            </footer>
          </main>
        </div>
        {previewShown && inspectorShown && (
          <DockDivider
            left="preview"
            right="inspector"
            widths={widths}
            onResize={setDragWidths}
            onCommit={commitWidths}
          />
        )}
        <div
          className={
            "dock-pane dock-inspector " + (!inspectorShown ? "pane-hidden" : "")
          }
          data-pane="inspector"
          style={{ flexGrow: widths.inspector }}
        >
          <WritingLabShell
            w={w}
            navigation={navigation}
            onCompare={() => setCompareSection(w.selectedSectionId)}
            onJumpSection={jumpToSection}
            findingVisit={
              findingVisit?.documentId === w.doc.id ? findingVisit : null
            }
            restoreFinding={restoreFinding}
            restoreLabRun={restoreLabRun}
            onReturnFinding={returnToFinding}
            labOrigin={labOrigin?.documentId === w.doc.id ? labOrigin : null}
            onReturnToLab={returnToLab}
            onReturnToSelection={returnToSelection}
            onReturnToSection={returnToSection}
            onOpenTrailFinding={openTrailFinding}
            takeOriginSectionId={
              takeReturn?.documentId === w.doc.id ? takeReturn.sectionId : null
            }
            onReturnToTakeSection={returnToTakeSection}
            openWork={openWork}
          />
        </div>
      </div>
      <UtilityPanel
        w={w}
        libraryNavigation={navigation.libraryNavigation}
        returnToMenu={() =>
          document.querySelector<HTMLElement>('[aria-label="Document actions"]')
        }
      />
      {compareSection && compareSection === w.selectedSectionId && (
        <RelationalCompare w={w} close={() => setCompareSection(null)} />
      )}
      {navigation.paletteOpen && (
        <CommandPalette
          initialQuery={navigation.initialQuery}
          close={navigation.closeCommands}
          run={navigation.runCommand}
        />
      )}
      {w.insertion && (
        <SectionInsertionPicker
          key={`${w.insertion.documentId}:${w.insertion.beforeSectionId}`}
          anchor={w.insertion}
          sections={w.doc.sections}
          onInsert={w.insertSection}
          onClose={w.closeInsertion}
        />
      )}
      {confirmation && (
        <Dialog
          title={
            confirmation.kind === "document"
              ? `Delete “${w.doc.title.trim() || "Untitled"}”?`
              : confirmation.kind === "archive"
                ? `Archive “${w.doc.title.trim() || "Untitled"}”?`
                : removing?.placement === "parked"
                  ? `Remove parked thought${removing && customSectionLabel(removing) ? ` “${customSectionLabel(removing)}”` : ""}?`
                  : "Remove section?"
          }
          close={() => setConfirmation(null)}
          returnFocus={
            confirmation.kind === "section"
              ? undefined
              : () => menuTrigger.current
          }
          initialFocus="[data-safe-cancel]"
        >
          <p>
            {confirmation.kind === "document"
              ? `This permanently deletes this document, its references, saved takes and history. Export JSON first if you want a backup.${w.documents.length === 1 ? " A new blank document will be created." : ""}`
              : confirmation.kind === "archive"
                ? `Archive removes this document from the writing switcher. All writing, takes, sources and history stay intact; restore it in Manage documents.${w.documents.length === 1 ? " A new blank document will be created." : ""}`
                : `This removes the ${removing?.placement === "parked" ? "parked thought" : "section"} and its local workbench. The rest of your writing is untouched. Undo restores it during this editing session.${w.doc.sections.length === 1 ? " Removing the last section leaves an empty Freeform writing surface." : ""}`}
          </p>
          <div className="row end">
            <Button
              data-safe-cancel="true"
              onClick={() => setConfirmation(null)}
            >
              Keep writing
            </Button>
            <Button
              className={
                confirmation.kind === "archive" ? "primary" : "danger solid"
              }
              onClick={() => {
                if (confirmation.kind === "document") void w.remove();
                else if (confirmation.kind === "archive")
                  void w.archiveDocuments([w.doc.id]);
                else if (confirmation.id) w.deleteSection(confirmation.id);
                setConfirmation(null);
              }}
            >
              {confirmation.kind === "document"
                ? "Delete document"
                : confirmation.kind === "archive"
                  ? "Archive document"
                  : removing?.placement === "parked"
                    ? "Delete parked thought"
                    : "Delete section"}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
