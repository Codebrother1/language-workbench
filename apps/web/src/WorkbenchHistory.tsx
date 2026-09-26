import { useEffect, useRef } from "react";
import type { Workspace } from "./useWorkspace";
import { Button } from "./ui";
import { modelLabel } from "./ModelControls";
export function WorkbenchHistory({
  w,
  open = false,
}: {
  w: Workspace;
  open?: boolean;
}) {
  const recent = [...w.localHistory].reverse();
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
      {recent.map((run) => (
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
          <p className="small">{modelLabel(w.catalog, run.model)}</p>
          <p>
            {run.instruction || run.response.question || run.response.diagnosis}
          </p>
          <span className="small muted">
            {run.response.proposals.length} candidates · {run.target.scope}
          </span>
          <Button className="full" onClick={() => w.selectRun(run.id)}>
            Inspect this run
          </Button>
        </article>
      ))}
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
                  {run.response.proposals.map((p) => (
                    <div key={p.id}>
                      <p>{p.text}</p>
                      <p className="small muted">{p.explanation}</p>
                      <Button onClick={() => w.copy(p.text)}>
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
