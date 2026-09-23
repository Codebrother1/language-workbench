import { useRef, useState } from "react";
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
import { Button, Select, Field, Dialog, download } from "./ui";
import { WritingLabShell } from "./WritingLabShell";
import { UtilityPanel } from "./UtilityPanel";
function Structure({
  w,
  onRemove,
}: {
  w: Workspace;
  onRemove: (id: string) => void;
}) {
  const drag = useRef<string | null>(null);
  return (
    <nav className="structure" aria-label="Document structure">
      <div className="row between">
        <span className="eyebrow">STRUCTURE</span>
        <span className="count">{w.doc.sections.length}</span>
      </div>
      <p className="small muted structure-hint">A shape of your choosing.</p>
      <div className="section-list">
        {w.doc.sections.map((s, i) => (
          <div
            key={s.id}
            className={
              "structure-item " + (w.target?.sectionId === s.id ? "active" : "")
            }
            data-testid="structure-item"
            data-section-id={s.id}
            draggable
            onDragStart={(e) => {
              drag.current = s.id;
              e.dataTransfer.setData("text/plain", s.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag.current) w.moveSection(drag.current, i);
              drag.current = null;
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
            <div className="section-excerpt">
              {sectionText(s).slice(0, 64) || "Start writing…"}
            </div>
            {w.target?.sectionId === s.id && (
              <details className="section-options">
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
                      })
                    }
                  >
                    {sectionKinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Section notes · AI context">
                  <textarea
                    rows={2}
                    value={s.notes}
                    onChange={(e) =>
                      w.update((d) => ({
                        ...d,
                        sections: d.sections.map((x) =>
                          x.id === s.id ? { ...x, notes: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </Field>
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
                    disabled={w.doc.sections.length === 1}
                    onClick={() => onRemove(s.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
      <Button className="add-section" onClick={w.addSection}>
        <Plus size={14} /> Add section
      </Button>
      <div className="structure-bottom">
        <span className="eyebrow">CONTEXT</span>
        <Button onClick={() => w.setPanel("brief")}>
          <FileText size={15} />
          Writing brief
        </Button>
        <Button onClick={() => w.setPanel("sources")}>
          <BookOpen size={15} />
          Sources <span className="count">{w.doc.sources.length}</span>
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: "document" | "section";
    id?: string;
  } | null>(null);
  const [menu, setMenu] = useState(false);
  const text = documentText(w.doc);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const filename =
    w.doc.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "writing";
  return (
    <div className={"app " + (!w.nav ? "nav-hidden" : "")}>
      <header className="topbar">
        <div className="topbar-main">
          <Button
            className="icon nav-toggle"
            aria-label="Toggle structure"
            aria-pressed={w.nav}
            onClick={() => w.setNav(!w.nav)}
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
      <div className="workspace">
        {w.nav && (
          <Structure
            w={w}
            onRemove={(id) => setConfirmation({ kind: "section", id })}
          />
        )}
        <main className="writing">
          <Toolbar w={w} />
          <div className="page">
            <div className="page-caption">
              <span className="eyebrow">YOUR WORDS, FIRST</span>
              <button onClick={() => w.setPanel("brief")}>
                Writing brief <ArrowUp size={11} className="rotate" />
              </button>
            </div>
            <div className={"editor-wrap " + (!text ? "empty" : "")}>
              <EditorContent editor={w.editor} />
              {!text && (
                <div className="editor-placeholder" aria-hidden="true">
                  Start with what you mean.
                </div>
              )}
            </div>
            <div className="page-end">
              <span />
              <span>Nothing added until you choose.</span>
              <span />
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
        <WritingLabShell w={w} />
      </div>
      <UtilityPanel w={w} />
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
              : "This removes the section and its saved variants. The rest of your writing is untouched."}
          </p>
          <div className="row end">
            <Button onClick={() => setConfirmation(null)}>Keep writing</Button>
            <Button
              className="danger solid"
              onClick={() => {
                if (confirmation.kind === "document") w.remove();
                else
                  w.sync({
                    ...w.doc,
                    sections: w.doc.sections.filter(
                      (s) => s.id !== confirmation.id,
                    ),
                  });
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
