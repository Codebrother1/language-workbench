import { NextSteps, ContextHelp, EmptyInspectorIntro } from "./FirstMove";
import type { Wayfinding } from "./wayfinding";
import { QuickSave, ContextLibrary, StyleContext } from "./LibraryTools";
import { StructureTool } from "./StructureTool";
import { ModelControls, modelLabel } from "./ModelControls";
import { WordLensControls, CandidatePreview } from "./WordLens";
import { WorkbenchHistory } from "./WorkbenchHistory";
import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Bookmark,
  X,
  ChevronDown,
  Focus,
  ArrowUpRight,
} from "lucide-react";
import {
  labFor,
  resolveModel,
  writingActions,
  structuralMechanisms,
  sectionText,
  type WritingAction,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { Button, Field, Select, Range, GrowingTextarea } from "./ui";
export function WritingLabShell({
  w,
  navigation,
  onCompare,
  openWork,
}: {
  w: Workspace;
  navigation: Wayfinding;
  onCompare?: () => void;
  openWork?: {
    sectionId: string;
    kind: "variants" | "structure" | "history";
    token: number;
  } | null;
}) {
  const { target, response, responseTarget } = w;
  const section = w.doc.sections.find((s) => s.id === target?.sectionId);
  const lab = labFor(section?.kind ?? "Freeform", target?.scope ?? "selection");
  const sectionIntent =
    target?.scope === "section" &&
    Boolean(section && (section.kind !== "Freeform" || section.notes.trim()));
  const hasTarget =
    (Boolean(target?.text.trim()) || w.canCoachTarget || sectionIntent) &&
    target?.scope !== "document";
  const hasWriting = w.doc.sections.some((s) => sectionText(s).trim());
  const offlineCritique =
    resolveModel({
      oneOff: w.doc.workbench?.oneOffModel,
      task: "critique",
      documentDefault: w.doc.defaultModel,
      preferences: w.settings.routing,
      applicationDefault: w.catalog?.applicationDefault ?? {
        providerId: "mock",
        modelId: "conservative",
      },
    }).model.providerId === "mock";
  const isWholeAnalysis = Boolean(
    response && responseTarget?.scope === "document",
  );
  const targetLabel =
    target?.scope === "word"
      ? "word"
      : target?.scope === "selection" && w.editor?.state.selection.empty
        ? "sentence"
        : target?.scope === "section"
          ? "section"
          : "passage";
  const relevantActions = lab.actions.slice(0, 5);
  const responseSection = w.doc.sections.find(
    (s) => s.id === responseTarget?.sectionId,
  );
  const responseLab = labFor(
    responseSection?.kind ?? "Freeform",
    responseTarget?.scope ?? "selection",
  );
  const isLexicalRun =
    w.activeRun?.action === "words" && Boolean(w.activeRun?.lens);
  const [compare, setCompare] = useState<string | null>(null);
  const responseRef = useRef<HTMLElement>(null);
  const variantsRef = useRef<HTMLDetailsElement>(null);
  const wasBusy = useRef(false);
  useEffect(() => {
    // Scroll only the Inspector on completion; never focus or scroll the document.
    if (wasBusy.current && !w.busy && responseRef.current) {
      const panel = responseRef.current.closest(".inspector");
      if (panel)
        panel.scrollTo({
          top:
            panel.scrollTop +
            responseRef.current.getBoundingClientRect().top -
            panel.getBoundingClientRect().top -
            16,
          behavior: "smooth",
        });
    }
    wasBusy.current = w.busy;
  }, [w.busy]);
  useEffect(() => {
    if (!openWork || openWork.sectionId !== target?.sectionId) return;
    if (openWork.kind === "variants" && variantsRef.current)
      variantsRef.current.open = true;
    const selector = {
      variants: ".variants",
      structure: ".structure-tool",
      history: ".local-history",
    }[openWork.kind];
    requestAnimationFrame(() =>
      document
        .querySelector(".inspector")
        ?.querySelector(selector)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }, [openWork, target?.sectionId]);
  const fullCopy = response
    ? [
        responseTarget?.scope !== "document" && responseTarget?.text
          ? "Original target\n" + responseTarget.text
          : "",
        response.diagnosis,
        response.mechanism,
        response.question,
        ...response.missingIngredients,
        ...response.findings.map((f) => f.title + "\n" + f.detail),
        ...response.lexical.map((l) => Object.values(l).join("\n")),
        ...response.proposals.map(
          (p) => p.label + "\n" + p.text + "\n" + p.explanation,
        ),
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";
  const requestedTool = navigation.toolNavigation?.tool;
  const explicitVariants = requestedTool === "variants";
  const explicitStructure =
    requestedTool === "structure" || requestedTool === "thoughts";
  const firstThought =
    hasWriting &&
    w.doc.sections.length === 1 &&
    section?.kind === "Freeform" &&
    !section.workbench &&
    !response &&
    !w.isLensTarget &&
    Boolean(w.editor?.state.selection.empty) &&
    w.target?.scope !== "section" &&
    !requestedTool;
  if (!hasWriting && !hasTarget && !explicitStructure && !explicitVariants)
    return (
      <aside className="inspector" aria-label="Contextual writing inspector">
        <EmptyInspectorIntro w={w} onCommand={navigation.runCommand} />
        {requestedTool === "help" && (
          <ContextHelp w={w} onCommand={navigation.runCommand} />
        )}
        <button
          className="wayfinding-link"
          onClick={() => navigation.openCommands()}
        >
          Find a tool · ⌘ / Ctrl K
        </button>
      </aside>
    );
  if (firstThought)
    return (
      <aside className="inspector" aria-label="Contextual writing inspector">
        <div className="lab-head">
          <h2>Your thought is here.</h2>
          <p>
            Keep going, or choose one small next move. Your words won’t change
            unless you choose a change.
          </p>
        </div>
        <NextSteps w={w} onCommand={navigation.runCommand} />
        <ContextHelp w={w} onCommand={navigation.runCommand} />
        <button
          className="wayfinding-link"
          onClick={() => navigation.openCommands()}
        >
          Find a tool · ⌘ / Ctrl K
        </button>
      </aside>
    );
  return (
    <aside className="inspector" aria-label="Contextual writing inspector">
      <div className="inspector-top">
        <span className="eyebrow">WRITING LAB</span>
        <span className="provider" title="Provider for the current model route">
          {!w.catalog
            ? "Provider status unavailable"
            : w.effectiveModel.model.providerId === "mock"
              ? "Mock · local"
              : (w.catalog.providers.find(
                  (p) => p.id === w.effectiveModel.model.providerId,
                )?.displayName ?? w.effectiveModel.model.providerId)}
        </span>
      </div>
      <div className="lab-head">
        <h2>
          {isWholeAnalysis
            ? "Whole-piece analysis"
            : hasTarget
              ? w.isLensTarget
                ? target?.scope === "word"
                  ? "Word intelligence · Lens"
                  : "Phrase Lens"
                : lab.title
              : "Your words, first"}
        </h2>
        <p>
          {isWholeAnalysis
            ? "Read the structure in context. This analysis does not replace your writing."
            : hasTarget
              ? lab.strategy
              : "Start writing. When you want a second look, place the cursor in a sentence or select a word or passage."}
        </p>
      </div>
      {isWholeAnalysis && (
        <section className="document-analysis-controls">
          <Field label="Whole-piece direction">
            <textarea
              rows={2}
              value={w.instruction}
              onChange={(e) => w.setInstruction(e.target.value)}
              placeholder="What should the critique examine?"
            />
          </Field>
          {target?.sectionId && (
            <Button
              className="full"
              onClick={() => w.focusSection(target.sectionId!)}
            >
              Return to selected section
            </Button>
          )}
        </section>
      )}
      {hasTarget && target && !isWholeAnalysis && (
        <>
          {isWholeAnalysis && (
            <h3 className="local-lab-title">{lab.title} · local target</h3>
          )}
          <div className="target-box">
            <div className="row between wrap">
              <span className="eyebrow">
                <Focus size={14} /> Working on ·
                {targetLabel === "sentence"
                  ? "CURRENT SENTENCE"
                  : targetLabel === "section"
                    ? "WHOLE SECTION"
                    : targetLabel === "word"
                      ? "SELECTED WORD"
                      : "SELECTED PASSAGE"}
              </span>
              {section && (
                <span className="muted small" title={section.label}>
                  {section.label}
                </span>
              )}
            </div>
            <p>
              {target.text ||
                (section?.notes
                  ? "No prose yet — working from your storyboard note."
                  : "No prose yet. Describe what this part should do.")}
            </p>
            <small>
              Reads the whole piece. Changes only this {targetLabel}.
            </small>
            <div className="row wrap target-actions">
              <Button
                className="text-button"
                aria-label="Copy target"
                onClick={() => w.copy(target.text)}
              >
                <Copy size={14} />
                Copy target
              </Button>
              {target.scope !== "section" && target.sectionId && (
                <Button
                  className="text-button"
                  onClick={() => w.focusSection(target.sectionId!)}
                >
                  Whole section <ArrowUpRight size={14} />
                </Button>
              )}
            </div>
          </div>
          {w.isLensTarget ? (
            <WordLensControls w={w} />
          ) : (
            <>
              <Field
                label="Your direction"
                hint="Your experience and intent lead. AI should ask, not invent."
              >
                <GrowingTextarea
                  rows={4}
                  placeholder="What feels off? What must stay?"
                  value={w.instruction}
                  onChange={(e) => w.setInstruction(e.target.value)}
                />
              </Field>
              <Field label={`What should this ${targetLabel} do?`}>
                <Select
                  aria-label="Writing action"
                  value={w.action}
                  onChange={(e) => w.setAction(e.target.value as WritingAction)}
                >
                  {relevantActions.map((a) => (
                    <option key={a} value={a}>
                      {a.replaceAll("_", " ")}
                    </option>
                  ))}
                  {!relevantActions.includes(w.action) && (
                    <option value={w.action}>
                      {w.action.replaceAll("_", " ")}
                    </option>
                  )}
                </Select>
              </Field>
              {w.catalog && w.effectiveModel.model.providerId === "mock" && (
                <p className="offline-capability">
                  Offline diagnosis gives deterministic structural guidance, not
                  a model-quality rewrite. A later proposal can trim a few
                  listed phrases or stage wording you supply; it cannot invent a
                  nuanced answer to your direction.
                </p>
              )}
              <Button
                className="primary full"
                disabled={w.busy || !w.canCoachTarget || !w.ready}
                onClick={() => w.ask("diagnose")}
              >
                {w.busy ? "Thinking…" : `Diagnose this ${targetLabel}`}
                <ArrowRight size={15} />
              </Button>
            </>
          )}
        </>
      )}
      {(hasTarget || isWholeAnalysis) && (
        <div className="lab-secondary">
          {hasTarget && !w.isLensTarget && (
            <details className="control-details all-actions">
              <summary>
                More approaches <ChevronDown size={14} />
              </summary>
              <Field label="Explore another approach">
                <Select
                  aria-label="All writing actions"
                  value={w.action}
                  onChange={(e) => w.setAction(e.target.value as WritingAction)}
                >
                  <optgroup label={`For this ${targetLabel}`}>
                    {lab.actions.map((a) => (
                      <option key={a} value={a}>
                        {a.replaceAll("_", " ")}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Other local approaches">
                    {writingActions
                      .filter(
                        (a) =>
                          !lab.actions.includes(a) &&
                          !["critique", "break_template", "structure"].includes(
                            a,
                          ),
                      )
                      .map((a) => (
                        <option key={a} value={a}>
                          {a.replaceAll("_", " ")}
                        </option>
                      ))}
                  </optgroup>
                </Select>
              </Field>
            </details>
          )}
          <ModelControls
            key={
              isWholeAnalysis
                ? "document"
                : `${target?.sectionId}:${target?.scope}`
            }
            w={w}
          />
          {hasTarget && !w.isLensTarget && (
            <details className="control-details">
              <summary>
                Fine-tune the approach <ChevronDown size={14} />
              </summary>
              <div>
                {lab.controls.map((c) => (
                  <Range
                    key={c.key}
                    label={c.label}
                    low={c.low}
                    high={c.high}
                    value={Number(w.controls[c.key] ?? 50)}
                    onChange={(v) =>
                      w.setControls({ ...w.controls, [c.key]: v })
                    }
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      {hasTarget && target && <QuickSave w={w} text={target.text} />}
      {hasWriting && !isWholeAnalysis && (
        <>
          <NextSteps w={w} onCommand={navigation.runCommand} />
          <ContextHelp w={w} onCommand={navigation.runCommand} />
        </>
      )}
      {!isWholeAnalysis && (
        <>
          <StructureTool
            key={openWork?.kind === "structure" ? openWork.token : "structure"}
            w={w}
            open={
              openWork?.sectionId === section?.id &&
              openWork?.kind === "structure"
            }
          />
          {hasTarget && (
            <>
              <ContextLibrary w={w} />
              <StyleContext w={w} />
            </>
          )}
        </>
      )}
      {response && (
        <section className="response" ref={responseRef} aria-live="polite">
          <div className="row between">
            <span className="eyebrow">
              {responseTarget?.scope === "document"
                ? "WHOLE-PIECE ANALYSIS"
                : "DIAGNOSIS"}
            </span>
            <Button
              className="icon"
              aria-label="Copy all AI output"
              title="Copy all AI output"
              onClick={() => w.copy(fullCopy)}
            >
              <Copy size={14} />
            </Button>
          </div>
          <span className="provider">
            {response.provider.toLowerCase().includes("mock")
              ? "Mock output — not a live model"
              : response.provider}
          </span>
          {responseTarget && responseTarget.scope !== "document" && (
            <div className="response-original">
              <div className="row between">
                <span className="eyebrow">
                  Original{" "}
                  {responseTarget.scope === "selection"
                    ? "passage"
                    : responseTarget.scope}
                </span>
                <Button
                  className="icon"
                  aria-label="Copy original target"
                  title="Copy original target"
                  onClick={() => w.copy(responseTarget.text)}
                >
                  <Copy size={14} />
                </Button>
              </div>
              <p>{responseTarget.text}</p>
              <small>
                These options belong to this original, even if your cursor
                moves.
              </small>
            </div>
          )}
          <p className="diagnosis">{response.diagnosis}</p>
          {response.mechanism && <p className="small">{response.mechanism}</p>}
          {response.missingIngredients.length > 0 && (
            <div className="ingredients">
              <b>Bring your material</b>
              <ul>
                {response.missingIngredients.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {response.findings.map((finding, i) => (
            <article className="finding" key={i}>
              <div className="row between">
                <b>{finding.title}</b>
                <span className="tag">{finding.severity}</span>
              </div>
              <p>{finding.detail}</p>
              {finding.sectionId && (
                <Button
                  className="text-button"
                  onClick={() => w.focusSection(finding.sectionId!)}
                >
                  Focus section <ArrowUpRight size={13} />
                </Button>
              )}
            </article>
          ))}
          {(!isLexicalRun || w.activeRun?.lens?.mode === "explore") &&
            response.lexical.map((word, i) => (
              <article className="finding" key={i}>
                <div className="row between">
                  <h3>{word.term}</h3>
                  <Button
                    className="icon"
                    aria-label={"Copy " + word.term}
                    onClick={() => w.copy(Object.values(word).join("\n"))}
                  >
                    <Copy size={13} />
                  </Button>
                </div>
                <p>{word.meaning}</p>
                <p>{word.nuance}</p>
                <span className="tag">{word.register}</span>
                <p>
                  <em>{word.example}</em>
                </p>
              </article>
            ))}
          {response.model && (
            <p className="small muted" data-testid="run-model">
              {modelLabel(w.catalog, response.model)} ·{" "}
              {response.routeSource?.replace("_", " ")}
            </p>
          )}
          {!isLexicalRun &&
            !w.activeRun?.structure &&
            responseTarget?.scope !== "document" && (
              <>
                <Field label={response.question || responseLab.question}>
                  <textarea
                    rows={3}
                    aria-label="Your material"
                    value={w.responseAnswer}
                    onChange={(e) => w.setResponseAnswer(e.target.value)}
                    placeholder="Add the detail only you know…"
                  />
                </Field>
                {w.catalog && w.effectiveModel.model.providerId === "mock" && (
                  <p className="offline-capability">
                    Offline proposals can stage your supplied passage or apply a
                    few fixed trims. Directions alone cannot produce a
                    model-quality rewrite; configure a model for that.
                  </p>
                )}
                <Button
                  className="primary full"
                  disabled={
                    w.busy ||
                    (!w.responseAnswer.trim() &&
                      ![
                        "words",
                        "spellcheck",
                        "critique",
                        "break_template",
                      ].includes(w.action))
                  }
                  onClick={() => w.ask("propose")}
                >
                  Propose options <ArrowRight size={14} />
                </Button>
              </>
            )}
          {response.proposals.map((p, i) => (
            <article className="proposal" key={p.id} data-testid="proposal">
              <div className="row between">
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")} / {p.label}
                </span>
                <Button
                  className="icon"
                  aria-label={
                    (isLexicalRun ? "Copy candidate " : "Copy proposal ") +
                    (i + 1)
                  }
                  onClick={() => w.copy(p.text)}
                >
                  <Copy size={14} />
                </Button>
              </div>
              <span className="eyebrow">Proposed</span>
              <textarea
                aria-label={"Edit proposal " + (i + 1)}
                value={p.text}
                rows={Math.min(9, Math.max(3, Math.ceil(p.text.length / 35)))}
                onChange={(e) => w.proposalText(p.id, e.target.value)}
              />
              <p>{p.explanation}</p>
              <QuickSave w={w} text={p.text} origin="candidate" />
              {isLexicalRun && (
                <CandidatePreview w={w} text={p.text} open={i === 0} />
              )}
              {w.proposalStates[p.id] ? (
                <div className="success">{w.proposalStates[p.id]}</div>
              ) : (
                <div className="proposal-actions">
                  <Button
                    className="primary"
                    data-testid="accept-proposal"
                    disabled={responseTarget?.scope === "document"}
                    onClick={() => w.decide(p.id, "accepted")}
                  >
                    <Check size={13} />
                    {isLexicalRun ? "Replace" : "Accept"}
                  </Button>
                  <Button
                    data-testid="save-variant"
                    onClick={() => w.decide(p.id, "saved")}
                    title="Save as variant"
                  >
                    <Bookmark size={13} />
                    Save
                  </Button>
                  <Button
                    data-testid="reject-proposal"
                    onClick={() => w.decide(p.id, "rejected")}
                    title="Reject"
                  >
                    <X size={13} />
                  </Button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {(hasTarget || isWholeAnalysis) && (
        <WorkbenchHistory
          key={openWork?.kind === "history" ? openWork.token : "history"}
          w={w}
          open={
            openWork?.sectionId === section?.id && openWork?.kind === "history"
          }
        />
      )}
      {(hasTarget || explicitVariants) && section && !isWholeAnalysis && (
        <details ref={variantsRef} className="variants">
          <summary>
            Variants <span className="count">{section.variants.length}</span>
          </summary>
          {section.variants.length === 0 ? (
            <p className="muted small">
              Saved alternatives and accepted originals stay with this section.
            </p>
          ) : (
            section.variants.map((v) => (
              <article key={v.id} className="variant">
                {v.model && (
                  <p className="small muted">
                    {modelLabel(w.catalog, v.model)}
                  </p>
                )}
                <Field label={v.origin + " variant"}>
                  <input
                    aria-label="Variant label"
                    value={v.label}
                    onChange={(e) =>
                      w.update((d) => ({
                        ...d,
                        sections: d.sections.map((s) =>
                          s.id === section.id
                            ? {
                                ...s,
                                variants: s.variants.map((x) =>
                                  x.id === v.id
                                    ? { ...x, label: e.target.value }
                                    : x,
                                ),
                              }
                            : s,
                        ),
                      }))
                    }
                  />
                </Field>
                <textarea
                  aria-label="Variant text"
                  value={v.text}
                  rows={3}
                  onChange={(e) =>
                    w.update((d) => ({
                      ...d,
                      sections: d.sections.map((s) =>
                        s.id === section.id
                          ? {
                              ...s,
                              variants: s.variants.map((x) =>
                                x.id === v.id
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            }
                          : s,
                      ),
                    }))
                  }
                />
                <div className="row wrap">
                  <Button onClick={() => w.activate(v)}>Activate</Button>
                  <Button
                    aria-label="Copy variant"
                    onClick={() => w.copy(v.text)}
                  >
                    <Copy size={13} />
                  </Button>
                  <Button
                    onClick={() => {
                      if (
                        section &&
                        ["Segue", "Transition"].includes(section.kind) &&
                        onCompare
                      )
                        onCompare();
                      else setCompare(compare === v.id ? null : v.id);
                    }}
                  >
                    Compare
                  </Button>
                  <Button
                    aria-label="Delete variant"
                    onClick={() =>
                      w.update((d) => ({
                        ...d,
                        sections: d.sections.map((s) =>
                          s.id === section.id
                            ? {
                                ...s,
                                variants: s.variants.filter(
                                  (x) => x.id !== v.id,
                                ),
                              }
                            : s,
                        ),
                      }))
                    }
                  >
                    <X size={13} />
                  </Button>
                </div>
                {compare === v.id && (
                  <div className="comparison">
                    <b>Original target</b>
                    <p>{v.target.text}</p>
                    <b>Current section</b>
                    <p>{sectionText(section)}</p>
                    <b>Alternative</b>
                    <p>{v.text}</p>
                  </div>
                )}
              </article>
            ))
          )}
        </details>
      )}
      <div className="whole-piece">
        <span className="eyebrow">STEP BACK</span>
        <p>Look at the structure without rewriting it.</p>
        {w.catalog && offlineCritique && (
          <p className="offline-capability">
            Offline whole-piece critique checks limited deterministic patterns;
            it cannot assess your argument or invent new analysis.
          </p>
        )}
        <Button
          className="full"
          disabled={w.busy || !w.ready || !hasWriting}
          onClick={() => w.ask("diagnose", "critique")}
        >
          Whole-piece critique <ArrowUpRight size={14} />
        </Button>
        <details>
          <summary>Break a familiar template</summary>
          <p className="small muted">
            Choose an intentional mechanism. Nothing is automatically
            rearranged.
          </p>
          <Select
            aria-label="Structural mechanism"
            value={String(w.controls.mechanism ?? structuralMechanisms[0].name)}
            onChange={(e) =>
              w.setControls({ ...w.controls, mechanism: e.target.value })
            }
          >
            {structuralMechanisms.map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </Select>
          <p className="small">
            {
              structuralMechanisms.find(
                (m) =>
                  m.name ===
                  (w.controls.mechanism ?? structuralMechanisms[0].name),
              )?.effect
            }
          </p>
          <Button
            className="full"
            disabled={w.busy || !w.ready || !hasWriting}
            onClick={() => w.ask("diagnose", "break_template")}
          >
            Explore this structure
          </Button>
        </details>
      </div>
    </aside>
  );
}
