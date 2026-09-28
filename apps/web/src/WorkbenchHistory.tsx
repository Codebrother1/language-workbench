import { useEffect, useRef } from "react";
import type { Workspace } from "./useWorkspace";
import { Button } from "./ui";
import { modelLabel } from "./ModelControls";
import { resolveHistoricalTarget } from "./target-drafts";
import {
  sectionMentions,
  runDraftState,
  humanTargetLabel,
  resultOutcome,
} from "./workspace-helpers";
export function WorkbenchHistory({
  w,
  open = false,
}: {
  w: Workspace;
  open?: boolean;
}) {
  const recent = [...w.localHistory].reverse();
  const display = (text: string) =>
    sectionMentions(w.doc, text)
      .map((part) => part.text)
      .join("");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (open && detailsRef.current) detailsRef.current.open = true;
  }, [open]);
  return (
    <details ref={detailsRef} className="local-history">
      <summary>
        Workbench history <span className="count">{recent.length}</span>
      </summary>
      <p className="small muted">
        Local to this writing object. Canonical text stays unchanged while you
        explore.
      </p>
      {recent.map((run, index) => {
        const ordinal = recent.length - index;
        const question =
          run.instruction.trim() ||
          (run.target.text.trim()
            ? `No writer question · “${run.target.text.trim()}”`
            : `No writer question · ${run.action.replaceAll("_", " ")}`);
        const status =
          run.target.scope === "document"
            ? runDraftState(w.doc, run)
            : {
                exact: "Current",
                changed: "Target changed",
                unresolved: "Target unresolved",
              }[resolveHistoricalTarget(w.doc, run.target).status];
        const unavailable =
          resultOutcome(run)?.title ??
          (!run.response.diagnosis.trim() && !run.response.proposals.length
            ? run.response.missingIngredients.some((reason) =>
                /unavailable|cannot|offline/i.test(reason),
              )
              ? "Unavailable"
              : "No result"
            : "");
        return (
          <article
            className={
              "run-entry " + (w.activeRun?.id === run.id ? "active" : "")
            }
            key={run.id}
          >
            <div className="row between">
              <b>{run.action.replaceAll("_", " ")}</b>
              <time>
                {new Date(run.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <p className="run-question" title={question}>
              {question}
            </p>
            <span className="small muted">
              Run {ordinal} · {humanTargetLabel(run.target)} · {status}
              {unavailable ? ` · ${unavailable}` : ""}
            </span>
            <p className="small muted">
              {modelLabel(w.catalog, run.model)} ·{" "}
              {run.response.proposals.length} candidates
            </p>
            <Button
              className="full"
              title={`Inspect Run ${ordinal}: ${question}`}
              onClick={() => w.selectRun(run.id)}
            >
              Inspect this run
            </Button>
          </article>
        );
      })}
      {recent.filter((r) => r.response.proposals.length).length > 1 && (
        <details>
          <summary>Compare recent outputs</summary>
          <div className="run-comparison">
            {recent
              .filter((r) => r.response.proposals.length)
              .slice(0, 4)
              .map((run) => (
                <article key={run.id}>
                  <b>{modelLabel(w.catalog, run.model)}</b>
                  <span className="draft-state">
                    {runDraftState(w.doc, run)}
                  </span>
                  {run.response.proposals.map((p) => (
                    <div key={p.id}>
                      <p>{display(p.text)}</p>
                      <p className="small muted">{display(p.explanation)}</p>
                      <Button onClick={() => w.copy(display(p.text))}>
                        Copy candidate
                      </Button>
                    </div>
                  ))}
                  <Button onClick={() => w.selectRun(run.id)}>
                    Inspect / edit
                  </Button>
                </article>
              ))}
          </div>
        </details>
      )}
    </details>
  );
}
