import { useState } from "react";
import {
  compositionKnowledge,
  getRelationship,
  connectorsFor,
  scaffoldsFor,
  suggestRelationships,
  matchesLibraryScope,
  type LibraryItem,
  type StructureDraft,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { Button, Field, Select } from "./ui";
export function StructureTool({ w }: { w: Workspace }) {
  const d = w.structure,
    rel = getRelationship(d.relationship),
    scaffolds = scaffoldsFor(d.relationship, d.register),
    scaffold = scaffolds.find((s) => s.id === d.scaffoldId) ?? scaffolds[0];
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  const context = {
    sectionKind: section?.kind,
    contentType: w.doc.brief.contentType,
    audience: w.doc.brief.audience,
    register: d.register,
  };
  const library = w.library.items.filter((i) =>
    matchesLibraryScope(i, context),
  );
  const preference = (text: string) =>
    library
      .filter(
        (i) =>
          i.kind === "connector" &&
          i.content.toLowerCase() === text.toLowerCase(),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.preference;
  const connectors = connectorsFor(d.relationship, d.register);
  const [showAvoid, setShowAvoid] = useState(false);
  const shown = connectors.filter(
    (c) => showAvoid || preference(c.text) !== "avoid",
  );
  const base = d.customTemplate || scaffold?.template || "[X]. [Y].";
  const template =
    base + (d.optionalSlot && !base.includes("[Z]") ? "\n[Z]" : "");
  const preview = w.assembleStructure(template);
  const complete =
    !!d.thoughtA.trim() &&
    !!d.thoughtB.trim() &&
    template.includes("[X]") &&
    template.includes("[Y]") &&
    !/\[[XYZ]\]/.test(preview);
  const set = <K extends keyof StructureDraft>(
    key: K,
    value: StructureDraft[K],
  ) => w.setStructure((s) => ({ ...s, [key]: value }));
  const saveConnector = (
    text: string,
    notes: string,
    status: LibraryItem["preference"],
  ) => {
    const existing = library.find(
      (i) =>
        i.kind === "connector" &&
        i.content === text &&
        i.register === d.register,
    );
    const input = {
      kind: "connector" as const,
      title: text,
      content: text,
      notes,
      preference: status,
      register: d.register,
      sectionKinds: section ? [section.kind] : [],
      contentTypes: [w.doc.brief.contentType],
      tags: [d.relationship],
    };
    void (
      existing
        ? w.updateLibraryItem(existing.id, input)
        : w.saveLibraryItem(input)
    )
      .then(() => w.setNotice("Connector preference saved in your library."))
      .catch((e) => w.setError(e.message));
  };
  return (
    <details className="structure-tool">
      <summary>Structure · assemble a thought</summary>
      <p className="small muted">
        Start with your meaning. Choose a relationship, then a shape. Nothing
        here rewrites your document.
      </p>
      <details>
        <summary>Start from a rant or raw notes</summary>
        <Field label="Raw thoughts">
          <textarea
            rows={5}
            value={d.raw}
            onChange={(e) => set("raw", e.target.value)}
            placeholder="Speak freely. Keep the messy version."
          />
        </Field>
        <div className="row wrap">
          <Button disabled={!d.raw.trim()} onClick={w.segmentThoughts}>
            Find thought units
          </Button>
          {w.target?.text && (
            <Button onClick={() => set("raw", w.target!.text)}>
              Copy target into raw notes
            </Button>
          )}
        </div>
        <p className="small muted">
          Verbatim chunks from punctuation and conjunction cues—not paraphrases
          or a semantic verdict. Copy any chunk into a slot and edit it in your
          own words.
        </p>
        {d.units.map((unit, i) => (
          <article className="thought-unit" key={unit.id}>
            <b>Thought {i + 1}</b>
            <p>{unit.text}</p>
            <div className="row">
              <Button onClick={() => set("thoughtA", unit.text)}>
                Use as Thought A
              </Button>
              <Button onClick={() => set("thoughtB", unit.text)}>
                Use as Thought B
              </Button>
            </div>
          </article>
        ))}
      </details>
      <Field label="Thought A · main thought">
        <textarea
          rows={2}
          value={d.thoughtA}
          onChange={(e) => set("thoughtA", e.target.value)}
          placeholder="The software was useful"
        />
      </Field>
      <Field label="Thought B · second thought">
        <textarea
          rows={2}
          value={d.thoughtB}
          onChange={(e) => set("thoughtB", e.target.value)}
          placeholder="it was too expensive"
        />
      </Field>
      {(d.thoughtA || d.thoughtB) && (
        <details>
          <summary>What might connect these?</summary>
          {suggestRelationships(d.thoughtA, d.thoughtB).map((s) => (
            <div className="relationship-hint" key={s.id}>
              <Button
                onClick={() =>
                  w.setStructure((x) => ({
                    ...x,
                    relationship: s.id,
                    scaffoldId: "",
                    connectorId: "",
                    customTemplate: "",
                  }))
                }
              >
                {getRelationship(s.id).label}
              </Button>
              <p>{s.reason}</p>
            </div>
          ))}
        </details>
      )}
      <Field label="Logical relationship">
        <Select
          value={d.relationship}
          onChange={(e) =>
            w.setStructure((s) => ({
              ...s,
              relationship: e.target.value as typeof s.relationship,
              scaffoldId: "",
              connectorId: "",
              customTemplate: "",
            }))
          }
        >
          {compositionKnowledge.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="structure-principle">{rel.principle}</p>
      <p className="small muted">{rel.question}</p>
      <Field label="Structure register">
        <Select
          value={d.register}
          onChange={(e) =>
            w.setStructure((s) => ({
              ...s,
              register: e.target.value as typeof s.register,
              scaffoldId: "",
              connectorId: "",
              customTemplate: "",
            }))
          }
        >
          {["conversational", "formal", "technical", "sharp", "any"].map(
            (r) => (
              <option key={r}>{r}</option>
            ),
          )}
        </Select>
      </Field>
      <details className="connector-intelligence">
        <summary>Why these connectors differ</summary>
        <p className="small muted">
          Usage associations, not rigid word classes. Inspect a connector; do
          not blindly swap it into an incompatible scaffold.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={showAvoid}
            onChange={(e) => setShowAvoid(e.target.checked)}
          />
          Show avoided connectors
        </label>
        {shown.map((c) => (
          <article key={c.id}>
            <div className="row between">
              <b>{c.text}</b>
              {preference(c.text) && (
                <span className="tag">{preference(c.text)}</span>
              )}
            </div>
            <p>{c.distinction}</p>
            <div className="row wrap">
              <Button
                aria-pressed={d.connectorId === c.id}
                onClick={() => set("connectorId", c.id)}
              >
                Consider {c.text}
              </Button>
              <Button
                onClick={() => saveConnector(c.text, c.distinction, "like")}
              >
                Favorite {c.text}
              </Button>
              <Button
                onClick={() =>
                  saveConnector(
                    c.text,
                    c.distinction,
                    preference(c.text) === "avoid" ? "reference" : "avoid",
                  )
                }
              >
                {preference(c.text) === "avoid" ? "Unhide" : "Avoid"} {c.text}
              </Button>
            </div>
          </article>
        ))}
      </details>
      <Field label="Sentence scaffold">
        <Select
          value={scaffold?.id ?? ""}
          onChange={(e) =>
            w.setStructure((s) => ({
              ...s,
              scaffoldId: e.target.value,
              customTemplate: "",
            }))
          }
        >
          {scaffolds.map((s) => (
            <option key={s.id} value={s.id}>
              {s.template}
            </option>
          ))}
        </Select>
      </Field>
      <p className="small muted">{scaffold?.effect}</p>
      <details>
        <summary>Adapt the scaffold / add a detail</summary>
        <Field
          label="Custom scaffold"
          hint="Use [X] and [Y] for your two thoughts. [Z] is optional. Templates never fill these slots for you."
        >
          <textarea
            rows={2}
            value={d.customTemplate}
            onChange={(e) => set("customTemplate", e.target.value)}
            placeholder={scaffold?.template}
          />
        </Field>
        <Field label="Extra detail job">
          <Select
            value={d.purpose}
            onChange={(e) => set("purpose", e.target.value as typeof d.purpose)}
          >
            {[
              "qualifier",
              "example",
              "consequence",
              "aside",
              "punchline",
              "reveal",
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Optional detail">
          <textarea
            rows={2}
            value={d.optionalSlot}
            onChange={(e) => set("optionalSlot", e.target.value)}
            placeholder="Your words; no invented examples."
          />
        </Field>
      </details>
      <div className="scaffold-preview">
        <span className="eyebrow">Structure, not a rewrite</span>
        <p className="scaffold-template">{template}</p>
        <span className="eyebrow">Your filled preview</span>
        <p data-testid="scaffold-preview">{preview}</p>
        <small>
          Casing and punctuation are kept exactly as typed. Edit the slots if
          existing connectors or stops repeat.
        </small>
      </div>
      <div className="row wrap">
        <Button onClick={() => w.copy(preview)}>Copy scaffold preview</Button>
        <Button
          disabled={!complete || !w.target}
          onClick={() => w.stageStructure(template)}
        >
          Stage for target
        </Button>
        <Button
          disabled={!w.libraryReady}
          onClick={() =>
            w
              .saveLibraryItem({
                kind: "pattern",
                title: rel.label,
                content: template,
                notes: scaffold?.effect,
                sectionKinds: section ? [section.kind] : [],
                register: d.register,
                tags: [d.relationship],
                preference: "like",
              })
              .then(() => w.setNotice("Scaffold saved as a pattern."))
              .catch((e) => w.setError(e.message))
          }
        >
          Save structure
        </Button>
        <Button
          disabled={!w.libraryReady}
          onClick={() =>
            w
              .saveLibraryItem({
                kind: "move",
                title: rel.label,
                content: rel.principle,
                notes: rel.question,
                sectionKinds: section ? [section.kind] : [],
                tags: [d.relationship],
              })
              .then(() => w.setNotice("Move saved."))
              .catch((e) => w.setError(e.message))
          }
        >
          Save this move
        </Button>
      </div>
      <details>
        <summary>Ask the model about this structure</summary>
        <p className="small muted">
          Uses the same model routing and exact edit target. Analysis explains;
          only explicit acceptance changes your writing.
        </p>
        <div className="row wrap">
          <Button
            disabled={w.busy || !w.target}
            onClick={() => w.runStructure("analyze", template)}
          >
            Analyze relationship
          </Button>
          <Button
            disabled={w.busy || !w.target}
            onClick={() => w.runStructure("critique", template)}
          >
            Critique structure
          </Button>
          <Button
            disabled={w.busy || !w.target || !complete}
            onClick={() => w.runStructure("tighten", template)}
          >
            Propose a tighter version
          </Button>
        </div>
      </details>
    </details>
  );
}
