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
} from "@workbench/domain";
import { APIError } from "./errors.js";

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
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id=1), body TEXT NOT NULL);`);
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
    return this.insert({
      ...doc,
      id,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      sources: doc.sources.map((s) => ({ ...s, id: uid() })),
      sections: doc.sections.map((s) => ({
        ...s,
        id: sectionIds.get(s.id)!,
        variants: s.variants.map((v) => ({
          ...v,
          id: uid(),
          target: remapTarget(v.target),
        })),
      })),
      history: doc.history.map((h) => ({
        ...h,
        id: uid(),
        target: remapTarget(h.target),
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
  close(): void {
    this.db.close();
  }
}
