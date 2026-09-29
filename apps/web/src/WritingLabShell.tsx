import { NextSteps, ContextHelp, EmptyInspectorIntro } from "./FirstMove";
import type { Wayfinding } from "./wayfinding";
import {
  QuickSave,
  ContextLibrary,
  StyleContext,
  ContextualWriting,
  ContextualBrief,
} from "./LibraryTools";
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
  type WorkbenchRun,
  type AIResponse,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { resolveHistoricalTarget } from "./target-drafts";
import {
  Button,
  ConfirmDelete,
  Field,
  Select,
  Range,
  GrowingTextarea,
} from "./ui";
import {
  sectionMentions,
  sectionReference,
  customSectionLabel,
  runDraftState,
  humanTargetLabel,
  resultOutcome,
  writerResultReason,
  currentTakeIds,
  alignedTextDifference,
  type DiffPart,
  labActionLabel,
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

function DiffText({
  parts,
  kind,
}: {
  parts: DiffPart[];
  kind: "added" | "removed";
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.changed ? (
          <mark
            key={index}
            className={`compare-${kind}`}
            title={kind === "added" ? "Changed wording" : "Earlier wording"}
          >
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function FollowUpEvidence({
  text,
  original,
}: {
  text: string;
  original: string;
}) {
  return (
    <>
      {text.split(/(“[^”\n]{3,180}”|"[^"\n]{3,180}")/g).map((part, index) => {
        const quote = part.slice(1, -1);
        return (part.startsWith("“") || part.startsWith('"')) &&
          original.includes(quote) ? (
          <mark
            className="lab-evidence"
            key={index}
            title="Quoted from the original passage"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

function FollowUpThread({ w, run }: { w: Workspace; run: WorkbenchRun }) {
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [run.id]);
  const resolution = resolveHistoricalTarget(w.doc, run.target);
  const owner = run.target.sectionId;
  const identity = owner
    ? (sectionReference(w.doc, owner) ?? "Section no longer available")
    : null;
  const pending = run.conversation.at(-1)?.role === "writer";
  const full = run.conversation.length >= 24;
  const send = async () => {
    if (await w.askFollowUp(run.id, draft)) setDraft("");
  };
  return (
    <section
      className="lab-follow-up"
      data-testid="lab-follow-up"
      aria-label="Follow-up conversation"
    >
      <h3>
        Follow-up · {humanTargetLabel(run.target)}
        {identity ? ` · ${identity}` : ""}
      </h3>
      {run.instruction.trim() && (
        <p className="small">
          <b>Original question:</b> {run.instruction}
        </p>
      )}
      {!!run.briefContext.length && (
        <div className="follow-up-guidance" data-testid="run-brief-snapshot">
          <b>Brief context used for this run</b>
          {run.briefContext.map((item, index) => (
            <p key={index}>
              <small>
                WRITING BRIEF · {item.field.replaceAll("_", " ").toUpperCase()}
              </small>{" "}
              · {item.value}
            </p>
          ))}
        </div>
      )}
      {!!run.guidance.length && (
        <div className="follow-up-guidance" data-testid="run-guidance-snapshot">
          <b>Guidance used for this run</b>
          {run.guidance.map((item, index) => (
            <p key={index}>
              <small>
                {item.source === "library"
                  ? `PERSONAL LIBRARY · ${item.kind?.replaceAll("_", " ").toUpperCase() ?? "ITEM"}`
                  : item.source.replaceAll("_", " ").toUpperCase()}
                {item.preference === "avoid" ? " · AVOID" : ""}
              </small>{" "}
              · {item.text}
            </p>
          ))}
        </div>
      )}
      {resolution.status === "changed" && (
        <div className="follow-up-age" role="status">
          <b>Target changed since this run</b>
          <p>Original passage: {run.target.text}</p>
          <p>Current passage: {resolution.current.text}</p>
          <small>
            Follow-ups here discuss the original passage, not the current
            wording.
          </small>
          <Button onClick={() => w.stageCurrentPassage(run.id)}>
            Ask about current passage
          </Button>
        </div>
      )}
      {resolution.status === "unresolved" && (
        <p className="follow-up-age" role="status">
          The original passage cannot be located safely. This conversation is
          historical; select a new target to ask again.
        </p>
      )}
      {run.conversation.map((turn) => (
        <article
          key={turn.id}
          className="follow-up-turn"
          data-testid={`follow-up-${turn.role}`}
        >
          <div className="row between">
            <b>{turn.role === "writer" ? "Your follow-up" : "Response"}</b>
            <time>
              {new Date(turn.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          <p className="preserve">
            <FollowUpEvidence text={turn.text} original={run.target.text} />
          </p>
          {turn.role === "assistant" && (
            <div className="row wrap">
              {turn.model && (
                <small>
                  {modelLabel(w.catalog, turn.model)} · {turn.provider}
                </small>
              )}
              <Button className="text-button" onClick={() => w.copy(turn.text)}>
                Copy response
              </Button>
            </div>
          )}
          {turn.proposals?.map((proposal) => (
            <div className="follow-up-option" key={proposal.id}>
              <b>Option · {proposal.label}</b>
              <p className="preserve">{proposal.text}</p>
              <small>{proposal.explanation}</small>
              <div className="row wrap">
                <Button onClick={() => w.copy(proposal.text)}>
                  Copy option
                </Button>
                <Button
                  onClick={() => w.saveFollowUpOption(run.id, proposal.id)}
                >
                  Save option
                </Button>
                <Button
                  disabled={
                    resolution.status !== "exact" ||
                    w.busy ||
                    !w.doc.sections.some(
                      (section) =>
                        section.id === run.target.sectionId &&
                        sectionText(section) === run.target.sectionSnapshot,
                    )
                  }
                  onClick={() => w.useFollowUpOption(run.id, proposal.id)}
                >
                  Use option explicitly
                </Button>
              </div>
            </div>
          ))}
        </article>
      ))}
      {pending && (
        <Button
          disabled={w.busy || resolution.status === "unresolved"}
          onClick={() => void w.askFollowUp(run.id)}
        >
          Retry saved follow-up
        </Button>
      )}
      {!pending && !full && (
        <div className="follow-up-compose">
          <Field label="Ask a follow-up about this passage">
            <textarea
              rows={3}
              maxLength={3000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about the original passage…"
            />
          </Field>
          {w.followUpModel && (
            <small className="muted">
              Next follow-up with: {modelLabel(w.catalog, w.followUpModel)}
            </small>
          )}
          {w.followUpAvailability === "offline" && (
            <small className="muted">
              Offline cannot answer open follow-ups. Choose a configured model
              with Run with if you need an answer; no paid fallback is used.
            </small>
          )}
          {w.followUpAvailability === "unavailable" && (
            <small className="muted">
              The selected follow-up model is unavailable. Choose a configured
              model with Run with; no fallback is used.
            </small>
          )}
          {w.followUpAvailability === "unknown" && (
            <small className="muted">
              Provider status unavailable. Reconnect before sending a follow-up.
            </small>
          )}
          <Button
            disabled={
              !draft.trim() || w.busy || resolution.status === "unresolved"
            }
            onClick={() => void send()}
          >
            Send follow-up
          </Button>
        </div>
      )}
      {full && !pending && (
        <small>
          This conversation holds twelve follow-ups. Start a new Lab run for
          another question; nothing was removed.
        </small>
      )}
    </section>
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
  restoreLabRun,
  onReturnFinding,
  labOrigin,
  onReturnToLab,
  onReturnToSelection,
  onReturnToSection,
  onOpenTrailFinding,
  takeOriginSectionId,
  onReturnToTakeSection,
}: {
  w: Workspace;
  navigation: Wayfinding;
  onCompare?: () => void;
  onJumpSection: (
    id: string,
    anchor?: { runId: string; findingIndex: number },
  ) => void;
  findingVisit?: {
    sectionId: string;
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
  restoreLabRun?: {
    runId: string;
    inspectorScrollTop: number;
    token: number;
  } | null;
  onReturnFinding: () => void;
  labOrigin?: { documentId: string; sectionId: string; runId: string } | null;
  onReturnToLab: (sectionId: string, runId: string) => void;
  onReturnToSelection: (sectionId: string, runId: string) => void;
  onReturnToSection: (sectionId: string, runId: string) => void;
  onOpenTrailFinding: (runId: string, findingIndex: number) => void;
  takeOriginSectionId?: string | null;
  onReturnToTakeSection: () => void;
  openWork?: {
    sectionId: string;
    kind: "variants" | "structure" | "history";
    token: number;
  } | null;
}) {
  const { target, response, responseTarget } = w;
  const section = w.doc.sections.find((s) => s.id === target?.sectionId);
  const sectionName =
    section && (sectionReference(w.doc, section.id) ?? "Selected section");
  const sectionIdentity =
    section &&
    customSectionLabel(section) &&
    w.doc.sections.filter(
      (item) => customSectionLabel(item) === customSectionLabel(section),
    ).length > 1
      ? `${sectionName} · Section ${w.doc.sections.findIndex((item) => item.id === section.id) + 1}`
      : sectionName;
  const currentTakes = section ? currentTakeIds(section) : [];
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
  const targetLabel = target
    ? humanTargetLabel(target)
        .toLowerCase()
        .replace(/^(?:current|selected|whole) /, "")
    : "passage";
  const relevantActions = lab.actions.slice(0, 5);
  const responseSection = w.doc.sections.find(
    (s) => s.id === responseTarget?.sectionId,
  );
  const responseLab = labFor(
    responseSection?.kind ?? "Freeform",
    responseTarget?.scope ?? "selection",
  );
  const outcome = w.activeRun ? resultOutcome(w.activeRun) : null;
  const isLexicalRun =
    w.activeRun?.action === "words" && Boolean(w.activeRun?.lens);
  const deliveryActive = w.isDeliveryTarget && w.lens.view === "delivery";
  const isDeliveryRun = isLexicalRun && w.activeRun?.lens?.view === "delivery";
  const phraseExploration =
    isLexicalRun &&
    !isDeliveryRun &&
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
  const labContextLost =
    labOrigin &&
    (labOrigin.sectionId !== target?.sectionId ||
      w.activeRun?.id !== labOrigin.runId ||
      !w.activeRun ||
      target?.scope !== w.activeRun.target.scope ||
      target?.start !== w.activeRun.target.start ||
      target?.text !== w.activeRun.target.text ||
      runDraftState(w.doc, w.activeRun) === "Target changed");
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
  const [deletingTake, setDeletingTake] = useState<{
    sectionId: string;
    id: string;
  } | null>(null);
  const responseRef = useRef<HTMLElement>(null);
  const variantsRef = useRef<HTMLDetailsElement>(null);
  const wasBusy = useRef(false);
  const wasFollowingUp = useRef(false);
  useEffect(() => {
    // Scroll only the Inspector on completion; never focus or scroll the document.
    if (w.busy && w.running?.label === "Following up…")
      wasFollowingUp.current = true;
    if (wasBusy.current && !w.busy && responseRef.current) {
      const panel = responseRef.current.closest(".inspector");
      const destination = wasFollowingUp.current
        ? (Array.from(
            responseRef.current.querySelectorAll<HTMLElement>(
              ".follow-up-turn",
            ),
          ).at(-1) ?? responseRef.current)
        : responseRef.current;
      if (panel)
        panel.scrollTo({
          top:
            panel.scrollTop +
            destination.getBoundingClientRect().top -
            panel.getBoundingClientRect().top -
            16,
          behavior: "smooth",
        });
      wasFollowingUp.current = false;
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
  useEffect(() => {
    if (!restoreLabRun || restoreLabRun.runId !== w.activeRun?.id) return;
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        const result = responseRef.current;
        const pane = result?.closest<HTMLElement>(".inspector");
        if (!result || !pane) return;
        pane.scrollTop = restoreLabRun.inspectorScrollTop;
        if (
          w.activeRun?.conversation.length &&
          restoreLabRun.inspectorScrollTop > 0
        )
          return;
        const top = result.getBoundingClientRect().top;
        const paneTop = pane.getBoundingClientRect().top;
        if (
          top < paneTop + 50 ||
          top > paneTop + pane.clientHeight - 120 ||
          top < 50 ||
          top > window.innerHeight - 120
        )
          result.scrollIntoView({ block: "start", behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [restoreLabRun?.token, w.activeRun?.id]);
  const fullCopy = response
    ? [
        responseTarget?.scope !== "document" && responseTarget?.text
          ? "Original target\n" + responseTarget.text
          : "",
        displayText(response.diagnosis),
        displayText(response.mechanism),
        displayText(response.question),
        ...(response.qualityNotices ?? []).map((reason) =>
          displayText(writerResultReason(reason)),
        ),
        ...response.missingIngredients.map((reason) =>
          displayText(writerResultReason(reason)),
        ),
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
        <span
          className="provider"
          title={
            w.running
              ? "Model for this request"
              : "Provider for the next model route"
          }
        >
          {w.running
            ? w.running.models.length > 1
              ? `Comparing ${w.running.models.length} models`
              : modelLabel(w.catalog, w.running.models[0])
            : !w.catalog
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
        target?.scope !== "document" &&
        findingVisit.sectionId === target?.sectionId && (
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
      {!(findingVisit && findingVisit.sectionId === target?.sectionId) &&
        labOrigin &&
        labContextLost &&
        target?.scope !== "document" &&
        w.doc.sections.some((s) => s.id === labOrigin.sectionId) && (
          <div className="finding-return" data-testid="lab-return">
            <Button
              onClick={() =>
                onReturnToLab(labOrigin.sectionId, labOrigin.runId)
              }
            >
              ← Return to question ·{" "}
              {sectionReference(w.doc, labOrigin.sectionId)}
            </Button>
          </div>
        )}
      <div className="lab-head">
        <h2>
          {isWholeAnalysis
            ? "Whole-piece analysis"
            : hasTarget
              ? deliveryActive
                ? "Delivery Lens"
                : w.isLensTarget
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
          <ContextualBrief w={w} />
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
                {humanTargetLabel(target).toUpperCase()}
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
              {w.rhetoricalTargets.length > 0 && (
                <div
                  className="row wrap target-scope"
                  role="group"
                  aria-label="Target scope"
                >
                  {w.rhetoricalTargets.map((choice) => (
                    <Button
                      key={choice.kind}
                      className="text-button"
                      aria-pressed={
                        choice.kind === "section"
                          ? target.scope === "section"
                          : target.unit === choice.kind
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => w.selectRhetoricalTarget(choice.kind)}
                    >
                      {choice.kind === "section"
                        ? "Whole section"
                        : choice.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <ContextualWriting
            key={`${w.doc.id}:${target.sectionId}:${target.scope}:${target.start}:${target.end}:${target.sectionSnapshot}`}
            w={w}
            navigation={navigation}
          />
          <ContextualBrief w={w} />
          {w.isDeliveryTarget && (
            <div
              className="segmented lens-view"
              role="group"
              aria-label="Lens view"
            >
              <Button
                aria-pressed={!deliveryActive}
                disabled={!w.isLensTarget}
                onClick={() =>
                  w.setLens((lens) => ({ ...lens, view: "lexical" }))
                }
              >
                Words/Phrases
              </Button>
              <Button
                aria-pressed={deliveryActive}
                onClick={() =>
                  w.setLens((lens) => ({
                    ...lens,
                    view: "delivery",
                    mode: "explore",
                  }))
                }
              >
                Delivery
              </Button>
            </div>
          )}
          {w.stagedCurrentPassage ? (
            <section
              className="staged-current-passage"
              data-testid="current-passage-stage"
              aria-label="Current passage staged"
            >
              <b>Current passage staged</b>
              <p>{target.text}</p>
              <small>
                No question was sent. Review your question and model before
                running.
              </small>
              <Field label="Question for current passage">
                <textarea
                  rows={3}
                  value={w.instruction}
                  onChange={(event) => w.setInstruction(event.target.value)}
                  placeholder="What should the Lab look at in this wording?"
                />
              </Field>
              <small>
                Next run with: {modelLabel(w.catalog, w.effectiveModel.model)} ·{" "}
                {w.effectiveModel.source.replace("_", " ")}
              </small>
              <div className="row wrap">
                <Button
                  className="primary"
                  disabled={!w.instruction.trim() || w.busy || !w.ready}
                  onClick={() => void w.ask("diagnose")}
                >
                  Run question
                </Button>
                <Button onClick={w.cancelStagedPassage}>
                  Return to saved run
                </Button>
              </div>
            </section>
          ) : deliveryActive || w.isLensTarget ? (
            <WordLensControls w={w} />
          ) : (
            <>
              <Field
                label="Your direction"
                hint="Your experience and intent lead. AI should ask, not invent."
              >
                <GrowingTextarea
                  rows={4}
                  data-lab-direction
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
                {w.busy ? "Analyzing…" : labActionLabel(w.action, targetLabel)}
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
          {restoreLabRun?.runId === w.activeRun?.id && (
            <p className="small muted" data-testid="saved-run-context">
              Saved Lab result · {w.activeRun?.action} ·{" "}
              {humanTargetLabel(w.activeRun!.target)}
            </p>
          )}
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
          {outcome && (
            <div
              className="result-outcome"
              role="status"
              data-testid="result-outcome"
            >
              <b>{outcome.title}</b>
              {outcome.reasons.length ? (
                outcome.reasons.map((reason, index) => (
                  <p key={index}>
                    <ReferencedText
                      w={w}
                      text={writerResultReason(reason)}
                      onJumpSection={onJumpSection}
                    />
                  </p>
                ))
              ) : (
                <p>
                  The request finished without a proposal or explanation. Your
                  draft is unchanged.
                </p>
              )}
            </div>
          )}
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
                  Original {humanTargetLabel(responseTarget).toLowerCase()}
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
              {w.inspectedTarget && (
                <div
                  className="target-resolution"
                  data-testid="target-resolution"
                  role="status"
                >
                  {w.inspectedTarget.resolution.status === "changed" ? (
                    <>
                      <b>Target changed since this run</b>
                      <p>
                        Current passage:{" "}
                        {w.inspectedTarget.resolution.current.text}
                      </p>
                      {w.inspectedTarget.confirmed ? (
                        <small>
                          Current passage selected. A new run will use this
                          wording, not the original.
                        </small>
                      ) : (
                        <div className="row wrap">
                          <Button onClick={w.returnToCurrentPassage}>
                            Return to current passage
                          </Button>
                          <Button onClick={w.useCurrentPassage}>
                            Use current passage for a new run
                          </Button>
                        </div>
                      )}
                    </>
                  ) : w.inspectedTarget.resolution.status === "unresolved" ? (
                    <b>
                      Original target changed and can’t be located reliably.
                      Select a new target in the editor.
                    </b>
                  ) : (
                    <Button
                      onClick={() =>
                        w.inspectSectionRun(
                          responseTarget.sectionId!,
                          w.activeRun!.id,
                        )
                      }
                    >
                      Restore exact selection
                    </Button>
                  )}
                </div>
              )}
              <small>
                These options belong to this original, even if your cursor
                moves.
              </small>
              {w.activeRun?.id &&
                responseTarget.sectionId &&
                (!w.inspectedTarget ||
                  w.inspectedTarget.resolution.status === "exact") && (
                  <Button
                    className="text-button"
                    onClick={() =>
                      responseTarget.scope === "selection" ||
                      responseTarget.scope === "word"
                        ? onReturnToSelection(
                            responseTarget.sectionId!,
                            w.activeRun!.id,
                          )
                        : onReturnToSection(
                            responseTarget.sectionId!,
                            w.activeRun!.id,
                          )
                    }
                  >
                    {w.doc.sections.find(
                      (s) => s.id === responseTarget.sectionId,
                    )?.placement === "parked"
                      ? "Return to parked thought"
                      : responseTarget.scope === "word" ||
                          responseTarget.scope === "selection"
                        ? "Return to selection"
                        : "Return to section"}
                  </Button>
                )}
            </div>
          )}
          {isDeliveryRun && (
            <div className="delivery-result" data-testid="delivery-result">
              <b>Delivery · Effect</b>
              <p>
                <ReferencedText
                  w={w}
                  text={response.diagnosis}
                  onJumpSection={onJumpSection}
                />
              </p>
              {response.mechanism && (
                <>
                  <b>Why it reads that way</b>
                  <p>
                    <ReferencedText
                      w={w}
                      text={response.mechanism}
                      onJumpSection={onJumpSection}
                    />
                  </p>
                </>
              )}
              {response.findings.slice(0, 2).map((finding, index) => (
                <div key={index}>
                  <b>{displayText(finding.title)}</b>
                  <p>
                    <ReferencedText
                      w={w}
                      text={finding.detail}
                      onJumpSection={onJumpSection}
                    />
                  </p>
                </div>
              ))}
              {response.question && (
                <>
                  <b>Question</b>
                  <p>{displayText(response.question)}</p>
                </>
              )}
            </div>
          )}
          {!isDeliveryRun && (
            <p className="diagnosis">
              <ReferencedText
                w={w}
                text={response.diagnosis.slice(0, diagnosisSplit)}
                onJumpSection={onJumpSection}
              />
            </p>
          )}
          {!isDeliveryRun &&
            (phraseExploration &&
            (diagnosisSplit < response.diagnosis.length ||
              response.mechanism) ? (
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
            ))}
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
          {!outcome && !!response.qualityNotices?.length && (
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
          {!outcome && response.missingIngredients.length > 0 && (
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
          {!isDeliveryRun && localFindings.map(renderFinding)}
          {!isDeliveryRun && relatedFindings.length > 0 && (
            <details className="related-draft-uses">
              <summary>
                Related uses elsewhere in draft ({relatedCount})
              </summary>
              {relatedFindings.map(renderFinding)}
            </details>
          )}
          {!isDeliveryRun &&
            (!isLexicalRun || w.activeRun?.lens?.mode === "explore") &&
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
          {(response.model ?? w.activeRun?.model) && (
            <p className="small muted" data-testid="run-model">
              {modelLabel(w.catalog, response.model ?? w.activeRun?.model)}
              {response.routeSource
                ? ` · ${response.routeSource.replace("_", " ")}`
                : ""}
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
                  {w.running?.label === "Proposing…"
                    ? "Proposing…"
                    : "Propose options"}{" "}
                  <ArrowRight size={14} />
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
                  <div className="success">
                    {w.proposalStates[p.id] === "saved"
                      ? "Saved as take"
                      : w.proposalStates[p.id]}
                  </div>
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
          {w.activeRun?.model && responseTarget?.scope !== "document" && (
            <FollowUpThread w={w} run={w.activeRun} />
          )}
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
      {w.doc.revisionTrail.length > 0 && (
        <details className="revision-trail">
          <summary>
            Revision trail{" "}
            <span className="count">{w.doc.revisionTrail.length}</span>
          </summary>
          <ul>
            {[...w.doc.revisionTrail]
              .reverse()
              .slice(0, 8)
              .map((entry) => {
                const run = [
                  ...(w.doc.workbench?.runs ?? []),
                  ...w.doc.sections.flatMap(
                    (item) => item.workbench?.runs ?? [],
                  ),
                ].find((item) => item.id === entry.runId);
                const title =
                  entry.findingIndex === null
                    ? `${run?.action ?? "Saved Lab work"} run`
                    : (run?.response.findings[entry.findingIndex]?.title ??
                      "Whole-piece finding");
                return (
                  <li key={entry.id}>
                    {run ? (
                      <Button
                        className="text-button"
                        onClick={() =>
                          entry.findingIndex === null
                            ? onReturnToLab(entry.sectionId, run.id)
                            : onOpenTrailFinding(run.id, entry.findingIndex)
                        }
                      >
                        Open saved run · {displayText(title)}
                      </Button>
                    ) : (
                      <b>{displayText(title)}</b>
                    )}
                    {" → edited "}
                    {sectionReference(w.doc, entry.sectionId) ? (
                      <Button
                        className="text-button"
                        onClick={() =>
                          onJumpSection(
                            entry.sectionId,
                            entry.findingIndex === null
                              ? undefined
                              : {
                                  runId: entry.runId,
                                  findingIndex: entry.findingIndex!,
                                },
                          )
                        }
                      >
                        {sectionReference(w.doc, entry.sectionId)}
                      </Button>
                    ) : (
                      "a section no longer in the draft"
                    )}
                    <small>
                      Viewed before edit ·{" "}
                      {entry.savedRevision === null
                        ? "Not saved yet"
                        : `Saved with revision ${entry.savedRevision}`}
                    </small>
                  </li>
                );
              })}
          </ul>
        </details>
      )}
      {(hasTarget || explicitVariants) && section && !isWholeAnalysis && (
        <details ref={variantsRef} className="variants">
          <summary>
            Saved takes ·{" "}
            <span className="take-owner" title={sectionIdentity ?? ""}>
              {sectionIdentity}
            </span>{" "}
            <span className="count">{section.variants.length}</span>
            <span className="take-state" data-testid="current-draft-state">
              {currentTakes.length
                ? `In draft: ${section.variants
                    .filter((take) => currentTakes.includes(take.id))
                    .map((take) => take.label)
                    .join(" · ")}`
                : "Current draft"}
            </span>
          </summary>
          {takeOriginSectionId === section.id && (
            <Button className="text-button" onClick={onReturnToTakeSection}>
              Return to section
            </Button>
          )}
          {section.variants.length === 0 ? (
            <p className="muted small">
              Save take on the selected card, or save an AI option here. Nothing
              changes in your draft until you activate a take.
            </p>
          ) : (
            section.variants.map((v) => {
              const originalText =
                v.sourceTarget?.text ??
                (v.origin === "original" ? v.text : v.target.text);
              const currentText = sectionText(section);
              const draftDiff = alignedTextDifference(
                originalText,
                currentText,
              );
              const takeDiff = alignedTextDifference(currentText, v.text);
              return (
                <article key={v.id} className="variant">
                  {currentTakes.includes(v.id) && (
                    <span className="take-current" data-testid="take-current">
                      In draft
                    </span>
                  )}
                  <p className="small muted">
                    {v.origin === "human"
                      ? "Saved by you"
                      : v.origin === "original"
                        ? "Original before apply"
                        : "AI proposal"}
                    {v.model ? ` · ${modelLabel(w.catalog, v.model)}` : ""}
                  </p>
                  <Field label="Take name">
                    <input
                      aria-label="Take name"
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
                    aria-label="Take text"
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
                      aria-label="Copy take"
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
                      aria-label="Delete take"
                      title="Delete take"
                      onClick={() =>
                        setDeletingTake({ sectionId: section.id, id: v.id })
                      }
                    >
                      <X size={13} />
                    </Button>
                  </div>
                  {deletingTake?.sectionId === section.id &&
                    deletingTake.id === v.id && (
                      <ConfirmDelete
                        title={
                          v.label.trim()
                            ? `Delete take “${v.label}”?`
                            : "Delete this saved take?"
                        }
                        confirmLabel="Delete take"
                        onCancel={() => setDeletingTake(null)}
                        onConfirm={() => {
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
                          }));
                          w.setNotice(
                            v.label.trim()
                              ? `Deleted take “${v.label}”.`
                              : "Deleted saved take.",
                          );
                          setDeletingTake(null);
                        }}
                      />
                    )}
                  {compare === v.id && (
                    <div
                      className="comparison"
                      data-testid="variant-comparison"
                    >
                      <b>
                        {v.origin === "human"
                          ? "When this take was saved"
                          : v.origin === "original"
                            ? "Original before apply"
                            : "Original target"}
                        {originalText === currentText
                          ? " · Current draft text"
                          : ""}
                      </b>
                      <p data-testid="compare-original">
                        <DiffText parts={draftDiff.before} kind="removed" />
                      </p>
                      {originalText !== currentText && (
                        <>
                          <b>Current draft text</b>
                          <p data-testid="compare-current">
                            <DiffText parts={draftDiff.after} kind="added" />
                          </p>
                        </>
                      )}
                      {v.text !== originalText && v.text !== currentText ? (
                        <>
                          <b>
                            {v.origin === "human"
                              ? `${v.label} · Saved by you`
                              : v.origin === "original"
                                ? "Original before apply"
                                : `${v.label} · AI proposal saved as take`}
                          </b>
                          <p data-testid="compare-take">
                            <DiffText parts={takeDiff.after} kind="added" />
                          </p>
                        </>
                      ) : (
                        <small>
                          {v.origin === "human"
                            ? `${v.label} · Saved by you. ${v.text === currentText ? "This take matches the current draft." : "This saved take differs from the current draft."}`
                            : `${v.origin === "original" ? "Original before apply" : `${v.label} · AI proposal saved as take`} matches ${v.text === currentText ? "the current draft" : "the earlier version"}.`}
                        </small>
                      )}
                    </div>
                  )}
                </article>
              );
            })
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
          {w.running?.label === "Analyzing the draft…"
            ? "Analyzing…"
            : "Whole-piece critique"}{" "}
          <ArrowUpRight size={14} />
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
