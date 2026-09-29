import type { InsertionAnchor } from "./SectionInsertion";
import { closeHistory } from "@tiptap/pm/history";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  type Document,
  type RevisionTrailEntry,
  type WritingSection,
  insertSectionAt,
  saveSectionTake,
  insertParkedSection,
  parkSection,
  includeSectionAt,
  moveParkedSectionToGroup,
  draftSections,
  parkedSections,
  duplicateSection as duplicateSectionInstance,
  removeSection as removeSectionInstance,
  type Settings,
  type EditTarget,
  type WorkbenchRun,
  type SavedGuidance,
  type SavedBriefContext,
  type AIResponse,
  type WritingAction,
  type Variant,
  defaultSettings,
  newDocument,
  newSection,
  uid,
  documentText,
  documentTarget,
  sectionText,
  targetFor,
  validateTarget,
  paragraphs,
  documentSchema,
  hasAuthoredDraftChange,
  type SectionWorkbench,
  type ModelRef,
  type ProviderCatalog,
  type LensOptions,
  type AIRequest,
  requestedVariantShape,
  resolveModel,
  modelKey,
  routingPreferencesSchema,
  emptyLibrary,
  personalLibrarySchema,
  libraryItemSchema,
  relevantLibraryItems,
  resolveWritingStyle,
  emptyStructure,
  renderScaffold,
  segmentRawThoughts,
  getRelationship,
  scaffoldsFor,
  type PersonalLibrary,
  type LibraryItem,
  type StructureDraft,
  type StructureRequest,
} from "./domain";
import {
  WritingDocument,
  WritingSectionNode,
  TargetHighlight,
  SectionBoundaryGuard,
  authorizedSetContent,
  allowSectionLocalEdit,
  toEditor,
  fromEditor,
  cursorTarget,
  highlight,
  sectionLocation,
  scrollPreviewToSection,
  scrollPreviewToTarget,
  positionMap,
  targetRange,
  clipboardPlainText,
  draftClipboardSlice,
  clipboardHTML,
} from "./editor";
import {
  getWorkbench,
  makeRevisionCheckpoint,
  checkpointMatchesDraft,
  contextualBrief,
  chooseActiveDocument,
  updateWorkbench,
  isLensTarget as detectsLensTarget,
  isDeliveryTarget as detectsDeliveryTarget,
  makeRun,
  appendRun,
  editRunProposal,
  forkWorkbench,
  inspectRun,
  type RunCapture,
} from "./workspace-helpers";
import {
  createLibraryItem,
  contextualGuidance,
  guidanceContext,
  guidanceIdentity,
  isGuidanceDismissed,
  libraryDelta,
  makeHumanRun,
  type SaveLibraryItemInput,
  type LibraryItemPatch,
} from "./library-helpers";
import {
  getTargetDraft,
  targetDraftKey,
  patchTargetDraft,
  restoreFocusTarget,
  resolveHistoricalTarget,
  rhetoricalTargetChoices,
  withFocusTarget,
  sameFocusTarget,
  type TargetResolution,
  canCoachTarget as hasCoachContext,
} from "./target-drafts";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const e = await response.json();
      message = typeof e.error === "string" ? e.error : (e.message ?? message);
    } catch {}
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export type Panel =
  | "brief"
  | "memory"
  | "revision"
  | "revisionPlan"
  | "sources"
  | "style"
  | "radar"
  | "history"
  | "providers"
  | "documents"
  | "library"
  | "guides"
  | null;
function forkDocument(doc: Document, title = doc.title): Document {
  const id = uid();
  return {
    ...doc,
    id,
    title,
    revision: 0,
    workbench: forkWorkbench(doc.workbench, id),
    focusTarget: doc.focusTarget
      ? { ...doc.focusTarget, documentId: id }
      : null,
    createdAt: new Date().toISOString(),
    sections: doc.sections.map((s) => ({
      ...s,
      workbench: forkWorkbench(s.workbench, id),
      variants: s.variants.map((v) => ({
        ...v,
        target: { ...v.target, documentId: id },
      })),
    })),
    history: doc.history.map((h) => ({
      ...h,
      target: { ...h.target, documentId: id },
    })),
  };
}
function sameSavedContentExceptFocus(a: Document, b: Document): boolean {
  const withoutFocus = (doc: Document) =>
    JSON.stringify(
      documentSchema.parse({
        ...doc,
        revision: 0,
        updatedAt: "",
        focusTarget: null,
        selectedSectionId: null,
      }),
    );
  return withoutFocus(a) === withoutFocus(b);
}

function modelForFollowUp(
  wb: SectionWorkbench,
  run: WorkbenchRun,
): ModelRef | null {
  return (
    wb.oneOffModel ??
    (wb.runChain && sameFocusTarget(wb.runChain.target, run.target)
      ? wb.runChain.model
      : null) ??
    run.chainModel ??
    run.model
  );
}

function guidanceKey(target: EditTarget): string {
  return JSON.stringify([
    target.documentId,
    target.sectionId,
    targetDraftKey(target),
    target.sectionSnapshot,
  ]);
}

export function useWorkspace() {
  const initial = useRef(newDocument());
  const [doc, setDoc] = useState(initial.current);
  const [stagedPassage, setStagedPassage] = useState<{
    documentId: string;
    sourceRunId: string;
    target: EditTarget;
  } | null>(null);
  const [guidanceDraft, setGuidanceDraft] = useState<{
    documentId: string;
    key: string;
    items: SavedGuidance[];
  } | null>(null);
  const [briefDraft, setBriefDraft] = useState<{
    documentId: string;
    key: string;
    items: SavedBriefContext[];
  } | null>(null);
  const current = useRef(doc);
  useEffect(() => {
    setStagedPassage(null);
    setGuidanceDraft(null);
    setBriefDraft(null);
  }, [doc.id]);
  const persisted = useRef(doc);
  // Preserve section metadata when rich-editor undo resurrects a removed/reordered node.
  const sectionMetadata = useRef(new Map(doc.sections.map((s) => [s.id, s])));
  const [documents, setDocuments] = useState<Document[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const settingsRef = useRef(settings);
  const settingsQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [library, setLibrary] = useState<PersonalLibrary>(emptyLibrary);
  const libraryRef = useRef(library);
  const [libraryReady, setLibraryReady] = useState(false);
  const libraryReadyRef = useRef(false);
  const libraryQueue = useRef<Promise<unknown>>(Promise.resolve());
  const libraryOperations = useRef(0);
  const libraryPending = useRef<((base: PersonalLibrary) => PersonalLibrary)[]>(
    [],
  );
  const [librarySaveState, setLibrarySaveState] = useState("Connecting");
  const [health, setHealth] = useState({
    ok: false,
    provider: "Connecting",
    webResearch: false,
  });
  const [ready, setReady] = useState(false);
  const isReady = useRef(false);
  const dirty = useRef(0),
    saved = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inflight = useRef<Promise<void> | null>(null);
  const [saveState, setSaveState] = useState("Connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTargetState] = useState<EditTarget | null>(null);
  const targetRef = useRef<EditTarget | null>(null);
  const explicitFocusIntent = useRef(false);
  const [inspectedTarget, setInspectedTarget] = useState<{
    runId: string;
    sectionId: string;
    resolution: TargetResolution;
    confirmed: boolean;
  } | null>(null);
  const inspectionRef = useRef<typeof inspectedTarget>(null);
  const changeInspection = (value: typeof inspectedTarget) => {
    inspectionRef.current = value;
    setInspectedTarget(value);
  };
  const selectingExplicitTarget = useRef(false);
  const pendingRevisionContext = useRef<{
    documentId: string;
    runId: string;
    sectionId: string;
    findingIndex: number | null;
    viewedAt: string;
  } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<{
    label: string;
    models: ModelRef[];
  } | null>(null);
  const requestBusy = useRef(false);
  const navigating = useRef(false);
  const [documentSwitching, setDocumentSwitching] = useState(false);
  const [documentWorkbench, setDocumentWorkbench] = useState(false);
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const latestCatalogRequest = useRef(0);
  const refreshCatalog = useCallback(async () => {
    const requestId = ++latestCatalogRequest.current;
    try {
      const [next, status] = await Promise.all([
        api<ProviderCatalog>("/providers"),
        api<typeof health>("/health"),
      ]);
      if (requestId === latestCatalogRequest.current) {
        setCatalog(next);
        setHealth(status);
      }
      return next;
    } catch (error) {
      if (requestId === latestCatalogRequest.current) setCatalog(null);
      throw error;
    }
  }, []);
  const updateRef = useRef<(fn: (d: Document) => Document) => void>(() => {});
  const selectRef = useRef<() => void>(() => {});
  const [insertion, setInsertion] = useState<InsertionAnchor | null>(null);
  const editor = useEditor({
    autofocus: false,
    extensions: [
      StarterKit.configure({ document: false, trailingNode: false }),
      WritingDocument,
      WritingSectionNode,
      TargetHighlight,
      SectionBoundaryGuard.configure({
        onBlocked: () =>
          setNotice(
            "Section boundaries are protected. Edit within one section, or use section controls to change structure.",
          ),
      }),
    ],
    content: toEditor(initial.current),
    editorProps: {
      clipboardTextSerializer: clipboardPlainText,
      handleDOMEvents: {
        copy: (view, event) => {
          if (view.dom.classList.contains("in-card") || !event.clipboardData)
            return false;
          const draft = draftClipboardSlice(view.state.selection.content());
          if (!draft) return false;
          event.clipboardData.setData("text/plain", clipboardPlainText(draft));
          event.clipboardData.setData(
            "text/html",
            clipboardHTML(draft, view.state.schema),
          );
          event.preventDefault();
          return true;
        },
      },
      attributes: {
        "data-testid": "writing-editor",
        "aria-label": "Writing editor",
        role: "textbox",
        "aria-multiline": "true",
        class: "writing-editor",
      },
    },
    onUpdate: ({ editor }) => {
      const sections = fromEditor(editor, [
        ...sectionMetadata.current.values(),
      ]);
      updateRef.current((d) => {
        const context = pendingRevisionContext.current;
        const before = d.sections.find(
          (section) => section.id === context?.sectionId,
        );
        const after = sections.find(
          (section) => section.id === context?.sectionId,
        );
        if (
          context &&
          before &&
          after &&
          context.documentId === d.id &&
          !selectingExplicitTarget.current &&
          sectionText(before) !== sectionText(after)
        ) {
          pendingRevisionContext.current = null;
          const entry: RevisionTrailEntry = {
            id: uid(),
            runId: context.runId,
            sectionId: context.sectionId,
            findingIndex: context.findingIndex,
            viewedAt: context.viewedAt,
            editedAt: new Date().toISOString(),
            savedRevision: null,
          };
          return {
            ...d,
            sections,
            revisionTrail: [...d.revisionTrail, entry].slice(-100),
          };
        }
        return { ...d, sections };
      });
      selectRef.current();
    },
    onSelectionUpdate: () => selectRef.current(),
  });
  const flush: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    if (!isReady.current) return;
    if (inflight.current) {
      await inflight.current;
      if (dirty.current > saved.current) return flush();
      return;
    }
    const run = async () => {
      let rebases = 0;
      while (dirty.current > saved.current) {
        const version = dirty.current,
          snapshot = {
            ...withFocusTarget(
              current.current,
              explicitFocusIntent.current && targetRef.current
                ? { ...targetRef.current, focusOrigin: "explicit" }
                : null,
              targetRef.current?.sectionId ??
                current.current.selectedSectionId ??
                null,
            ),
            title: current.current.title.trim() || "Untitled",
            revisionTrail: current.current.revisionTrail.map((entry) =>
              entry.savedRevision === null
                ? { ...entry, savedRevision: current.current.revision + 1 }
                : entry,
            ),
          };
        setSaveState("Saving");
        try {
          const result = await api<Document>(
            "/documents/" + snapshot.id,
            "PUT",
            snapshot,
          );
          if (current.current.id === snapshot.id) {
            persisted.current = result;
            const merged = {
              ...withFocusTarget(
                current.current,
                explicitFocusIntent.current && targetRef.current
                  ? { ...targetRef.current, focusOrigin: "explicit" }
                  : null,
                targetRef.current?.sectionId ??
                  current.current.selectedSectionId ??
                  null,
              ),
              revision: result.revision,
              draftRevision: result.draftRevision,
              updatedAt: result.updatedAt,
              revisionTrail: current.current.revisionTrail.map(
                (entry) =>
                  result.revisionTrail.find(
                    (savedEntry) => savedEntry.id === entry.id,
                  ) ?? entry,
              ),
            };
            current.current = merged;
            setDoc(merged);
            setDocuments((ds) =>
              ds.map((d) => (d.id === merged.id ? merged : d)),
            );
          }
          saved.current = version;
        } catch (e) {
          if (
            (e as Error & { status?: number }).status === 409 &&
            rebases < 2
          ) {
            const latest = await api<Document>(
              "/documents/" + snapshot.id,
            ).catch(() => null);
            if (
              latest &&
              current.current.id === snapshot.id &&
              persisted.current.id === snapshot.id &&
              sameSavedContentExceptFocus(latest, persisted.current)
            ) {
              rebases++;
              persisted.current = latest;
              const rebased = {
                ...current.current,
                revision: latest.revision,
                updatedAt: latest.updatedAt,
              };
              current.current = rebased;
              setDoc(rebased);
              setDocuments((ds) =>
                ds.map((d) => (d.id === rebased.id ? rebased : d)),
              );
              continue;
            }
          }
          setSaveState("Not saved");
          setError(
            (e as Error).message +
              " Your edits are still here. Retry saving before switching documents.",
          );
          throw e;
        }
      }
      setSaveState("Saved");
    };
    inflight.current = run();
    try {
      await inflight.current;
    } finally {
      inflight.current = null;
    }
  }, []);
  const setTarget = useCallback(
    (value: SetStateAction<EditTarget | null>) => {
      const next =
        typeof value === "function" ? value(targetRef.current) : value;
      const changed = !sameFocusTarget(targetRef.current, next);
      targetRef.current = next;
      setTargetState(next);
      // Selection metadata shares the document save queue, without a document
      // state update or nested editor dispatch in selectionUpdate.
      if (changed && isReady.current) {
        dirty.current++;
        setSaveState("Unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void flush().catch(() => {});
        }, 700);
      }
    },
    [flush],
  );
  const explicitAnchor = useRef<{
    from: number;
    to: number;
    sectionId: string;
    sectionSnapshot: string;
  } | null>(null);
  const selectExactTarget = (next: EditTarget | null, selectRange = true) => {
    if (
      inspectionRef.current &&
      next?.sectionId !== inspectionRef.current.sectionId
    )
      changeInspection(null);
    explicitFocusIntent.current = !!next;
    selectingExplicitTarget.current = true;
    try {
      if (editor && next?.sectionId) {
        const range = targetRange(editor, next);
        if (range)
          editor.view.dispatch(
            editor.state.tr
              .setSelection(
                TextSelection.create(
                  editor.state.doc,
                  range.from,
                  selectRange && next.scope !== "section"
                    ? range.to
                    : range.from,
                ),
              )
              .setMeta("addToHistory", false),
          );
      }
      if (editor && next?.sectionId)
        explicitAnchor.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
          sectionId: next.sectionId,
          sectionSnapshot: next.sectionSnapshot,
        };
      else explicitAnchor.current = null;
      setTarget(next);
      setDocumentWorkbench(next?.scope === "document");
      if (editor) highlight(editor, next);
    } finally {
      selectingExplicitTarget.current = false;
    }
  };
  const inspectHistoricalTarget = (run: WorkbenchRun) => {
    const resolution = resolveHistoricalTarget(current.current, run.target);
    if (resolution.status === "exact") {
      changeInspection(null);
      selectExactTarget(resolution.current);
      if (editor?.view.hasFocus()) editor.view.dom.blur();
      return;
    }
    const owner = current.current.sections.some(
      (section) => section.id === run.target.sectionId,
    )
      ? run.target.sectionId!
      : (targetRef.current?.sectionId ?? current.current.sections[0]?.id);
    if (!owner) return;
    changeInspection({
      runId: run.id,
      sectionId: owner,
      resolution,
      confirmed: false,
    });
    selectingExplicitTarget.current = true;
    try {
      explicitAnchor.current = null;
      explicitFocusIntent.current = true;
      setTarget(targetFor(current.current, owner));
      setDocumentWorkbench(false);
      if (editor) highlight(editor, null, true);
    } finally {
      selectingExplicitTarget.current = false;
    }
    if (editor?.view.hasFocus()) editor.view.dom.blur();
  };
  const restoreSavedRunTarget = (next: Document) => {
    const restored = restoreFocusTarget(next);
    selectExactTarget(restored);
    if (!restored?.sectionId) return;
    const workbench = getWorkbench(next, restored.sectionId);
    const run = workbench.runs.find(
      (item) => item.id === workbench.activeRunId,
    );
    if (!run || !["selection", "word"].includes(run.target.scope)) return;
    const resolution = resolveHistoricalTarget(next, run.target);
    if (resolution.status === "exact") return;
    changeInspection({
      runId: run.id,
      sectionId: restored.sectionId,
      resolution,
      confirmed: false,
    });
    if (editor) highlight(editor, null, true);
  };
  const update = useCallback(
    (fn: (d: Document) => Document) => {
      const next = {
        ...fn(current.current),
        updatedAt: new Date().toISOString(),
      };
      current.current = next;
      next.sections.forEach((s) => sectionMetadata.current.set(s.id, s));
      setDoc(next);
      dirty.current++;
      setSaveState("Unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 700);
    },
    [flush],
  );
  updateRef.current = update;
  selectRef.current = () => {
    if (!editor || editor.view.composing || selectingExplicitTarget.current)
      return;
    const anchor = explicitAnchor.current;
    if (
      anchor &&
      editor.state.selection.from === anchor.from &&
      editor.state.selection.to === anchor.to &&
      current.current.sections.some(
        (s) =>
          s.id === anchor.sectionId &&
          sectionText(s) === anchor.sectionSnapshot,
      )
    )
      return;
    explicitAnchor.current = null;
    const t = cursorTarget(editor, current.current);
    if (
      inspectionRef.current &&
      !editor.state.selection.empty &&
      t?.sectionId === inspectionRef.current.sectionId &&
      (t.scope === "selection" || t.scope === "word") &&
      current.current.sections.some(
        (section) =>
          section.id === t.sectionId &&
          sectionText(section) === t.sectionSnapshot,
      )
    )
      changeInspection(null);
    const draft = t?.sectionId
      ? getTargetDraft(getWorkbench(current.current, t.sectionId), t)
      : null;
    explicitFocusIntent.current =
      !!t &&
      (!editor.state.selection.empty ||
        !!draft?.instruction.trim() ||
        !!draft?.answer.trim());
    setTarget(
      t?.sectionId && !t.sectionSnapshot
        ? targetFor(current.current, t.sectionId)
        : t,
    );
    setDocumentWorkbench(false);
  };
  const rememberSelectedDocument = async (id: string) => {
    if (settingsRef.current.activeDocumentId === id) {
      await settingsQueue.current;
      return;
    }
    const next = { ...settingsRef.current, activeDocumentId: id };
    settingsRef.current = next;
    setSettings(next);
    const operation = settingsQueue.current
      .catch(() => {})
      .then(() => api<Settings>("/settings", "PUT", next));
    settingsQueue.current = operation;
    await operation;
  };
  useEffect(() => {
    if (!editor || isReady.current) return;
    let alive = true;
    (async () => {
      try {
        const [ds, s, h, c, loadedLibrary] = await Promise.all([
          api<Document[]>("/documents"),
          api<Settings>("/settings"),
          api<typeof health>("/health"),
          api<ProviderCatalog>("/providers").catch(() => null),
          api<PersonalLibrary>("/library").then((value) =>
            personalLibrarySchema.parse(value),
          ),
        ]);
        if (!alive) return;
        libraryRef.current = loadedLibrary;
        setLibrary(loadedLibrary);
        libraryReadyRef.current = true;
        setLibraryReady(true);
        setLibrarySaveState("Saved");
        setSettings(s);
        settingsRef.current = s;
        setHealth(h);
        setCatalog(c);
        let active: Document;
        if (dirty.current === 0 && ds.length)
          active = chooseActiveDocument(ds, s.activeDocumentId)!;
        else {
          const created = await api<Document>("/documents", "POST", {});
          persisted.current = created;
          // Keep anything typed during boot, including stable section IDs.
          active = {
            ...current.current,
            id: created.id,
            revision: created.revision,
            createdAt: created.createdAt,
          };
          ds.push(active);
          dirty.current++;
        }
        if (!alive) return;
        if (s.activeDocumentId !== active.id)
          try {
            await rememberSelectedDocument(active.id);
          } catch {
            setError(
              "Document opened, but the last selected document could not be saved.",
            );
          }
        if (!alive) return;
        current.current = active;
        if (dirty.current === 0) persisted.current = active;
        sectionMetadata.current = new Map(
          active.sections.map((s) => [s.id, s]),
        );
        setDoc(active);
        setDocuments(ds);
        if (editor) {
          authorizedSetContent(editor, toEditor(active), { emitUpdate: false });
          editor.view.updateState(
            EditorState.create({
              schema: editor.schema,
              doc: editor.state.doc,
              plugins: editor.state.plugins,
            }),
          );
        }
        restoreSavedRunTarget(active);
        if (editor.view.hasFocus()) editor.view.focus();
        isReady.current = true;
        setReady(true);
        setSaveState("Saved");
        if (dirty.current) void flush().catch(() => {});
      } catch (e) {
        setError((e as Error).message);
        setSaveState("Offline · edits local");
      }
    })();
    return () => {
      alive = false;
    };
  }, [editor, flush]);
  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void refreshCatalog().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [ready, refreshCatalog]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (
        dirty.current > saved.current ||
        requestBusy.current ||
        libraryPending.current.length ||
        libraryOperations.current > 0
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  // Queue all CAS writes/imports. Failed operations retain their explicit local deltas.
  const publishLibrary = (next: PersonalLibrary) => {
    libraryRef.current = next;
    setLibrary(next);
  };
  const requireLibrary = () => {
    if (!libraryReadyRef.current)
      throw new Error("The personal library is not loaded yet.");
  };
  const drainLibrary = async () => {
    requireLibrary();
    while (libraryPending.current.length) {
      const count = libraryPending.current.length;
      const snapshot = libraryRef.current;
      setLibrarySaveState("Saving");
      const result = personalLibrarySchema.parse(
        await api<PersonalLibrary>("/library", "PUT", snapshot),
      );
      libraryPending.current.splice(0, count);
      publishLibrary(
        libraryPending.current.reduce((base, apply) => apply(base), result),
      );
    }
    setLibrarySaveState("Saved");
  };
  const queueLibrary = (operation: () => Promise<void>): Promise<void> => {
    libraryOperations.current++;
    const queued = libraryQueue.current
      .catch(() => {})
      .then(operation)
      .finally(() => {
        libraryOperations.current--;
      });
    libraryQueue.current = queued;
    // Attach an error handler immediately, while still returning rejection to callers.
    void queued.catch((e: Error) => {
      setLibrarySaveState("Not saved");
      setError(
        "Library not saved: " +
          e.message +
          " Your local edits are still here. Retry saving or export them before leaving.",
      );
    });
    return queued;
  };
  const flushLibrary = (): Promise<void> => queueLibrary(drainLibrary);
  const saveLibrary = (next: PersonalLibrary): Promise<void> => {
    try {
      requireLibrary();
      const parsed = personalLibrarySchema.parse({
        ...next,
        revision: libraryRef.current.revision,
      });
      const apply = libraryDelta(libraryRef.current, parsed);
      libraryPending.current.push(apply);
      publishLibrary(parsed);
      setLibrarySaveState("Unsaved");
      return flushLibrary();
    } catch (e) {
      setError((e as Error).message);
      return Promise.reject(e);
    }
  };
  const updateLibrary = (
    fn: (previous: PersonalLibrary) => PersonalLibrary,
  ): Promise<void> => {
    try {
      requireLibrary();
      return saveLibrary(fn(libraryRef.current));
    } catch (e) {
      setError((e as Error).message);
      return Promise.reject(e);
    }
  };
  const saveLibraryItem = async (
    input: SaveLibraryItemInput,
  ): Promise<string> => {
    const item = createLibraryItem(input);
    await updateLibrary((previous) => ({
      ...previous,
      items: [...previous.items, item],
    }));
    return item.id;
  };
  const updateLibraryItem = (
    id: string,
    patch: LibraryItemPatch,
  ): Promise<void> =>
    updateLibrary((previous) => ({
      ...previous,
      items: previous.items.map((item) =>
        item.id === id
          ? libraryItemSchema.parse({
              ...item,
              ...patch,
              id: item.id,
              createdAt: item.createdAt,
              updatedAt: new Date().toISOString(),
            })
          : item,
      ),
    }));
  const deleteLibraryItem = (id: string): Promise<void> =>
    updateLibrary((previous) => ({
      ...previous,
      items: previous.items.filter((item) => item.id !== id),
    }));
  const markLibraryUsed = (id: string): Promise<void> => {
    const item = libraryRef.current.items.find((item) => item.id === id);
    return item
      ? updateLibraryItem(id, {
          useCount: item.useCount + 1,
          lastUsedAt: new Date().toISOString(),
        })
      : Promise.resolve();
  };
  const importLibrary = async (file: File): Promise<void> => {
    try {
      const imported = personalLibrarySchema.parse(
        JSON.parse(await file.text()),
      );
      await queueLibrary(async () => {
        await drainLibrary();
        setLibrarySaveState("Saving");
        const result = personalLibrarySchema.parse(
          await api<PersonalLibrary>("/library/import", "POST", {
            library: imported,
          }),
        );
        // Edits made while import was in flight are rebased rather than overwritten.
        publishLibrary(
          libraryPending.current.reduce((base, apply) => apply(base), result),
        );
        await drainLibrary();
      });
      setNotice("Library imported");
    } catch (e) {
      setError("Library import failed: " + (e as Error).message);
      throw e;
    }
  };
  const sync = (next: Document) => {
    update(() => next);
    if (editor) editor.view.dispatch(closeHistory(editor.state.tr));
    if (editor)
      authorizedSetContent(editor, toEditor(next), { emitUpdate: false });
    if (editor) editor.view.dispatch(closeHistory(editor.state.tr));
    setTarget(null);
    if (editor) highlight(editor, null);
  };
  const load = (next: Document) => {
    setInsertion(null);
    pendingRevisionContext.current = null;
    changeInspection(null);
    sectionMetadata.current = new Map(next.sections.map((s) => [s.id, s]));
    current.current = next;
    persisted.current = next;
    setDoc(next);
    dirty.current = 0;
    saved.current = 0;
    if (editor) {
      authorizedSetContent(editor, toEditor(next), { emitUpdate: false });
      editor.view.updateState(
        EditorState.create({
          schema: editor.schema,
          doc: editor.state.doc,
          plugins: editor.state.plugins,
        }),
      );
    }
    restoreSavedRunTarget(next);
    // Restoring saved metadata is not a user edit.
    saved.current = dirty.current;
    setSaveState("Saved");
  };
  const navigate = async (id: string) => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    setDocumentSwitching(true);
    try {
      await flush();
      const next =
        current.current.id === id
          ? current.current
          : documents.find((d) => d.id === id);
      if (next) {
        await rememberSelectedDocument(next.id);
        load(next);
      }
    } catch (error) {
      setError("Could not switch documents: " + (error as Error).message);
    } finally {
      navigating.current = false;
      setDocumentSwitching(false);
    }
  };
  const create = async (duplicate = false) => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    setDocumentSwitching(true);
    try {
      await flush();
      const next = duplicate
        ? await api<Document>("/import", "POST", {
            document: {
              ...forkDocument(
                current.current,
                current.current.title + " — copy",
              ),
              guidanceDismissals: [],
            },
          })
        : await api<Document>("/documents", "POST", {});
      await flush();
      setDocuments((ds) => [...ds, next]);
      try {
        await rememberSelectedDocument(next.id);
      } catch {
        setError("New document opened, but its selection could not be saved.");
      }
      load(next);
      if (!duplicate) editor?.view.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      navigating.current = false;
      setDocumentSwitching(false);
    }
  };
  const remove = async () => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    setDocumentSwitching(true);
    try {
      await flush();
      const deletedTitle = current.current.title.trim() || "Untitled";
      await api("/documents/" + current.current.id, "DELETE");
      const remaining = documents.filter((d) => d.id !== current.current.id);
      const next =
        remaining[0] ?? (await api<Document>("/documents", "POST", {}));
      setDocuments(remaining.length ? remaining : [next]);
      try {
        await rememberSelectedDocument(next.id);
      } catch {
        setError(
          "Another document opened, but its selection could not be saved.",
        );
      }
      load(next);
      setNotice(`Deleted “${deletedTitle}”.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      navigating.current = false;
      setDocumentSwitching(false);
    }
  };
  const refreshAfterLifecycleChange = async () => {
    const active = await api<Document[]>("/documents");
    const surviving = active.find((doc) => doc.id === current.current.id);
    const next =
      surviving ?? active[0] ?? (await api<Document>("/documents", "POST", {}));
    setDocuments(active.length ? active : [next]);
    if (!surviving) {
      try {
        await rememberSelectedDocument(next.id);
      } catch {
        setError(
          "Another document opened, but its selection could not be saved.",
        );
      }
      load(next);
    }
  };
  const archiveDocuments = async (ids: string[]) => {
    if (requestBusy.current || navigating.current) {
      setError("Finish the current operation before archiving documents.");
      return false;
    }
    if (!ids.length) return false;
    navigating.current = true;
    setDocumentSwitching(true);
    try {
      await flush();
      const { count } = await api<{ count: number }>(
        "/documents/archive",
        "POST",
        { ids },
      );
      await refreshAfterLifecycleChange();
      setNotice(
        count === 1
          ? `Archived “${documents.find((doc) => doc.id === ids[0])?.title ?? "Untitled"}”.`
          : `Archived ${count} documents.`,
      );
      return true;
    } catch (error) {
      setError("Archive failed: " + (error as Error).message);
      return false;
    } finally {
      navigating.current = false;
      setDocumentSwitching(false);
    }
  };
  const restoreDocuments = async (ids: string[]) => {
    if (requestBusy.current || navigating.current) {
      setError("Finish the current operation before restoring documents.");
      return false;
    }
    if (!ids.length) return false;
    navigating.current = true;
    try {
      const { count } = await api<{ count: number }>(
        "/documents/restore",
        "POST",
        { ids },
      );
      await refreshAfterLifecycleChange();
      setNotice(`Restored ${count} ${count === 1 ? "document" : "documents"}.`);
      return true;
    } catch (error) {
      setError("Restore failed: " + (error as Error).message);
      return false;
    } finally {
      navigating.current = false;
    }
  };
  const deleteManagedDocuments = async (ids: string[]) => {
    if (requestBusy.current || navigating.current) {
      setError("Finish the current operation before deleting documents.");
      return false;
    }
    if (!ids.length) return false;
    navigating.current = true;
    setDocumentSwitching(true);
    try {
      await flush();
      const { count } = await api<{ count: number }>(
        "/documents/bulk",
        "DELETE",
        { ids, ...(new Set(ids).size > 1 ? { confirmation: "DELETE" } : {}) },
      );
      await refreshAfterLifecycleChange();
      setNotice(`Deleted ${count} ${count === 1 ? "document" : "documents"}.`);
      return true;
    } catch (error) {
      setError("Delete failed: " + (error as Error).message);
      return false;
    } finally {
      navigating.current = false;
      setDocumentSwitching(false);
    }
  };
  const importDoc = async (file: File) => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    setDocumentSwitching(true);
    try {
      await flush();
      const parsed = documentSchema.parse(JSON.parse(await file.text()));
      editor?.schema.nodeFromJSON(toEditor(parsed)).check();
      const next = await api<Document>("/import", "POST", {
        document: forkDocument(parsed),
      });
      await flush();
      setDocuments((ds) => [...ds, next]);
      try {
        await rememberSelectedDocument(next.id);
      } catch {
        setError(
          "Imported document opened, but its selection could not be saved.",
        );
      }
      load(next);
    } catch (e) {
      setError("Import failed: " + (e as Error).message);
    } finally {
      navigating.current = false;
      setDocumentSwitching(false);
    }
  };
  const prepareSectionTarget = (id: string): EditTarget | null => {
    if (!current.current.sections.some((s) => s.id === id)) return null;
    const next = targetFor(current.current, id);
    selectExactTarget(next, false);
    return next;
  };
  const navigateToSection = (id: string): boolean => {
    if (!current.current.sections.some((section) => section.id === id))
      return false;
    if (inspectionRef.current && inspectionRef.current.sectionId !== id)
      changeInspection(null);
    explicitAnchor.current = null;
    explicitFocusIntent.current = true;
    setTarget(targetFor(current.current, id));
    setDocumentWorkbench(false);
    return true;
  };
  const noteRevisionContext = (
    runId: string,
    sectionId: string,
    findingIndex: number | null = null,
  ) => {
    const d = current.current;
    const run = [
      ...(d.workbench?.runs ?? []),
      ...(d.sections.find((section) => section.id === sectionId)?.workbench
        ?.runs ?? []),
    ].find((item) => item.id === runId);
    if (
      !run ||
      run.target.documentId !== d.id ||
      (findingIndex !== null && !run.response.findings[findingIndex])
    )
      return;
    pendingRevisionContext.current = {
      documentId: d.id,
      runId,
      sectionId,
      findingIndex,
      viewedAt: new Date().toISOString(),
    };
  };
  const focusSection = (id: string, forceText = false) => {
    const next = prepareSectionTarget(id);
    if (next && editor) {
      selectingExplicitTarget.current = true;
      try {
        editor.view.focus();
        const pos = editor.state.selection.from;
        const dom = editor.view.domAtPos(pos);
        editor.view.dom.ownerDocument
          .getSelection()
          ?.setBaseAndExtent(dom.node, dom.offset, dom.node, dom.offset);
        setTarget(next);
        // A prose-edit jump places a caret; the whole-section target remains
        // available to Labs, but must not look like selected replacement text.
        highlight(editor, forceText ? null : next);
        scrollPreviewToSection(id);
      } finally {
        selectingExplicitTarget.current = false;
      }
    }
  };
  const patchSection = (
    id: string,
    patch: Partial<Pick<WritingSection, "kind" | "label">>,
  ) => {
    update((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
    if (editor) {
      const loc = sectionLocation(editor, id);
      if (loc)
        editor.view.dispatch(
          allowSectionLocalEdit(
            editor.state.tr.setNodeMarkup(loc.pos, undefined, {
              ...loc.node.attrs,
              ...patch,
            }),
            id,
          ),
        );
    }
    setTarget((t) =>
      t?.sectionId === id
        ? targetFor(current.current, id, t.scope, t.start, t.end)
        : t,
    );
  };
  const requestSectionInsertion = (
    beforeId: string | null,
    button: HTMLElement,
  ) => {
    if (!isReady.current) return;
    if (
      beforeId !== null &&
      !current.current.sections.some((s) => s.id === beforeId)
    ) {
      setError("The insertion position no longer exists.");
      return;
    }
    const rect = button.getBoundingClientRect();
    setInsertion({
      documentId: current.current.id,
      beforeSectionId: beforeId,
      x: rect.left,
      y: rect.bottom + 6,
      returnFocus: button,
    });
  };
  const commitSectionInsertion = (
    kind: WritingSection["kind"],
    beforeId: string | null,
  ) => {
    const section = newSection(kind);
    const before =
      beforeId &&
      current.current.sections.find((item) => item.id === beforeId)
        ?.placement !== "parked"
        ? beforeId
        : (parkedSections(current.current)[0]?.id ?? null);
    sync(insertSectionAt(current.current, section, before));
    setInsertion(null);
    focusSection(section.id);
  };
  const insertSection = (kind: WritingSection["kind"]) => {
    try {
      if (!insertion || insertion.documentId !== current.current.id)
        throw new Error("Choose an insertion position in this document.");
      commitSectionInsertion(kind, insertion.beforeSectionId);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  // All entry points share this insertion operation and its undo/scope semantics.
  const captureThought = (
    text: string,
    destination: "draft" | "parked" = "draft",
  ) => {
    if (!text.trim()) return false;
    if (destination === "parked") {
      const section = newSection("Freeform", text.trim());
      sync(insertParkedSection(current.current, section));
      prepareSectionTarget(section.id);
      return true;
    }
    const [first] = current.current.sections;
    if (
      current.current.sections.length === 1 &&
      first.placement !== "parked" &&
      first.kind === "Freeform" &&
      !sectionText(first).trim() &&
      !first.notes.trim() &&
      first.variants.length === 0
    ) {
      sync({
        ...current.current,
        sections: [
          { ...first, content: newSection("Freeform", text.trim()).content },
        ],
      });
      prepareSectionTarget(first.id);
      return true;
    }
    const section = newSection("Freeform", text.trim());
    sync(
      insertSectionAt(
        current.current,
        section,
        parkedSections(current.current)[0]?.id ?? null,
      ),
    );
    prepareSectionTarget(section.id);
    return true;
  };
  const addSectionAfter = (
    id: string,
    kind: WritingSection["kind"] = "Freeform",
  ) => {
    try {
      const index = current.current.sections.findIndex((s) => s.id === id);
      if (index < 0) throw new Error("Choose an existing section first.");
      commitSectionInsertion(
        kind,
        current.current.sections[index + 1]?.id ?? null,
      );
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const addSource = () => {
    const id = uid();
    update((d) => ({
      ...d,
      sources: [
        ...d.sources,
        {
          id,
          title: "Reference " + (d.sources.length + 1),
          kind: "text",
          text: "",
          url: "",
        },
      ],
    }));
    return id;
  };
  const focusSentence = () => {
    if (!editor) return;
    editor.commands.setTextSelection(editor.state.selection.from);
    explicitFocusIntent.current = true;
    setTarget(cursorTarget(editor, current.current));
    setDocumentWorkbench(false);
  };
  const duplicateSection = (id: string) => {
    try {
      const index = current.current.sections.findIndex((s) => s.id === id);
      const next = duplicateSectionInstance(current.current, id);
      sync(next);
      focusSection(next.sections[index + 1].id);
      setNotice(
        "Independent section copy created, including its local workbench.",
      );
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const setRevisionCheckpoint = (label = "") => {
    const draftRevision =
      current.current.draftRevision +
      Number(hasAuthoredDraftChange(persisted.current, current.current));
    update((doc) => ({
      ...doc,
      revisionCheckpoint: makeRevisionCheckpoint(doc, draftRevision, label),
    }));
  };
  const createRevisionIntent = (sectionId: string, text: string) => {
    if (
      !current.current.sections.some((section) => section.id === sectionId) ||
      !text.trim() ||
      text.trim().length > 1200
    )
      return false;
    update((doc) => ({
      ...doc,
      revisionPlan: [
        ...doc.revisionPlan,
        {
          id: uid(),
          sectionId,
          text: text.trim(),
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ],
    }));
    return true;
  };
  const editRevisionIntent = (id: string, sectionId: string, text: string) => {
    if (
      !current.current.sections.some((section) => section.id === sectionId) ||
      !text.trim() ||
      text.trim().length > 1200
    )
      return false;
    update((doc) => ({
      ...doc,
      revisionPlan: doc.revisionPlan.map((note) =>
        note.id === id ? { ...note, sectionId, text: text.trim() } : note,
      ),
    }));
    return true;
  };
  const completeRevisionIntent = (id: string, completed: boolean) =>
    update((doc) => ({
      ...doc,
      revisionPlan: doc.revisionPlan.map((note) =>
        note.id === id
          ? {
              ...note,
              completedAt: completed ? new Date().toISOString() : null,
            }
          : note,
      ),
    }));
  const removeRevisionIntent = (id: string) =>
    update((doc) => ({
      ...doc,
      revisionPlan: doc.revisionPlan.filter((note) => note.id !== id),
    }));
  const saveTake = (id: string, name = "") => {
    try {
      update((doc) => saveSectionTake(doc, id, name));
      const take = current.current.sections
        .find((section) => section.id === id)
        ?.variants.at(-1);
      setNotice(`Saved take · ${take?.label ?? "Take"}`);
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      return false;
    }
  };
  const deleteSection = (id: string) => {
    try {
      const oldIndex = current.current.sections.findIndex((s) => s.id === id);
      const next = removeSectionInstance(
        current.current,
        id,
        newSection("Freeform"),
      );
      sync(next);
      prepareSectionTarget(
        next.sections[Math.min(Math.max(oldIndex, 0), next.sections.length - 1)]
          .id,
      );
      setNotice(
        "Section removed. Undo restores it during this editing session.",
      );
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const moveSection = (id: string, to: number) => {
    const next = [...current.current.sections];
    const index = next.findIndex((s) => s.id === id);
    if (to < 0 || to >= next.length || index < 0) return;
    if (next[index].placement !== next[to].placement) return;
    if (
      next[index].placement === "parked" &&
      next[index].parkedGroupId !== next[to].parkedGroupId
    )
      return;
    next.splice(to, 0, next.splice(index, 1)[0]);
    sync({ ...current.current, sections: next });
    focusSection(id);
  };
  const splitSection = () => {
    if (!editor || !editor.state.selection.empty)
      return setError("Place the cursor at a split point first.");
    const t = cursorTarget(editor, current.current);
    if (!t?.sectionId) return;
    const loc = sectionLocation(editor, t.sectionId)!;
    const offset = editor.state.selection.from - loc.pos - 1;
    if (offset <= 0 || offset >= loc.node.content.size) return;
    const first = loc.node.content.cut(0, offset),
      second = loc.node.content.cut(offset);
    const old = current.current.sections.find((s) => s.id === t.sectionId)!;
    const fresh = {
      ...newSection(old.kind),
      placement: old.placement,
      parkedGroupId: old.parkedGroupId,
      lastParkedGroupId: old.lastParkedGroupId,
      content: second.toJSON(),
    };
    const sections = current.current.sections.flatMap((s) =>
      s.id === old.id ? [{ ...s, content: first.toJSON() }, fresh] : [s],
    );
    sync({ ...current.current, sections });
    focusSection(fresh.id);
  };
  const mergeSection = (id: string) => {
    const list = current.current.sections;
    const i = list.findIndex((s) => s.id === id);
    if (i < 0 || i >= list.length - 1) return;
    const a = list[i],
      b = list[i + 1];
    if (
      a.placement !== b.placement ||
      (a.placement === "parked" && a.parkedGroupId !== b.parkedGroupId)
    )
      return;
    const merged = {
      ...a,
      content: [...a.content, ...b.content],
      notes: [a.notes, b.notes].filter(Boolean).join("\n"),
      variants: [...a.variants, ...b.variants],
      ...(a.workbench || b.workbench
        ? {
            workbench: {
              ...getWorkbench(current.current, a.id),
              runs: [
                ...getWorkbench(current.current, a.id).runs,
                ...getWorkbench(current.current, b.id).runs,
              ],
            },
          }
        : {}),
    };
    sync({
      ...current.current,
      sections: [...list.slice(0, i), merged, ...list.slice(i + 2)],
    });
    focusSection(id);
  };
  const sectionId = documentWorkbench
    ? null
    : (target?.sectionId ?? doc.sections[0]?.id ?? null);
  const currentWorkbench = getWorkbench(doc, sectionId);
  const localHistory = currentWorkbench.runs;
  const activeRun =
    localHistory.find((run) => run.id === currentWorkbench.activeRunId) ?? null;
  const followUpModel = activeRun
    ? modelForFollowUp(currentWorkbench, activeRun)
    : null;
  const followUpProvider = catalog?.providers.find(
    (provider) => provider.id === followUpModel?.providerId,
  );
  const followUpDescriptor = followUpProvider?.models.find(
    (model) => model.id === followUpModel?.modelId,
  );
  const followUpAvailability = !catalog
    ? "unknown"
    : !followUpModel ||
        !followUpProvider?.configured ||
        !followUpProvider.enabled ||
        !followUpProvider.implemented ||
        !followUpDescriptor ||
        followUpDescriptor.capabilities.structuredOutput === false
      ? "unavailable"
      : followUpModel.providerId === "mock"
        ? "offline"
        : "live";
  const stagedCurrentPassage =
    stagedPassage?.documentId === doc.id &&
    !activeRun &&
    target &&
    sameFocusTarget(stagedPassage.target, target)
      ? stagedPassage
      : null;
  const response = activeRun?.response ?? null;
  const responseTarget = activeRun?.target ?? null;
  const activeResolution =
    activeRun && ["selection", "word"].includes(activeRun.target.scope)
      ? resolveHistoricalTarget(doc, activeRun.target)
      : null;
  const inspectedRunTarget =
    activeRun &&
    activeResolution &&
    activeRun.target.sectionId &&
    (inspectedTarget?.runId === activeRun.id ||
      activeResolution.status !== "exact")
      ? {
          runId: activeRun.id,
          sectionId: activeRun.target.sectionId,
          resolution: activeResolution,
          confirmed:
            inspectedTarget?.runId === activeRun.id
              ? inspectedTarget.confirmed
              : false,
        }
      : null;
  const { controls, lens, oneOffModel, compareModels, proposalStates } =
    currentWorkbench;
  const draftTarget = documentWorkbench ? null : target;
  const historicalDraftTarget =
    inspectedRunTarget &&
    !inspectedRunTarget.confirmed &&
    inspectedRunTarget.resolution.status !== "exact"
      ? activeRun?.target
      : null;
  const { instruction, answer } = getTargetDraft(
    currentWorkbench,
    historicalDraftTarget ?? draftTarget,
  );
  const canCoachTarget = hasCoachContext(doc, target, instruction);
  const isLensTarget =
    !documentWorkbench &&
    detectsLensTarget(target, !!editor && !editor.state.selection.empty);
  const isDeliveryTarget = !documentWorkbench && detectsDeliveryTarget(target);
  const rhetoricalTargets = (() => {
    if (!editor || !target?.sectionId) return [];
    const found = sectionLocation(editor, target.sectionId);
    const pos = editor.state.selection.from;
    if (
      !found ||
      pos < found.pos + 1 ||
      pos > found.pos + found.node.nodeSize - 1
    )
      return [];
    const map = positionMap(found.node, found.pos);
    const caret = map.starts.findIndex((value) => value >= pos);
    return rhetoricalTargetChoices(
      doc,
      target,
      caret < 0 ? map.text.length : caret,
      !editor.state.selection.empty,
    );
  })();
  // Word targeting is a view of the saved action, not a destructive change to it.
  const action = (
    isLensTarget ? "words" : currentWorkbench.action
  ) as WritingAction;
  const patchWorkbench = (
    fn: (wb: SectionWorkbench) => SectionWorkbench,
    owner = sectionId,
  ) => update((d) => updateWorkbench(d, owner, fn));
  const setField = <K extends keyof SectionWorkbench>(
    key: K,
    value: SetStateAction<SectionWorkbench[K]>,
  ) =>
    patchWorkbench((wb) => ({
      ...wb,
      [key]:
        typeof value === "function"
          ? (value as (old: SectionWorkbench[K]) => SectionWorkbench[K])(
              wb[key],
            )
          : value,
    }));
  const setDraftField = (
    key: "instruction" | "answer",
    value: SetStateAction<string>,
  ) => {
    const activeTarget = documentWorkbench
      ? null
      : (historicalDraftTarget ?? targetRef.current);
    const owner = documentWorkbench
      ? null
      : (activeTarget?.sectionId ?? sectionId);
    if (activeTarget && !historicalDraftTarget)
      explicitFocusIntent.current = true;
    patchWorkbench(
      (wb) =>
        patchTargetDraft(wb, activeTarget, {
          [key]:
            typeof value === "function"
              ? value(getTargetDraft(wb, activeTarget)[key])
              : value,
        }),
      owner,
    );
  };
  const setInstruction = (v: SetStateAction<string>) =>
    setDraftField("instruction", v);
  const setAnswer = (v: SetStateAction<string>) => setDraftField("answer", v);
  const responseAnswer =
    activeRun && responseTarget
      ? (currentWorkbench.questionAnswers[activeRun.id] ??
        (activeRun.stage
          ? ""
          : getTargetDraft(currentWorkbench, responseTarget).answer))
      : answer;
  const setResponseAnswer = (value: string) => {
    if (!responseTarget || !activeRun) return setAnswer(value);
    patchWorkbench(
      (wb) => ({
        ...patchTargetDraft(wb, responseTarget, { answer: value }),
        questionAnswers: { ...wb.questionAnswers, [activeRun.id]: value },
      }),
      responseTarget.scope === "document" ? null : responseTarget.sectionId,
    );
  };
  const setAction = (v: SetStateAction<WritingAction>) =>
    patchWorkbench((wb) => ({
      ...wb,
      action: typeof v === "function" ? v(wb.action as WritingAction) : v,
    }));
  const setControls = (v: SetStateAction<SectionWorkbench["controls"]>) =>
    setField("controls", v);
  const setLens = (v: SetStateAction<LensOptions>) => setField("lens", v);
  const setOneOffModel = (v: ModelRef | null) =>
    patchWorkbench((wb) => ({
      ...wb,
      oneOffModel: v,
      runChain: v === null ? null : wb.runChain,
      clearedChainRunId: v === null ? wb.activeRunId : null,
    }));
  const setCompareModels = (v: SetStateAction<ModelRef[]>) =>
    setField("compareModels", v);
  const inspectDocumentRun = (id: string) => {
    const run = getWorkbench(current.current, null).runs.find(
      (item) => item.id === id,
    );
    if (!run) return setError("That saved critique is no longer available.");
    update((d) => updateWorkbench(d, null, (wb) => inspectRun(wb, id)));
    selectExactTarget(documentTarget(current.current));
  };
  const inspectSectionRun = (sectionId: string, runId: string) => {
    const run = getWorkbench(current.current, sectionId).runs.find(
      (item) => item.id === runId,
    );
    if (!run || run.target.documentId !== current.current.id) return;
    update((d) => updateWorkbench(d, sectionId, (wb) => inspectRun(wb, runId)));
    inspectHistoricalTarget(run);
  };
  const revealCurrentPassage = (passage: EditTarget) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!editor || !scrollPreviewToTarget(editor, passage))
          scrollPreviewToSection(passage.sectionId!, false, true);
      }),
    );
  const useCurrentPassage = () => {
    const inspection = inspectionRef.current;
    if (!inspection) return;
    const run = getWorkbench(current.current, inspection.sectionId).runs.find(
      (item) => item.id === inspection.runId,
    );
    if (!run) return;
    const resolution = resolveHistoricalTarget(current.current, run.target);
    if (resolution.status !== "changed") {
      changeInspection({ ...inspection, resolution, confirmed: false });
      return;
    }
    selectExactTarget(resolution.current);
    changeInspection({ ...inspection, resolution, confirmed: true });
    revealCurrentPassage(resolution.current);
  };
  const returnToCurrentPassage = () => {
    const inspection = inspectionRef.current;
    if (!inspection) return;
    const run = getWorkbench(current.current, inspection.sectionId).runs.find(
      (item) => item.id === inspection.runId,
    );
    if (!run) return;
    const resolution = resolveHistoricalTarget(current.current, run.target);
    changeInspection({ ...inspection, resolution, confirmed: false });
    if (resolution.status !== "changed") return;
    selectExactTarget(resolution.current);
    revealCurrentPassage(resolution.current);
  };
  const selectRun = (id: string) => {
    const run = getWorkbench(current.current, sectionId).runs.find(
      (r) => r.id === id,
    );
    if (!run) return;
    if (run.target.scope === "document") return inspectDocumentRun(id);
    patchWorkbench((wb) => inspectRun(wb, id));
    // Historical targets remain inspectable even when stale. Apply still validates.
    inspectHistoricalTarget(run);
  };
  const structure = currentWorkbench.structure ?? emptyStructure();
  const setStructure = (value: SetStateAction<StructureDraft>) =>
    patchWorkbench((wb) => ({
      ...wb,
      structure:
        typeof value === "function"
          ? value(wb.structure ?? emptyStructure())
          : value,
    }));
  const segmentThoughts = () =>
    setStructure((previous) => ({
      ...previous,
      units: segmentRawThoughts(previous.raw),
    }));
  const assembleStructure = (template: string): string => {
    const draft =
      getWorkbench(current.current, sectionId).structure ?? emptyStructure();
    return renderScaffold(
      template,
      draft.thoughtA,
      draft.thoughtB,
      draft.optionalSlot,
    );
  };
  const previewStructure = (template?: string): string => {
    const draft =
      getWorkbench(current.current, sectionId).structure ?? emptyStructure();
    const selected = getRelationship(draft.relationship).scaffolds.find(
      (option) => option.id === draft.scaffoldId,
    );
    return assembleStructure(
      template ??
        selected?.template ??
        scaffoldsFor(draft.relationship, draft.register)[0]?.template ??
        "[X] [Y]",
    );
  };
  const structureInput = (
    mode: StructureRequest["mode"],
    template: string,
  ): StructureRequest => {
    if (
      !target ||
      target.scope === "document" ||
      sectionId !== target.sectionId
    )
      throw new Error(
        "Select a local section target before working with structure.",
      );
    const draft =
      getWorkbench(current.current, sectionId).structure ?? emptyStructure();
    const preview = renderScaffold(
      template,
      draft.thoughtA,
      draft.thoughtB,
      draft.optionalSlot,
    );
    if (
      mode === "tighten" &&
      (!draft.thoughtA.trim() ||
        !draft.thoughtB.trim() ||
        /\[[^\]]+\]/u.test(preview) ||
        !preview.trim())
    )
      throw new Error(
        "Fill thoughts A and B and every scaffold slot before staging or tightening.",
      );
    return { mode, draft: structuredClone(draft), scaffold: template, preview };
  };
  const previewLibraryItem = (item: LibraryItem): void => {
    try {
      const savedItem = libraryRef.current.items.find(
        (saved) => saved.id === item.id,
      );
      if (!savedItem)
        throw new Error("That saved item is no longer in your library.");
      if (savedItem.kind !== "snippet" && savedItem.kind !== "style_example")
        throw new Error(
          "Only snippets and style examples can be previewed as exact text.",
        );
      if (!target || target.scope === "document")
        throw new Error("Select a local target first.");
      validateTarget(current.current, target);
      const run = makeHumanRun({
        target,
        workbench: {
          ...getWorkbench(current.current, target.sectionId),
          ...getTargetDraft(
            getWorkbench(current.current, target.sectionId),
            target,
          ),
          controls: {
            ...getWorkbench(current.current, target.sectionId).controls,
            libraryItemId: savedItem.id,
          },
        },
        text: savedItem.content,
        title: savedItem.title,
        provider: "human-library",
        instruction: `Preview saved library item ${savedItem.id}: ${savedItem.title}`,
      });
      update((d) => appendRun(d, run));
      setDocumentWorkbench(false);
      setNotice("Saved text staged. Apply explicitly to change the target.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const stageStructure = (template: string): void => {
    try {
      if (!target || target.scope === "document")
        throw new Error("Select a local target first.");
      validateTarget(current.current, target);
      const input = structureInput("tighten", template);
      const run = makeHumanRun({
        target,
        workbench: {
          ...getWorkbench(current.current, target.sectionId),
          ...getTargetDraft(
            getWorkbench(current.current, target.sectionId),
            target,
          ),
        },
        text: input.preview,
        title: "User-assembled structure",
        provider: "human-structure",
        instruction:
          "Preview the user-filled scaffold exactly. Apply only after explicit acceptance.",
        structure: input,
      });
      update((d) => appendRun(d, run));
      setDocumentWorkbench(false);
      setNotice("Structure staged. Apply explicitly to change the target.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const selectedSection = doc.sections.find((s) => s.id === sectionId);
  const libraryContext = {
    sectionKind: selectedSection?.kind,
    contentType: doc.brief.contentType,
    audience: doc.brief.audience,
    register: settings.styleDNA.register,
  };
  const relevantItems = relevantLibraryItems(library.items, libraryContext);
  const briefItems = contextualBrief(
    doc,
    target,
    action,
    isDeliveryTarget && lens.view === "delivery",
  );
  const selectedBrief =
    target &&
    briefDraft?.documentId === doc.id &&
    briefDraft.key === guidanceKey(target)
      ? briefDraft.items
      : [];
  const attachBrief = (item: SavedBriefContext) => {
    if (!target) return;
    const key = guidanceKey(target);
    setBriefDraft((previous) => {
      const currentItems =
        previous?.documentId === doc.id && previous.key === key
          ? previous.items
          : [];
      if (
        currentItems.some(
          (entry) => entry.field === item.field && entry.value === item.value,
        ) ||
        currentItems.length >= 3
      )
        return previous;
      return { documentId: doc.id, key, items: [...currentItems, item] };
    });
  };
  const removeBrief = (item: SavedBriefContext) =>
    setBriefDraft((previous) =>
      previous
        ? {
            ...previous,
            items: previous.items.filter(
              (entry) =>
                !(entry.field === item.field && entry.value === item.value),
            ),
          }
        : null,
    );
  const contextualItems = contextualGuidance({
    doc,
    target,
    action,
    styleDNA: settings.styleDNA,
    library,
  });
  const contextualVisibleItems = contextualItems.filter(
    (item) => !isGuidanceDismissed(doc, item, target, action),
  );
  const contextualHiddenItems = contextualItems.filter((item) =>
    isGuidanceDismissed(doc, item, target, action),
  );
  const dismissGuidance = (item: SavedGuidance) => {
    if (!target) return;
    update((currentDoc) => {
      const context = guidanceContext(currentDoc, target, action);
      if (!context || isGuidanceDismissed(currentDoc, item, target, action))
        return currentDoc;
      return {
        ...currentDoc,
        guidanceDismissals: [
          ...currentDoc.guidanceDismissals,
          { ...context, identity: guidanceIdentity(item) },
        ],
      };
    });
  };
  const restoreGuidance = (item: SavedGuidance) => {
    if (!target) return;
    update((currentDoc) => {
      const context = guidanceContext(currentDoc, target, action);
      return context
        ? {
            ...currentDoc,
            guidanceDismissals: currentDoc.guidanceDismissals.filter(
              (dismissal) =>
                !(
                  dismissal.sectionId === context.sectionId &&
                  dismissal.context === context.context &&
                  dismissal.identity === guidanceIdentity(item)
                ),
            ),
          }
        : currentDoc;
    });
  };
  const selectedGuidance =
    target &&
    guidanceDraft?.documentId === doc.id &&
    guidanceDraft.key === guidanceKey(target)
      ? guidanceDraft.items
      : [];
  const attachGuidance = (item: SavedGuidance) => {
    if (!target) return;
    const key = guidanceKey(target);
    setGuidanceDraft((previous) => {
      const currentItems =
        previous?.documentId === doc.id && previous.key === key
          ? previous.items
          : [];
      if (
        currentItems.some(
          (entry) =>
            entry.source === item.source &&
            entry.itemId === item.itemId &&
            entry.key === item.key,
        ) ||
        currentItems.length >= 3
      )
        return previous;
      return { documentId: doc.id, key, items: [...currentItems, item] };
    });
  };
  const removeGuidance = (item: SavedGuidance) =>
    setGuidanceDraft((previous) =>
      previous
        ? {
            ...previous,
            items: previous.items.filter(
              (entry) =>
                !(
                  entry.source === item.source &&
                  entry.itemId === item.itemId &&
                  entry.key === item.key
                ),
            ),
          }
        : null,
    );
  const resolvedStyle = resolveWritingStyle({
    global: settings.styleDNA,
    library,
    context: libraryContext,
    sectionNotes: selectedSection?.notes,
    instruction,
  });
  const chainModel = activeRun
    ? !target ||
      !sameFocusTarget(activeRun.target, target) ||
      currentWorkbench.clearedChainRunId === activeRun.id
      ? null
      : (activeRun.chainModel ??
        (activeRun.response.routeSource === "action" ? activeRun.model : null))
    : currentWorkbench.runChain &&
        target &&
        sameFocusTarget(currentWorkbench.runChain.target, target)
      ? currentWorkbench.runChain.model
      : null;
  const effectiveModel = resolveModel({
    oneOff: oneOffModel ?? chainModel,
    sectionOverride: selectedSection?.modelOverride,
    sectionType: selectedSection?.kind,
    task: action,
    documentDefault: doc.defaultModel,
    preferences: settings.routing,
    applicationDefault: catalog?.applicationDefault ?? {
      providerId: "mock",
      modelId: "conservative",
    },
  });
  const setSectionModel = (model: ModelRef | null) => {
    if (sectionId)
      update((d) => ({
        ...d,
        sections: d.sections.map((s) =>
          s.id === sectionId ? { ...s, modelOverride: model } : s,
        ),
      }));
  };
  const setDocumentModel = (model: ModelRef | null) =>
    update((d) => ({ ...d, defaultModel: model }));

  const operate = async (
    stage: "diagnose" | "propose",
    override?: WritingAction,
    lensMode?: LensOptions["mode"],
    comparing = false,
    explicitTarget?: EditTarget,
    structureInput?: StructureRequest,
  ) => {
    if (requestBusy.current || navigating.current) return;
    const historical =
      activeRun?.target.sectionId === targetRef.current?.sectionId &&
      (activeRun?.target.scope === "selection" ||
        activeRun?.target.scope === "word")
        ? resolveHistoricalTarget(current.current, activeRun.target)
        : null;
    if (!override && historical && historical.status !== "exact") {
      const fresh =
        targetRef.current &&
        editor &&
        !editor.state.selection.empty &&
        (targetRef.current.scope === "word" ||
          targetRef.current.scope === "selection") &&
        current.current.sections.some(
          (section) =>
            section.id === targetRef.current?.sectionId &&
            sectionText(section) === targetRef.current?.sectionSnapshot,
        );
      if (
        (stage === "propose" && !lensMode) ||
        (!inspectionRef.current?.confirmed && !fresh)
      ) {
        setError(
          stage === "propose" && !lensMode
            ? "Diagnose a freshly selected passage before proposing changes."
            : "Select a new target or choose Use current passage before running the Lab.",
        );
        return;
      }
    }
    let activeCatalog: ProviderCatalog;
    try {
      activeCatalog = await refreshCatalog();
    } catch {
      setError(
        "Provider status is unavailable. Reconnect to the server before running the Lab.",
      );
      return;
    }
    if (requestBusy.current || navigating.current) return;
    const chosen = structureInput
      ? "structure"
      : lensMode
        ? "words"
        : (override ?? action);
    const t =
      explicitTarget ??
      (structureInput
        ? targetRef.current
        : override
          ? documentTarget(current.current)
          : lensMode || comparing || stage === "diagnose"
            ? targetRef.current
            : responseTarget);
    if (!t)
      return setError(
        "Select text within one section. Cross-section selections are read-only.",
      );
    if (stage === "propose" && t.scope === "document")
      return setError(
        "Whole-piece work is analysis-only. Select a passage for a local proposal.",
      );
    const owner = t.scope === "document" ? null : t.sectionId;
    const wb = getWorkbench(current.current, owner);
    const followupModel =
      stage === "propose" &&
      activeRun &&
      wb.clearedChainRunId !== activeRun.id &&
      sameFocusTarget(activeRun.target, t)
        ? (activeRun.chainModel ??
          (activeRun.response.routeSource === "action"
            ? activeRun.model
            : null))
        : null;
    const retryModel =
      stage === "diagnose" &&
      !activeRun &&
      wb.runChain &&
      sameFocusTarget(wb.runChain.target, t)
        ? wb.runChain.model
        : null;
    const chosenOneOff = wb.oneOffModel ?? followupModel ?? retryModel;
    const draft = getTargetDraft(wb, t);
    const selectedModels = [...wb.compareModels];
    if (comparing && (selectedModels.length < 2 || selectedModels.length > 4))
      return setError("Select between two and four models to compare.");
    if (
      comparing &&
      chosenOneOff &&
      !selectedModels.some(
        (model) => modelKey(model) === modelKey(chosenOneOff),
      )
    )
      return setError(
        "This run chain uses a chosen model. Include it in Compare or explicitly change Run with before comparing.",
      );
    if (override && !structureInput) {
      setDocumentWorkbench(true);
      update((d) =>
        updateWorkbench(d, null, (local) => ({ ...local, action: chosen })),
      );
    }
    const section = current.current.sections.find((s) => s.id === owner);
    const route = resolveModel({
      oneOff: chosenOneOff,
      sectionOverride: section?.modelOverride,
      sectionType: section?.kind,
      task: chosen,
      documentDefault: current.current.defaultModel,
      preferences: settingsRef.current.routing,
      applicationDefault: activeCatalog.applicationDefault,
    });
    const chosenProvider = activeCatalog.providers.find(
      (provider) => provider.id === route.model.providerId,
    );
    const chosenDescriptor = chosenProvider?.models.find(
      (model) => model.id === route.model.modelId,
    );
    if (
      !chosenProvider?.configured ||
      !chosenProvider.enabled ||
      !chosenProvider.implemented ||
      !chosenDescriptor
    )
      return setError(
        "The chosen provider/model is unavailable for this step. Change the model explicitly before continuing; no fallback was used.",
      );
    if (chosenDescriptor.capabilities.structuredOutput === false)
      return setError(
        "The chosen model cannot return structured writing results. Change the provider/model explicitly; no fallback was used.",
      );
    const answerForRequest =
      stage === "propose" && activeRun && sameFocusTarget(activeRun.target, t)
        ? (wb.questionAnswers[activeRun.id] ??
          (activeRun.stage ? "" : draft.answer))
        : draft.answer;
    const guidanceForRequest =
      target && guidanceKey(target) === guidanceKey(t) ? selectedGuidance : [];
    const briefForRequest =
      target && guidanceKey(target) === guidanceKey(t) ? selectedBrief : [];
    const capture: RunCapture = {
      stage,
      guidance: guidanceForRequest,
      briefContext: briefForRequest,
      ...(chosen === "words"
        ? {
            lens: {
              ...wb.lens,
              mode:
                lensMode ??
                (stage === "diagnose"
                  ? ("explore" as const)
                  : ("replace" as const)),
            },
          }
        : {}),
      target: t,
      action: chosen,
      instruction: draft.instruction,
      answer:
        structureInput && !answerForRequest.trim()
          ? structureInput.preview
          : stage === "diagnose" && !structureInput
            ? ""
            : answerForRequest,
      ...(structureInput ? { structure: structureInput } : {}),
      controls: { ...wb.controls },
      model: route.model,
      ...(chosenOneOff ? { chainModel: chosenOneOff } : {}),
      question:
        wb.runs.find((r) => r.id === wb.activeRunId)?.response.question ?? "",
    };
    requestBusy.current = true;
    setBusy(true);
    setRunning({
      label: comparing
        ? `Comparing ${selectedModels.length} models…`
        : stage === "propose"
          ? "Proposing…"
          : chosen === "critique"
            ? "Analyzing the draft…"
            : "Analyzing…",
      models: comparing ? selectedModels : [route.model],
    });
    setError("");
    try {
      await settingsQueue.current;
      await flushLibrary();
      validateTarget(current.current, t);
      const request: AIRequest = {
        readContext: {
          document: current.current,
          styleDNA: settingsRef.current.styleDNA,
          // Library records are loaded and scoped by the backend, not echoed wholesale.
          resolvedStyle: resolveWritingStyle({
            global: settingsRef.current.styleDNA,
            library: libraryRef.current,
            context: {
              sectionKind: section?.kind,
              contentType: current.current.brief.contentType,
              audience: current.current.brief.audience,
              register:
                structureInput?.draft.register ??
                settingsRef.current.styleDNA.register,
            },
            sectionNotes: section?.notes,
            instruction: capture.instruction,
          }),
          knowledgePacks: settingsRef.current.knowledgePacks,
          approvedLanguage: settingsRef.current.radar.filter(
            (r) => r.status !== "maybe",
          ),
        },
        ...(structureInput ? { structure: structureInput } : {}),
        editTarget: t,
        ...(capture.guidance?.length
          ? { explicitGuidance: capture.guidance }
          : {}),
        ...(capture.briefContext?.length
          ? { explicitBriefContext: capture.briefContext }
          : {}),
        action: chosen,
        stage,
        instruction: capture.instruction,
        answer: capture.answer,
        controls: capture.controls,
        variantCount: requestedVariantShape(capture.instruction)?.min ?? 2,
        modelOverride: comparing ? null : chosenOneOff,
        ...(chosen === "words"
          ? {
              lens: {
                ...wb.lens,
                mode:
                  lensMode ?? (stage === "diagnose" ? "explore" : "replace"),
              },
            }
          : {}),
      };
      // Consume only the captured single-operation override. Persistent routes are untouched.
      if (wb.oneOffModel)
        update((d) =>
          updateWorkbench(d, owner, (local) => ({
            ...local,
            oneOffModel: null,
            runChain: { model: wb.oneOffModel!, target: t },
          })),
        );
      else if (
        stage === "propose" &&
        followupModel &&
        (!wb.runChain ||
          modelKey(wb.runChain.model) !== modelKey(followupModel) ||
          !sameFocusTarget(wb.runChain.target, t))
      )
        update((d) =>
          updateWorkbench(d, owner, (local) => ({
            ...local,
            runChain: { model: followupModel, target: t },
          })),
        );
      if (lensMode)
        update((d) =>
          updateWorkbench(d, owner, (local) => ({
            ...local,
            lens: { ...local.lens, mode: lensMode },
          })),
        );
      if (comparing) {
        const result = await api<{
          results: { model: ModelRef; response?: AIResponse; error?: string }[];
        }>("/ai/compare", "POST", { request, models: selectedModels });
        const failures: string[] = [];
        for (const item of result.results) {
          if (!item.response) {
            failures.push(item.error ?? "A comparison model failed.");
            continue;
          }
          const run = makeRun(
            { ...capture, model: item.model },
            { ...item.response, model: item.response.model ?? item.model },
          );
          update((d) => appendRun(d, run, capture.question, true));
        }
        if (failures.length) setError(failures.join(" "));
      } else {
        const result = await api<AIResponse>("/ai", "POST", request);
        const run = makeRun(capture, result);
        update((d) =>
          appendRun(
            stage === "diagnose" && !wb.oneOffModel && wb.runChain
              ? updateWorkbench(d, owner, (local) => ({
                  ...local,
                  runChain: null,
                }))
              : d,
            run,
            capture.question,
          ),
        );
      }
      if (guidanceForRequest.length) setGuidanceDraft(null);
      if (briefForRequest.length) setBriefDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      requestBusy.current = false;
      setBusy(false);
      setRunning(null);
    }
  };
  const runStructure = async (
    mode: StructureRequest["mode"],
    template: string,
  ): Promise<void> => {
    try {
      const input = structureInput(mode, template);
      await operate(
        mode === "tighten" ? "propose" : "diagnose",
        undefined,
        undefined,
        false,
        undefined,
        input,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const ask = (stage: "diagnose" | "propose", override?: WritingAction) => {
    if (!override && action === "structure") {
      const draft =
        getWorkbench(current.current, sectionId).structure ?? emptyStructure();
      const options = scaffoldsFor(draft.relationship, draft.register);
      const template =
        draft.customTemplate ||
        options.find((s) => s.id === draft.scaffoldId)?.template ||
        options[0].template;
      return runStructure(
        stage === "propose" ? "tighten" : "analyze",
        template +
          (draft.optionalSlot && !template.includes("[Z]") ? "\n[Z]" : ""),
      );
    }
    return operate(stage, override);
  };
  const stageCurrentPassage = (runId: string): void => {
    const run = current.current.sections
      .flatMap((section) => section.workbench?.runs ?? [])
      .find((item) => item.id === runId);
    const resolution =
      run && resolveHistoricalTarget(current.current, run.target);
    if (!run || !resolution || resolution.status !== "changed") return;
    const currentTarget = resolution.current;
    selectExactTarget(currentTarget);
    changeInspection(null);
    update((doc) =>
      updateWorkbench(doc, currentTarget.sectionId, (local) => ({
        ...patchTargetDraft(local, currentTarget, {
          instruction: "",
          answer: "",
        }),
        activeRunId: null,
        oneOffModel: null,
        runChain: null,
        clearedChainRunId: run.id,
      })),
    );
    setStagedPassage({
      documentId: current.current.id,
      sourceRunId: run.id,
      target: currentTarget,
    });
  };
  const cancelStagedPassage = () => {
    const sourceRunId = stagedCurrentPassage?.sourceRunId;
    setStagedPassage(null);
    if (sourceRunId) selectRun(sourceRunId);
  };
  const askFollowUp = async (
    runId: string,
    text?: string,
  ): Promise<boolean> => {
    if (requestBusy.current || navigating.current) return false;
    const documentId = current.current.id;
    const owner = current.current.sections.find((section) =>
      section.workbench?.runs.some((run) => run.id === runId),
    );
    const run = owner?.workbench?.runs.find((item) => item.id === runId);
    if (
      !owner ||
      !run?.model ||
      run.target.scope === "document" ||
      activeRun?.id !== runId
    )
      return false;
    const resolution = resolveHistoricalTarget(current.current, run.target);
    if (resolution.status === "unresolved") {
      setError(
        "The original passage cannot be located safely. Select a new target for a new run.",
      );
      return false;
    }
    const last = run.conversation.at(-1);
    const question = last?.role === "writer" ? last.text : (text?.trim() ?? "");
    if (!question) return false;
    if (question.length > 3000) {
      setError(
        "Keep this follow-up under 3,000 characters. Your question has not been sent.",
      );
      return false;
    }
    if (last?.role !== "writer" && run.conversation.length >= 23) {
      setError(
        "This conversation is full. Start a new Lab run for another question; no turns were removed.",
      );
      return false;
    }
    const wb = getWorkbench(current.current, owner.id);
    const chosen = modelForFollowUp(wb, run)!;
    requestBusy.current = true;
    setBusy(true);
    setRunning({ label: "Following up…", models: [chosen] });
    setError("");
    if (last?.role !== "writer")
      update((doc) =>
        updateWorkbench(doc, owner.id, (local) => ({
          ...local,
          runs: local.runs.map((item) =>
            item.id === runId
              ? {
                  ...item,
                  conversation: [
                    ...item.conversation,
                    {
                      id: uid(),
                      role: "writer",
                      text: question,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : item,
          ),
        })),
      );
    try {
      await flush();
      const result = await api<AIResponse>("/ai/follow-up", "POST", {
        documentId,
        runId,
        question,
        modelOverride: chosen,
      });
      if (
        !result.diagnosis.trim() &&
        !result.proposals.some((item) => item.explanation.trim())
      ) {
        setError(
          result.missingIngredients.join(" ") ||
            "No follow-up answer was returned. Your question was kept for retry.",
        );
        return false;
      }
      if (
        current.current.id !== documentId ||
        !current.current.sections.some((section) =>
          section.workbench?.runs.some((item) => item.id === runId),
        )
      )
        return false;
      update((doc) =>
        updateWorkbench(doc, owner.id, (local) => ({
          ...local,
          oneOffModel:
            wb.oneOffModel &&
            local.oneOffModel &&
            modelKey(local.oneOffModel) === modelKey(wb.oneOffModel)
              ? null
              : local.oneOffModel,
          runChain: wb.oneOffModel
            ? { model: chosen, target: run.target }
            : local.runChain,
          runs: local.runs.map((item) =>
            item.id === runId
              ? {
                  ...item,
                  conversation: [
                    ...item.conversation,
                    {
                      id: uid(),
                      role: "assistant",
                      text:
                        [result.diagnosis, result.mechanism]
                          .filter(Boolean)
                          .join("\n\n") ||
                        result.proposals
                          .map((item) => item.explanation)
                          .filter(Boolean)
                          .join("\n\n"),
                      createdAt: new Date().toISOString(),
                      provider: result.provider,
                      model: result.model ?? chosen,
                      ...(result.proposals.length
                        ? {
                            proposals: result.proposals.map((proposal) => ({
                              ...proposal,
                              id: uid(),
                            })),
                          }
                        : {}),
                    },
                  ],
                }
              : item,
          ),
        })),
      );
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      requestBusy.current = false;
      setBusy(false);
      setRunning(null);
    }
  };
  const askLens = (mode: LensOptions["mode"], explicitTarget?: EditTarget) =>
    lens.view === "delivery" && mode === "replace"
      ? setError(
          "Delivery Lens explores choices; select Words/Phrases to request a replacement.",
        )
      : operate(
          mode === "explore" ? "diagnose" : "propose",
          undefined,
          mode,
          false,
          explicitTarget,
        );
  const askAboutCandidate = (t: EditTarget, text: string) => {
    try {
      validateTarget(current.current, t);
      const instruction = `Explain the difference between “${t.text}” and “${text}” in this exact context. Do not rewrite the sentence.`;
      update((d) =>
        updateWorkbench(d, t.sectionId, (wb) =>
          patchTargetDraft(wb, t, { instruction }),
        ),
      );
      selectExactTarget(t);
      return operate("diagnose", undefined, "explore", false, t);
    } catch (error) {
      setError((error as Error).message);
      return Promise.resolve();
    }
  };
  const compare = () =>
    operate("propose", undefined, isLensTarget ? "replace" : undefined, true);
  const proposalText = (id: string, text: string) => {
    if (activeRun)
      update((d) => editRunProposal(d, sectionId, activeRun.id, id, text));
  };
  const applyText = (t: EditTarget, text: string, captureOriginal = true) => {
    if (!editor) throw new Error("Editor unavailable");
    if (t.scope === "document")
      throw new Error("Document analysis cannot replace your writing.");
    validateTarget(current.current, t);
    const range = targetRange(editor, t);
    if (!range) throw new Error("This target changed. Make a fresh selection.");
    const before = sectionLocation(editor, t.sectionId!)!;
    const expected =
      t.scope === "section"
        ? text
        : t.sectionSnapshot.slice(0, t.start) +
          text +
          t.sectionSnapshot.slice(t.end);
    if (expected === t.sectionSnapshot)
      throw new Error(
        "No text changed. The proposal was not recorded as accepted.",
      );
    const scrollPositions = Array.from(
      document.querySelectorAll<HTMLElement>(".inspector, .inspector *"),
    )
      .filter(
        (node) =>
          node.matches(".inspector") || node.scrollHeight > node.clientHeight,
      )
      .map((node) => ({ node, top: node.scrollTop }));
    const restoreScroll = () =>
      scrollPositions.forEach(({ node, top }) => {
        node.scrollTop = top;
      });
    selectingExplicitTarget.current = true;
    try {
      const tr = editor.state.tr;
      if (t.scope === "section") {
        const nodes = paragraphs(text).map((n) =>
          editor.schema.nodeFromJSON(n),
        );
        tr.replaceWith(
          before.pos + 1,
          before.pos + before.node.nodeSize - 1,
          nodes,
        );
      } else tr.insertText(text, range.from, range.to);
      // Select the accepted range in this same transaction. ProseMirror's default
      // replacement selection may otherwise land in the next section.
      let selected = false;
      tr.doc.forEach((node, pos) => {
        if (node.attrs.id !== t.sectionId) return;
        const map = positionMap(node, pos);
        if (map.text !== expected)
          throw new Error(
            "The replacement did not match the requested target text.",
          );
        const start = t.scope === "section" ? 0 : t.start;
        const end =
          t.scope === "section" ? map.text.length : start + text.length;
        const from = map.starts[start] ?? map.ends.at(-1) ?? map.empty;
        const to = end > start ? (map.ends[end - 1] ?? from) : from;
        tr.setSelection(TextSelection.create(tr.doc, from, to));
        selected = true;
      });
      if (!selected) throw new Error("The target section no longer exists.");
      const priorDoc = editor.state.doc;
      editor.view.dispatch(
        allowSectionLocalEdit(closeHistory(tr), t.sectionId!),
      );
      const applied = sectionLocation(editor, t.sectionId!);
      if (
        editor.state.doc.eq(priorDoc) ||
        !applied ||
        positionMap(applied.node, applied.pos).text !== expected
      )
        throw new Error(
          "The editor blocked this replacement. Nothing was recorded as accepted.",
        );
      const acceptedTarget = targetFor(
        current.current,
        t.sectionId!,
        t.scope === "word" && /\s/.test(text.trim()) ? "selection" : t.scope,
        t.scope === "section" ? 0 : t.start,
        t.scope === "section" ? undefined : t.start + text.length,
      );
      if (captureOriginal) {
        const original: Variant = {
          id: uid(),
          label: "Original target",
          text: t.text,
          target: acceptedTarget,
          sourceTarget: t,
          origin: "original",
          createdAt: new Date().toISOString(),
        };
        update((d) => ({
          ...d,
          sections: d.sections.map((s) =>
            s.id === t.sectionId
              ? { ...s, variants: [...s.variants, original] }
              : s,
          ),
        }));
      }
      explicitAnchor.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
        sectionId: t.sectionId!,
        sectionSnapshot: acceptedTarget.sectionSnapshot,
      };
      setTarget(acceptedTarget);
      setDocumentWorkbench(false);
      highlight(editor, acceptedTarget);
      editor.view.dispatch(closeHistory(editor.state.tr));
    } finally {
      selectingExplicitTarget.current = false;
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    }
    setNotice(
      captureOriginal
        ? "Applied only to the target. Original before apply saved as a take."
        : "Activated take in this section. Your other writing is unchanged.",
    );
  };
  const saveFollowUpOption = (runId: string, proposalId: string) => {
    const owner = current.current.sections.find((section) =>
      section.workbench?.runs.some((run) => run.id === runId),
    );
    const run = owner?.workbench?.runs.find((item) => item.id === runId);
    const turn = run?.conversation.find((item) =>
      item.proposals?.some((proposal) => proposal.id === proposalId),
    );
    const proposal = turn?.proposals?.find((item) => item.id === proposalId);
    if (!owner || !run || !proposal) return;
    if (
      owner.variants.some(
        (variant) => variant.runId === runId && variant.text === proposal.text,
      )
    ) {
      setNotice("This option is already saved with this run.");
      return;
    }
    const variant: Variant = {
      id: uid(),
      label: proposal.label,
      text: proposal.text,
      target: run.target,
      origin: "ai",
      model: turn!.model ?? run.model!,
      runId,
      createdAt: new Date().toISOString(),
    };
    update((doc) => ({
      ...doc,
      sections: doc.sections.map((section) =>
        section.id === owner.id
          ? { ...section, variants: [...section.variants, variant] }
          : section,
      ),
    }));
    setNotice("Saved option as a variant. Your draft is unchanged.");
  };
  const useFollowUpOption = (runId: string, proposalId: string) => {
    const run = current.current.sections
      .flatMap((section) => section.workbench?.runs ?? [])
      .find((item) => item.id === runId);
    const proposal = run?.conversation
      .flatMap((turn) => turn.proposals ?? [])
      .find((item) => item.id === proposalId);
    if (!run || !proposal) return;
    try {
      applyText(run.target, proposal.text);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const decide = (id: string, state: "accepted" | "rejected" | "saved") => {
    try {
      const p = response?.proposals.find((p) => p.id === id),
        t = responseTarget;
      if (!p || !t) return;
      if (state === "accepted") {
        applyText(t, p.text);
        const used = activeRun?.controls.libraryItemId;
        if (
          activeRun?.response.provider === "human-library" &&
          typeof used === "string"
        )
          void markLibraryUsed(used).catch((e) => setError(e.message));
      }
      if (state === "saved") {
        const variant: Variant = {
          id: uid(),
          label: p.label,
          text: p.text,
          target: t,
          origin: "ai",
          ...(activeRun?.model ? { model: activeRun.model } : {}),
          ...(activeRun ? { runId: activeRun.id } : {}),
          createdAt: new Date().toISOString(),
        };
        update((d) => ({
          ...d,
          sections: d.sections.map((s) =>
            s.id === t.sectionId
              ? { ...s, variants: [...s.variants, variant] }
              : s,
          ),
        }));
      }
      update((d) => ({
        ...d,
        history: d.history.map((h) => (h.id === id ? { ...h, state } : h)),
      }));
      patchWorkbench(
        (wb) => ({
          ...wb,
          proposalStates: { ...wb.proposalStates, [id]: state },
        }),
        t.scope === "document" ? null : t.sectionId,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const activate = (v: Variant) => {
    try {
      if (v.origin !== "human") return applyText(v.target, v.text);
      const section = current.current.sections.find(
        (item) => item.id === v.target.sectionId,
      );
      const take = section?.variants.find(
        (item) => item.id === v.id && item.origin === "human",
      );
      if (
        !section ||
        !take ||
        v.target.documentId !== current.current.id ||
        v.target.scope !== "section" ||
        v.target.start !== 0 ||
        v.target.end !== v.target.sectionSnapshot.length ||
        v.target.text !== v.target.sectionSnapshot
      )
        throw new Error("This take no longer belongs to an available section.");
      const currentText = sectionText(section);
      if (currentText === take.text)
        return setNotice("This take is already current.");
      const needsTake =
        !!currentText.trim() &&
        !section.variants.some(
          (item) => item.origin !== "ai" && item.text === currentText,
        );
      const leaving = needsTake
        ? saveSectionTake(current.current, section.id)
            .sections.find((item) => item.id === section.id)!
            .variants.at(-1)!
        : null;
      applyText(targetFor(current.current, section.id), take.text, false);
      if (leaving)
        update((doc) => ({
          ...doc,
          sections: doc.sections.map((item) =>
            item.id === section.id
              ? { ...item, variants: [...item.variants, leaving] }
              : item,
          ),
        }));
      setNotice(
        leaving
          ? `Activated ${take.label} · Previous draft saved as ${leaving.label}`
          : `Activated ${take.label}`,
      );
    } catch (e) {
      setError(
        v.origin === "human"
          ? (e as Error).message
          : (e as Error).message +
              " Copy the variant, then make a fresh selection to use it manually.",
      );
    }
  };
  const saveSettings = async (next: Settings) => {
    setSettings(next);
    settingsRef.current = next;
    const operation = settingsQueue.current
      .catch(() => {})
      .then(() => api("/settings", "PUT", next));
    settingsQueue.current = operation;
    try {
      await operation;
      setNotice("Preferences saved");
    } catch (e) {
      setError("Preferences not saved: " + (e as Error).message);
    }
  };
  const defaultLayout = {
    primaryView: "workbench" as const,
    density: "comfortable" as const,
    workbenchVisible: true,
    previewVisible: true,
    inspectorVisible: true,
    paneWidths: { workbench: 50, preview: 30, inspector: 20 },
  };
  const layout = { ...defaultLayout, ...settings.layout };
  const patchLayout = (patch: Partial<NonNullable<Settings["layout"]>>) => {
    const prior = { ...defaultLayout, ...settingsRef.current.layout };
    if (
      Object.entries(patch).every(
        ([key, value]) => prior[key as keyof typeof prior] === value,
      )
    )
      return Promise.resolve();
    return saveSettings({
      ...settingsRef.current,
      layout: { ...prior, ...patch },
    });
  };
  const setPrimaryView = (primaryView: "workbench" | "document") =>
    patchLayout({ primaryView });
  const setDensity = (density: "comfortable" | "overview") =>
    patchLayout({ density });
  const setPreviewVisible = (previewVisible: boolean) =>
    patchLayout({ previewVisible });
  const setWorkbenchVisible = (workbenchVisible: boolean) =>
    patchLayout({ workbenchVisible });
  const setInspectorVisible = (inspectorVisible: boolean) =>
    patchLayout({ inspectorVisible });
  const setPaneWidths = (
    paneWidths: NonNullable<Settings["layout"]>["paneWidths"],
  ) => patchLayout({ paneWidths });
  const applyLayoutPreset = (
    preset: "writing" | "review" | "workbench" | "all" | "reset",
  ) => {
    const base = { ...defaultLayout, ...settingsRef.current.layout };
    const changes = {
      writing: {
        primaryView: "workbench" as const,
        workbenchVisible: true,
        previewVisible: true,
        inspectorVisible: false,
        paneWidths: { workbench: 70, preview: 30, inspector: 20 },
      },
      review: {
        primaryView: "document" as const,
        workbenchVisible: true,
        previewVisible: true,
        inspectorVisible: true,
        paneWidths: { workbench: 25, preview: 50, inspector: 25 },
      },
      workbench: {
        primaryView: "workbench" as const,
        workbenchVisible: true,
        previewVisible: false,
        inspectorVisible: false,
        paneWidths: { workbench: 70, preview: 30, inspector: 20 },
      },
      all: {
        primaryView: "workbench" as const,
        workbenchVisible: true,
        previewVisible: true,
        inspectorVisible: true,
        paneWidths: { workbench: 50, preview: 30, inspector: 20 },
      },
      reset: defaultLayout,
    }[preset];
    return patchLayout({ ...base, ...changes });
  };
  const setSectionTypeModel = (model: ModelRef | null) => {
    if (!selectedSection) return;
    const routing = routingPreferencesSchema.parse(
      settingsRef.current.routing ?? {},
    );
    if (model) routing.sectionTypeDefaults[selectedSection.kind] = model;
    else delete routing.sectionTypeDefaults[selectedSection.kind];
    return saveSettings({ ...settingsRef.current, routing });
  };
  const setTaskModel = (task: string, model: ModelRef | null) => {
    const routing = routingPreferencesSchema.parse(
      settingsRef.current.routing ?? {},
    );
    if (model) routing.taskDefaults[task] = model;
    else delete routing.taskDefaults[task];
    return saveSettings({ ...settingsRef.current, routing });
  };
  const refreshRadar = async (query: string) => {
    if (!health.webResearch || requestBusy.current || navigating.current)
      return;
    requestBusy.current = true;
    setBusy(true);
    try {
      await flush();
      await settingsQueue.current;
      const { items } = await api<{ items: Settings["radar"] }>(
        "/culture/refresh",
        "POST",
        { query, documentId: current.current.id },
      );
      await saveSettings({
        ...settingsRef.current,
        radar: [
          ...settingsRef.current.radar,
          ...items.filter(
            (item) => !settingsRef.current.radar.some((r) => r.id === item.id),
          ),
        ],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard");
    } catch {
      setError(
        "Clipboard access was blocked. Select and copy the text manually.",
      );
    }
  };
  const copyDocument = async () => {
    try {
      if (!editor) throw new Error("No editor");
      const html = document.createElement("div");
      html.innerHTML = editor.getHTML();
      const draftIds = new Set(draftSections(current.current).map((s) => s.id));
      html
        .querySelectorAll("section[data-writing-section]")
        .forEach((section) => {
          if (!draftIds.has(section.id)) section.remove();
        });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([documentText(current.current)], {
            type: "text/plain",
          }),
          "text/html": new Blob([html.innerHTML], { type: "text/html" }),
        }),
      ]);
      setNotice("Copied document with formatting");
    } catch {
      await copy(documentText(current.current));
    }
  };
  const draftRevision =
    doc.draftRevision +
    Number(
      persisted.current.id === doc.id &&
        hasAuthoredDraftChange(persisted.current, doc),
    );
  const revisionHasChanges = useMemo(
    () =>
      !!doc.revisionCheckpoint &&
      !checkpointMatchesDraft(doc.revisionCheckpoint, doc, draftRevision),
    [doc.revisionCheckpoint, doc.sections, draftRevision],
  );
  return {
    draftRevision,
    revisionHasChanges,
    layout,
    setPrimaryView,
    setDensity,
    setWorkbenchVisible,
    setPreviewVisible,
    setInspectorVisible,
    setPaneWidths,
    applyLayoutPreset,
    selectedSectionId: target?.sectionId ?? null,
    prepareSectionTarget,
    navigateToSection,
    canCoachTarget,
    showLocalWorkbench: () => setDocumentWorkbench(false),
    addSectionAfter,
    createParkedGroup: (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const id = uid();
      update((doc) => ({
        ...doc,
        parkedGroups: [
          ...doc.parkedGroups,
          { id, name: trimmed, collapsed: false },
        ],
      }));
      return id;
    },
    renameParkedGroup: (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      update((doc) => ({
        ...doc,
        parkedGroups: doc.parkedGroups.map((group) =>
          group.id === id ? { ...group, name: trimmed } : group,
        ),
      }));
    },
    deleteParkedGroup: (id: string) => {
      const group = current.current.parkedGroups.find((item) => item.id === id);
      if (!group) return false;
      if (
        current.current.sections.some(
          (section) =>
            section.placement === "parked" && section.parkedGroupId === id,
        )
      ) {
        setNotice(
          `Move its parked thoughts to Ungrouped before deleting “${group.name}”.`,
        );
        return false;
      }
      update((doc) => ({
        ...doc,
        parkedGroups: doc.parkedGroups.filter((item) => item.id !== id),
      }));
      setNotice(`Deleted group “${group.name}”.`);
      return true;
    },
    setParkedGroupCollapsed: (id: string, collapsed: boolean) =>
      update((doc) => ({
        ...doc,
        parkedGroups: doc.parkedGroups.map((group) =>
          group.id === id ? { ...group, collapsed } : group,
        ),
      })),
    moveParkedToGroup: (id: string, groupId: string | null) => {
      try {
        const next = moveParkedSectionToGroup(current.current, id, groupId);
        sync({
          ...next,
          parkedGroups: next.parkedGroups.map((group) =>
            group.id === groupId ? { ...group, collapsed: false } : group,
          ),
        });
        focusSection(id);
      } catch (error) {
        setError((error as Error).message);
      }
    },
    parkThought: (id: string) => {
      try {
        sync(parkSection(current.current, id));
        focusSection(id);
        setNotice(
          "Thought parked. It stays in this project, outside the reader draft.",
        );
      } catch (error) {
        setError((error as Error).message);
      }
    },
    includeThought: (id: string, beforeId: string | null) => {
      try {
        sync(includeSectionAt(current.current, id, beforeId));
        focusSection(id);
        setNotice("Thought included at the chosen draft position.");
      } catch (error) {
        setError((error as Error).message);
      }
    },
    captureThought,
    addSource,
    focusSentence,
    insertion,
    closeInsertion: () => setInsertion(null),
    requestSectionInsertion,
    insertSection,
    duplicateSection,
    setRevisionCheckpoint,
    createRevisionIntent,
    editRevisionIntent,
    completeRevisionIntent,
    removeRevisionIntent,
    saveTake,
    deleteSection,
    library,
    libraryReady,
    librarySaveState,
    saveLibrary,
    updateLibrary,
    flushLibrary,
    saveLibraryItem,
    updateLibraryItem,
    deleteLibraryItem,
    importLibrary,
    markLibraryUsed,
    relevantItems,
    briefItems,
    selectedBrief,
    attachBrief,
    removeBrief,
    contextualItems,
    contextualVisibleItems,
    contextualHiddenItems,
    dismissGuidance,
    restoreGuidance,
    selectedGuidance,
    attachGuidance,
    removeGuidance,
    resolvedStyle,
    previewLibraryItem,
    structure,
    setStructure,
    segmentThoughts,
    assembleStructure,
    previewStructure,
    stageStructure,
    runStructure,
    doc,
    catalog,
    refreshCatalog,
    effectiveModel,
    setSectionModel,
    setDocumentModel,
    setSectionTypeModel,
    setTaskModel,
    oneOffModel,
    chainModel,
    setOneOffModel,
    compareModels,
    setCompareModels,
    compare,
    currentWorkbench,
    localHistory,
    activeRun,
    followUpModel,
    followUpAvailability,
    inspectedTarget: inspectedRunTarget,
    useCurrentPassage,
    returnToCurrentPassage,
    selectRun,
    inspectSectionRun,
    inspectDocumentRun,
    lens,
    setLens,
    isLensTarget,
    isDeliveryTarget,
    rhetoricalTargets,
    selectRhetoricalTarget: (
      kind: (typeof rhetoricalTargets)[number]["kind"],
    ) => {
      const choice = rhetoricalTargets.find((item) => item.kind === kind);
      if (choice) selectExactTarget(choice.target);
    },
    askLens,
    askAboutCandidate,
    documents,
    settings,
    health,
    ready,
    documentSwitching,
    saveState,
    error,
    setError,
    notice,
    setNotice,
    target,
    editor,
    panel,
    setPanel,
    response,
    responseTarget,
    busy,
    running,
    answer,
    setAnswer,
    responseAnswer,
    setResponseAnswer,
    instruction,
    setInstruction,
    action,
    setAction,
    controls,
    setControls,
    proposalStates,
    update,
    sync,
    flush,
    navigate,
    create,
    remove,
    archiveDocuments,
    restoreDocuments,
    deleteManagedDocuments,
    importDoc,
    focusSection,
    noteRevisionContext,
    patchSection,
    moveSection,
    splitSection,
    mergeSection,
    ask,
    askFollowUp,
    stagedCurrentPassage,
    stageCurrentPassage,
    cancelStagedPassage,
    saveFollowUpOption,
    useFollowUpOption,
    proposalText,
    decide,
    activate,
    saveSettings,
    refreshRadar,
    copy,
    copyDocument,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
