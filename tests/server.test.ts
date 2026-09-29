import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../apps/server/src/app";
import {
  createRepository,
  type Repository,
} from "../apps/server/src/repository";
import { MockProvider } from "../apps/server/src/mock-provider";
import {
  documentTarget,
  documentText,
  documentSchema,
  sectionText,
  newDocument,
  targetFor,
  emptyWorkbench,
  newSection,
  paragraphs,
} from "../packages/domain/src/index";

let directory: string;
let repository: Repository;
let server: Server;
let provider: MockProvider;
let base: string;
async function start() {
  repository = createRepository(directory);
  provider = new MockProvider();
  const app = createApp({ repository, provider });
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function stop() {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  repository?.close();
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function fixture(
  text = "I really utilize this in order to help.",
  kind = "Freeform",
) {
  const doc = await (
    await request("/api/documents", "POST", { title: "My draft", text })
  ).json();
  doc.sections[0].kind = kind;
  doc.sections[0].label = kind;
  const settings = await (await request("/api/settings")).json();
  return {
    readContext: {
      document: doc,
      styleDNA: settings.styleDNA,
      knowledgePacks: settings.knowledgePacks,
      approvedLanguage: settings.radar,
    },
    editTarget: {
      scope: "section",
      sectionId: doc.sections[0].id,
      start: 0,
      end: text.length,
      text,
      sectionSnapshot: text,
      documentId: doc.id,
      documentRevision: doc.revision,
    },
    action: "coach",
    stage: "diagnose",
    answer: "",
    instruction: "",
    controls: {},
    variantCount: 2,
  };
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "workbench-server-"));
  await start();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

describe("saved Lab follow-up thread", () => {
  it("keeps a run's conversation through restart, archive, restore and duplicate without leaking across documents", async () => {
    let doc = await (
      await request("/api/documents", "POST", {
        title: "Conversation",
        text: "The passage remains mine.",
      })
    ).json();
    const other = await (
      await request("/api/documents", "POST", {
        title: "Other",
        text: "Unrelated piece.",
      })
    ).json();
    const run = {
      id: "run-a",
      target: targetFor(doc, doc.sections[0].id),
      createdAt: doc.createdAt,
      stage: "diagnose",
      action: "coach",
      instruction: "What is the line doing?",
      answer: "",
      controls: {},
      model: { providerId: "mock", modelId: "plain" },
      guidance: [
        {
          source: "section_style",
          itemId: "guide-one",
          title: "Original Hook rule",
          text: "Keep my exact first line.",
        },
      ],
      briefContext: [
        {
          source: "writing_brief",
          field: "objective",
          value: "Keep this claim narrow.",
        },
      ],
      response: {
        provider: "mock",
        diagnosis: "An older note.",
        mechanism: "",
        question: "",
        missingIngredients: [],
        findings: [],
        proposals: [],
        lexical: [],
      },
      conversation: [
        {
          id: "turn-w",
          role: "writer",
          text: "Where is the evidence?",
          createdAt: doc.createdAt,
        },
        {
          id: "turn-a",
          role: "assistant",
          text: "The passage remains mine.",
          createdAt: doc.createdAt,
          provider: "openai",
          model: { providerId: "openai", modelId: "test-model" },
        },
      ],
    };
    doc.sections[0].workbench = {
      ...emptyWorkbench(),
      runs: [run],
      activeRunId: run.id,
    };
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    await request("/api/documents/archive", "POST", { ids: [doc.id] });
    await stop();
    await start();
    const archived = await (await request(`/api/documents/${doc.id}`)).json();
    expect(
      archived.sections[0].workbench.runs[0].conversation.map(
        (turn: any) => turn.text,
      ),
    ).toEqual(run.conversation.map((turn) => turn.text));
    await request("/api/documents/restore", "POST", { ids: [doc.id] });
    const duplicate = await (
      await request("/api/import", "POST", { document: archived })
    ).json();
    expect(
      duplicate.sections[0].workbench.runs[0].conversation.map(
        (turn: any) => turn.text,
      ),
    ).toEqual(run.conversation.map((turn) => turn.text));
    expect(duplicate.sections[0].workbench.runs[0].guidance).toMatchObject(
      run.guidance,
    );
    expect(archived.sections[0].workbench.runs[0].guidance).toMatchObject(
      run.guidance,
    );
    expect(duplicate.sections[0].workbench.runs[0].briefContext).toMatchObject(
      run.briefContext,
    );
    expect(archived.sections[0].workbench.runs[0].briefContext).toMatchObject(
      run.briefContext,
    );
    expect(duplicate.sections[0].workbench.runs[0].id).not.toBe(run.id);
    expect(duplicate.sections[0].workbench.runs[0].conversation[0].id).not.toBe(
      "turn-w",
    );
    expect(
      (await (await request(`/api/documents/${other.id}`)).json()).sections[0]
        .workbench,
    ).toBeUndefined();
    expect(documentText(duplicate)).toBe(documentText(doc));
  });
  it("requires a saved local run and refuses unsafe historical follow-ups without changing prose", async () => {
    let doc = await (
      await request("/api/documents", "POST", {
        title: "Follow-up",
        text: "Before the bridge stays. The middle repeats. After the bridge stays.",
      })
    ).json();
    const original = doc.sections[0].content;
    const text = "The middle repeats.";
    const start = original[0].content[0].text.indexOf(text);
    const target = targetFor(
      doc,
      doc.sections[0].id,
      "selection",
      start,
      start + text.length,
    );
    const run = {
      id: "saved-run",
      createdAt: doc.createdAt,
      target,
      stage: "diagnose",
      action: "coach",
      instruction: "Why does the turn flatten?",
      answer: "",
      controls: {},
      model: { providerId: "mock", modelId: "conservative" },
      response: {
        provider: "mock",
        diagnosis: "Original diagnosis.",
        mechanism: "Original mechanism.",
        question: "What matters?",
        missingIngredients: [],
        findings: [],
        proposals: [],
        lexical: [],
      },
      conversation: [
        {
          id: "writer-1",
          role: "writer",
          text: "Show me the evidence.",
          createdAt: doc.createdAt,
        },
      ],
    };
    doc.sections[0].workbench = {
      ...emptyWorkbench(),
      runs: [run],
      activeRunId: run.id,
    };
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    const body = {
      documentId: doc.id,
      runId: run.id,
      question: "Show me the evidence.",
    };
    expect(
      (
        await request("/api/ai/follow-up", "POST", {
          ...body,
          runId: "unknown",
        })
      ).status,
    ).toBe(404);
    const offline = await (
      await request("/api/ai/follow-up", "POST", body)
    ).json();
    expect(offline.diagnosis).toBe("");
    expect(offline.missingIngredients.join(" ")).toMatch(
      /Offline cannot answer/,
    );
    expect(
      (
        await request("/api/ai", "POST", {
          readContext: (await fixture()).readContext,
          editTarget: target,
          action: "coach",
          stage: "diagnose",
          followUp: {
            runId: run.id,
            question: body.question,
            originalInstruction: run.instruction,
            originalResult: {
              diagnosis: "forged",
              mechanism: "",
              question: "",
            },
            turns: [],
            targetStatus: "exact",
          },
        })
      ).status,
    ).toBe(400);
    expect(
      documentText(await (await request(`/api/documents/${doc.id}`)).json()),
    ).toBe(documentText(doc));
    doc.sections[0].content = paragraphs(
      "Before the bridge stays. The middle lingers. After the bridge stays.",
    );
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    const changed = await (
      await request("/api/ai/follow-up", "POST", body)
    ).json();
    expect(changed.missingIngredients.join(" ")).toMatch(
      /Offline cannot answer/,
    );
    doc.sections[0].workbench.runs[0].conversation[0].text =
      "Give me three alternatives.";
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    const options = { ...body, question: "Give me three alternatives." };
    expect((await request("/api/ai/follow-up", "POST", options)).status).toBe(
      409,
    );
    doc.sections[0].content = paragraphs("An entirely different passage.");
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    expect((await request("/api/ai/follow-up", "POST", options)).status).toBe(
      409,
    );
  });
  it("defaults older runs to an empty bounded conversation and preserves writer/assistant turns", () => {
    const doc = newDocument("Lab thread", "The first line stays.");
    const run = {
      id: "run-one",
      createdAt: doc.createdAt,
      target: targetFor(doc, doc.sections[0].id),
      stage: "diagnose" as const,
      action: "coach",
      instruction: "Why is this flat?",
      answer: "",
      controls: {},
      model: null,
      response: {
        provider: "mock",
        diagnosis: "An earlier reading.",
        mechanism: "",
        question: "What should change?",
        missingIngredients: [],
        findings: [],
        proposals: [],
        lexical: [],
      },
    };
    doc.sections[0].workbench = { ...emptyWorkbench(), runs: [run] };
    const older = documentSchema.parse(doc);
    expect(older.sections[0].workbench?.runs[0].conversation).toEqual([]);
    expect(older.sections[0].workbench?.runs[0].guidance).toEqual([]);
    expect(older.sections[0].workbench?.runs[0].briefContext).toEqual([]);
    const turns = [
      {
        id: "w",
        role: "writer",
        text: "What evidence?",
        createdAt: doc.createdAt,
      },
      {
        id: "a",
        role: "assistant",
        text: "The first line stays.",
        createdAt: doc.createdAt,
        provider: "openai",
        model: { providerId: "openai", modelId: "test-model" },
      },
    ];
    const saved = documentSchema.parse({
      ...doc,
      sections: [
        {
          ...doc.sections[0],
          workbench: {
            ...doc.sections[0].workbench,
            runs: [{ ...run, conversation: turns }],
          },
        },
      ],
    });
    expect(saved.sections[0].workbench?.runs[0].conversation).toEqual(turns);
    expect(() =>
      documentSchema.parse({
        ...doc,
        sections: [
          {
            ...doc.sections[0],
            workbench: {
              ...doc.sections[0].workbench,
              runs: [
                {
                  ...run,
                  conversation: Array.from({ length: 25 }, (_, index) => ({
                    id: `turn-${index}`,
                    role: "writer",
                    text: "A question",
                    createdAt: doc.createdAt,
                  })),
                },
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("local API and SQLite persistence", () => {
  it("CRUD persists through a server/repository restart and rejects stale saves", async () => {
    expect(await (await request("/api/documents")).json()).toEqual([]);
    const create = await request("/api/documents", "POST", {
      title: "Local draft",
      text: "Human writing.",
    });
    expect(create.status).toBe(201);
    const first = await create.json();
    expect(first.revision).toBe(0);
    const updated = await (
      await request(`/api/documents/${first.id}`, "PUT", {
        ...first,
        title: "Revised",
      })
    ).json();
    expect(updated.revision).toBe(1);
    expect(
      (await request(`/api/documents/${first.id}`, "PUT", first)).status,
    ).toBe(409);
    await stop();
    await start();
    expect(await (await request(`/api/documents/${first.id}`)).json()).toEqual(
      updated,
    );
    expect((await request(`/api/documents/${first.id}`, "DELETE")).status).toBe(
      204,
    );
    expect((await request(`/api/documents/${first.id}`)).status).toBe(404);
  });
  it("stores optional document-local Piece Memory across restart, archive and identity-remapped import", async () => {
    const first = await (
      await request("/api/documents", "POST", {
        title: "First piece",
        text: "Authored prose.",
      })
    ).json();
    const second = await (
      await request("/api/documents", "POST", {
        title: "Other piece",
        text: "Independent prose.",
      })
    ).json();
    expect(first.pieceMemory).toEqual({
      purpose: "",
      reader: "",
      currentQuestion: "",
      unresolved: [],
      decisions: [],
      nextMove: "",
      nextMoveSectionId: null,
      lastSessionNote: "",
      reviewedDraftRevision: 0,
    });
    const memory = {
      ...first.pieceMemory,
      purpose: "Let the reader see the turn.",
      unresolved: ["Is the transition earned?"],
      decisions: [
        {
          id: "decision-1",
          text: "Keep the repeated ending.",
          createdAt: first.createdAt,
        },
      ],
      nextMove: "Rewrite the middle.",
      nextMoveSectionId: first.sections[0].id,
      lastSessionNote: "Opening is settled.",
    };
    const saved = await (
      await request(`/api/documents/${first.id}`, "PUT", {
        ...first,
        pieceMemory: memory,
      })
    ).json();
    expect(saved.pieceMemory).toMatchObject(memory);
    await request("/api/documents/archive", "POST", { ids: [first.id] });
    await stop();
    await start();
    expect(
      (await (await request(`/api/documents/${first.id}`)).json()).pieceMemory,
    ).toMatchObject(memory);
    await request("/api/documents/restore", "POST", { ids: [first.id] });
    const copied = await (
      await request("/api/import", "POST", { document: saved })
    ).json();
    expect(copied.pieceMemory).toMatchObject({
      purpose: memory.purpose,
      nextMove: memory.nextMove,
      decisions: [{ text: memory.decisions[0].text }],
    });
    expect(copied.pieceMemory.nextMoveSectionId).toBe(copied.sections[0].id);
    expect(copied.pieceMemory.nextMoveSectionId).not.toBe(first.sections[0].id);
    expect(copied.pieceMemory.decisions[0].id).not.toBe(memory.decisions[0].id);
    const oldLink = structuredClone(saved);
    delete oldLink.pieceMemory.nextMoveSectionId;
    const importedOld = await (
      await request("/api/import", "POST", { document: oldLink })
    ).json();
    expect(importedOld.pieceMemory.nextMove).toBe(memory.nextMove);
    expect(importedOld.pieceMemory.nextMoveSectionId).toBeNull();
    const missingLink = structuredClone(saved);
    missingLink.pieceMemory.nextMoveSectionId = "missing-section";
    const importedMissing = await (
      await request("/api/import", "POST", { document: missingLink })
    ).json();
    expect(importedMissing.pieceMemory.nextMove).toBe(memory.nextMove);
    expect(importedMissing.pieceMemory.nextMoveSectionId).toBeNull();
    expect(
      (await (await request(`/api/documents/${second.id}`)).json()).pieceMemory
        .nextMove,
    ).toBe("");
    delete second.pieceMemory;
    delete second.draftRevision;
    delete second.guidanceDismissals;
    const legacy = await (
      await request("/api/import", "POST", { document: second })
    ).json();
    expect(legacy.pieceMemory).toEqual(first.pieceMemory);
    expect(legacy.draftRevision).toBe(0);
    expect(legacy.guidanceDismissals).toEqual([]);
    const oldMemory = structuredClone(first);
    oldMemory.pieceMemory.nextMove = "An earlier note.";
    delete oldMemory.pieceMemory.reviewedDraftRevision;
    delete oldMemory.draftRevision;
    const importedMemory = await (
      await request("/api/import", "POST", { document: oldMemory })
    ).json();
    expect(importedMemory.pieceMemory.reviewedDraftRevision).toBe(
      importedMemory.draftRevision,
    );
    await request(`/api/documents/${first.id}`, "DELETE");
    expect(
      (await (await request(`/api/documents/${copied.id}`)).json()).pieceMemory
        .nextMove,
    ).toBe(memory.nextMove);
  });
  it("keeps writer revision intentions across restart, archive and import without guessing missing links", async () => {
    let doc = await (
      await request("/api/documents", "POST", {
        title: "Revision pass",
        text: "My opening.",
      })
    ).json();
    expect(doc.revisionPlan).toEqual([]);
    doc.revisionPlan = [
      {
        id: "active",
        sectionId: doc.sections[0].id,
        text: "Does this opening arrive too early?",
        createdAt: doc.createdAt,
        completedAt: null,
      },
      {
        id: "done",
        sectionId: "removed-section",
        text: "Old aside was optional.",
        createdAt: doc.createdAt,
        completedAt: doc.createdAt,
      },
    ];
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    expect(doc.draftRevision).toBe(0);
    await request("/api/documents/archive", "POST", { ids: [doc.id] });
    await stop();
    await start();
    const archived = await (await request(`/api/documents/${doc.id}`)).json();
    expect(archived.revisionPlan).toEqual(doc.revisionPlan);
    await request("/api/documents/restore", "POST", { ids: [doc.id] });
    const copy = await (
      await request("/api/import", "POST", { document: archived })
    ).json();
    expect(copy.revisionPlan.map((note: any) => note.text)).toEqual(
      doc.revisionPlan.map((note: any) => note.text),
    );
    expect(copy.revisionPlan[0].sectionId).toBe(copy.sections[0].id);
    expect(copy.revisionPlan[0].sectionId).not.toBe(doc.sections[0].id);
    expect(copy.revisionPlan[1].sectionId).not.toBe("removed-section");
    expect(
      copy.sections.some(
        (section: any) => section.id === copy.revisionPlan[1].sectionId,
      ),
    ).toBe(false);
    expect(copy.revisionPlan[1].completedAt).toBe(
      doc.revisionPlan[1].completedAt,
    );
    const malformed = structuredClone(archived);
    malformed.revisionPlan = [
      malformed.revisionPlan[0],
      { id: "broken", sectionId: 7, text: "Missing ID" },
    ];
    const imported = await (
      await request("/api/import", "POST", { document: malformed })
    ).json();
    expect(imported.revisionPlan).toHaveLength(1);
    const legacy = structuredClone(archived);
    delete legacy.revisionPlan;
    expect(
      (
        await (
          await request("/api/import", "POST", { document: legacy })
        ).json()
      ).revisionPlan,
    ).toEqual([]);
  });
  it("preserves explicit revision checkpoint snapshots through restart, archive and remapped import", async () => {
    let doc = await (
      await request("/api/documents", "POST", {
        title: "Checkpoint",
        text: "Original human line.",
      })
    ).json();
    const checkpoint = {
      id: "checkpoint",
      createdAt: doc.createdAt,
      draftRevision: doc.draftRevision,
      label: "Before editing",
      sections: doc.sections.map((section: any, order: number) => ({
        id: section.id,
        order,
        kind: section.kind,
        label: section.label,
        placement: section.placement,
        text: sectionText(section),
        content: structuredClone(section.content),
      })),
    };
    doc.revisionCheckpoint = checkpoint;
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    expect(doc.draftRevision).toBe(0);
    expect(doc.revisionCheckpoint).toMatchObject(checkpoint);
    await request("/api/documents/archive", "POST", { ids: [doc.id] });
    await stop();
    await start();
    const archived = await (await request(`/api/documents/${doc.id}`)).json();
    expect(archived.revisionCheckpoint).toEqual(doc.revisionCheckpoint);
    await request("/api/documents/restore", "POST", { ids: [doc.id] });
    const duplicate = await (
      await request("/api/import", "POST", { document: archived })
    ).json();
    expect(duplicate.revisionCheckpoint.sections[0].id).toBe(
      duplicate.sections[0].id,
    );
    expect(duplicate.revisionCheckpoint.sections[0].id).not.toBe(
      doc.sections[0].id,
    );
    expect(duplicate.revisionCheckpoint.sections[0].text).toBe(
      "Original human line.",
    );
    const historical = structuredClone(archived);
    historical.revisionCheckpoint.sections.push({
      ...checkpoint.sections[0],
      id: "removed-aside",
      order: 1,
      text: "An older aside.",
      content: paragraphs("An older aside."),
    });
    const importedHistorical = await (
      await request("/api/import", "POST", { document: historical })
    ).json();
    expect(importedHistorical.revisionCheckpoint.sections[1].id).not.toBe(
      "removed-aside",
    );
    expect(
      importedHistorical.sections.some(
        (section: any) =>
          section.id === importedHistorical.revisionCheckpoint.sections[1].id,
      ),
    ).toBe(false);
    const malformed = structuredClone(archived);
    malformed.revisionCheckpoint = { id: "broken", sections: [{ id: "bad" }] };
    const safelyImported = await (
      await request("/api/import", "POST", { document: malformed })
    ).json();
    expect(safelyImported.revisionCheckpoint).toBeUndefined();
    const old = structuredClone(archived);
    delete old.revisionCheckpoint;
    expect(
      (await (await request("/api/import", "POST", { document: old })).json())
        .revisionCheckpoint,
    ).toBeUndefined();
  });
  it("persists contextual dismissals with the document and remaps them on import", async () => {
    let doc = await (
      await request("/api/documents", "POST", {
        title: "Local context",
        text: "Authored line.",
      })
    ).json();
    doc.guidanceDismissals.push({
      identity: "library:move-one",
      sectionId: doc.sections[0].id,
      context: JSON.stringify(["Freeform", "section", "coach", "freeform"]),
    });
    doc = await (await request(`/api/documents/${doc.id}`, "PUT", doc)).json();
    const prose = documentText(doc);
    await request("/api/documents/archive", "POST", { ids: [doc.id] });
    await stop();
    await start();
    const archived = await (await request(`/api/documents/${doc.id}`)).json();
    expect(archived.guidanceDismissals).toEqual(doc.guidanceDismissals);
    await request("/api/documents/restore", "POST", { ids: [doc.id] });
    const imported = await (
      await request("/api/import", "POST", { document: archived })
    ).json();
    expect(imported.guidanceDismissals).toEqual([
      { ...doc.guidanceDismissals[0], sectionId: imported.sections[0].id },
    ]);
    expect(imported.sections[0].id).not.toBe(doc.sections[0].id);
    expect(documentText(imported)).toBe(prose);
  });
  it("tracks authored draft revision independently of metadata and memory review", async () => {
    let doc = await (
      await request("/api/documents", "POST", {
        title: "Memory freshness",
        text: "Original prose.",
      })
    ).json();
    expect(doc.draftRevision).toBe(0);
    expect(doc.pieceMemory.reviewedDraftRevision).toBe(0);
    const save = async (change: (body: any) => void) => {
      const body = structuredClone(doc);
      change(body);
      doc = await (
        await request(`/api/documents/${body.id}`, "PUT", body)
      ).json();
      return doc;
    };
    await save((body) => {
      body.pieceMemory.nextMove = "Check the ending.";
      body.pieceMemory.reviewedDraftRevision = 0;
    });
    expect(doc.draftRevision).toBe(0);
    await save((body) => {
      body.sections[0].workbench = emptyWorkbench();
      body.sections[0].workbench.instruction = "What happens next?";
    });
    expect(doc.draftRevision).toBe(0);
    await save((body) => {
      body.selectedSectionId = body.sections[0].id;
      body.defaultModel = { providerId: "mock", modelId: "conservative" };
      body.sections[0].modelOverride = { providerId: "mock", modelId: "plain" };
      body.sections[0].variants.push({
        id: "saved-take",
        label: "Earlier",
        text: "Original prose.",
        target: targetFor(body, body.sections[0].id),
        createdAt: body.createdAt,
        origin: "human",
      });
    });
    expect(doc.draftRevision).toBe(0);
    await save((body) => {
      body.draftRevision = 99;
    });
    expect(doc.draftRevision).toBe(0);
    await save((body) => {
      body.sections[0].content = paragraphs("Revised prose.");
    });
    expect(doc.draftRevision).toBe(1);
    expect(doc.pieceMemory.reviewedDraftRevision).toBe(0);
    await save((body) => {
      body.pieceMemory.reviewedDraftRevision = 1;
    });
    expect(doc.draftRevision).toBe(1);
    await save((body) => {
      body.sections.push(newSection("Point", "Another section."));
    });
    expect(doc.draftRevision).toBe(2);
    await save((body) => {
      body.sections.reverse();
    });
    expect(doc.draftRevision).toBe(3);
    await save((body) => {
      body.sections[0].placement = "parked";
    });
    expect(doc.draftRevision).toBe(4);
    await save((body) => {
      body.sections[0].placement = "draft";
    });
    expect(doc.draftRevision).toBe(5);
    await save((body) => {
      body.sections.pop();
    });
    expect(doc.draftRevision).toBe(6);
    await save((body) => {
      body.title = "A new title";
      body.brief.audience = "One reader";
    });
    expect(doc.draftRevision).toBe(6);
    await stop();
    await start();
    expect(
      (await (await request(`/api/documents/${doc.id}`)).json()).draftRevision,
    ).toBe(6);
    const staleCopy = await (
      await request("/api/import", "POST", { document: doc })
    ).json();
    expect(staleCopy.draftRevision).toBe(6);
    expect(staleCopy.pieceMemory.reviewedDraftRevision).toBe(1);
    await save((body) => {
      body.pieceMemory.reviewedDraftRevision = 6;
    });
    const currentCopy = await (
      await request("/api/import", "POST", { document: doc })
    ).json();
    expect(currentCopy.draftRevision).toBe(6);
    expect(currentCopy.pieceMemory.reviewedDraftRevision).toBe(6);
    await request("/api/documents/archive", "POST", { ids: [staleCopy.id] });
    await stop();
    await start();
    expect(
      (await (await request(`/api/documents/${staleCopy.id}`)).json())
        .pieceMemory.reviewedDraftRevision,
    ).toBe(1);
    await request("/api/documents/restore", "POST", { ids: [staleCopy.id] });
    expect(
      (await (await request(`/api/documents/${staleCopy.id}`)).json())
        .draftRevision,
    ).toBe(6);
  });
  it("archives and restores full documents by ID across a server restart", async () => {
    const first = await (
      await request("/api/documents", "POST", {
        title: "Same title",
        text: "A durable line.",
      })
    ).json();
    const second = await (
      await request("/api/documents", "POST", {
        title: "Same title",
        text: "A different line.",
      })
    ).json();
    first.sections[0].variants.push({
      id: "take-one",
      label: "Earlier",
      text: "A durable line.",
      target: targetFor(first, first.sections[0].id),
      origin: "human",
      createdAt: first.createdAt,
    });
    first.sources.push({
      id: "source-one",
      title: "Witness",
      kind: "quote",
      text: "A source survives.",
      url: "",
    });
    const run = {
      id: "run-one",
      createdAt: first.createdAt,
      target: targetFor(first, first.sections[0].id),
      action: "coach",
      instruction: "Keep my point.",
      answer: "",
      controls: {},
      model: null,
      response: {
        provider: "mock",
        diagnosis: "A saved thought.",
        mechanism: "",
        question: "What matters?",
        missingIngredients: [],
        findings: [],
        proposals: [],
        lexical: [],
      },
    };
    first.sections[0].workbench = {
      ...emptyWorkbench(),
      runs: [run],
      activeRunId: run.id,
    };
    first.history.push({
      id: "history-one",
      createdAt: first.createdAt,
      target: run.target,
      instruction: "Keep my point.",
      coachQuestion: "What matters?",
      userAnswer: "",
      proposal: "Another version.",
      state: "saved",
      provider: "mock",
    });
    first.parkedGroups.push({
      id: "group-one",
      name: "Unfinished",
      collapsed: true,
    });
    const aside = newSection("Example", "Keep this side note.");
    aside.placement = "parked";
    aside.parkedGroupId = "group-one";
    first.sections.push(aside);
    first.brief.customNotes = "Human writing guidance stays here.";
    first.sections[0].modelOverride = { providerId: "mock", modelId: "plain" };
    const stored = await (
      await request(`/api/documents/${first.id}`, "PUT", first)
    ).json();
    expect(
      (await request("/api/documents/archive", "POST", { ids: [first.id] }))
        .status,
    ).toBe(200);
    expect(
      (await (await request("/api/documents")).json()).map(
        (item: any) => item.id,
      ),
    ).toEqual([second.id]);
    expect(
      (await (await request("/api/documents/archived")).json()).map(
        (item: any) => item.id,
      ),
    ).toEqual([first.id]);
    expect(
      (await request(`/api/documents/${first.id}`, "PUT", stored)).status,
    ).toBe(409);
    await stop();
    await start();
    expect(
      (await (await request("/api/documents/archived")).json())[0],
    ).toEqual(stored);
    expect(
      (
        await (
          await request("/api/documents/restore", "POST", { ids: [first.id] })
        ).json()
      ).count,
    ).toBe(1);
    expect(
      (
        await (
          await request("/api/documents/restore", "POST", { ids: [first.id] })
        ).json()
      ).count,
    ).toBe(0);
    expect(
      (await (await request(`/api/documents/${first.id}`)).json()).sections[0]
        .variants[0].label,
    ).toBe("Earlier");
    const restored = await (await request(`/api/documents/${first.id}`)).json();
    expect(restored).toEqual(stored);
    expect(restored.sources[0].text).toBe("A source survives.");
    expect(restored.sections[0].workbench.runs[0].response.diagnosis).toBe(
      "A saved thought.",
    );
    expect(restored.history[0].proposal).toBe("Another version.");
    expect(restored.sections[1].parkedGroupId).toBe("group-one");
    expect(restored.sections[0].modelOverride.modelId).toBe("plain");
  });
  it("bulk archive and permanent deletion leave unselected documents untouched", async () => {
    const docs = await Promise.all(
      ["A", "B", "C"].map(async (title) =>
        (await request("/api/documents", "POST", { title })).json(),
      ),
    );
    expect(
      (
        await request("/api/documents/archive", "POST", {
          ids: [docs[0].id, "missing"],
        })
      ).status,
    ).toBe(404);
    expect(await (await request("/api/documents/archived")).json()).toEqual([]);
    expect(
      (
        await (
          await request("/api/documents/archive", "POST", {
            ids: docs.slice(0, 2).map((doc) => doc.id),
          })
        ).json()
      ).count,
    ).toBe(2);
    expect(
      (await (await request("/api/documents")).json()).map(
        (item: any) => item.id,
      ),
    ).toEqual([docs[2].id]);
    expect(
      (
        await request("/api/documents/bulk", "DELETE", {
          ids: docs.slice(0, 2).map((doc) => doc.id),
        })
      ).status,
    ).toBe(400);
    expect(
      await (await request("/api/documents/archived")).json(),
    ).toHaveLength(2);
    expect(
      (await request("/api/documents/bulk", "DELETE", { ids: [docs[2].id] }))
        .status,
    ).toBe(409);
    expect(
      (
        await (
          await request("/api/documents/bulk", "DELETE", {
            ids: docs.slice(0, 2).map((doc) => doc.id),
            confirmation: "DELETE",
          })
        ).json()
      ).count,
    ).toBe(2);
    expect(await (await request("/api/documents/archived")).json()).toEqual([]);
    expect(
      (await (await request("/api/documents")).json()).map(
        (item: any) => item.id,
      ),
    ).toEqual([docs[2].id]);
    await stop();
    await start();
    expect(
      (await (await request("/api/documents")).json()).map(
        (item: any) => item.id,
      ),
    ).toEqual([docs[2].id]);
  });
  it("duplicates imports safely without overwriting the original", async () => {
    const ai = await fixture();
    const original = ai.readContext.document;
    original.selectedSectionId = original.sections[0].id;
    original.history.push({
      id: "historical",
      createdAt: original.createdAt,
      target: ai.editTarget,
      instruction: "",
      coachQuestion: "",
      userAnswer: "human",
      proposal: "candidate",
      state: "saved",
      provider: "mock",
    });
    original.sections[0].variants.push({
      id: "variant",
      label: "Saved",
      text: "candidate",
      target: ai.editTarget,
      createdAt: original.createdAt,
      origin: "human",
    });
    const response = await request("/api/import", "POST", {
      document: original,
    });
    expect(response.status).toBe(201);
    const imported = await response.json();
    expect(imported.id).not.toBe(original.id);
    expect(imported.sections[0].id).not.toBe(original.sections[0].id);
    expect(imported.selectedSectionId).toBe(imported.sections[0].id);
    expect(imported.history[0].target.documentId).toBe(imported.id);
    expect(imported.sections[0].variants[0].target.sectionId).toBe(
      imported.sections[0].id,
    );
    expect((await (await request("/api/documents")).json()).length).toBe(2);
  });
  it("settings survive restart, invalid bodies are 400, route IDs must match", async () => {
    const settings = await (await request("/api/settings")).json();
    const selected = await (
      await request("/api/documents", "POST", { title: "Selected draft" })
    ).json();
    settings.activeDocumentId = selected.id;
    settings.theme = "dark";
    settings.styleDNA.neverSuggest = ["synergy"];
    expect((await request("/api/settings", "PUT", settings)).status).toBe(200);
    await stop();
    await start();
    expect(await (await request("/api/settings")).json()).toEqual(settings);
    expect(
      (await request("/api/settings", "PUT", { theme: "invalid" })).status,
    ).toBe(400);
    expect(
      (await request("/api/documents", "POST", { title: "" })).status,
    ).toBe(400);
    const ai = await fixture();
    expect(
      (
        await request(`/api/documents/${ai.readContext.document.id}`, "PUT", {
          ...ai.readContext.document,
          id: "wrong",
        })
      ).status,
    ).toBe(400);
  });
  it("returns safe errors and never reveals a configured key", async () => {
    const secret = "sk-test-secret-do-not-disclose";
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = secret;
    try {
      expect(await (await request("/api/health")).json()).toEqual({
        ok: true,
        provider: "mock",
        webResearch: false,
      });
      const ai = await fixture();
      vi.spyOn(provider, "run").mockRejectedValueOnce(
        new Error(`Provider failed with ${secret}`),
      );
      const failed = await request("/api/ai", "POST", ai);
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain(secret);
      vi.spyOn(repository, "list").mockImplementationOnce(() => {
        throw new Error(secret);
      });
      const internal = await request("/api/documents");
      expect(internal.status).toBe(500);
      expect(await internal.text()).not.toContain(secret);
      expect(await (await request("/api/settings")).text()).not.toContain(
        secret,
      );
    } finally {
      if (old === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = old;
    }
  });
});

describe("human-first AI boundaries", () => {
  it("coaches a section without proposals or writes, then proposes a conservative trim", async () => {
    const ai = await fixture(
      "I really want to help in order to finish.",
      "Hook",
    );
    const before = await (await request("/api/documents")).json();
    const coach = await (await request("/api/ai", "POST", ai)).json();
    expect(coach.provider).toBe("mock");
    expect(coach.diagnosis).toContain("OFFLINE");
    expect(coach.question).toContain("Hook");
    expect(coach.proposals).toEqual([]);
    const proposal = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "shorten",
        stage: "propose",
        answer: "Keep the intent to help, remove fillers.",
      })
    ).json();
    expect(proposal.proposals[0].text).toBe("I want to help to finish.");
    expect(await (await request("/api/documents")).json()).toEqual(before);
    const again = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "shorten",
        stage: "propose",
        answer: "Keep the intent to help, remove fillers.",
      })
    ).json();
    expect(again).toEqual(proposal);
  });
  it("rejects invalid ranges, snapshots, document editing and unanswered proposals", async () => {
    const ai = await fixture();
    const invalids = [
      { ...ai, editTarget: { ...ai.editTarget, end: 999 } },
      { ...ai, editTarget: { ...ai.editTarget, start: -1 } },
      { ...ai, editTarget: { ...ai.editTarget, documentRevision: -1 } },
      { ...ai, editTarget: { ...ai.editTarget, sectionSnapshot: "old" } },
      {
        ...ai,
        editTarget: { ...ai.editTarget, scope: "document", sectionId: null },
        action: "shorten",
      },
      { ...ai, stage: "propose", action: "humor", answer: "" },
      { ...ai, variantCount: 9 },
    ];
    for (const invalid of invalids)
      expect((await request("/api/ai", "POST", invalid)).status).toBe(400);
    expect(
      (
        await request("/api/ai", "POST", {
          ...ai,
          action: "critique",
          editTarget: {
            ...ai.editTarget,
            scope: "document",
            sectionId: null,
            start: 9,
          },
        })
      ).status,
    ).toBe(400);
  });
  it("keeps section targets valid after autosave and unrelated edits, but rejects changed snapshots", async () => {
    const ai = await fixture();
    const target = structuredClone(ai.editTarget);
    const path = `/api/documents/${ai.readContext.document.id}`;
    ai.readContext.document = await (
      await request(path, "PUT", ai.readContext.document)
    ).json();
    expect(ai.readContext.document.revision).toBeGreaterThan(
      target.documentRevision,
    );
    expect((await request("/api/ai", "POST", ai)).status).toBe(200);
    ai.readContext.document.sections.push(
      newSection("Freeform", "An unrelated section."),
    );
    ai.readContext.document = await (
      await request(path, "PUT", ai.readContext.document)
    ).json();
    expect((await request("/api/ai", "POST", ai)).status).toBe(200);
    ai.readContext.document.sections[1].content =
      paragraphs("Edited elsewhere.");
    ai.readContext.document = await (
      await request(path, "PUT", ai.readContext.document)
    ).json();
    expect((await request("/api/ai", "POST", ai)).status).toBe(200);
    ai.readContext.document.sections[0].content = paragraphs(
      "Changed selected section.",
    );
    expect((await request("/api/ai", "POST", ai)).status).toBe(400);
    expect(ai.editTarget).toEqual(target);
  });
  it("uses the whole-document text snapshot for critique, not the autosave revision", async () => {
    const ai = await fixture();
    const target = documentTarget(ai.readContext.document);
    ai.readContext.document = await (
      await request(
        `/api/documents/${ai.readContext.document.id}`,
        "PUT",
        ai.readContext.document,
      )
    ).json();
    const input = { ...ai, action: "critique", editTarget: target };
    const result = await request("/api/ai", "POST", input);
    expect(result.status).toBe(200);
    expect((await result.json()).proposals).toEqual([]);
    ai.readContext.document.sections.push(
      newSection(
        "Freeform",
        "New text anywhere invalidates whole-document critique.",
      ),
    );
    expect((await request("/api/ai", "POST", input)).status).toBe(400);
  });
  it("validates injected provider output at the API boundary without changing sources or document", async () => {
    const ai = await fixture();
    ai.readContext.document.sources.push({
      id: "source",
      kind: "transcript",
      title: "Original",
      text: "teh exact source",
      url: "",
    });
    const before = await (
      await request(`/api/documents/${ai.readContext.document.id}`)
    ).json();
    const output = await provider.run(ai as never);
    const badOutputs = [
      {
        ...output,
        findings: [
          {
            sectionId: "invented",
            title: "Wrong section",
            detail: "invalid",
            severity: "note",
          },
        ],
      },
      {
        ...output,
        proposals: [
          { id: "p", label: "Unsolicited", text: "New draft", explanation: "" },
        ],
      },
      { provider: "mock" },
    ];
    for (const bad of badOutputs) {
      vi.spyOn(provider, "run").mockResolvedValueOnce(bad as never);
      expect((await request("/api/ai", "POST", ai)).status).toBe(502);
    }
    expect(
      await (
        await request(`/api/documents/${ai.readContext.document.id}`)
      ).json(),
    ).toEqual(before);
    expect(ai.readContext.document.sources[0].text).toBe("teh exact source");
  });
  it("offers lexical nuance from a small curated table and an honest unknown fallback", async () => {
    const ai = await fixture("assumed");
    const known = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "words",
        editTarget: { ...ai.editTarget, scope: "word" },
      })
    ).json();
    expect(known.lexical.map((entry: { term: string }) => entry.term)).toEqual(
      expect.arrayContaining(["assumed", "figured", "believed"]),
    );
    expect(known.lexical[0].nuance).toContain("untested");
    const unknown = await fixture("sesquipedalian");
    const result = await (
      await request("/api/ai", "POST", { ...unknown, action: "words" })
    ).json();
    expect(result.lexical).toEqual([]);
    expect(result.diagnosis).toContain("not comprehensive");
  });
  it("flags generic transitions, uniform cadence and repeated contrasts with real section links", async () => {
    const ai = await fixture(
      "Furthermore, birds can fly. Quiet clouds move slowly. Small leaves fall gently. It is not speed but care. It is not force but patience.",
    );
    const output = await (
      await request("/api/ai", "POST", { ...ai, action: "critique" })
    ).json();
    expect(output.findings.map((f: { title: string }) => f.title)).toEqual(
      expect.arrayContaining([
        "Stock bridge or opener",
        "Repeated not-X-but-Y",
      ]),
    );
    expect(
      output.findings.every(
        (f: { sectionId: string }) => f.sectionId === ai.editTarget.sectionId,
      ),
    ).toBe(true);
    const cadence = await fixture(
      "Birds can fly. Clouds drift slowly. Leaves fall gently.",
    );
    const cadenceOutput = await (
      await request("/api/ai", "POST", { ...cadence, action: "critique" })
    ).json();
    expect(
      cadenceOutput.findings.some(
        (f: { title: string }) => f.title === "Uniform sentence cadence",
      ),
    ).toBe(true);
  });
  it("spellchecks conservatively and protects quotes and explicit length constraints", async () => {
    const ai = await fixture("I recieve teh note: “teh source stays.”");
    const output = await (
      await request("/api/ai", "POST", { ...ai, action: "spellcheck" })
    ).json();
    expect(output.proposals[0].text).toBe(
      "I receive the note: “teh source stays.”",
    );
    const bounded = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "spellcheck",
        controls: { maxWords: 1 },
      })
    ).json();
    expect(bounded.proposals).toEqual([]);
    expect(bounded.missingIngredients[0]).toContain("maxWords");
    const simplify = await fixture("We utilize numerous tools.");
    const simple = await (
      await request("/api/ai", "POST", {
        ...simplify,
        action: "simplify",
        stage: "propose",
        answer: "For a general reader.",
      })
    ).json();
    expect(simple.proposals[0].text).toBe("We use many tools.");
  });
  it("does not stage a direction as authored prose when offline cannot answer it", async () => {
    const ai = await fixture("The room was quiet.");
    const output = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "emotion",
        stage: "propose",
        answer: "Please make this more nuanced and less sentimental.",
      })
    ).json();
    expect(output.proposals).toEqual([]);
    expect(output.missingIngredients[0]).toContain("configure a model");
  });
  it("creative offline output explicitly uses human wording, never fabricated observations", async () => {
    const ai = await fixture("The room was quiet.");
    const human = "Material: Even the fridge stopped humming.";
    const output = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "emotion",
        stage: "propose",
        answer: human,
      })
    ).json();
    expect(output.proposals[0].text).toBe("Even the fridge stopped humming.");
    expect(output.proposals[0].label).toContain("verbatim");
    ai.readContext.styleDNA.neverSuggest = ["synergy"];
    const forbidden = await (
      await request("/api/ai", "POST", {
        ...ai,
        action: "humor",
        stage: "propose",
        answer: "We need synergy now.",
      })
    ).json();
    expect(forbidden.proposals).toEqual([]);
  });
  it("offline culture is unavailable, not a fake fresh feed", async () => {
    const response = await request("/api/culture/refresh", "POST", {
      query: "current language patterns",
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("offline");
    expect(
      (await request("/api/culture/refresh", "POST", { query: "" })).status,
    ).toBe(400);
    expect((await (await request("/api/settings")).json()).radar).toEqual([]);
  });
});

describe("loopback / browser security", () => {
  it("denies hostile origins, DNS-rebinding hosts, opaque origins, and non-JSON mutations", async () => {
    for (const origin of [
      "https://evil.example",
      "null",
      "http://localhost.evil.example",
      "http://user@localhost",
    ]) {
      expect(
        (await request("/api/documents", "POST", {}, { Origin: origin }))
          .status,
      ).toBe(403);
    }
    // Native fetch normalizes/ignores Host overrides in some releases; node:http provides the raw-host check below.
    const { request: rawRequest } = await import("node:http");
    const hostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const raw = rawRequest(
          `${base}/api/health`,
          { headers: { Host: "rebinding.attacker.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        raw.on("error", reject);
        raw.end();
      },
    );
    expect(hostStatus).toBe(403);
    const text = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });
    expect(text.status).toBe(415);
    const allowed = await request("/api/health", "GET", undefined, {
      Origin: "http://localhost:5173",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(
      (
        await request("/api/health", "GET", undefined, {
          "Sec-Fetch-Site": "cross-site",
        })
      ).status,
    ).toBe(403);
  });
  it("allows bodyless JSON DELETE but rejects missing/simple/spoofed MIME and hostile origins", async () => {
    const ai = await fixture();
    const path = `/api/documents/${ai.readContext.document.id}`;
    for (const mime of [
      undefined,
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data",
      "application/jsonp",
      "text/plain; application/json",
    ]) {
      const result = await fetch(`${base}${path}`, {
        method: "DELETE",
        headers: mime ? { "Content-Type": mime } : {},
      });
      expect(result.status).toBe(415);
    }
    expect(
      (
        await request(path, "DELETE", undefined, {
          Origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(path, "DELETE", undefined, {
          "Sec-Fetch-Site": "cross-site",
        })
      ).status,
    ).toBe(403);
    expect((await request(path)).status).toBe(200);
    expect(
      (
        await request(path, "DELETE", undefined, {
          "Content-Type": "application/json; charset=utf-8",
        })
      ).status,
    ).toBe(204);
  });
  it("rejects malformed and oversized JSON safely", async () => {
    expect(
      (
        await fetch(`${base}/api/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("/api/documents", "POST", { text: "x".repeat(2_100_000) }))
        .status,
    ).toBe(413);
  });
});
