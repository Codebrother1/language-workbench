import { afterAll, afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../apps/server/src/app";
import { createRepository } from "../apps/server/src/repository";
import { ProviderRegistry } from "../apps/server/src/provider-registry";
import { MockProvider } from "../apps/server/src/mock-provider";
import { newDocument } from "../packages/domain/src/index";
import {
  desktopPaths,
  desktopSmokeProfile,
  backupDesktopDatabase,
  startDesktopBackend,
} from "../desktop/runtime.mjs";

const directory = mkdtempSync(join(tmpdir(), "workbench-desktop-fixture-"));
let backend: Awaited<ReturnType<typeof startDesktopBackend>> | undefined;
afterEach(async () => {
  await backend?.stop();
  backend = undefined;
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("desktop runtime isolation and lifecycle", () => {
  it("separates app-support data from repo development and packaged assets", () => {
    const repoRoot = resolve(directory, "repo");
    const appRoot = resolve(
      directory,
      "Language Workbench.app",
      "Contents",
      "Resources",
      "app.asar",
    );
    const userData = resolve(directory, "support", "Language Workbench");
    const desktop = desktopPaths({
      packaged: true,
      userData,
      repoRoot,
      appRoot,
    });
    const development = desktopPaths({
      packaged: false,
      userData,
      repoRoot,
      appRoot,
    });
    expect(desktop.dataDir).toBe(userData);
    expect(desktop.webDir).toBe(join(appRoot, "apps/web/dist"));
    expect(development.dataDir).toBe(join(repoRoot, "data/desktop-dev"));
    expect(desktop.dataDir).not.toBe(development.dataDir);
    expect(desktop.dataDir).not.toBe(join(repoRoot, "data"));
    const smoke = join(tmpdir(), "language-workbench-desktop-smoke-test-123");
    expect(desktopSmokeProfile(smoke, true)).toBe(resolve(smoke));
    expect(() => desktopSmokeProfile(userData, true)).toThrow(
      /dedicated temporary directory/,
    );
    expect(() => desktopSmokeProfile(smoke, false)).toThrow(/packaged app/);
  });
  it("backs up existing SQLite including WAL changes before repository schema setup", async () => {
    const dir = mkdtempSync(join(directory, "db-"));
    const db = new DatabaseSync(join(dir, "workbench.sqlite"));
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE legacy (value TEXT); INSERT INTO legacy VALUES ('preserved');",
    );
    const backupPath = await backupDesktopDatabase(dir);
    expect(backupPath).toContain("backups");
    const copy = new DatabaseSync(backupPath!, { readOnly: true });
    expect(copy.prepare("SELECT value FROM legacy").get()).toMatchObject({
      value: "preserved",
    });
    copy.close();
    db.close();
    expect(
      readdirSync(join(dir, "backups")).filter((name) =>
        name.endsWith(".sqlite"),
      ),
    ).toHaveLength(1);
  });
  it("restores a WAL-aware backup of an older version-one document into a separate disposable profile", async () => {
    const working = mkdtempSync(join(directory, "working-"));
    const restored = mkdtempSync(join(directory, "restored-"));
    const sourcePath = join(working, "workbench.sqlite");
    const db = new DatabaseSync(sourcePath);
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE documents (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);",
    );
    const legacy: any = newDocument(
      "Before the change",
      "Original authored prose.",
    );
    delete legacy.revisionPlan;
    delete legacy.pieceMemory;
    delete legacy.sections[0].placement;
    delete legacy.sections[0].workbench;
    db.prepare(
      "INSERT INTO documents (id, revision, body) VALUES (?, ?, ?)",
    ).run(legacy.id, legacy.revision, JSON.stringify(legacy));
    const backupPath = await backupDesktopDatabase(working);
    expect(backupPath).not.toBeNull();
    db.prepare("UPDATE documents SET body=?, revision=1 WHERE id=?").run(
      JSON.stringify({ ...legacy, title: "Changed working copy", revision: 1 }),
      legacy.id,
    );
    db.close();
    copyFileSync(backupPath!, join(restored, "workbench.sqlite"));
    backend = await startDesktopBackend({
      dataDir: restored,
      webDir: undefined,
      env: { WORKBENCH_DESKTOP: "1" },
      loadServer: async () => ({
        createApp,
        createRepository,
        ProviderRegistry,
        MockProvider,
      }),
      log: () => {},
    });
    const response = await fetch(`${backend.url}/api/documents/${legacy.id}`);
    expect(response.status).toBe(200);
    const recovered = await response.json();
    expect(recovered.title).toBe("Before the change");
    expect(recovered.sections[0].placement).toBe("draft");
    expect(recovered.sections[0].content).toEqual(legacy.sections[0].content);
    expect(recovered.revisionPlan).toEqual([]);
    expect(recovered.pieceMemory.purpose).toBe("");
    const changed = new DatabaseSync(sourcePath, { readOnly: true });
    expect(
      JSON.parse(
        String(
          changed
            .prepare("SELECT body FROM documents WHERE id=?")
            .get(legacy.id)?.body,
        ),
      ).title,
    ).toBe("Changed working copy");
    changed.close();
    expect(
      readdirSync(join(restored, "backups")).some((file) =>
        file.endsWith(".sqlite"),
      ),
    ).toBe(true);
  });
  it("reports missing packaged frontend instead of opening a blank window or creating a database", async () => {
    const dataDir = mkdtempSync(join(directory, "missing-"));
    await expect(
      startDesktopBackend({
        dataDir,
        webDir: join(dataDir, "assets"),
        env: {},
        loadServer: async () => ({
          createApp,
          createRepository,
          ProviderRegistry,
          MockProvider,
        }),
      }),
    ).rejects.toThrow(/frontend is missing/i);
    expect(readdirSync(dataDir)).toEqual([]);
  });
  it("fails safely if the desktop database directory cannot be opened", async () => {
    const path = join(directory, "blocked-data-path");
    writeFileSync(path, "not a directory");
    await expect(
      startDesktopBackend({
        dataDir: path,
        webDir: undefined,
        env: {},
        loadServer: async () => ({
          createApp,
          createRepository,
          ProviderRegistry,
          MockProvider,
        }),
        log: () => {},
      }),
    ).rejects.toThrow();
    expect(readFileSync(path, "utf8")).toBe("not a directory");
  });
  it("pins an external OpenAI default on removal instead of silently falling back to Offline", async () => {
    const dir = mkdtempSync(join(directory, "external-"));
    backend = await startDesktopBackend({
      dataDir: dir,
      webDir: undefined,
      env: { WORKBENCH_DESKTOP: "1", OPENAI_API_KEY: "sk-external-test-key" },
      loadServer: async () => ({
        createApp,
        createRepository,
        ProviderRegistry,
        MockProvider,
      }),
      log: () => {},
    });
    backend.configureOpenAI(null);
    const settings = await (await fetch(backend.url + "/api/settings")).json();
    expect(settings.routing.applicationDefault).toEqual({
      providerId: "openai",
      modelId: "gpt-4.1-mini",
    });
    const catalog = await (await fetch(backend.url + "/api/providers")).json();
    expect(
      catalog.providers.find((p: any) => p.id === "openai").configured,
    ).toBe(false);
    expect(catalog.applicationDefault).toEqual({
      providerId: "openai",
      modelId: "gpt-4.1-mini",
    });
  });
  it("starts exactly one loopback backend on an available port and closes without losing its data", async () => {
    const dir = mkdtempSync(join(directory, "server-"));
    const options = {
      dataDir: dir,
      webDir: undefined,
      env: { WORKBENCH_DESKTOP: "1" },
      loadServer: async () => ({
        createApp,
        createRepository,
        ProviderRegistry,
        MockProvider,
      }),
    };
    backend = await startDesktopBackend(options);
    expect(backend.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(backend.port).toBeGreaterThan(0);
    expect(
      (await (await fetch(backend.url + "/api/health")).json()).provider,
    ).toBe("mock");
    backend.configureOpenAI("sk-disposable-desktop-fixture");
    const catalog = await (await fetch(backend.url + "/api/providers")).json();
    expect(catalog.providers.find((p: any) => p.id === "openai")).toMatchObject(
      { configured: true, credentialSuffix: null },
    );
    expect(catalog.applicationDefault).toEqual({
      providerId: "mock",
      modelId: "conservative",
    });
    backend.configureOpenAI(null);
    expect(
      (
        await (await fetch(backend.url + "/api/providers")).json()
      ).providers.find((p: any) => p.id === "openai").configured,
    ).toBe(false);
    expect(
      (await (await fetch(backend.url + "/api/settings")).json()).routing
        .applicationDefault,
    ).toEqual({ providerId: "mock", modelId: "conservative" });
    await expect(startDesktopBackend(options)).rejects.toThrow(
      /already running/i,
    );
    const created = await fetch(backend.url + "/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Desktop test", text: "Saved prose" }),
    });
    expect(created.status).toBe(201);
    await backend.stop();
    backend = undefined;
    const next = await startDesktopBackend(options);
    backend = next;
    expect(
      (await (await fetch(next.url + "/api/documents")).json()).some(
        (doc: any) => doc.title === "Desktop test",
      ),
    ).toBe(true);
    expect(readdirSync(join(dir, "backups")).length).toBeGreaterThan(0);
  });
});
