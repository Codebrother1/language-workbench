import { useState, useRef } from "react";
import {
  type LibraryItem,
  libraryKinds,
  searchLibrary,
  sectionKinds,
  contentTypes,
  contentTypeConfig,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { type SaveLibraryItemInput } from "./library-helpers";
import { Button, Field, Select, download } from "./ui";
const labels: Record<string, string> = {
  snippet: "Snippets",
  pattern: "Patterns",
  move: "Moves",
  style_example: "Style examples",
  style_rule: "Style guides",
  connector: "Connectors",
  my_language: "My Language",
};
const csv = (s: string) =>
  s
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
function ItemEditor({
  item,
  w,
  done,
}: {
  item: LibraryItem | null;
  w: Workspace;
  done: () => void;
}) {
  const [kind, setKind] = useState<LibraryItem["kind"]>(
      item?.kind ?? "snippet",
    ),
    [title, setTitle] = useState(item?.title ?? ""),
    [content, setContent] = useState(item?.content ?? ""),
    [notes, setNotes] = useState(item?.notes ?? ""),
    [tags, setTags] = useState(item?.tags.join(", ") ?? ""),
    [roles, setRoles] = useState(item?.sectionKinds.join(", ") ?? ""),
    [types, setTypes] = useState(item?.contentTypes.join(", ") ?? ""),
    [effects, setEffects] = useState(item?.effects.join(", ") ?? ""),
    [audiences, setAudiences] = useState(item?.audiences.join(", ") ?? ""),
    [register, setRegister] = useState(item?.register ?? ""),
    [preference, setPreference] = useState(item?.preference ?? "reference"),
    [myLanguage, setMyLanguage] = useState(item?.myLanguage ?? false),
    [ruleKey, setRuleKey] = useState(item?.ruleKey ?? ""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const input: SaveLibraryItemInput = {
      kind,
      title: title || content.slice(0, 70),
      content,
      notes,
      tags: csv(tags),
      sectionKinds: csv(roles),
      contentTypes: csv(types),
      effects: csv(effects),
      audiences: csv(audiences),
      register,
      preference,
      myLanguage,
      ruleKey,
    };
    try {
      if (item) await w.updateLibraryItem(item.id, input);
      else await w.saveLibraryItem(input);
      done();
    } catch (e) {
      w.setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="library-editor">
      <h3>{item ? "Edit saved item" : "Save something worth keeping"}</h3>
      <div className="form-grid">
        <Field label="Object type">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {libraryKinds.map((k) => (
              <option key={k} value={k}>
                {labels[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preference">
          <Select
            value={preference}
            onChange={(e) => setPreference(e.target.value as typeof preference)}
          >
            <option value="reference">Reference, not a default</option>
            <option value="like">Like / favorite</option>
            <option value="avoid">Avoid suggesting</option>
          </Select>
        </Field>
      </div>
      <Field label="Library title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Saved language or principle">
        <textarea
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </Field>
      <Field label="Why it matters / notes">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {kind === "style_rule" && (
        <Field
          label="Preference key"
          hint="Optional named preference such as rhythm, transitions, sentenceLengths or register. Matching keys use the most specific value."
        >
          <input value={ruleKey} onChange={(e) => setRuleKey(e.target.value)} />
        </Field>
      )}
      <details open>
        <summary>Where it belongs</summary>
        <div className="form-grid">
          <Field label="Section types (comma-separated)">
            <input
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
              placeholder="Hook, Segue, Closer"
            />
          </Field>
          <Field label="Content types (comma-separated)">
            <input
              value={types}
              onChange={(e) => setTypes(e.target.value)}
              placeholder="narration, reply, article"
            />
          </Field>
          <Field label="Custom tags (comma-separated)">
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field label="Effects (comma-separated)">
            <input
              value={effects}
              onChange={(e) => setEffects(e.target.value)}
              placeholder="ominous, playful, resigned"
            />
          </Field>
          <Field label="Register scope">
            <input
              value={register}
              onChange={(e) => setRegister(e.target.value)}
              placeholder="Blank = any; formal, technical…"
            />
          </Field>
          <Field label="Audiences (exact labels, comma-separated)">
            <input
              value={audiences}
              onChange={(e) => setAudiences(e.target.value)}
              placeholder="Blank = any audience"
            />
          </Field>
        </div>
        <p className="small muted">
          Within each field, any listed value matches. Across fields, every
          specified scope must match. Tags are searchable, not restrictions.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={myLanguage}
            onChange={(e) => setMyLanguage(e.target.checked)}
          />
          My Language
        </label>
      </details>
      <div className="row end">
        <Button onClick={done}>Cancel editing</Button>
        <Button
          className="primary"
          disabled={busy || !content.trim()}
          onClick={save}
        >
          {item ? "Save changes" : "Save library item"}
        </Button>
      </div>
    </section>
  );
}
export function PersonalLibrary({
  w,
  initialQuery = "",
  initialKind = "all",
}: {
  w: Workspace;
  initialQuery?: string;
  initialKind?: string;
}) {
  const [query, setQuery] = useState(initialQuery),
    [kind, setKind] = useState(initialKind),
    [editing, setEditing] = useState<string | null | undefined>(undefined),
    [deleting, setDeleting] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const found = searchLibrary(w.library.items, query, kind);
  const outsideMatches =
    query.trim() && kind !== "all"
      ? searchLibrary(w.library.items, query, "all").length - found.length
      : 0;
  if (editing !== undefined)
    return (
      <ItemEditor
        key={editing ?? "new"}
        item={w.library.items.find((i) => i.id === editing) ?? null}
        w={w}
        done={() => setEditing(undefined)}
      />
    );
  return (
    <>
      <p className="panel-intro">
        Your language, constructions, and reasons for liking them. Saved
        references never insert themselves into a document.
      </p>
      <div className="row between wrap">
        <span className="small muted" data-testid="library-save-state">
          {w.librarySaveState}
        </span>
        <div className="row">
          <Button onClick={() => setEditing(null)}>New library item</Button>
          <Button onClick={() => w.setPanel("guides")}>Style guides</Button>
        </div>
      </div>
      <Field label="Search Personal Library">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Words, roles, tags, effects, register…"
        />
      </Field>
      <Field label="Library view">
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All items</option>
          {[...libraryKinds, "my_language"].map((k) => (
            <option key={k} value={k}>
              {labels[k]}
            </option>
          ))}
        </Select>
      </Field>
      {outsideMatches > 0 && (
        <p className="guidance">
          {outsideMatches} matching items are outside this category.{" "}
          <Button onClick={() => setKind("all")}>Search all types</Button>
        </p>
      )}
      {!found.length && (
        <p className="empty-note">
          No matching items. Select a passage or candidate to save it, or add
          your own note here.
        </p>
      )}
      {found.map((item) => (
        <article className="library-entry" key={item.id}>
          <div className="row between">
            <h3>{item.title}</h3>
            <span className="tag">{item.kind.replaceAll("_", " ")}</span>
          </div>
          <p className="preserve">{item.content}</p>
          {item.notes && <p className="small muted">{item.notes}</p>}
          <p className="small muted">
            {[
              ...item.sectionKinds,
              ...item.contentTypes,
              ...item.tags,
              ...item.effects,
              item.register,
              item.preference === "avoid" ? "Avoid" : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="row wrap">
            <Button onClick={() => w.copy(item.content)}>Copy item</Button>
            <Button onClick={() => setEditing(item.id)}>Edit item</Button>
            {["snippet", "style_example"].includes(item.kind) && (
              <Button
                disabled={!w.target}
                onClick={() => {
                  w.previewLibraryItem(item);
                  w.setPanel(null);
                }}
              >
                Preview for target
              </Button>
            )}
            {item.kind === "pattern" && (
              <Button
                onClick={() => {
                  if (
                    !item.content.includes("[X]") ||
                    !item.content.includes("[Y]")
                  )
                    return w.setError(
                      "This pattern needs [X] and [Y] slots before it can be used in the builder.",
                    );
                  w.setStructure((d) => ({
                    ...d,
                    customTemplate: item.content,
                  }));
                  w.setPanel(null);
                  w.setNotice(
                    "Pattern loaded. Open Structure and fill your own slots.",
                  );
                }}
              >
                Use in builder
              </Button>
            )}
            <Button onClick={() => setDeleting(item.id)}>Delete item</Button>
          </div>
          {deleting === item.id && (
            <div className="inline-confirm">
              <p>Remove this item? Your document is unaffected.</p>
              <Button onClick={() => setDeleting(null)}>Keep item</Button>
              <Button
                className="danger"
                onClick={() =>
                  w
                    .deleteLibraryItem(item.id)
                    .then(() => setDeleting(null))
                    .catch((e) => w.setError(e.message))
                }
              >
                Confirm delete item
              </Button>
            </div>
          )}
        </article>
      ))}
      <details>
        <summary>Library backup & import</summary>
        <p className="small muted">
          This separate JSON backup includes guides and preferences, not your
          documents. Import adds fresh copies and never overwrites existing
          items.
        </p>
        <div className="row wrap">
          <Button
            onClick={() =>
              download(
                "personal-writing-library.json",
                JSON.stringify(w.library, null, 2),
                "application/json",
              )
            }
          >
            Export library JSON
          </Button>
          <Button onClick={() => file.current?.click()}>
            Import library JSON
          </Button>
          <Button
            onClick={() => w.flushLibrary().catch((e) => w.setError(e.message))}
          >
            Retry library save
          </Button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          data-testid="library-import"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0])
              void w
                .importLibrary(e.target.files[0])
                .catch((err) => w.setError(err.message));
            e.target.value = "";
          }}
        />
      </details>
    </>
  );
}
export function ScopedStyleGuides({ w }: { w: Workspace }) {
  const active = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  const [level, setLevel] = useState<"section" | "content">("section"),
    [role, setRole] = useState(active?.kind ?? "Hook"),
    [type, setType] = useState(w.doc.brief.contentType),
    [key, setKey] = useState(""),
    [text, setText] = useState(""),
    [why, setWhy] = useState(""),
    [edit, setEdit] = useState<string | undefined>();
  const matches = w.library.items.filter(
    (i) =>
      i.kind === "style_rule" &&
      (level === "section"
        ? i.sectionKinds.includes(role)
        : !i.sectionKinds.length && i.contentTypes.includes(type)),
  );
  const save = async () => {
    try {
      const value = {
        kind: "style_rule" as const,
        title: `${level === "section" ? role : contentTypeConfig[type].label}: ${key || "style note"}`,
        content: text,
        notes: why,
        ruleKey: key,
        sectionKinds: level === "section" ? [role] : [],
        contentTypes: level === "content" ? [type] : [],
      };
      if (edit) await w.updateLibraryItem(edit, value);
      else await w.saveLibraryItem(value);
      setEdit(undefined);
      setText("");
      setKey("");
      setWhy("");
    } catch (e) {
      w.setError((e as Error).message);
    }
  };
  return (
    <>
      <p className="panel-intro">
        More specific guidance wins: current instruction → section notes →
        section style → content style → global Style DNA. No AI-suggested rule
        is saved without your explicit Save.
      </p>
      <div className="form-grid">
        <Field label="Guide scope">
          <Select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as typeof level);
              setEdit(undefined);
            }}
          >
            <option value="section">Section type</option>
            <option value="content">Content type</option>
          </Select>
        </Field>
        {level === "section" ? (
          <Field label="Section style guide">
            <Select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as typeof role);
                setEdit(undefined);
              }}
            >
              {sectionKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Content style guide">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setEdit(undefined);
              }}
            >
              {contentTypes.map((t) => (
                <option key={t} value={t}>
                  {contentTypeConfig[t].label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {matches.map((item) => (
        <article className="guide-rule" key={item.id}>
          <b>{item.ruleKey || "Style note"}</b>
          <p>{item.content}</p>
          {item.notes && <small>{item.notes}</small>}
          <div className="row">
            <Button
              onClick={() => {
                setEdit(item.id);
                setKey(item.ruleKey);
                setText(item.content);
                setWhy(item.notes);
              }}
            >
              Edit rule
            </Button>
          </div>
        </article>
      ))}
      {!matches.length && (
        <p className="small muted">
          No saved rules for this scope. Global Style DNA remains the fallback.
        </p>
      )}
      <h3>{edit ? "Edit this preference" : "Add a preference"}</h3>
      <Field
        label="Style preference key"
        hint="For deterministic conflicts use the same key, e.g. rhythm, sentenceLengths, transitions or register. Freeform notes are priority-ordered guidance."
      >
        <input value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      <Field label="Style preference">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Prefer short transitions; don’t announce the move…"
        />
      </Field>
      <Field label="Why this preference?">
        <input value={why} onChange={(e) => setWhy(e.target.value)} />
      </Field>
      <Button
        className="primary"
        disabled={!text.trim() || !w.libraryReady}
        onClick={save}
      >
        Save style rule
      </Button>
      <p className="small muted">
        Section notes and current instructions can use key: value lines. Blank
        values do not erase preferences; an explicit [clear] value clears a
        named preference. Freeform contradictions require model interpretation
        and review.
      </p>
      <Button className="text-button" onClick={() => w.setPanel("library")}>
        Browse / delete rules in Personal Library
      </Button>
    </>
  );
}
