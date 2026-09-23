import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  defaultSettings,
  documentSchema,
  newDocument,
  settingsSchema,
  uid,
  type Document,
  type Settings,
  type ModelDescriptor,
  type SectionWorkbench,
} from "@workbench/domain";
import { APIError } from "./errors.js";

export type ProviderState = {
  enabled: boolean;
  models: ModelDescriptor[];
  lastRefreshedAt: string | null;
};

export function createRepository(dataDir: string) {
  return new Repository(dataDir);
}

/** Single local SQLite store. JSON holds the canonical domain object, revision is the CAS index. */
export class Repository {
  private readonly db: DatabaseSync;
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(resolve(dataDir, "workbench.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_catalog (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  }
  list(): Document[] {
    return this.db
      .prepare(
        "SELECT body FROM documents ORDER BY json_extract(body, '$.updatedAt') DESC, id",
      )
      .all()
      .map((row) => documentSchema.parse(JSON.parse(String(row.body))));
  }
  get(id: string): Document {
    const row = this.db
      .prepare("SELECT body FROM documents WHERE id=?")
      .get(id);
    if (!row) throw new APIError(404, "Document not found");
    return documentSchema.parse(JSON.parse(String(row.body)));
  }
  private insert(doc: Document): Document {
    const parsed = documentSchema.parse(doc);
    this.db
      .prepare("INSERT INTO documents (id, revision, body) VALUES (?, ?, ?)")
      .run(parsed.id, parsed.revision, JSON.stringify(parsed));
    return parsed;
  }
  create(title?: string, text?: string): Document {
    return this.insert(newDocument(title, text));
  }
  save(id: string, input: Document): Document {
    const doc = documentSchema.parse(input);
    if (doc.id !== id)
      throw new APIError(400, "Document ID must match the route");
    // No awaits between read and atomic compare-and-swap; a second process is guarded by SQL too.
    const old = this.get(id);
    if (old.revision !== doc.revision)
      throw new APIError(409, "Document changed. Reload before saving.");
    const saved: Document = {
      ...doc,
      createdAt: old.createdAt,
      updatedAt: new Date().toISOString(),
      revision: old.revision + 1,
    };
    const result = this.db
      .prepare(
        "UPDATE documents SET body=?, revision=? WHERE id=? AND revision=?",
      )
      .run(JSON.stringify(saved), saved.revision, id, doc.revision);
    if (result.changes !== 1)
      throw new APIError(409, "Document changed. Reload before saving.");
    return saved;
  }
  delete(id: string): void {
    const result = this.db.prepare("DELETE FROM documents WHERE id=?").run(id);
    if (result.changes !== 1) throw new APIError(404, "Document not found");
  }
  import(input: Document): Document {
    const doc = documentSchema.parse(input);
    const now = new Date().toISOString();
    const id = uid();
    const sectionIds = new Map(doc.sections.map((s) => [s.id, uid()]));
    const remapTarget = (target: Document["history"][number]["target"]) => ({
      ...target,
      documentId: id,
      documentRevision: 0,
      sectionId:
        target.sectionId === null
          ? null
          : (sectionIds.get(target.sectionId) ?? null),
    });
    const runIds = new Map(
      [
        ...(doc.workbench?.runs ?? []),
        ...doc.sections.flatMap((s) => s.workbench?.runs ?? []),
      ].map((r) => [r.id, uid()]),
    );
    const proposalIds = new Map(
      [
        ...doc.history.map((h) => h.id),
        ...[
          ...(doc.workbench?.runs ?? []),
          ...doc.sections.flatMap((s) => s.workbench?.runs ?? []),
        ].flatMap((r) => r.response.proposals.map((p) => p.id)),
      ].map((id) => [id, uid()]),
    );
    const remapWorkbench = (
      w: SectionWorkbench | undefined,
    ): SectionWorkbench | undefined =>
      w && {
        ...w,
        proposalStates: Object.fromEntries(
          Object.entries(w.proposalStates).map(([id, state]) => [
            proposalIds.get(id) ?? id,
            state,
          ]),
        ),
        activeRunId: w.activeRunId ? (runIds.get(w.activeRunId) ?? null) : null,
        runs: w.runs.map((r) => ({
          ...r,
          id: runIds.get(r.id)!,
          target: remapTarget(r.target),
          response: {
            ...r.response,
            proposals: r.response.proposals.map((p) => ({
              ...p,
              id: proposalIds.get(p.id)!,
            })),
            findings: r.response.findings.map((f) => ({
              ...f,
              sectionId: f.sectionId
                ? (sectionIds.get(f.sectionId) ?? null)
                : null,
            })),
          },
        })),
      };
    return this.insert({
      ...doc,
      workbench: remapWorkbench(doc.workbench),
      id,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      sources: doc.sources.map((s) => ({ ...s, id: uid() })),
      sections: doc.sections.map((s) => ({
        ...s,
        id: sectionIds.get(s.id)!,
        workbench: remapWorkbench(s.workbench),
        variants: s.variants.map((v) => ({
          ...v,
          id: uid(),
          target: remapTarget(v.target),
          runId: v.runId ? runIds.get(v.runId) : undefined,
        })),
      })),
      history: doc.history.map((h) => ({
        ...h,
        id: proposalIds.get(h.id)!,
        target: remapTarget(h.target),
        runId: h.runId ? runIds.get(h.runId) : undefined,
      })),
    });
  }
  getSettings(): Settings {
    const row = this.db.prepare("SELECT body FROM settings WHERE id=1").get();
    return row
      ? settingsSchema.parse(JSON.parse(String(row.body)))
      : defaultSettings();
  }
  saveSettings(input: Settings): Settings {
    const settings = settingsSchema.parse(input);
    this.db
      .prepare(
        "INSERT INTO settings (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(JSON.stringify(settings));
    return settings;
  }
  getProviderState(id: string): ProviderState | undefined {
    const row = this.db
      .prepare("SELECT body FROM provider_catalog WHERE id=?")
      .get(id);
    return row ? JSON.parse(String(row.body)) : undefined;
  }
  saveProviderState(id: string, state: ProviderState): void {
    this.db
      .prepare(
        "INSERT INTO provider_catalog (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(id, JSON.stringify(state));
  }
  close(): void {
    this.db.close();
  }
}
