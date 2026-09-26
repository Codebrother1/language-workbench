import { RelationalContext, RelationalCompare } from "./RelationalWorkspace";
import { modelLabel } from "./ModelControls";
import { FirstMove } from "./FirstMove";
import { useWayfinding } from "./wayfinding";
import { CommandPalette } from "./CommandPalette";
import {
  SectionInsertionPicker,
  SectionInsertionGaps,
} from "./SectionInsertion";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { DockDivider, type PaneWidths } from "./DockDivider";
import { EditorContent } from "@tiptap/react";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { sectionLocation } from "./editor";
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
import { Button, Select, Field, Dialog, GrowingTextarea, download } from "./ui";
import { WritingLabShell } from "./WritingLabShell";
import { UtilityPanel } from "./UtilityPanel";
import { SectionConceptSelect } from "./SectionConceptHelp";
import { customSectionLabel } from "./workspace-helpers";

function draftPositionLabel(section: WritingSection, index: number): string {
  const opening = sectionText(section).replace(/\s+/g, " ").trim();
  const name =
    section.label.trim() && section.label !== section.kind
      ? section.label.trim()
      : opening || section.label;
  const short = name.length > 52 ? name.slice(0, 49).trimEnd() + "…" : name;
  return `Before ${index + 1}. “${short}” · ${section.kind}`;
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
}: {
  group: ParkedGroup;
  count: number;
  onToggle: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
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
    </div>
  );
}
type SavedWorkKind = "variants" | "structure" | "history";
function Structure({
  w,
  onRemove,
  editorCard,
  onWriteCard,
  onEditPreview,
  onOpenSavedWork,
}: {
  w: Workspace;
  onRemove: (id: string) => void;
  editorCard: string | null;
  onWriteCard: (id: string, point?: { x: number; y: number }) => void;
  onEditPreview: (id: string) => void;
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
                  <span className="section-number">
                    {String(i + 1).padStart(2, "0")}
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
                          {s.variants.length}{" "}
                          {s.variants.length === 1 ? "variant" : "variants"}
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
                            title="Places the cursor at the start of this section in the assembled preview. Select text to replace it."
                          >
                            Edit in preview
                          </Button>
                          <Button onClick={() => w.parkThought(s.id)}>
                            Park thought
                          </Button>
                        </>
                      )}
                    </div>
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
                        {draft.map((item, index) => (
                          <option key={item.id} value={item.id}>
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
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ed?.chain().focus().undo().run()}
        >
          <Undo2 size={15} />
        </Button>
        <Button
          aria-label="Redo"
          title="Redo"
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
  const [confirmation, setConfirmation] = useState<{
    kind: "document" | "section";
    id?: string;
  } | null>(null);
  const [menu, setMenu] = useState(false);
  const layoutMenu = useRef<HTMLDetailsElement>(null);
  const [dragWidths, setDragWidths] = useState<PaneWidths | null>(null);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [documentPreviewOverride, setDocumentPreviewOverride] = useState<
    boolean | null
  >(null);
  const [compareSection, setCompareSection] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [openWork, setOpenWork] = useState<{
    sectionId: string;
    kind: SavedWorkKind;
    token: number;
  } | null>(null);
  const draft = draftSections(w.doc);
  const parked = parkedSections(w.doc);
  const text = documentText(w.doc);
  const wordCount = draft.flatMap((section) =>
    sectionText(section).trim().split(/\s+/).filter(Boolean),
  ).length;
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
  const jumpToSection = (id: string) => {
    const section = w.doc.sections.find((item) => item.id === id);
    if (!section) return;
    if (section.parkedGroupId)
      w.setParkedGroupCollapsed(section.parkedGroupId, false);
    if (!w.layout.workbenchVisible) void w.setWorkbenchVisible(true);
    if (w.layout.primaryView !== "workbench")
      void w.setPrimaryView("workbench");
    setPreviewFocused(false);
    w.focusSection(id);
    setPendingJump(id);
  };
  useLayoutEffect(() => {
    if (!pendingJump || !workbenchShown || w.layout.primaryView !== "workbench")
      return;
    const card = Array.from(
      document.querySelectorAll<HTMLElement>(".structure-item"),
    ).find((element) => element.dataset.sectionId === pendingJump);
    const pane = card?.closest<HTMLElement>(".structure");
    if (!card || !pane || getComputedStyle(card).display === "none") return;
    pane.scrollTop +=
      card.getBoundingClientRect().top - pane.getBoundingClientRect().top - 75;
    setPendingJump(null);
  }, [
    pendingJump,
    workbenchShown,
    w.layout.primaryView,
    w.doc.parkedGroups,
    w.doc.sections,
  ]);
  const activeEditorCard =
    workbenchShown &&
    w.layout.primaryView === "workbench" &&
    w.layout.density === "comfortable" &&
    editorCard &&
    w.doc.sections.some((section) => section.id === w.selectedSectionId)
      ? w.selectedSectionId
      : null;
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
  }, [w.editor, w.doc.sections, activeEditorCard]);
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
        " " +
        "dock-shell"
      }
    >
      {activeEditorCard && (
        <style>{`.card-editor-host .writing-editor > section { display: none !important; }
.card-editor-host .writing-editor > section#${CSS.escape(activeEditorCard)} { display: block !important; }`}</style>
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
              onChange={(e) => w.navigate(e.target.value)}
              disabled={!w.ready}
            >
              {w.documents.length ? (
                w.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id === w.doc.id ? w.doc.title : d.title}
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
            title="Save now"
          >
            {w.saveState === "Saved" ? (
              <Check size={12} />
            ) : (
              <span className="status-dot" />
            )}
            {w.saveState}
          </button>
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
            <Button
              aria-label="Document actions"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={20} />
            </Button>
            {menu && (
              <div
                className="document-menu"
                role="group"
                aria-label="Document commands"
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
              onClick={() => setPreviewFocused(!previewFocused)}
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
          <Button
            onClick={() => {
              setPreviewFocused(false);
              void w.setWorkbenchVisible(!w.layout.workbenchVisible);
            }}
            disabled={workbenchShown && paneCount === 1}
          >
            {w.layout.workbenchVisible ? "Hide Workbench" : "Show Workbench"}
          </Button>
          <Button
            onClick={() => {
              setDocumentPreviewOverride(null);
              setPreviewFocused(false);
              w.setPreviewVisible(!w.layout.previewVisible);
            }}
            disabled={previewShown && paneCount === 1}
          >
            {previewShown ? "Hide preview" : "Show preview"}
          </Button>
          <Button
            onClick={() => {
              setPreviewFocused(false);
              void w.setInspectorVisible(!w.layout.inspectorVisible);
            }}
            disabled={inspectorShown && paneCount === 1}
          >
            {w.layout.inspectorVisible ? "Hide Inspector" : "Show Inspector"}
          </Button>
        </div>
      </div>
      <div
        className={
          "workspace dock-workspace " + (paneCount === 3 ? "dock-three" : "")
        }
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
            onOpenSavedWork={(sectionId, kind) => {
              w.focusSection(sectionId);
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
          <main className="writing">
            <Toolbar w={w} />
            <div className="selected-preview-heading">
              <span className="eyebrow">
                {w.layout.primaryView === "workbench"
                  ? "Assembled preview · same writing"
                  : "Document View"}
              </span>
              <b>
                {(w.layout.primaryView === "workbench"
                  ? w.doc.sections
                  : draft
                ).find((s) => s.id === w.selectedSectionId)?.label ??
                  "Your document"}
              </b>
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
                      <section key={section.id}>
                        {sectionText(section) || (
                          <span className="muted">Unwritten section</span>
                        )}
                      </section>
                    ))}
                  </div>
                )}
                {!activeEditorCard && (
                  <SectionInsertionGaps
                    editor={w.editor}
                    sections={draft}
                    onInsert={w.requestSectionInsertion}
                  />
                )}
                {!activeEditorCard && !text.trim() && (
                  <FirstMove w={w} onCommand={navigation.runCommand} />
                )}
              </div>
            </div>
            <footer className="writing-footer">
              <span>
                {wordCount.toLocaleString()} words{" "}
                <span className="dot-separator">·</span>{" "}
                {Math.max(1, Math.ceil(wordCount / 200))} min read
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
            openWork={openWork}
          />
        </div>
      </div>
      <UtilityPanel w={w} libraryNavigation={navigation.libraryNavigation} />
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
              ? "Delete this document?"
              : "Remove this section?"
          }
          close={() => setConfirmation(null)}
        >
          <p>
            {confirmation.kind === "document"
              ? "The document, references, variants, and history will be permanently deleted. Export JSON first if you want a backup."
              : "This removes the section and its local workbench. The rest of your writing is untouched. Undo restores it during this editing session. Deleting the last section leaves an empty Freeform writing surface."}
          </p>
          <div className="row end">
            <Button onClick={() => setConfirmation(null)}>Keep writing</Button>
            <Button
              className="danger solid"
              onClick={() => {
                if (confirmation.kind === "document") w.remove();
                else if (confirmation.id) w.deleteSection(confirmation.id);
                setConfirmation(null);
              }}
            >
              Delete {confirmation.kind}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
