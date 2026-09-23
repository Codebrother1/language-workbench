import { describe, expect, expectTypeOf, it } from "vitest";
import {
  documentSchema,
  documentTarget,
  emptyStructure,
  emptyWorkbench,
  newDocument,
  newSection,
  paragraphs,
  sectionKinds,
  sectionText,
  targetFor,
  validateTarget,
  type Document,
  type Iteration,
  type WritingSection,
} from "../packages/domain/src/index";
import {
  duplicateSection,
  insertSectionAt,
  removeSection,
} from "../packages/domain/src/section-operations";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function richDocument(): Document {
  const doc = newDocument("Instance composition", "Alpha beta");
  doc.revision = 7;
  const section = doc.sections[0];
  section.kind = "Point";
  section.label = "My observation";
  section.content = [
    {
      type: "blockquote",
      attrs: { attribution: { name: "Writer" } },
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Alpha beta",
              marks: [
                { type: "bold" },
                {
                  type: "link",
                  attrs: { href: "https://example.com", data: { owned: true } },
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  section.notes = "Keep this distinction.";
  section.modelOverride = { providerId: "local", modelId: "section-model" };
  doc.sections.push(newSection("Evidence", "Other section"));
  const target = targetFor(doc, section.id, "word", 0, 5);
  // Old revision is not an excuse to widen/recompute the captured range.
  target.documentRevision = 2;
  const model = { providerId: "local", modelId: "run-model" };
  const structure = {
    ...emptyStructure(),
    raw: "raw local thoughts",
    thoughtA: "Alpha",
    thoughtB: "beta",
    customTemplate: "[X], except [Y]",
    relationship: "exception" as const,
    units: [{ id: "thought-0", text: "raw local thoughts", start: 0, end: 18 }],
  };
  const wb = emptyWorkbench();
  wb.instruction = "Local instruction";
  wb.answer = "Local answer";
  wb.action = "structure";
  wb.controls = { intensity: 37, preserve: true, mechanism: "contrast" };
  wb.lens = {
    ...wb.lens,
    mode: "replace",
    fidelity: "exact",
    persona: "Writer",
  };
  wb.oneOffModel = { providerId: "local", modelId: "one-off" };
  wb.compareModels = [{ providerId: "local", modelId: "compare" }];
  wb.structure = structure;
  wb.activeRunId = "run-original";
  wb.proposalStates = { "proposal-saved": "saved", "legacy-state": "rejected" };
  wb.runs = [
    {
      id: "run-original",
      createdAt: doc.createdAt,
      target,
      instruction: "Captured instruction",
      answer: "Captured answer",
      action: "words",
      controls: { intensity: 22 },
      model,
      lens: { ...wb.lens },
      structure: {
        mode: "tighten",
        draft: structuredClone(structure),
        scaffold: "[X]",
        preview: "Alpha",
      },
      response: {
        provider: "local",
        model,
        routeSource: "action",
        diagnosis: "Diagnosis",
        mechanism: "Mechanism",
        question: "Which?",
        missingIngredients: [],
        lexical: [],
        proposals: [
          {
            id: "proposal-pending",
            label: "New",
            text: "Gamma",
            explanation: "Specific",
          },
          {
            id: "proposal-saved",
            label: "Saved",
            text: "Delta",
            explanation: "Precise",
          },
        ],
        findings: [
          {
            sectionId: section.id,
            title: "Own",
            detail: "Own detail",
            severity: "note",
          },
          {
            sectionId: doc.sections[1].id,
            title: "Other",
            detail: "Read only",
            severity: "consider",
          },
          {
            sectionId: "merged-dead-section",
            title: "Dead",
            detail: "Historical",
            severity: "note",
          },
          {
            sectionId: null,
            title: "Whole",
            detail: "Context",
            severity: "check",
          },
        ],
      },
    },
  ];
  section.workbench = wb;
  section.variants = [
    {
      id: "variant-original",
      label: "Alternative",
      text: "Gamma",
      target: structuredClone(target),
      createdAt: doc.createdAt,
      origin: "ai",
      model,
      runId: "run-original",
    },
  ];
  doc.history = wb.runs[0].response.proposals.map((p): Iteration => ({
    id: p.id,
    createdAt: doc.createdAt,
    target: structuredClone(target),
    instruction: "Captured instruction",
    coachQuestion: "Which?",
    userAnswer: "Captured answer",
    proposal: p.text,
    state: p.id === "proposal-saved" ? "saved" : "proposed",
    provider: "local",
    model,
    runId: "run-original",
  }));
  doc.history.push({
    ...structuredClone(doc.history[0]),
    id: "other-history",
    target: targetFor(doc, doc.sections[1].id),
  });
  return doc;
}

function expectNoSharedObjects(a: unknown, b: unknown): void {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return;
  expect(a).not.toBe(b);
  for (const key of Object.keys(a))
    expectNoSharedObjects(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    );
}

describe("ordered section instances", () => {
  it("supports unlimited repeated kinds, no Hook/Closer and unusual ordering", () => {
    const doc = newDocument();
    doc.sections = [
      newSection("Sign-off"),
      ...Array.from({ length: 120 }, () => newSection("Point")),
      newSection("Title"),
    ];
    expect(documentSchema.parse(doc).sections).toEqual(doc.sections);
    expectTypeOf<Document["sections"][number]["kind"]>().toEqualTypeOf<
      WritingSection["kind"]
    >();
    expectTypeOf<
      Extract<keyof Document, "point1" | "point2" | "point3">
    >().toEqualTypeOf<never>();
    expect(doc).not.toHaveProperty("point1");
  });

  it("kind is typed metadata, not canonical content, identity or local configuration", () => {
    const doc = richDocument();
    const before = structuredClone(doc.sections[0]);
    const kind: WritingSection["kind"] = "Cliffhanger";
    const converted: WritingSection = { ...doc.sections[0], kind };
    expect(
      documentSchema.parse({ ...doc, sections: [converted] }).sections[0].kind,
    ).toBe(kind);
    expect({ ...converted, kind: before.kind }).toEqual(before);
    expect(sectionText(converted)).toBe("Alpha beta");
  });

  it.each(sectionKinds)(
    "new %s instances inherit no artificial template configuration",
    (kind) => {
      const doc = richDocument();
      const section = newSection(kind);
      const next = insertSectionAt(freeze(doc), section, null);
      expect(next.sections.at(-1)).toEqual(section);
      expect(next.sections.at(-1)?.workbench).toBeUndefined();
      expect(next.sections.at(-1)?.modelOverride).toBeUndefined();
      expect(next.sections.at(-1)?.content).toEqual(paragraphs(""));
      expect(documentSchema.safeParse(next).success).toBe(true);
    },
  );
});

describe("insertSectionAt", () => {
  it.each([0, 1, 2])(
    "inserts strictly at position %i without mutating either input",
    (index) => {
      const doc = richDocument();
      const before = structuredClone(doc);
      const section = freeze(newSection("Point", "Fresh"));
      const next = insertSectionAt(
        freeze(doc),
        section,
        doc.sections[index]?.id ?? null,
      );
      expect(next.sections[index]).toEqual(section);
      expect(next.sections.map((s) => s.id)).toEqual([
        ...before.sections.slice(0, index).map((s) => s.id),
        section.id,
        ...before.sections.slice(index).map((s) => s.id),
      ]);
      expect(doc).toEqual(before);
      expect(next.sections[index]).not.toBe(section);
      expect(next.history).toEqual(before.history);
      expect(next.revision).toBe(before.revision);
    },
  );

  it("rejects an invalid anchor (including empty string) rather than appending", () => {
    const doc = freeze(newDocument());
    for (const anchor of ["missing", ""])
      expect(() => insertSectionAt(doc, newSection(), anchor)).toThrow(
        "Section not found",
      );
  });

  it("rejects duplicate IDs even when kind/label are different", () => {
    const doc = freeze(newDocument());
    expect(() =>
      insertSectionAt(
        doc,
        { ...newSection("Point"), id: doc.sections[0].id },
        null,
      ),
    ).toThrow("ID already exists");
  });
});

describe("duplicateSection", () => {
  it("deep-copies rich marks, notes, model preferences, drafts, structure, lens and controls", () => {
    const doc = richDocument();
    const before = structuredClone(doc);
    const next = duplicateSection(freeze(doc), doc.sections[0].id);
    const source = next.sections[0],
      copy = next.sections[1];
    expect(copy.id).not.toBe(source.id);
    expect(copy.kind).toBe(source.kind);
    expect(copy.label).toBe("My observation — copy");
    for (const key of ["content", "notes", "modelOverride"] as const)
      expect(copy[key]).toEqual(source[key]);
    for (const key of [
      "instruction",
      "answer",
      "action",
      "controls",
      "lens",
      "oneOffModel",
      "compareModels",
      "structure",
    ] as const)
      expect(copy.workbench![key]).toEqual(source.workbench![key]);
    expect(copy.workbench!.runs[0].structure).toEqual(
      source.workbench!.runs[0].structure,
    );
    expectNoSharedObjects(copy, source);
    expectNoSharedObjects(next.history[3], source.workbench!.runs[0]);
    expect(doc).toEqual(before);
    expect(next.sections[2].id).toBe(before.sections[1].id);
    expect(documentSchema.safeParse(next).success).toBe(true);
  });

  it("remaps variants, runs, proposals, state keys, findings and matching history consistently", () => {
    const doc = freeze(richDocument());
    const next = duplicateSection(doc, doc.sections[0].id);
    const copy = next.sections[1],
      wb = copy.workbench!,
      run = wb.runs[0];
    const proposals = run.response.proposals;
    expect(run.id).not.toBe("run-original");
    expect(wb.activeRunId).toBe(run.id);
    expect(copy.variants[0].id).not.toBe("variant-original");
    expect(copy.variants[0].runId).toBe(run.id);
    expect(wb.proposalStates).toEqual({
      [proposals[1].id]: "saved",
      [Object.keys(wb.proposalStates).find((id) => id !== proposals[1].id)!]:
        "rejected",
    });
    expect(wb.proposalStates).not.toHaveProperty("proposal-saved");
    expect(wb.proposalStates).not.toHaveProperty("legacy-state");
    expect(wb.proposalStates[proposals[0].id]).toBeUndefined();
    expect(run.response.findings.map((f) => f.sectionId)).toEqual([
      copy.id,
      doc.sections[1].id,
      "merged-dead-section",
      null,
    ]);
    expect(next.history.slice(0, 3)).toEqual(doc.history);
    expect(next.history).toHaveLength(5);
    next.history.slice(3).forEach((history, index) => {
      expect(history.id).toBe(proposals[index].id);
      expect(history.runId).toBe(run.id);
      expect(history.target.sectionId).toBe(copy.id);
      expect(history.state).toBe(doc.history[index].state);
      expectNoSharedObjects(history, doc.history[index]);
    });
    for (const target of [
      run.target,
      copy.variants[0].target,
      ...next.history.slice(3).map((h) => h.target),
    ]) {
      expect(target).toEqual({
        ...doc.sections[0].variants[0].target,
        sectionId: copy.id,
        documentRevision: doc.revision,
      });
      expect(() => validateTarget(next, target)).not.toThrow();
    }
    const again = duplicateSection(next, copy.id);
    const identities = again.sections.flatMap((s) => [
      s.id,
      ...s.variants.map((v) => v.id),
      ...(s.workbench?.runs ?? []).flatMap((r) => [
        r.id,
        ...r.response.proposals.map((p) => p.id),
      ]),
    ]);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("allows accepting a pending copy proposal locally without modifying source content/history", () => {
    const doc = freeze(richDocument());
    const next = duplicateSection(doc, doc.sections[0].id);
    const copy = next.sections[1],
      run = copy.workbench!.runs[0],
      proposal = run.response.proposals[0];
    validateTarget(next, run.target);
    const text = sectionText(copy);
    copy.content = paragraphs(
      text.slice(0, run.target.start) +
        proposal.text +
        text.slice(run.target.end),
    );
    copy.workbench!.proposalStates[proposal.id] = "accepted";
    next.history.find((h) => h.id === proposal.id)!.state = "accepted";
    expect(sectionText(copy)).toBe("Gamma beta");
    expect(sectionText(next.sections[0])).toBe("Alpha beta");
    expect(next.sections[0]).toEqual(doc.sections[0]);
    expect(next.history.find((h) => h.id === "proposal-pending")!.state).toBe(
      "proposed",
    );
  });

  it("preserves dead, other-section, document and foreign-document historical targets rather than guessing", () => {
    const doc = richDocument();
    const section = doc.sections[0];
    const targets = [
      { ...section.variants[0].target, sectionId: "merged-dead-section" },
      targetFor(doc, doc.sections[1].id),
      documentTarget(doc),
      { ...section.variants[0].target, documentId: "foreign-document" },
    ];
    section.variants = targets.map((target, i) => ({
      ...section.variants[0],
      id: `old-variant-${i}`,
      target,
    }));
    section.workbench!.runs = targets.map((target, i) => ({
      ...structuredClone(section.workbench!.runs[0]),
      id: `old-run-${i}`,
      target,
      response: { ...section.workbench!.runs[0].response, proposals: [] },
    }));
    doc.history = targets.map((target, i) => ({
      ...doc.history[0],
      id: `historical-${i}`,
      target,
    }));
    const next = duplicateSection(freeze(doc), section.id);
    expect(next.sections[1].variants.map((v) => v.target)).toEqual(targets);
    expect(next.sections[1].workbench!.runs.map((r) => r.target)).toEqual(
      targets,
    );
    expect(next.history).toEqual(doc.history);
    expect(() =>
      validateTarget(next, next.sections[1].variants[0].target),
    ).toThrow("no longer exists");
    expect(() =>
      validateTarget(next, next.sections[1].variants[2].target),
    ).toThrow("Document changed");
    expect(() =>
      validateTarget(next, next.sections[1].variants[3].target),
    ).toThrow("different document");
  });

  it("does not repair stale snapshots or widen invalid ranges", () => {
    const doc = richDocument();
    doc.sections[0].variants.push({
      ...structuredClone(doc.sections[0].variants[0]),
      id: "invalid-range",
      target: { ...doc.sections[0].variants[0].target, end: 100 },
    });
    doc.sections[0].variants[0].target.sectionSnapshot = "Earlier content";
    const next = duplicateSection(freeze(doc), doc.sections[0].id);
    expect(() =>
      validateTarget(next, next.sections[1].variants[0].target),
    ).toThrow("section changed");
    expect(() =>
      validateTarget(next, next.sections[1].variants[1].target),
    ).toThrow("Invalid target range");
  });

  it("handles absent optional workbenches and partial legacy metadata without inventing drafts", () => {
    const bare = freeze(newDocument());
    const next = duplicateSection(bare, bare.sections[0].id);
    expect(next.sections[1].workbench).toBeUndefined();
    expect(next.sections[1].variants).toEqual([]);
    const legacy = richDocument();
    legacy.sections[0].workbench = {
      instruction: "Legacy",
      activeRunId: "missing-run",
    } as WritingSection["workbench"];
    legacy.sections[0].variants[0].runId = "missing-run";
    legacy.history[0].runId = "missing-run";
    const result = duplicateSection(freeze(legacy), legacy.sections[0].id);
    const copy = result.sections[1];
    expect(copy.workbench!.instruction).toBe("Legacy");
    expect(copy.workbench!.activeRunId).not.toBe("missing-run");
    expect(copy.variants[0].runId).toBe(copy.workbench!.activeRunId);
    expect(result.history[3].runId).toBe(copy.workbench!.activeRunId);
    expect(copy.workbench!.structure).toBeUndefined();
    expect(documentSchema.safeParse(result).success).toBe(true);
  });

  it("rejects unknown source IDs", () => {
    expect(() => duplicateSection(newDocument(), "missing")).toThrow(
      "Section not found",
    );
  });
});

describe("removeSection", () => {
  it("removes by instance ID, with no kind requirements or history deletion", () => {
    const doc = freeze(richDocument());
    const next = removeSection(
      doc,
      doc.sections[0].id,
      newSection("Closer", "unused"),
    );
    expect(next.sections).toEqual([doc.sections[1]]);
    expect(next.history).toEqual(doc.history);
    expect(doc.sections).toHaveLength(2);
    expect(documentSchema.safeParse(next).success).toBe(true);
  });

  it("replaces the final section with the supplied blank Freeform, retaining historical records", () => {
    const doc = richDocument();
    doc.sections = [doc.sections[0]];
    const empty = freeze(newSection("Freeform"));
    const next = removeSection(freeze(doc), doc.sections[0].id, empty);
    expect(next.sections).toEqual([empty]);
    expect(next.sections[0]).not.toBe(empty);
    expect(next.sections[0].content).toEqual([
      { type: "paragraph", content: [] },
    ]);
    expect(next.history).toEqual(doc.history);
    expect(documentSchema.safeParse(next).success).toBe(true);
    expect(() => validateTarget(next, doc.history[0].target)).toThrow(
      "no longer exists",
    );
  });

  it("rejects unknown IDs, reused replacement IDs, wrong kinds and nonblank replacements", () => {
    const doc = freeze(newDocument());
    expect(() => removeSection(doc, "missing", newSection())).toThrow(
      "Section not found",
    );
    expect(() =>
      removeSection(doc, doc.sections[0].id, {
        ...newSection(),
        id: doc.sections[0].id,
      }),
    ).toThrow("fresh ID");
    expect(() =>
      removeSection(doc, doc.sections[0].id, newSection("Closer")),
    ).toThrow("empty Freeform");
    expect(() =>
      removeSection(
        doc,
        doc.sections[0].id,
        newSection("Freeform", "Not empty"),
      ),
    ).toThrow("empty Freeform");
  });
});
