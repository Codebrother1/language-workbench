import type { LibraryNavigation } from "./wayfinding";
import { PersonalLibrary, ScopedStyleGuides } from "./PersonalLibrary";
import { ProviderSettings } from "./ProviderSettings";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ExternalLink, Copy, RefreshCw } from "lucide-react";
import {
  contentTypeConfig,
  contentTypes,
  uid,
  documentText,
  sectionText,
  type Document,
  type RevisionIntent,
  type Settings,
  type WritingBrief,
  type PieceMemory as PieceMemoryData,
  type SourceMaterial,
} from "./domain";
import { api, type Workspace } from "./useWorkspace";
import {
  Dialog,
  Button,
  ConfirmDelete,
  Field,
  Select,
  safeURL,
  download,
} from "./ui";
import {
  sectionMentions,
  documentBackup,
  duplicateDocumentCue,
  hasPieceMemoryContent,
  nextMoveSectionLabel,
  revisionChanges,
  revisionExcerpt,
  sortedRevisionPlan,
} from "./workspace-helpers";
const words = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const nice = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
function Brief({ w }: { w: Workspace }) {
  const b = w.doc.brief;
  const change = (key: keyof WritingBrief, value: unknown) =>
    w.update((d) => ({ ...d, brief: { ...d.brief, [key]: value } }));
  return (
    <>
      <h3>What are you making?</h3>
      <p className="panel-intro">
        This brief is optional. Add what you know now, leave the rest blank, and
        come back anytime. Your notes give the tools context; they never
        automatically create a template or change your writing.
      </p>
      <div className="form-grid">
        <Field label="Content type">
          <Select
            value={b.contentType}
            onChange={(e) => change("contentType", e.target.value)}
          >
            {contentTypes.map((t) => (
              <option key={t} value={t}>
                {contentTypeConfig[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destination">
          <input
            value={b.destination}
            onChange={(e) => change("destination", e.target.value)}
            placeholder="Where will this live?"
          />
        </Field>
      </div>
      <p className="guidance">{contentTypeConfig[b.contentType].guidance}</p>
      <Field label="Audience">
        <input
          value={b.audience}
          onChange={(e) => change("audience", e.target.value)}
          placeholder="Who are you talking to?"
        />
      </Field>
      {(["objectives", "desiredReactions", "excludedFrameworks"] as const).map(
        (k) => (
          <Field key={k} label={nice(k) + " (comma-separated)"}>
            <input
              defaultValue={b[k].join(", ")}
              onBlur={(e) => change(k, words(e.target.value))}
            />
          </Field>
        ),
      )}
      <div className="form-grid">
        <Field label="Source material type">
          <Select
            value={b.sourceMaterialType}
            onChange={(e) => change("sourceMaterialType", e.target.value)}
          >
            {[
              "none",
              "text",
              "comment",
              "article",
              "clip",
              "transcript",
              "repo",
              "announcement",
              "other",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Framework preference">
          <Select
            value={b.frameworkPreference}
            onChange={(e) => change("frameworkPreference", e.target.value)}
          >
            {["none", "reference_only", "intentional"].map((t) => (
              <option key={t} value={t}>
                {nice(t.replaceAll("_", " "))}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Desired length">
        <input
          value={b.desiredLength}
          onChange={(e) => change("desiredLength", e.target.value)}
          placeholder="As long as it needs, or a specific limit"
        />
      </Field>
      <Field label="Custom notes">
        <textarea
          rows={4}
          value={b.customNotes}
          onChange={(e) => change("customNotes", e.target.value)}
          placeholder="Constraints, context, non-negotiables…"
        />
      </Field>
    </>
  );
}
function RevisionPanel({
  w,
  onGoToSection,
}: {
  w: Workspace;
  onGoToSection: (id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const checkpoint = w.doc.revisionCheckpoint;
  const changes =
    reviewOpen && checkpoint ? revisionChanges(checkpoint, w.doc) : [];
  const changed = w.revisionHasChanges;
  const setCheckpoint = () => {
    w.setRevisionCheckpoint(label);
    setReviewOpen(false);
    setConfirmReplace(false);
    setLabel("");
  };
  return (
    <div className="revision-panel" data-testid="revision-panel">
      <p className="panel-intro">
        One writer-set baseline for the current draft. It does not save a Take
        or change your prose.
      </p>
      {!checkpoint ? (
        <>
          <Field label="Checkpoint note (optional)">
            <input
              maxLength={120}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Button onClick={setCheckpoint}>Set revision checkpoint</Button>
        </>
      ) : (
        <>
          <p className="small muted">
            Checkpoint set{" "}
            <time dateTime={checkpoint.createdAt}>
              {new Date(checkpoint.createdAt).toLocaleString()}
            </time>
            {checkpoint.label && ` · ${checkpoint.label}`}
          </p>
          <p className="small">
            {changed
              ? "Changes since checkpoint"
              : "No changes since checkpoint"}
          </p>
          <div className="row wrap">
            <Button onClick={() => setReviewOpen((open) => !open)}>
              {reviewOpen ? "Hide changes" : "Review changes"}
            </Button>
            <Button onClick={() => setConfirmReplace(true)}>
              Set current draft as new checkpoint
            </Button>
          </div>
          {reviewOpen && (
            <section
              className="revision-changes"
              aria-label="Changes since checkpoint"
            >
              {changes.length ? (
                <p className="small muted">
                  {changes.length} changed{" "}
                  {changes.length === 1 ? "section" : "sections"}
                </p>
              ) : (
                <p className="small muted">
                  {changed
                    ? "No section-level changes passed the low-noise comparison."
                    : "No section-level changes since this checkpoint."}
                </p>
              )}
              {changes.map((change) => {
                const reference = change.current
                  ? nextMoveSectionLabel(w.doc, change.id)
                  : [
                      String(change.beforeOrder).padStart(2, "0"),
                      change.before?.label !== change.before?.kind
                        ? change.before?.label
                        : null,
                      change.before?.kind,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                const excerpt = revisionExcerpt(
                  change.before?.text ?? "",
                  change.current ? sectionText(change.current) : "",
                );
                return (
                  <article
                    key={change.id}
                    data-testid="revision-change"
                    aria-label={`${reference} · ${change.status.join(" · ")}`}
                  >
                    <b>{reference}</b>
                    <p className="small muted">
                      {change.status.join(" · ")}
                      {change.status.includes("Moved") &&
                      change.beforeOrder &&
                      change.currentOrder
                        ? ` ${change.beforeOrder} → ${change.currentOrder}`
                        : ""}
                    </p>
                    {(change.status.includes("Edited") ||
                      change.status.includes("Formatting changed") ||
                      change.status.includes("Removed")) && (
                      <p>
                        <strong>Before:</strong> {excerpt.before}
                      </p>
                    )}
                    {(change.status.includes("Edited") ||
                      change.status.includes("Formatting changed") ||
                      change.status.includes("Added")) && (
                      <p>
                        <strong>Now:</strong> {excerpt.current}
                      </p>
                    )}
                    {change.current && (
                      <Button onClick={() => onGoToSection(change.id)}>
                        Go to section
                      </Button>
                    )}
                  </article>
                );
              })}
            </section>
          )}
          {confirmReplace && (
            <div
              className="inline-confirm"
              role="alertdialog"
              aria-label="Replace revision checkpoint"
            >
              <p>
                Replace the current revision checkpoint with the draft as it is
                now?
              </p>
              <Field label="Checkpoint note (optional)">
                <input
                  maxLength={120}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
              <div className="row wrap">
                <Button onClick={() => setConfirmReplace(false)}>Cancel</Button>
                <Button onClick={setCheckpoint}>Replace checkpoint</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RevisionIntentRow({
  w,
  note,
  onGoToSection,
}: {
  w: Workspace;
  note: RevisionIntent;
  onGoToSection: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [sectionId, setSectionId] = useState(note.sectionId);
  const location = nextMoveSectionLabel(w.doc, note.sectionId);
  return (
    <article
      data-testid="revision-intention"
      aria-label={`${location ?? "Linked section no longer exists"} · ${note.completedAt ? "Completed" : "Active"} revision note`}
    >
      <b>{location ?? "Linked section no longer exists"}</b>
      {editing ? (
        <div className="revision-plan-editor">
          <Field label="Edit note section">
            <Select
              value={
                w.doc.sections.some((section) => section.id === sectionId)
                  ? sectionId
                  : ""
              }
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">Choose section</option>
              {w.doc.sections.map((section) => (
                <option value={section.id} key={section.id}>
                  {nextMoveSectionLabel(w.doc, section.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Edit revision note">
            <textarea
              rows={2}
              maxLength={1200}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <div className="row wrap">
            <Button
              disabled={
                !text.trim() ||
                !w.doc.sections.some((section) => section.id === sectionId)
              }
              onClick={() => {
                if (w.editRevisionIntent(note.id, sectionId, text))
                  setEditing(false);
              }}
            >
              Save note
            </Button>
            <Button
              onClick={() => {
                setText(note.text);
                setSectionId(note.sectionId);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p>{note.text}</p>
      )}
      {!editing && (
        <div className="row wrap">
          {location && (
            <Button onClick={() => onGoToSection(note.sectionId)}>
              Go to section
            </Button>
          )}
          <Button
            onClick={() => w.completeRevisionIntent(note.id, !note.completedAt)}
          >
            {note.completedAt ? "Reopen" : "Done"}
          </Button>
          <Button className="text-button" onClick={() => setEditing(true)}>
            Edit note
          </Button>
          <Button
            className="text-button"
            onClick={() => w.removeRevisionIntent(note.id)}
          >
            Remove note
          </Button>
        </div>
      )}
    </article>
  );
}
function RevisionPlanPanel({
  w,
  onGoToSection,
}: {
  w: Workspace;
  onGoToSection: (id: string) => void;
}) {
  const [sectionId, setSectionId] = useState("");
  const [text, setText] = useState("");
  const active = sortedRevisionPlan(w.doc, false);
  const completed = sortedRevisionPlan(w.doc, true);
  return (
    <div className="revision-plan" data-testid="revision-plan">
      <p className="panel-intro">
        Short writer-authored notes about sections to revisit. Separate from
        prose, Piece Memory and the Revision checkpoint.
      </p>
      <h3>Revision plan · {active.length} active</h3>
      {active.map((note) => (
        <RevisionIntentRow
          key={note.id}
          w={w}
          note={note}
          onGoToSection={onGoToSection}
        />
      ))}
      {!!completed.length && (
        <details className="revision-plan-completed">
          <summary>Show completed · {completed.length}</summary>
          {completed.map((note) => (
            <RevisionIntentRow
              key={note.id}
              w={w}
              note={note}
              onGoToSection={onGoToSection}
            />
          ))}
        </details>
      )}
      <section className="revision-plan-create" aria-label="Add revision note">
        <Field label="Section for revision note">
          <Select
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
          >
            <option value="">Choose section</option>
            {w.doc.sections.map((section) => (
              <option value={section.id} key={section.id}>
                {nextMoveSectionLabel(w.doc, section.id)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Revision note">
          <textarea
            rows={2}
            maxLength={1200}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What do you want to reconsider here?"
          />
        </Field>
        <Button
          disabled={!sectionId || !text.trim()}
          onClick={() => {
            if (w.createRevisionIntent(sectionId, text)) {
              setText("");
              setSectionId("");
            }
          }}
        >
          Add revision note
        </Button>
      </section>
    </div>
  );
}

function PieceMemory({
  w,
  onGoToSection,
}: {
  w: Workspace;
  onGoToSection: (id: string) => void;
}) {
  const memory = w.doc.pieceMemory;
  const linkedSectionLabel = memory.nextMove.trim()
    ? nextMoveSectionLabel(w.doc, memory.nextMoveSectionId)
    : null;
  const [unresolvedDraft, setUnresolvedDraft] = useState("");
  const [decisionDraft, setDecisionDraft] = useState("");
  const [suggestedQuestion, setSuggestedQuestion] = useState<string | null>(
    null,
  );
  const [suggestionNotice, setSuggestionNotice] = useState("");
  useEffect(() => {
    setSuggestedQuestion(null);
    setSuggestionNotice("");
    setUnresolvedDraft("");
    setDecisionDraft("");
  }, [w.doc.id]);
  const change = (apply: (memory: PieceMemoryData) => PieceMemoryData) =>
    w.update((doc) => ({
      ...doc,
      pieceMemory: {
        ...apply(doc.pieceMemory),
        updatedAt: new Date().toISOString(),
        reviewedDraftRevision: w.draftRevision,
      },
    }));
  const draftChanged =
    hasPieceMemoryContent(memory) &&
    memory.reviewedDraftRevision !== w.draftRevision;
  const fields = [
    ["Next move", memory.nextMove],
    ["Purpose", memory.purpose],
    ["Reader", memory.reader],
    ["Current question", memory.currentQuestion],
    ["Last session note", memory.lastSessionNote],
  ].filter(([, value]) => value.trim());
  const unresolvedCount = memory.unresolved.filter((item) =>
    item.trim(),
  ).length;
  const decisionCount = memory.decisions.filter((item) =>
    item.text.trim(),
  ).length;
  const suggest = () => {
    const runs = [
      ...(w.doc.workbench?.runs ?? []),
      ...w.doc.sections.flatMap((section) => section.workbench?.runs ?? []),
    ];
    const question = runs
      .filter((run) => run.instruction.trim().includes("?"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((run) => run.instruction.trim() !== memory.currentQuestion.trim());
    setSuggestedQuestion(question?.instruction.trim() ?? null);
    setSuggestionNotice(
      question
        ? "Earlier writer-authored Lab question · check if it still applies. No memory was saved."
        : "No explicit writer question in saved Lab runs. Nothing was saved.",
    );
  };
  return (
    <div className="piece-memory" data-testid="piece-memory">
      <p className="panel-intro">
        Optional notes about where you are in this piece. Separate from the
        Writing Brief, Lab history and your draft. Nothing here edits your
        prose.
      </p>
      {draftChanged && (
        <div className="piece-memory-freshness" role="status">
          <span>Draft changed since this memory was last updated.</span>
          <Button onClick={() => change((old) => ({ ...old }))}>
            Mark reviewed
          </Button>
        </div>
      )}
      <section
        className="piece-memory-summary"
        aria-label="Where I left off"
        hidden={
          fields.length === 0 && unresolvedCount === 0 && decisionCount === 0
        }
      >
        {(fields.length > 0 || unresolvedCount > 0 || decisionCount > 0) && (
          <h3>Where I left off</h3>
        )}
        {fields.map(([label, value]) => (
          <div className="piece-memory-summary-item" key={label}>
            <b>{label}</b>
            <span>{value}</span>
            {label === "Next move" && linkedSectionLabel && (
              <span className="piece-memory-location">
                {linkedSectionLabel}
                <Button
                  onClick={() => onGoToSection(memory.nextMoveSectionId!)}
                >
                  Go to section
                </Button>
              </span>
            )}
          </div>
        ))}
        {(unresolvedCount > 0 || decisionCount > 0) && (
          <small>
            {[
              unresolvedCount > 0 ? `${unresolvedCount} unresolved` : "",
              decisionCount > 0
                ? `${decisionCount} ${decisionCount === 1 ? "decision" : "decisions"}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
        )}
      </section>
      <div className="piece-memory-next">
        <Field label="Next move">
          <textarea
            rows={2}
            maxLength={1200}
            value={memory.nextMove}
            onChange={(event) =>
              change((old) => ({ ...old, nextMove: event.target.value }))
            }
            placeholder="What were you about to do?"
          />
        </Field>
        {(memory.nextMove.trim() || memory.nextMoveSectionId) && (
          <div className="piece-memory-link">
            <Field label="Next-move section link">
              <Select
                value={
                  nextMoveSectionLabel(w.doc, memory.nextMoveSectionId)
                    ? memory.nextMoveSectionId!
                    : ""
                }
                onChange={(event) =>
                  change((old) => ({
                    ...old,
                    nextMoveSectionId: event.target.value || null,
                  }))
                }
              >
                <option value="">No linked section</option>
                {w.doc.sections.map((section) => (
                  <option value={section.id} key={section.id}>
                    {nextMoveSectionLabel(w.doc, section.id)}
                  </option>
                ))}
              </Select>
            </Field>
            {memory.nextMoveSectionId && (
              <Button
                className="text-button"
                onClick={() =>
                  change((old) => ({ ...old, nextMoveSectionId: null }))
                }
              >
                Clear link
              </Button>
            )}
          </div>
        )}
      </div>
      <Field label="Purpose">
        <textarea
          rows={2}
          maxLength={3000}
          value={memory.purpose}
          onChange={(event) =>
            change((old) => ({ ...old, purpose: event.target.value }))
          }
          placeholder="What is this piece trying to do?"
        />
      </Field>
      <Field label="Reader">
        <input
          maxLength={1200}
          value={memory.reader}
          onChange={(event) =>
            change((old) => ({ ...old, reader: event.target.value }))
          }
          placeholder="Who is this for?"
        />
      </Field>
      <Field label="Current question">
        <textarea
          rows={2}
          maxLength={1800}
          value={memory.currentQuestion}
          onChange={(event) =>
            change((old) => ({ ...old, currentQuestion: event.target.value }))
          }
          placeholder="What are you still deciding?"
        />
      </Field>
      <h3>Unresolved</h3>
      {memory.unresolved.map((item, index) => (
        <div className="row wrap" key={index}>
          <input
            aria-label={`Unresolved item ${index + 1}`}
            maxLength={1200}
            value={item}
            onChange={(event) =>
              change((old) => ({
                ...old,
                unresolved: old.unresolved.map((value, at) =>
                  at === index ? event.target.value : value,
                ),
              }))
            }
            onBlur={() => {
              if (!item.trim())
                change((old) => ({
                  ...old,
                  unresolved: old.unresolved.filter((_, at) => at !== index),
                }));
            }}
          />
          <Button
            aria-label={`Resolve unresolved item ${index + 1}`}
            onClick={() =>
              change((old) => ({
                ...old,
                unresolved: old.unresolved.filter((_, at) => at !== index),
              }))
            }
          >
            Resolve
          </Button>
        </div>
      ))}
      <div className="row wrap">
        <input
          aria-label="Unresolved note"
          maxLength={1200}
          value={unresolvedDraft}
          onChange={(event) => setUnresolvedDraft(event.target.value)}
          placeholder="Something to revisit"
        />
        <Button
          disabled={!unresolvedDraft.trim()}
          onClick={() => {
            change((old) => ({
              ...old,
              unresolved: [...old.unresolved, unresolvedDraft.trim()],
            }));
            setUnresolvedDraft("");
          }}
        >
          Add unresolved
        </Button>
      </div>
      <h3>Decisions made</h3>
      {draftChanged && decisionCount > 0 && (
        <small className="muted">
          Review decisions against the current draft.
        </small>
      )}
      {memory.decisions.map((decision, index) => (
        <div className="row wrap" key={decision.id}>
          <input
            aria-label={`Decision ${index + 1}`}
            maxLength={1200}
            value={decision.text}
            onChange={(event) =>
              change((old) => ({
                ...old,
                decisions: old.decisions.map((item) =>
                  item.id === decision.id
                    ? { ...item, text: event.target.value }
                    : item,
                ),
              }))
            }
            onBlur={() => {
              if (!decision.text.trim())
                change((old) => ({
                  ...old,
                  decisions: old.decisions.filter(
                    (item) => item.id !== decision.id,
                  ),
                }));
            }}
          />
          <Button
            aria-label={`Remove decision ${index + 1}`}
            onClick={() =>
              change((old) => ({
                ...old,
                decisions: old.decisions.filter(
                  (item) => item.id !== decision.id,
                ),
              }))
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <div className="row wrap">
        <input
          aria-label="Decision to remember"
          maxLength={1200}
          value={decisionDraft}
          onChange={(event) => setDecisionDraft(event.target.value)}
          placeholder="A choice you want to remember"
        />
        <Button
          disabled={!decisionDraft.trim()}
          onClick={() => {
            change((old) => ({
              ...old,
              decisions: [
                ...old.decisions,
                {
                  id: uid(),
                  text: decisionDraft.trim(),
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
            setDecisionDraft("");
          }}
        >
          Add decision
        </Button>
      </div>
      <Field label="Last session note">
        <textarea
          rows={3}
          maxLength={3000}
          value={memory.lastSessionNote}
          onChange={(event) =>
            change((old) => ({ ...old, lastSessionNote: event.target.value }))
          }
          placeholder="What should you remember next time?"
        />
      </Field>
      <div className="piece-memory-suggest">
        <Button onClick={suggest}>Suggest where I left off</Button>
        <small>
          Only copies an explicit writer question from saved Lab runs. No model
          request or paid provider; review before keeping it.
        </small>
        {suggestionNotice && <p role="status">{suggestionNotice}</p>}
        {suggestedQuestion !== null && (
          <div className="piece-memory-proposal">
            <Field label="Suggested current question">
              <textarea
                rows={2}
                value={suggestedQuestion}
                onChange={(event) => setSuggestedQuestion(event.target.value)}
              />
            </Field>
            <div className="row wrap">
              <Button
                disabled={!suggestedQuestion.trim()}
                onClick={() => {
                  change((old) => ({
                    ...old,
                    currentQuestion: suggestedQuestion.trim(),
                  }));
                  setSuggestedQuestion(null);
                  setSuggestionNotice(
                    "Saved your reviewed question to Piece Memory.",
                  );
                }}
              >
                Keep this question
              </Button>
              <Button
                onClick={() => {
                  setSuggestedQuestion(null);
                  setSuggestionNotice("Ignored. Nothing was saved.");
                }}
              >
                Ignore suggestion
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Sources({ w }: { w: Workspace }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const patch = (id: string, key: keyof SourceMaterial, value: string) =>
    w.update((d) => ({
      ...d,
      sources: d.sources.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    }));
  return (
    <>
      <p className="panel-intro">
        Paste material you want to refer to here: an article, a quote, a
        transcript, or background notes. It stays separate from your writing. If
        this is your own draft to work on, paste it into the page instead.
        Sources give the tools context, not instructions to follow.
      </p>
      {w.doc.sources.map((source, i) => (
        <section key={source.id} className="source" data-source-id={source.id}>
          <div className="row between">
            <span className="eyebrow">
              REFERENCE {String(i + 1).padStart(2, "0")}
            </span>
            <Button
              aria-label="Remove source"
              title="Remove source"
              onClick={() => setDeleting(source.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          {deleting === source.id && (
            <ConfirmDelete
              title={
                source.title.trim()
                  ? `Remove source “${source.title}”?`
                  : "Remove this source?"
              }
              confirmLabel="Remove source"
              onCancel={() => setDeleting(null)}
              onConfirm={() => {
                w.update((d) => ({
                  ...d,
                  sources: d.sources.filter((item) => item.id !== source.id),
                }));
                const message = source.title.trim()
                  ? `Removed source “${source.title}”.`
                  : "Removed source.";
                setFeedback(message);
                w.setNotice(message);
                setDeleting(null);
              }}
            />
          )}
          <div className="form-grid">
            <Field label="Reference title">
              <input
                value={source.title}
                onChange={(e) => patch(source.id, "title", e.target.value)}
              />
            </Field>
            <Field label="Material kind">
              <Select
                value={source.kind}
                onChange={(e) => patch(source.id, "kind", e.target.value)}
              >
                {[
                  "text",
                  "comment",
                  "quote",
                  "transcript",
                  "article",
                  "repo",
                  "notes",
                  "other",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Source text">
            <textarea
              data-source-text="true"
              rows={7}
              value={source.text}
              onChange={(e) => patch(source.id, "text", e.target.value)}
              placeholder="Paste the original material. Keep your writing in the editor."
            />
          </Field>
          <Field label="Source URL (optional)">
            <input
              type="url"
              value={source.url}
              onChange={(e) => patch(source.id, "url", e.target.value)}
              placeholder="https://…"
            />
          </Field>
          {safeURL(source.url) && (
            <a
              href={safeURL(source.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source <ExternalLink size={12} />
            </a>
          )}
        </section>
      ))}
      {feedback && (
        <p role="status" className="guidance">
          {feedback}
        </p>
      )}
      <Button onClick={w.addSource}>
        <Plus size={15} />
        Add reference
      </Button>
    </>
  );
}
function Style({
  w,
  draft,
  setDraft,
}: {
  w: Workspace;
  draft: Settings;
  setDraft: (update: (current: Settings) => Settings) => void;
}) {
  const style = draft.styleDNA;
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, styleDNA: { ...d.styleDNA, [key]: value } }));
  return (
    <>
      <p className="panel-intro">
        Describe what sounds like you. These preferences guide choices, not a
        style imitation machine.
      </p>
      <details open>
        <summary>Voice & cadence</summary>
        <div className="form-grid">
          {Object.entries(style)
            .filter(([, v]) => !Array.isArray(v))
            .map(([key, value]) => (
              <Field key={key} label={nice(key)}>
                {typeof value === "boolean" ? (
                  <Select
                    value={String(value)}
                    onChange={(e) => set(key, e.target.value === "true")}
                  >
                    <option value="true">Preserve intentional fragments</option>
                    <option value="false">Prefer complete sentences</option>
                  </Select>
                ) : key === "profanity" ? (
                  <Select
                    value={value}
                    onChange={(e) => set(key, e.target.value)}
                  >
                    {["preserve", "avoid", "welcome"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Select>
                ) : (
                  <textarea
                    rows={2}
                    value={String(value)}
                    onChange={(e) => set(key, e.target.value)}
                  />
                )}
              </Field>
            ))}
        </div>
      </details>
      <details>
        <summary>Vocabulary & boundaries</summary>
        {Object.entries(style)
          .filter(([, v]) => Array.isArray(v))
          .map(([key, value]) => (
            <Field key={key} label={nice(key) + " (one per line)"}>
              <textarea
                rows={3}
                value={(value as string[]).join("\n")}
                onChange={(e) => set(key, e.target.value.split("\n"))}
              />
            </Field>
          ))}
      </details>
      <details>
        <summary>
          Knowledge packs{" "}
          <span className="count">
            {draft.knowledgePacks.filter((p) => p.enabled).length} on
          </span>
        </summary>
        <p className="small muted">
          Mechanisms to consult, never mandatory frameworks.
        </p>
        {draft.knowledgePacks.map((pack) => (
          <div className="knowledge" key={pack.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={pack.enabled}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    knowledgePacks: d.knowledgePacks.map((p) =>
                      p.id === pack.id
                        ? { ...p, enabled: e.target.checked }
                        : p,
                    ),
                  }))
                }
              />
              {pack.name}
            </label>
            <textarea
              aria-label={pack.name + " principles"}
              rows={3}
              value={pack.principles}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  knowledgePacks: d.knowledgePacks.map((p) =>
                    p.id === pack.id ? { ...p, principles: e.target.value } : p,
                  ),
                }))
              }
            />
          </div>
        ))}
      </details>
      <div className="sticky-footer">
        <Button
          className="primary"
          onClick={async () => {
            await w.saveSettings(draft);
          }}
        >
          Save voice preferences
        </Button>
      </div>
    </>
  );
}
function Radar({ w }: { w: Workspace }) {
  const [query, setQuery] = useState(
    "Current language patterns and internet rhetoric",
  );
  return (
    <>
      <p className="panel-intro">
        Understand the construction, not just the catchphrase. Save language
        deliberately; nothing is inserted into your writing.
      </p>
      <Field label="Research topic">
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      <Button
        className="primary"
        disabled={!w.health.webResearch || w.busy || !query.trim()}
        onClick={() => w.refreshRadar(query)}
      >
        <RefreshCw size={14} />
        {w.busy ? "Researching…" : "Refresh live research"}
      </Button>
      {!w.health.webResearch && (
        <p className="guidance">
          Live research is unavailable for the current provider. Existing saved
          items remain accessible. No fake trends or citations are generated.
        </p>
      )}
      {w.settings.radar.length === 0 && (
        <p className="empty-note">
          No radar items yet. Your own language is always the starting point.
        </p>
      )}
      {w.settings.radar.map((item) => (
        <article className="radar-card" key={item.id}>
          <div className="row between">
            <h3>{item.term}</h3>
            <Select
              aria-label={"Status for " + item.term}
              value={item.status}
              onChange={(e) =>
                w.saveSettings({
                  ...w.settings,
                  radar: w.settings.radar.map((r) =>
                    r.id === item.id
                      ? { ...r, status: e.target.value as typeof item.status }
                      : r,
                  ),
                })
              }
            >
              {["saved", "maybe", "dislike", "never_suggest"].map((s) => (
                <option value={s} key={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </div>
          <p>{item.meaning}</p>
          <dl>
            {(
              [
                "mechanism",
                "pattern",
                "seriousUsage",
                "ironicUsage",
                "exampleStructure",
                "caveat",
              ] as const
            ).map((k) => (
              <div key={k}>
                <dt>{nice(k)}</dt>
                <dd>{item[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="small">Related: {item.relatedTerms.join(", ")}</p>
          <div className="citation">
            Verified {new Date(item.lastVerifiedAt).toLocaleDateString()} ·
            Discovered {new Date(item.discoveredAt).toLocaleDateString()}
            {item.sources.map((s, i) => (
              <a
                key={i}
                href={safeURL(s.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title} <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </article>
      ))}
    </>
  );
}
function History({ w }: { w: Workspace }) {
  const display = (text: string) =>
    sectionMentions(w.doc, text)
      .map((part) => part.text)
      .join("");
  return (
    <>
      <p className="panel-intro">
        A record of proposals, your direction, and what you chose. Undo and redo
        in the editor still use the normal editing history.
      </p>
      {!w.doc.history.length && (
        <p className="empty-note">
          No proposals yet. Start with your own words.
        </p>
      )}
      {[...w.doc.history].reverse().map((h) => (
        <article className="history-card" key={h.id}>
          <div className="row between">
            <span className="tag">{h.state}</span>
            <span className="small muted">
              {new Date(h.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="small muted">
            {h.provider} · {h.target.scope} target
          </p>
          <details>
            <summary>Original target & direction</summary>
            <blockquote>{h.target.text}</blockquote>
            <p>{h.instruction}</p>
            <p>{display(h.coachQuestion)}</p>
            <p>{h.userAnswer}</p>
          </details>
          <p className="preserve">{display(h.proposal)}</p>
          <Button onClick={() => w.copy(display(h.proposal))}>
            <Copy size={13} />
            Copy proposal
          </Button>
          {h.target.sectionId && (
            <Button
              onClick={() => {
                w.setPanel(null);
                w.focusSection(h.target.sectionId!);
              }}
            >
              Focus section
            </Button>
          )}
        </article>
      ))}
    </>
  );
}
function ManageDocuments({ w }: { w: Workspace }) {
  const [archived, setArchived] = useState<Document[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: "archive" | "delete";
    ids: string[];
    fromRow?: boolean;
  } | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const exportSequence = useRef(0);
  const focusOrigin = useRef<{ id: string | null; index: number }>({
    id: null,
    index: 0,
  });
  const rememberOpener = (element: HTMLElement, id: string | null = null) => {
    openerRef.current = element;
    focusOrigin.current = {
      id,
      index: Array.from(
        rootRef.current?.querySelectorAll(".managed-document") ?? [],
      ).findIndex((row) => row.getAttribute("data-managed-id") === id),
    };
  };
  const returnFocus = (afterAction = false) =>
    requestAnimationFrame(() => {
      const opener = openerRef.current;
      if (
        !afterAction &&
        opener?.isConnected &&
        !opener.hasAttribute("disabled")
      )
        return opener.focus();
      const rows = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(".managed-document") ??
          [],
      );
      const same = rows.find(
        (row) => row.dataset.managedId === focusOrigin.current.id,
      );
      const row =
        same ??
        rows[Math.min(Math.max(focusOrigin.current.index, 0), rows.length - 1)];
      const next =
        row?.querySelector<HTMLElement>("button:not(:disabled)") ??
        row?.querySelector<HTMLElement>("input[type=checkbox]") ??
        rootRef.current?.querySelector<HTMLElement>("button:not(:disabled)") ??
        document.querySelector<HTMLElement>('[aria-label="Document actions"]');
      next?.focus();
    });
  useEffect(() => {
    let alive = true;
    void api<Document[]>("/documents/archived")
      .then((docs) => {
        if (alive) setArchived(docs);
      })
      .catch((cause) => {
        if (alive) setError((cause as Error).message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const all = [
    ...w.documents.map((doc) => (doc.id === w.doc.id ? w.doc : doc)),
    ...archived,
  ];
  const cue = (doc: Document) => duplicateDocumentCue(doc, all);
  const identity = (doc: Document) =>
    `“${doc.title.trim() || "Untitled"}”${cue(doc) ? `, ${cue(doc)}` : ""}`;
  const visibleActive = w.documents.filter((doc) =>
    doc.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visibleArchived = archived.filter((doc) =>
    doc.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visible = [...visibleActive, ...visibleArchived];
  const visibleIds = new Set(visible.map((doc) => doc.id));
  const hiddenCount = selected.filter((id) => !visibleIds.has(id)).length;
  const activeIds = selected.filter((id) =>
    w.documents.some((doc) => doc.id === id),
  );
  const archivedIds = selected.filter((id) =>
    archived.some((doc) => doc.id === id),
  );
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const refresh = async () =>
    setArchived(await api<Document[]>("/documents/archived"));
  const act = async (
    action: "archive" | "restore" | "delete",
    ids: string[],
  ) => {
    if (pending || !ids.length) return;
    setPending(true);
    setError("");
    try {
      const okay =
        action === "archive"
          ? await w.archiveDocuments(ids)
          : action === "restore"
            ? await w.restoreDocuments(ids)
            : await w.deleteManagedDocuments(ids);
      if (okay) {
        await refresh();
        setSelected((current) => current.filter((id) => !ids.includes(id)));
        setConfirmation(null);
        setTyped("");
        setFeedback(
          ids.length === 1
            ? `${action === "archive" ? "Archived" : action === "restore" ? "Restored" : "Deleted"} “${all.find((doc) => doc.id === ids[0])?.title.trim() || "Untitled"}”.`
            : `${action === "archive" ? "Archived" : action === "restore" ? "Restored" : "Deleted"} ${ids.length} documents.`,
        );
        returnFocus(true);
      } else
        setError("Finish the current operation before changing documents.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };
  const exportDocs = async (ids: string[], scope: "selected" | "all") => {
    if (!ids.length || pending) return;
    setPending(true);
    setError("");
    try {
      await w.flush();
      const docs = await Promise.all(
        ids.map((id) => api<Document>(`/documents/${encodeURIComponent(id)}`)),
      );
      download(
        `language-workbench-${scope}-${new Date().toISOString().replace(/[:.]/g, "-")}-${++exportSequence.current}.json`,
        JSON.stringify(
          documentBackup(
            docs,
            archived.map((doc) => doc.id),
          ),
          null,
          2,
        ),
        "application/json",
      );
      setFeedback(
        `Exported ${docs.length} ${docs.length === 1 ? "document" : "documents"}.`,
      );
      returnFocus();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };
  const exportOne = async (doc: Document) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await w.flush();
      const latest = await api<Document>(
        `/documents/${encodeURIComponent(doc.id)}`,
      );
      download(
        `${latest.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "Untitled"}.json`,
        JSON.stringify(latest, null, 2),
        "application/json",
      );
      setFeedback(`Exported “${latest.title.trim() || "Untitled"}”.`);
      returnFocus();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };
  const rows = (docs: Document[], placement: "Active" | "Archived") =>
    docs.map((doc) => (
      <li key={doc.id} className="managed-document" data-managed-id={doc.id}>
        <label>
          <input
            type="checkbox"
            aria-label={`Select ${placement.toLowerCase()} document ${identity(doc)}`}
            checked={selected.includes(doc.id)}
            disabled={pending}
            onChange={() => toggle(doc.id)}
          />
          <span>
            <b>{doc.title.trim() || "Untitled"}</b>
            {cue(doc) && <small className="document-cue">{cue(doc)}</small>}
            <small>
              {documentText(doc).trim().split(/\s+/).filter(Boolean).length}{" "}
              words · Edited {new Date(doc.updatedAt).toLocaleDateString()}
            </small>
          </span>
        </label>
        <div className="row wrap">
          {placement === "Active" ? (
            <Button
              aria-label={`Archive ${identity(doc)}`}
              disabled={pending}
              onClick={(event) => {
                rememberOpener(event.currentTarget, doc.id);
                setConfirmation({
                  action: "archive",
                  ids: [doc.id],
                  fromRow: true,
                });
              }}
            >
              Archive
            </Button>
          ) : (
            <Button
              aria-label={`Restore ${identity(doc)}`}
              disabled={pending}
              onClick={(event) => {
                rememberOpener(event.currentTarget, doc.id);
                void act("restore", [doc.id]);
              }}
            >
              Restore
            </Button>
          )}
          <Button
            aria-label={`Export JSON ${identity(doc)}`}
            disabled={pending}
            onClick={(event) => {
              rememberOpener(event.currentTarget, doc.id);
              void exportOne(doc);
            }}
          >
            Export JSON
          </Button>
          {placement === "Archived" && (
            <span className="managed-danger">
              <Button
                className="danger"
                aria-label={`Delete permanently ${identity(doc)}`}
                disabled={pending}
                onClick={(event) => {
                  rememberOpener(event.currentTarget, doc.id);
                  setConfirmation({ action: "delete", ids: [doc.id] });
                }}
              >
                Delete permanently
              </Button>
            </span>
          )}
        </div>
      </li>
    ));
  const titles =
    confirmation?.ids.map((id) => {
      const doc = all.find((item) => item.id === id);
      return doc ? identity(doc) : "this document";
    }) ?? [];
  return (
    <div className="manage-documents" ref={rootRef}>
      <p className="panel-intro">
        Archive removes documents from the writing switcher without deleting
        their content. Backups here contain documents only, not Personal
        Library, Style DNA or provider credentials. Multi-document backup import
        is not available yet; individual Export JSON remains importable.
      </p>
      <Field label="Search document titles">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a document"
        />
      </Field>
      <div className="row wrap">
        <Button
          disabled={pending}
          onClick={() =>
            setSelected((ids) => [
              ...new Set([...ids, ...visible.map((doc) => doc.id)]),
            ])
          }
        >
          Select all visible
        </Button>
        <Button disabled={pending} onClick={() => setSelected([])}>
          Clear selection
        </Button>
        {hiddenCount > 0 && (
          <Button
            disabled={pending}
            onClick={() =>
              setSelected((ids) => ids.filter((id) => visibleIds.has(id)))
            }
          >
            Clear hidden selections
          </Button>
        )}
        <b aria-live="polite">
          {selected.length} selected
          {hiddenCount > 0 ? ` · ${hiddenCount} hidden by filter` : ""}
        </b>
      </div>
      <div className="row wrap managed-actions">
        <Button
          disabled={!activeIds.length || pending}
          onClick={(event) => {
            rememberOpener(event.currentTarget, activeIds[0] ?? null);
            setConfirmation({ action: "archive", ids: activeIds });
          }}
        >
          Archive {activeIds.length} active{" "}
          {activeIds.length === 1 ? "document" : "documents"}
        </Button>
        <Button
          disabled={!archivedIds.length || pending}
          onClick={(event) => {
            rememberOpener(event.currentTarget, archivedIds[0] ?? null);
            void act("restore", archivedIds);
          }}
        >
          Restore {archivedIds.length} archived{" "}
          {archivedIds.length === 1 ? "document" : "documents"}
        </Button>
        <Button
          disabled={!selected.length || pending}
          onClick={(event) => {
            rememberOpener(event.currentTarget);
            void exportDocs(selected, "selected");
          }}
        >
          Export selected
        </Button>
        <Button
          disabled={!all.length || pending}
          onClick={(event) => {
            rememberOpener(event.currentTarget);
            void exportDocs(
              all.map((doc) => doc.id),
              "all",
            );
          }}
        >
          Export all
        </Button>
        <Button
          className="danger"
          disabled={!archivedIds.length || pending}
          onClick={(event) => {
            rememberOpener(event.currentTarget, archivedIds[0] ?? null);
            setConfirmation({ action: "delete", ids: archivedIds });
          }}
        >
          Delete {archivedIds.length} archived{" "}
          {archivedIds.length === 1 ? "document" : "documents"}
        </Button>
      </div>
      <small className="muted">
        Bulk backup · import-all not yet supported
      </small>
      {feedback && (
        <p role="status" className="guidance">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="guidance">
          {error}
        </p>
      )}
      <h3>Active · {w.documents.length}</h3>
      {visibleActive.length ? (
        <ul>{rows(visibleActive, "Active")}</ul>
      ) : (
        <p className="muted small">No active documents match.</p>
      )}
      <h3>Archived · {archived.length}</h3>
      {visibleArchived.length ? (
        <ul>{rows(visibleArchived, "Archived")}</ul>
      ) : (
        <p className="muted small">
          {archived.length
            ? "No archived documents match."
            : "No archived documents yet."}
        </p>
      )}
      {confirmation && (
        <div
          role="alertdialog"
          aria-label={
            confirmation.action === "archive"
              ? "Confirm archive"
              : "Confirm permanent delete"
          }
          className="delete-confirm managed-confirm"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setConfirmation(null);
              setTyped("");
              returnFocus();
            }
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement &&
              confirmation.action === "delete" &&
              confirmation.ids.length > 1 &&
              typed === "DELETE"
            ) {
              event.preventDefault();
              void act("delete", confirmation.ids);
            }
          }}
        >
          <b>
            {confirmation.action === "archive"
              ? confirmation.ids.length === 1
                ? `Archive ${titles[0]}?`
                : `Archive ${confirmation.ids.length} documents?`
              : confirmation.ids.length === 1
                ? `Permanently delete ${titles[0]}?`
                : `Permanently delete ${confirmation.ids.length} documents?`}
          </b>
          <p>
            {confirmation.action === "archive"
              ? "All sections, takes, sources and history are kept. Restore from Archived whenever you need them."
              : `This permanently deletes ${confirmation.ids.length === 1 ? "this archived document and its" : "these archived documents and their"} saved takes, history and references. Export selected or Export all before deleting if you need a backup.`}
          </p>
          {confirmation.ids.length > 1 && (
            <p>
              {titles.slice(0, 5).join(" · ")}
              {titles.length > 5 ? ` · and ${titles.length - 5} more` : ""}
            </p>
          )}
          {confirmation.action === "delete" && confirmation.ids.length > 1 && (
            <Field label="Type DELETE to confirm">
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
          )}
          <div className="row wrap">
            <Button
              autoFocus
              onClick={() => {
                setConfirmation(null);
                setTyped("");
                returnFocus();
              }}
            >
              Cancel
            </Button>
            <Button
              className={
                confirmation.action === "delete" ? "danger solid" : "primary"
              }
              disabled={
                pending ||
                (confirmation.action === "delete" &&
                  confirmation.ids.length > 1 &&
                  typed !== "DELETE")
              }
              onClick={() => void act(confirmation.action, confirmation.ids)}
            >
              {confirmation.action === "archive"
                ? confirmation.fromRow
                  ? "Archive document"
                  : "Archive selected"
                : "Delete permanently"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function UtilityPanel({
  w,
  onGoToSection,
  libraryNavigation,
  returnToMenu,
}: {
  w: Workspace;
  onGoToSection: (id: string) => void;
  libraryNavigation?: LibraryNavigation;
  returnToMenu?: () => HTMLElement | null;
}) {
  const [styleDraft, setStyleDraft] = useState<Settings | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty =
    !!styleDraft &&
    (JSON.stringify(styleDraft.styleDNA) !==
      JSON.stringify(w.settings.styleDNA) ||
      JSON.stringify(styleDraft.knowledgePacks) !==
        JSON.stringify(w.settings.knowledgePacks));
  const close = () => {
    if (confirmDiscard) return setConfirmDiscard(false);
    if (w.panel === "style" && dirty) return setConfirmDiscard(true);
    setStyleDraft(null);
    w.setPanel(null);
  };
  if (!w.panel) return null;
  const title = {
    brief: "Writing brief",
    memory: "Piece memory",
    revision: "Revision",
    revisionPlan: "Revision plan",
    sources: "Source material",
    style: "Style DNA & knowledge",
    radar: "Language radar",
    history: "Operation history",
    providers: "AI providers & routing",
    documents: "Manage documents",
    library: "Personal Writing Library",
    guides: "Scoped Style Guides",
  }[w.panel];
  return (
    <Dialog
      title={title}
      close={close}
      wide
      returnFocus={w.panel === "documents" ? returnToMenu : undefined}
    >
      {w.panel === "library" ? (
        <PersonalLibrary
          key={libraryNavigation?.token ?? 0}
          w={w}
          initialQuery={libraryNavigation?.query}
          initialKind={libraryNavigation?.kind}
        />
      ) : w.panel === "guides" ? (
        <ScopedStyleGuides w={w} />
      ) : w.panel === "providers" ? (
        <ProviderSettings w={w} />
      ) : w.panel === "documents" ? (
        <ManageDocuments w={w} />
      ) : w.panel === "brief" ? (
        <Brief w={w} />
      ) : w.panel === "memory" ? (
        <PieceMemory w={w} onGoToSection={onGoToSection} />
      ) : w.panel === "revision" ? (
        <RevisionPanel w={w} onGoToSection={onGoToSection} />
      ) : w.panel === "revisionPlan" ? (
        <RevisionPlanPanel w={w} onGoToSection={onGoToSection} />
      ) : w.panel === "sources" ? (
        <Sources w={w} />
      ) : w.panel === "style" ? (
        <Style
          w={w}
          draft={styleDraft ?? w.settings}
          setDraft={(update) =>
            setStyleDraft((current) => update(current ?? w.settings))
          }
        />
      ) : w.panel === "radar" ? (
        <Radar w={w} />
      ) : (
        <History w={w} />
      )}
      {confirmDiscard && w.panel === "style" && (
        <div
          className="delete-confirm"
          role="alertdialog"
          aria-label="Unsaved Style DNA changes"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setConfirmDiscard(false);
            }
          }}
        >
          <p>Discard unsaved Style DNA changes?</p>
          <div className="row wrap">
            <Button autoFocus onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              className="danger solid"
              onClick={() => {
                setConfirmDiscard(false);
                setStyleDraft(null);
                w.setPanel(null);
              }}
            >
              Discard changes
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
