import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import {
  type Document,
  type Settings,
  type EditTarget,
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
  type SectionWorkbench,
  type ModelRef,
  type ProviderCatalog,
  type LensOptions,
  type AIRequest,
  resolveModel,
  routingPreferencesSchema,
} from "./domain";
import {
  WritingDocument,
  WritingSectionNode,
  TargetHighlight,
  toEditor,
  fromEditor,
  cursorTarget,
  highlight,
  sectionLocation,
  targetRange,
} from "./editor";
import {
  getWorkbench,
  updateWorkbench,
  isLensTarget as detectsLensTarget,
  makeRun,
  appendRun,
  editRunProposal,
  forkWorkbench,
  inspectRun,
  type RunCapture,
} from "./workspace-helpers";
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
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export type Panel =
  "brief" | "sources" | "style" | "radar" | "history" | "providers" | null;
function forkDocument(doc: Document, title = doc.title): Document {
  const id = uid();
  return {
    ...doc,
    id,
    title,
    revision: 0,
    workbench: forkWorkbench(doc.workbench, id),
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
export function useWorkspace() {
  const initial = useRef(newDocument());
  const [doc, setDoc] = useState(initial.current);
  const current = useRef(doc);
  // Preserve section metadata when rich-editor undo resurrects a removed/reordered node.
  const sectionMetadata = useRef(new Map(doc.sections.map((s) => [s.id, s])));
  const [documents, setDocuments] = useState<Document[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const settingsRef = useRef(settings);
  const settingsQueue = useRef<Promise<unknown>>(Promise.resolve());
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
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [nav, setNav] = useState(() => window.innerWidth > 900);
  const [busy, setBusy] = useState(false);
  const requestBusy = useRef(false);
  const navigating = useRef(false);
  const [documentWorkbench, setDocumentWorkbench] = useState(false);
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const refreshCatalog = useCallback(async () => {
    const next = await api<ProviderCatalog>("/providers");
    setCatalog(next);
    return next;
  }, []);
  const updateRef = useRef<(fn: (d: Document) => Document) => void>(() => {});
  const selectRef = useRef<() => void>(() => {});
  const editor = useEditor({
    autofocus: false,
    extensions: [
      StarterKit.configure({ document: false, trailingNode: false }),
      WritingDocument,
      WritingSectionNode,
      TargetHighlight,
    ],
    content: toEditor(initial.current),
    editorProps: {
      attributes: {
        "data-testid": "writing-editor",
        "aria-label": "Writing editor",
        role: "textbox",
        "aria-multiline": "true",
        class: "writing-editor",
      },
    },
    onUpdate: ({ editor }) => {
      updateRef.current((d) => ({
        ...d,
        sections: fromEditor(editor, [...sectionMetadata.current.values()]),
      }));
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
      while (dirty.current > saved.current) {
        const version = dirty.current,
          snapshot = {
            ...current.current,
            title: current.current.title.trim() || "Untitled",
          };
        setSaveState("Saving");
        try {
          const result = await api<Document>(
            "/documents/" + snapshot.id,
            "PUT",
            snapshot,
          );
          if (current.current.id === snapshot.id) {
            const merged = {
              ...current.current,
              revision: result.revision,
              updatedAt: result.updatedAt,
            };
            current.current = merged;
            setDoc(merged);
            setDocuments((ds) =>
              ds.map((d) => (d.id === merged.id ? merged : d)),
            );
          }
          saved.current = version;
        } catch (e) {
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
    if (!editor || editor.view.composing) return;
    const t = cursorTarget(editor, current.current);
    setTarget(t);
    setDocumentWorkbench(false);
  };
  useEffect(() => {
    if (!editor || isReady.current) return;
    let alive = true;
    (async () => {
      try {
        const [ds, s, h, c] = await Promise.all([
          api<Document[]>("/documents"),
          api<Settings>("/settings"),
          api<typeof health>("/health"),
          api<ProviderCatalog>("/providers").catch(() => null),
        ]);
        if (!alive) return;
        setSettings(s);
        settingsRef.current = s;
        setHealth(h);
        setCatalog(c);
        let active: Document;
        if (dirty.current === 0 && ds.length) active = ds[0];
        else {
          const created = await api<Document>("/documents", "POST", {});
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
        current.current = active;
        sectionMetadata.current = new Map(
          active.sections.map((s) => [s.id, s]),
        );
        setDoc(active);
        setDocuments(ds);
        if (editor) {
          editor.commands.setContent(toEditor(active), { emitUpdate: false });
          editor.view.updateState(
            EditorState.create({
              schema: editor.schema,
              doc: editor.state.doc,
              plugins: editor.state.plugins,
            }),
          );
        }
        setTarget(cursorTarget(editor, active));
        if (document.activeElement === document.body || editor.view.hasFocus())
          editor.view.focus();
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
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current > saved.current || requestBusy.current) {
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
  const sync = (next: Document) => {
    update(() => next);
    editor?.commands.setContent(toEditor(next), { emitUpdate: false });
    setTarget(null);
    if (editor) highlight(editor, null);
  };
  const load = (next: Document) => {
    sectionMetadata.current = new Map(next.sections.map((s) => [s.id, s]));
    current.current = next;
    setDoc(next);
    dirty.current = 0;
    saved.current = 0;
    if (editor) {
      editor.commands.setContent(toEditor(next), { emitUpdate: false });
      editor.view.updateState(
        EditorState.create({
          schema: editor.schema,
          doc: editor.state.doc,
          plugins: editor.state.plugins,
        }),
      );
    }
    setTarget(editor ? cursorTarget(editor, next) : null);
    setDocumentWorkbench(false);
    setSaveState("Saved");
  };
  const navigate = async (id: string) => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    try {
      await flush();
      const next =
        current.current.id === id
          ? current.current
          : documents.find((d) => d.id === id);
      if (next) load(next);
    } catch {
    } finally {
      navigating.current = false;
    }
  };
  const create = async (duplicate = false) => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    try {
      await flush();
      const next = duplicate
        ? await api<Document>("/import", "POST", {
            document: forkDocument(
              current.current,
              current.current.title + " — copy",
            ),
          })
        : await api<Document>("/documents", "POST", {});
      await flush();
      setDocuments((ds) => [...ds, next]);
      load(next);
      editor?.commands.focus("start");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      navigating.current = false;
    }
  };
  const remove = async () => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    try {
      await flush();
      await api("/documents/" + current.current.id, "DELETE");
      const remaining = documents.filter((d) => d.id !== current.current.id);
      setDocuments(remaining);
      if (remaining.length) load(remaining[0]);
      else {
        const next = await api<Document>("/documents", "POST", {});
        setDocuments([next]);
        load(next);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      navigating.current = false;
    }
  };
  const importDoc = async (file: File) => {
    if (requestBusy.current || navigating.current)
      return setError(
        "Finish the current operation before switching documents. Section navigation is still available.",
      );
    navigating.current = true;
    try {
      await flush();
      const parsed = documentSchema.parse(JSON.parse(await file.text()));
      editor?.schema.nodeFromJSON(toEditor(parsed)).check();
      const next = await api<Document>("/import", "POST", {
        document: forkDocument(parsed),
      });
      await flush();
      setDocuments((ds) => [...ds, next]);
      load(next);
    } catch (e) {
      setError("Import failed: " + (e as Error).message);
    } finally {
      navigating.current = false;
    }
  };
  const focusSection = (id: string) => {
    setDocumentWorkbench(false);
    if (!editor) return;
    const loc = sectionLocation(editor, id);
    if (loc) {
      editor.commands.setTextSelection(loc.pos + 2);
      editor.commands.focus();
      const t = targetFor(current.current, id);
      setTarget(t);
      highlight(editor, t);
    }
  };
  const patchSection = (
    id: string,
    patch: Partial<Document["sections"][number]>,
  ) => {
    update((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
    if (editor) {
      const loc = sectionLocation(editor, id);
      if (loc)
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(loc.pos, undefined, {
            ...loc.node.attrs,
            ...patch,
          }),
        );
    }
    setTarget((t) =>
      t?.sectionId === id
        ? targetFor(current.current, id, t.scope, t.start, t.end)
        : t,
    );
  };
  const addSection = () => {
    const next = newSection();
    sync({ ...current.current, sections: [...current.current.sections, next] });
    focusSection(next.id);
  };
  const moveSection = (id: string, to: number) => {
    const next = [...current.current.sections];
    const index = next.findIndex((s) => s.id === id);
    if (to < 0 || to >= next.length || index < 0) return;
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
    const fresh = { ...newSection(old.kind), content: second.toJSON() };
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
  const response = activeRun?.response ?? null;
  const responseTarget = activeRun?.target ?? null;
  const {
    instruction,
    answer,
    controls,
    lens,
    oneOffModel,
    compareModels,
    proposalStates,
  } = currentWorkbench;
  const isLensTarget =
    !documentWorkbench &&
    detectsLensTarget(target, !!editor && !editor.state.selection.empty);
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
  const setInstruction = (v: SetStateAction<string>) =>
    setField("instruction", v);
  const setAnswer = (v: SetStateAction<string>) => setField("answer", v);
  const setAction = (v: SetStateAction<WritingAction>) =>
    patchWorkbench((wb) => ({
      ...wb,
      action: typeof v === "function" ? v(wb.action as WritingAction) : v,
    }));
  const setControls = (v: SetStateAction<SectionWorkbench["controls"]>) =>
    setField("controls", v);
  const setLens = (v: SetStateAction<LensOptions>) => setField("lens", v);
  const setOneOffModel = (v: ModelRef | null) => setField("oneOffModel", v);
  const setCompareModels = (v: SetStateAction<ModelRef[]>) =>
    setField("compareModels", v);
  const selectRun = (id: string) => patchWorkbench((wb) => inspectRun(wb, id));
  const selectedSection = doc.sections.find((s) => s.id === sectionId);
  const effectiveModel = resolveModel({
    oneOff: oneOffModel,
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
  ) => {
    if (requestBusy.current || navigating.current) return;
    const chosen = lensMode ? "words" : (override ?? action);
    const t =
      explicitTarget ??
      (override
        ? documentTarget(current.current)
        : lensMode || comparing || stage === "diagnose"
          ? target
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
    const selectedModels = [...wb.compareModels];
    if (comparing && (selectedModels.length < 2 || selectedModels.length > 4))
      return setError("Select between two and four models to compare.");
    if (override) {
      setDocumentWorkbench(true);
      update((d) =>
        updateWorkbench(d, null, (local) => ({ ...local, action: chosen })),
      );
    }
    const section = current.current.sections.find((s) => s.id === owner);
    const route = resolveModel({
      oneOff: wb.oneOffModel,
      sectionOverride: section?.modelOverride,
      sectionType: section?.kind,
      task: chosen,
      documentDefault: current.current.defaultModel,
      preferences: settingsRef.current.routing,
      applicationDefault: catalog?.applicationDefault ?? {
        providerId: "mock",
        modelId: "conservative",
      },
    });
    const capture: RunCapture = {
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
      instruction: wb.instruction,
      answer: wb.answer,
      controls: { ...wb.controls },
      model: catalog ? route.model : null,
      question:
        wb.runs.find((r) => r.id === wb.activeRunId)?.response.question ?? "",
    };
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      await settingsQueue.current;
      validateTarget(current.current, t);
      const request: AIRequest = {
        readContext: {
          document: current.current,
          styleDNA: settingsRef.current.styleDNA,
          knowledgePacks: settingsRef.current.knowledgePacks,
          approvedLanguage: settingsRef.current.radar.filter(
            (r) => r.status !== "maybe",
          ),
        },
        editTarget: t,
        action: chosen,
        stage,
        instruction: capture.instruction,
        answer: capture.answer,
        controls: capture.controls,
        variantCount: 2,
        modelOverride: comparing ? null : wb.oneOffModel,
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
      if (!comparing && wb.oneOffModel)
        update((d) =>
          updateWorkbench(d, owner, (local) => ({
            ...local,
            oneOffModel: null,
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
        update((d) => appendRun(d, run, capture.question));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };
  const ask = (stage: "diagnose" | "propose", override?: WritingAction) =>
    operate(stage, override);
  const askLens = (mode: LensOptions["mode"], explicitTarget?: EditTarget) =>
    operate(
      mode === "explore" ? "diagnose" : "propose",
      undefined,
      mode,
      false,
      explicitTarget,
    );
  const compare = () =>
    operate("propose", undefined, isLensTarget ? "replace" : undefined, true);
  const proposalText = (id: string, text: string) => {
    if (activeRun)
      update((d) => editRunProposal(d, sectionId, activeRun.id, id, text));
  };
  const applyText = (t: EditTarget, text: string, label: string) => {
    if (!editor) throw new Error("Editor unavailable");
    if (t.scope === "document")
      throw new Error("Document analysis cannot replace your writing.");
    validateTarget(current.current, t);
    const range = targetRange(editor, t);
    if (!range) throw new Error("This target changed. Make a fresh selection.");
    const original: Variant = {
      id: uid(),
      label: "Original · " + label,
      text: t.text,
      target: t,
      origin: "original",
      createdAt: new Date().toISOString(),
    };
    if (t.scope === "section") {
      const loc = sectionLocation(editor, t.sectionId!)!;
      const nodes = paragraphs(text).map((n) => editor.schema.nodeFromJSON(n));
      editor.view.dispatch(
        editor.state.tr.replaceWith(
          loc.pos + 1,
          loc.pos + loc.node.nodeSize - 1,
          nodes,
        ),
      );
    } else
      editor.view.dispatch(
        editor.state.tr.insertText(text, range.from, range.to),
      );
    original.target = targetFor(
      current.current,
      t.sectionId!,
      t.scope,
      t.start,
      t.scope === "section" ? undefined : t.start + text.length,
    );
    update((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id === t.sectionId
          ? { ...s, variants: [...s.variants, original] }
          : s,
      ),
    }));
    editor.commands.focus();
    setNotice("Applied only to the target. Original saved as a variant.");
  };
  const decide = (id: string, state: "accepted" | "rejected" | "saved") => {
    try {
      const p = response?.proposals.find((p) => p.id === id),
        t = responseTarget;
      if (!p || !t) return;
      if (state === "accepted") applyText(t, p.text, p.label);
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
      applyText(v.target, v.text, v.label);
    } catch (e) {
      setError(
        (e as Error).message +
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
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([documentText(current.current)], {
            type: "text/plain",
          }),
          "text/html": new Blob([editor.getHTML()], { type: "text/html" }),
        }),
      ]);
      setNotice("Copied document with formatting");
    } catch {
      await copy(documentText(current.current));
    }
  };
  return {
    doc,
    catalog,
    refreshCatalog,
    effectiveModel,
    setSectionModel,
    setDocumentModel,
    setSectionTypeModel,
    setTaskModel,
    oneOffModel,
    setOneOffModel,
    compareModels,
    setCompareModels,
    compare,
    currentWorkbench,
    localHistory,
    activeRun,
    selectRun,
    lens,
    setLens,
    isLensTarget,
    askLens,
    documents,
    settings,
    health,
    ready,
    saveState,
    error,
    setError,
    notice,
    setNotice,
    target,
    editor,
    panel,
    setPanel,
    nav,
    setNav,
    response,
    responseTarget,
    busy,
    answer,
    setAnswer,
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
    importDoc,
    focusSection,
    patchSection,
    addSection,
    moveSection,
    splitSection,
    mergeSection,
    ask,
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
