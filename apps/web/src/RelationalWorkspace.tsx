import { useState } from "react";
import { draftSections, sectionText, type WritingSection } from "./domain";
import type { Workspace } from "./useWorkspace";
import { Button, Dialog } from "./ui";
import { modelLabel } from "./ModelControls";
import { sectionMentions } from "./workspace-helpers";
export function NeighborContext({
  section,
  label,
  onSelect,
}: {
  section: WritingSection | undefined;
  label: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      className="neighbor-context"
      aria-label={label}
      data-testid={label.toLowerCase().replaceAll(" ", "-")}
    >
      <div className="row between">
        <span className="eyebrow">{label} · read context</span>
        {section && (
          <Button className="text-button" onClick={() => onSelect(section.id)}>
            Select separately
          </Button>
        )}
      </div>
      {section ? (
        <>
          <h3>
            {section.label}{" "}
            <small>{section.kind !== section.label ? section.kind : ""}</small>
          </h3>
          <p className="neighbor-prose">
            {sectionText(section) || "No prose yet."}
          </p>
          {section.notes && (
            <p className="neighbor-note">
              <b>Storyboard:</b> {section.notes}
            </p>
          )}
        </>
      ) : (
        <p className="small muted">
          No neighboring section yet. Use Add before / Add after.
        </p>
      )}
    </section>
  );
}
export function RelationalContext({
  w,
  onCompare,
}: {
  w: Workspace;
  onCompare: () => void;
}) {
  const sections = draftSections(w.doc);
  const index = sections.findIndex((s) => s.id === w.selectedSectionId),
    section = w.doc.sections.find((s) => s.id === w.selectedSectionId);
  if (!section || !["Segue", "Transition"].includes(section.kind)) return null;
  return (
    <div className="relational-context" data-testid="relational-context">
      <div className="row between">
        <span className="eyebrow">
          {section.placement === "parked"
            ? "Parked · no reader neighbors until included"
            : "Connect these two parts"}
        </span>
        <Button onClick={onCompare}>Compare Segue versions</Button>
      </div>
      <NeighborContext
        section={index < 0 ? undefined : sections[index - 1]}
        label="Previous section"
        onSelect={w.focusSection}
      />
      <div className="relational-target">
        <b>Editing only: {section.label}</b>
        <p>{sectionText(section) || "Your transition is still unwritten."}</p>
        {section.notes && (
          <p className="small">
            <b>Intent:</b> {section.notes}
          </p>
        )}
        {section.placement !== "parked" && (
          <div className="row wrap">
            <Button
              onClick={(e) =>
                w.requestSectionInsertion(section.id, e.currentTarget)
              }
            >
              + Add before
            </Button>
            <Button
              onClick={(e) =>
                w.requestSectionInsertion(
                  sections[index + 1]?.id ?? null,
                  e.currentTarget,
                )
              }
            >
              + Add after
            </Button>
            <Button onClick={() => w.focusSection(section.id)}>
              Work this Segue
            </Button>
          </div>
        )}
      </div>
      <NeighborContext
        section={index < 0 ? undefined : sections[index + 1]}
        label="Next section"
        onSelect={w.focusSection}
      />
    </div>
  );
}
export function RelationalCompare({
  w,
  close,
}: {
  w: Workspace;
  close: () => void;
}) {
  const sections = draftSections(w.doc);
  const index = sections.findIndex((s) => s.id === w.selectedSectionId),
    section = w.doc.sections.find((s) => s.id === w.selectedSectionId);
  const [included, setIncluded] = useState<string[]>([]);
  const display = (text: string) =>
    sectionMentions(w.doc, text)
      .map((part) => part.text)
      .join("");
  if (!section) return null;
  const allCandidates = [
    ...section.variants.map((v) => ({
      id: v.id,
      label: v.label,
      text: v.text,
      model: v.model,
      type: "variant" as const,
    })),
    ...(w.response?.proposals ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      text: p.text,
      model: w.response?.model,
      type: "proposal" as const,
    })),
  ];
  const seen = new Set<string>();
  const candidates = allCandidates.filter((c) => {
    const key = JSON.stringify([c.model?.providerId, c.model?.modelId, c.text]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const chosen = included.length
    ? candidates.filter((c) => included.includes(c.id))
    : candidates.slice(-3);
  return (
    <Dialog
      title="Compare this connection"
      close={close}
      wide
      className="relational-compare"
    >
      {w.error && (
        <p className="guidance" role="alert">
          {w.error}
          <Button onClick={() => w.setError("")}>Dismiss</Button>
        </p>
      )}
      {w.notice && (
        <p className="small" role="status">
          {w.notice}
        </p>
      )}
      <p className="panel-intro">
        Read both sides of the transition. Neighbors are context, not edit
        targets. Nothing changes until you choose Use this version.
      </p>
      <NeighborContext
        section={index < 0 ? undefined : sections[index - 1]}
        label="Previous section"
        onSelect={(id) => {
          close();
          w.focusSection(id);
        }}
      />
      <div className="compare-selector">
        {candidates.length > 3 && (
          <details>
            <summary>Choose versions to compare</summary>
            {candidates.map((c) => (
              <label className="check" key={c.id}>
                <input
                  type="checkbox"
                  checked={chosen.some((x) => x.id === c.id)}
                  onChange={(e) =>
                    setIncluded((ids) => {
                      const base = ids.length ? ids : chosen.map((x) => x.id);
                      return e.target.checked
                        ? [...base, c.id]
                        : base.filter((id) => id !== c.id);
                    })
                  }
                />
                {display(c.label)} · {modelLabel(w.catalog, c.model)}
              </label>
            ))}
          </details>
        )}
      </div>
      <div className="relational-versions">
        <article className="comparison-version current-version">
          <span className="eyebrow">Canonical · {section.label}</span>
          <p data-testid="compare-canonical">
            {sectionText(section) || "Empty — still waiting for your words."}
          </p>
          {section.notes && <p className="small muted">{section.notes}</p>}
          <Button onClick={() => w.copy(sectionText(section))}>
            Copy current
          </Button>
        </article>
        {chosen.map((c) => {
          const containsKnownId = sectionMentions(w.doc, c.text).some(
            (part) => part.sectionId,
          );
          return (
            <article
              key={c.id}
              className="comparison-version"
              data-testid="compare-version"
            >
              <span className="eyebrow">{display(c.label)}</span>
              <small>{modelLabel(w.catalog, c.model)}</small>
              <textarea
                aria-label={"Edit version " + display(c.label)}
                rows={5}
                value={containsKnownId ? display(c.text) : c.text}
                onChange={(e) =>
                  c.type === "proposal"
                    ? w.proposalText(c.id, e.target.value)
                    : w.update((d) => ({
                        ...d,
                        sections: d.sections.map((s) =>
                          s.id === section.id
                            ? {
                                ...s,
                                variants: s.variants.map((v) =>
                                  v.id === c.id
                                    ? { ...v, text: e.target.value }
                                    : v,
                                ),
                              }
                            : s,
                        ),
                      }))
                }
              />
              <div className="row wrap">
                <Button onClick={() => w.copy(display(c.text))}>
                  Copy version
                </Button>
                <Button
                  className="primary"
                  disabled={containsKnownId}
                  onClick={() => {
                    if (c.type === "proposal") w.decide(c.id, "accepted");
                    else {
                      const v = section.variants.find((v) => v.id === c.id);
                      if (v) w.activate(v);
                    }
                  }}
                >
                  Use this version
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {!candidates.length && (
        <p className="empty-note">
          No alternatives yet. Return to the Segue, describe the connection, and
          request proposals or compare models.
        </p>
      )}
      <NeighborContext
        section={index < 0 ? undefined : sections[index + 1]}
        label="Next section"
        onSelect={(id) => {
          close();
          w.focusSection(id);
        }}
      />
      <Button onClick={close}>Back to this Segue</Button>
    </Dialog>
  );
}
