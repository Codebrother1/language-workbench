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
import { EditorContent } from "@tiptap/react";
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
  sectionKinds,
  documentText,
  toMarkdown,
  sectionText,
  contentTypeConfig,
} from "./domain";
import { Button, Select, Field, Dialog, GrowingTextarea, download } from "./ui";
import { WritingLabShell } from "./WritingLabShell";
import { UtilityPanel } from "./UtilityPanel";
function Structure({
  w,
  onRemove,
  editorCard,
  onWriteCard,
  onEditPreview,
}: {
  w: Workspace;
  onRemove: (id: string) => void;
  editorCard: string | null;
  onWriteCard: (id: string, point?: { x: number; y: number }) => void;
  onEditPreview: (id: string) => void;
}) {
  const drag = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [thought, setThought] = useState("");
  const thoughtRef = useRef<HTMLTextAreaElement>(null);
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
      if (to !== from) w.moveSection(source, to);
    }
    finishDrag();
  };
  const capture = () => {
    if (!w.captureThought(thought)) return;
    setThought("");
    requestAnimationFrame(() => thoughtRef.current?.focus());
  };
  return (
    <nav
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
        <span className="count">{w.doc.sections.length}</span>
      </div>
      <p className="small muted structure-hint">
        Write, then move parts into order.
      </p>
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
          <label htmlFor="new-thought">NEW THOUGHT · CAPTURE FIRST</label>
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
          <small>Enter adds a Freeform card. Shift+Enter adds a line.</small>
        </div>
      )}
      <div className="section-list">
        {w.doc.sections.map((s, i) => (
          <Fragment key={s.id}>
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
                (w.target?.sectionId === s.id ? "active " : "") +
                (draggingId === s.id ? "dragging" : "")
              }
              data-testid="structure-item"
              data-section-id={s.id}
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
                if (!drag.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropGap(gapFor(drag.current, i));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const source =
                  e.dataTransfer.getData("text/plain") || drag.current || "";
                drop(source, gapFor(source, i));
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
                  <span>{s.label}</span>
                </button>
              </div>
              {w.layout.primaryView === "workbench" && (
                <>
                  <span className="section-role">ROLE · {s.kind}</span>
                  {w.layout.density === "comfortable" &&
                  w.target?.sectionId === s.id ? (
                    <div className="card-writing" data-testid="card-writing">
                      <div className="card-layer-label">
                        WRITING <span>· reader-facing prose</span>
                      </div>
                      <div
                        className="card-editor-host"
                        data-card-editor-host={s.id}
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
                    <div className="section-excerpt">
                      {sectionText(s) || "No prose yet."}
                    </div>
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
                  <Field label="Semantic kind">
                    <Select
                      value={s.kind}
                      onChange={(e) =>
                        w.patchSection(s.id, {
                          kind: e.target.value as typeof s.kind,
                          ...(s.label === s.kind
                            ? { label: e.target.value }
                            : {}),
                        })
                      }
                    >
                      {sectionKinds.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </Select>
                  </Field>
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
                  <div className="row wrap">
                    <Button
                      aria-label="Move section up"
                      disabled={i === 0}
                      onClick={() => w.moveSection(s.id, i - 1)}
                    >
                      <ArrowUp size={13} />
                    </Button>
                    <Button
                      aria-label="Move section down"
                      disabled={i === w.doc.sections.length - 1}
                      onClick={() => w.moveSection(s.id, i + 1)}
                    >
                      <ArrowDown size={13} />
                    </Button>
                    <Button
                      aria-label="Merge with next section"
                      title="Merge with next section"
                      disabled={i === w.doc.sections.length - 1}
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
        {dropGap === w.doc.sections.length && draggingId && (
          <div
            className="drop-marker"
            data-testid="drop-marker"
            data-drop-index={dropGap}
            aria-label="Drop at end"
          />
        )}
      </div>
      <Button className="add-section" onClick={w.addSection}>
        <Plus size={14} /> Add section
      </Button>
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
          onClick={() => ed?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={17} />
        </Button>
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
  const [compareSection, setCompareSection] = useState<string | null>(null);
  const text = documentText(w.doc);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const filename =
    w.doc.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "writing";
  const activeEditorCard =
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
        (!w.nav && w.layout.primaryView === "document" ? "nav-hidden" : "") +
        " " +
        (!w.layout.previewVisible ? "preview-hidden" : "") +
        " " +
        (!w.layout.inspectorVisible ? "inspector-hidden" : "")
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
            aria-pressed={w.layout.primaryView === "workbench" || w.nav}
            onClick={() => {
              if (w.layout.primaryView === "workbench") {
                w.setPrimaryView("document");
                w.setNav(false);
              } else w.setNav(!w.nav);
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
            onClick={() => w.setPrimaryView("workbench")}
          >
            Workbench
          </Button>
          <Button
            aria-pressed={w.layout.primaryView === "document"}
            onClick={() => w.setPrimaryView("document")}
          >
            Document View
          </Button>
        </div>
        <div className="row">
          {w.layout.primaryView === "workbench" && (
            <Button
              onClick={() => w.setPreviewVisible(!w.layout.previewVisible)}
            >
              {w.layout.previewVisible ? "Hide preview" : "Show preview"}
            </Button>
          )}
          <Button
            onClick={() => w.setInspectorVisible(!w.layout.inspectorVisible)}
          >
            {w.layout.inspectorVisible ? "Hide Inspector" : "Show Inspector"}
          </Button>
        </div>
      </div>
      <div className="workspace">
        {(w.nav || w.layout.primaryView === "workbench") && (
          <Structure
            w={w}
            onRemove={(id) => setConfirmation({ kind: "section", id })}
            editorCard={activeEditorCard}
            onWriteCard={writeInCard}
            onEditPreview={editInPreview}
          />
        )}
        <main className="writing">
          <Toolbar w={w} />
          <div className="selected-preview-heading">
            <span className="eyebrow">
              {w.layout.primaryView === "workbench"
                ? "Assembled preview · same writing"
                : "Document View"}
            </span>
            <b>
              {w.doc.sections.find((s) => s.id === w.selectedSectionId)
                ?.label ?? "Your document"}
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
                  {w.doc.sections.map((section) => (
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
                  sections={w.doc.sections}
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
              {w.doc.sections.length}{" "}
              {w.doc.sections.length === 1 ? "section" : "sections"}{" "}
              <span className="dot-separator">·</span> Human-led writing
            </span>
          </footer>
        </main>
        <WritingLabShell
          w={w}
          navigation={navigation}
          onCompare={() => setCompareSection(w.selectedSectionId)}
        />
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
