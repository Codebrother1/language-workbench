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
  type AIResponse,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { Button, Field, Select, Range, GrowingTextarea } from "./ui";
import {
  sectionMentions,
  sectionReference,
  runDraftState,
} from "./workspace-helpers";

function ReferencedText({
  w,
  text,
  onJumpSection,
}: {
  w: Workspace;
  text: string;
  onJumpSection: (id: string) => void;
}) {
  return (
    <>
      {sectionMentions(w.doc, text).map((part, index) =>
        part.sectionId ? (
          <button
            key={index}
            type="button"
            className="section-reference-link"
            onClick={() => onJumpSection(part.sectionId!)}
            aria-label={`Jump to ${part.text}`}
          >
            {part.text}
          </button>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function WritingLabShell({
  w,
  navigation,
  onCompare,
  openWork,
  onJumpSection,
  findingVisit,
  restoreFinding,
  onReturnFinding,
}: {
  w: Workspace;
  navigation: Wayfinding;
  onCompare?: () => void;
  onJumpSection: (
    id: string,
    anchor?: { runId: string; findingIndex: number },
  ) => void;
  findingVisit?: {
    runId: string;
    findingIndex: number;
    findingId: string;
    referencedSectionIds: string[];
    inspectorScrollTop: number;
  } | null;
  restoreFinding?: {
    runId: string;
    findingIndex: number;
    inspectorScrollTop: number;
    token: number;
  } | null;
  onReturnFinding: () => void;
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
  const phraseExploration =
    isLexicalRun &&
    w.activeRun?.lens?.mode === "explore" &&
    responseTarget?.scope === "selection";
  const displayText = (text: string) =>
    sectionMentions(w.doc, text)
      .map((part) => part.text)
      .join("");
  const documentRuns = (w.doc.workbench?.runs ?? []).filter(
    (run) => run.action === "critique",
  );
  const savedCritique =
    documentRuns.find((run) => run.id === w.doc.workbench?.activeRunId) ??
    documentRuns.at(-1);
  const visitedRun = documentRuns.find((run) => run.id === findingVisit?.runId);
  const visitedFinding =
    visitedRun?.response.findings[findingVisit?.findingIndex ?? -1];
  const analysisState = w.activeRun ? runDraftState(w.doc, w.activeRun) : null;
  const findingIds = (finding: AIResponse["findings"][number]) =>
    [
      ...new Set([
        finding.sectionId,
        ...sectionMentions(w.doc, finding.title + " " + finding.detail).map(
          (part) => part.sectionId,
        ),
      ]),
    ].filter((id): id is string => !!id && !!sectionReference(w.doc, id));
  const relatedFindings = phraseExploration
    ? (response?.findings.filter((finding) =>
        findingIds(finding).some((id) => id !== responseTarget?.sectionId),
      ) ?? [])
    : [];
  const localFindings =
    response?.findings.filter(
      (finding) => !relatedFindings.includes(finding),
    ) ?? [];
  const relatedCount = new Set(
    relatedFindings
      .flatMap(findingIds)
      .filter((id) => id !== responseTarget?.sectionId),
  ).size;
  const diagnosisSplit =
    phraseExploration && (response?.diagnosis.length ?? 0) > 340
      ? (response!.diagnosis.match(/^.{0,320}[.!?](?=\s|$)/s)?.[0].length ??
        320)
      : (response?.diagnosis.length ?? 0);
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
  useEffect(() => {
    if (
      !restoreFinding ||
      w.activeRun?.id !== restoreFinding.runId ||
      responseTarget?.scope !== "document"
    )
      return;
    const frame = requestAnimationFrame(() => {
      const pane = responseRef.current?.closest<HTMLElement>(".inspector");
      const finding = Array.from(
        responseRef.current?.querySelectorAll<HTMLElement>(
          "[data-finding-index]",
        ) ?? [],
      ).find(
        (element) =>
          element.dataset.findingIndex === String(restoreFinding.findingIndex),
      );
      if (!pane || !finding) return;
      pane.scrollTop = restoreFinding.inspectorScrollTop;
      const top =
        finding.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      if (top < 0 || top > pane.clientHeight - finding.clientHeight)
        pane.scrollTop += top - 70;
      finding.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [restoreFinding, w.activeRun?.id, responseTarget?.scope]);
  const fullCopy = response
    ? [
        responseTarget?.scope !== "document" && responseTarget?.text
          ? "Original target\n" + responseTarget.text
          : "",
        displayText(response.diagnosis),
        displayText(response.mechanism),
        displayText(response.question),
        ...(response.qualityNotices ?? []).map(displayText),
        ...response.missingIngredients.map(displayText),
        ...response.findings.map((f) => displayText(f.title + "\n" + f.detail)),
        ...response.lexical.map((l) =>
          displayText(Object.values(l).join("\n")),
        ),
        ...response.proposals.map((p) =>
          [p.label, p.text, p.explanation, p.qualityNote]
            .filter(Boolean)
            .map((part) => displayText(part!))
            .join("\n"),
        ),
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";
  const jumpFromFinding = (
    id: string,
    finding: AIResponse["findings"][number],
  ) =>
    onJumpSection(
      id,
      w.activeRun?.target.scope === "document"
        ? {
            runId: w.activeRun.id,
            findingIndex: response?.findings.indexOf(finding) ?? -1,
          }
        : undefined,
    );
  const renderFinding = (
    finding: AIResponse["findings"][number],
    index: number,
  ) => (
    <article
      className="finding"
      key={index}
      data-finding-index={response?.findings.indexOf(finding)}
      tabIndex={-1}
      aria-label={displayText(finding.title)}
    >
      <div className="row between">
        <b>
          <ReferencedText
            w={w}
            text={finding.title}
            onJumpSection={(id) => jumpFromFinding(id, finding)}
          />
        </b>
        <span className="tag">{finding.severity}</span>
      </div>
      <p>
        <ReferencedText
          w={w}
          text={finding.detail}
          onJumpSection={(id) => jumpFromFinding(id, finding)}
        />
      </p>
      {findingIds(finding).length > 0 && (
        <div
          className="row wrap finding-references"
          aria-label="Referenced sections"
        >
          {findingIds(finding).map((id) => (
            <Button
              key={id}
              className="text-button"
              onClick={() => jumpFromFinding(id, finding)}
            >
              {sectionReference(w.doc, id)} <ArrowUpRight size={13} />
            </Button>
          ))}
        </div>
      )}
    </article>
  );
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
      {findingVisit &&
        visitedRun &&
        visitedFinding &&
        target?.scope !== "document" && (
          <div className="finding-return" data-testid="finding-return">
            <Button
              onClick={onReturnFinding}
              title={`Whole-piece ${visitedRun.action} · ${new Date(visitedRun.createdAt).toLocaleString()}`}
            >
              ← Return to finding ·{" "}
              {displayText(visitedFinding.title).slice(0, 55)}
            </Button>
            <span className="small muted">
              {findingVisit.referencedSectionIds.length} referenced sections ·{" "}
              {runDraftState(w.doc, visitedRun) === "Earlier draft"
                ? "Based on an earlier draft"
                : "Current draft"}
            </span>
          </div>
        )}
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
            {responseTarget?.scope === "document" && (
              <span className="analysis-state" data-testid="analysis-state">
                {analysisState === "Earlier draft"
                  ? "Based on an earlier draft"
                  : "Current draft"}
              </span>
            )}
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
          {responseTarget?.scope === "document" &&
            analysisState === "Earlier draft" && (
              <div className="analysis-age" role="status">
                <span>
                  Based on an earlier draft. The finding is kept for review, not
                  refreshed.
                </span>
                <Button
                  disabled={w.busy || !w.ready}
                  onClick={() => w.ask("diagnose", "critique")}
                >
                  Analyze revised draft
                </Button>
              </div>
            )}
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
          <p className="diagnosis">
            <ReferencedText
              w={w}
              text={response.diagnosis.slice(0, diagnosisSplit)}
              onJumpSection={onJumpSection}
            />
          </p>
          {phraseExploration &&
          (diagnosisSplit < response.diagnosis.length || response.mechanism) ? (
            <details className="lens-more-analysis">
              <summary>More analysis</summary>
              {diagnosisSplit < response.diagnosis.length && (
                <p>
                  <ReferencedText
                    w={w}
                    text={response.diagnosis.slice(diagnosisSplit).trim()}
                    onJumpSection={onJumpSection}
                  />
                </p>
              )}
              {response.mechanism && (
                <p>
                  <ReferencedText
                    w={w}
                    text={response.mechanism}
                    onJumpSection={onJumpSection}
                  />
                </p>
              )}
            </details>
          ) : (
            response.mechanism && (
              <p className="small">
                <ReferencedText
                  w={w}
                  text={response.mechanism}
                  onJumpSection={onJumpSection}
                />
              </p>
            )
          )}
          {responseTarget?.scope === "document" && response.question && (
            <div className="revision-question" data-testid="revision-question">
              <b>Revision question</b>
              <p>
                <ReferencedText
                  w={w}
                  text={response.question}
                  onJumpSection={onJumpSection}
                />
              </p>
            </div>
          )}
          {!!response.qualityNotices?.length && (
            <div className="quality-notices" role="status">
              <b>Output check</b>
              {response.qualityNotices.map((note) => (
                <p key={note}>
                  <ReferencedText
                    w={w}
                    text={note}
                    onJumpSection={onJumpSection}
                  />
                </p>
              ))}
            </div>
          )}
          {response.missingIngredients.length > 0 && (
            <div className="ingredients">
              <b>Bring your material</b>
              <ul>
                {response.missingIngredients.map((m, i) => (
                  <li key={i}>
                    <ReferencedText
                      w={w}
                      text={m}
                      onJumpSection={onJumpSection}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {localFindings.map(renderFinding)}
          {relatedFindings.length > 0 && (
            <details className="related-draft-uses">
              <summary>
                Related uses elsewhere in draft ({relatedCount})
              </summary>
              {relatedFindings.map(renderFinding)}
            </details>
          )}
          {(!isLexicalRun || w.activeRun?.lens?.mode === "explore") &&
            response.lexical.map((word, i) => (
              <article className="finding" key={i}>
                <div className="row between">
                  <h3>
                    <ReferencedText
                      w={w}
                      text={word.term}
                      onJumpSection={onJumpSection}
                    />
                  </h3>
                  <Button
                    className="icon"
                    aria-label={"Copy " + word.term}
                    onClick={() => w.copy(Object.values(word).join("\n"))}
                  >
                    <Copy size={13} />
                  </Button>
                </div>
                <p>
                  <ReferencedText
                    w={w}
                    text={word.meaning}
                    onJumpSection={onJumpSection}
                  />
                </p>
                <p>
                  <ReferencedText
                    w={w}
                    text={word.nuance}
                    onJumpSection={onJumpSection}
                  />
                </p>
                <span className="tag">
                  <ReferencedText
                    w={w}
                    text={word.register}
                    onJumpSection={onJumpSection}
                  />
                </span>
                <p>
                  <em>
                    <ReferencedText
                      w={w}
                      text={word.example}
                      onJumpSection={onJumpSection}
                    />
                  </em>
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
                <Field
                  label={displayText(response.question) || responseLab.question}
                >
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
          {response.proposals.map((p, i) => {
            const containsKnownId = sectionMentions(w.doc, p.text).some(
              (part) => part.sectionId,
            );
            return (
              <article className="proposal" key={p.id} data-testid="proposal">
                <div className="row between">
                  <span className="eyebrow">
                    {String(i + 1).padStart(2, "0")} /{" "}
                    <ReferencedText
                      w={w}
                      text={p.label}
                      onJumpSection={onJumpSection}
                    />
                  </span>
                  <Button
                    className="icon"
                    aria-label={
                      (isLexicalRun ? "Copy candidate " : "Copy proposal ") +
                      (i + 1)
                    }
                    onClick={() => w.copy(displayText(p.text))}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
                <span className="eyebrow">Proposed</span>
                <textarea
                  aria-label={"Edit proposal " + (i + 1)}
                  value={containsKnownId ? displayText(p.text) : p.text}
                  rows={Math.min(9, Math.max(3, Math.ceil(p.text.length / 35)))}
                  onChange={(e) => w.proposalText(p.id, e.target.value)}
                />
                <p>
                  <ReferencedText
                    w={w}
                    text={p.explanation}
                    onJumpSection={onJumpSection}
                  />
                </p>
                {p.qualityNote && (
                  <p className="quality-note" data-testid="quality-note">
                    <ReferencedText
                      w={w}
                      text={p.qualityNote}
                      onJumpSection={onJumpSection}
                    />
                  </p>
                )}
                {containsKnownId && (
                  <p className="quality-note">
                    Replace the internal reference with your own wording before
                    accepting.
                  </p>
                )}
                {!containsKnownId && (
                  <QuickSave w={w} text={p.text} origin="candidate" />
                )}
                {isLexicalRun && !containsKnownId && (
                  <CandidatePreview w={w} text={p.text} open={i === 0} />
                )}
                {w.proposalStates[p.id] ? (
                  <div className="success">{w.proposalStates[p.id]}</div>
                ) : (
                  <div className="proposal-actions">
                    <Button
                      className="primary"
                      data-testid="accept-proposal"
                      disabled={
                        responseTarget?.scope === "document" || containsKnownId
                      }
                      onClick={() => w.decide(p.id, "accepted")}
                    >
                      <Check size={13} />
                      {isLexicalRun ? "Replace" : "Accept"}
                    </Button>
                    <Button
                      data-testid="save-variant"
                      disabled={containsKnownId}
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
            );
          })}
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
        {savedCritique && (
          <Button
            className="full"
            onClick={() => w.inspectDocumentRun(savedCritique.id)}
          >
            Review saved critique · {documentRuns.length}
          </Button>
        )}
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
