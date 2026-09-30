import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

let activeBackend = null;

export function desktopPaths({ packaged, userData, repoRoot, appRoot }) {
  return {
    dataDir: packaged ? userData : join(repoRoot, "data", "desktop-dev"),
    webDir: join(appRoot, "apps", "web", "dist"),
  };
}

export function desktopSmokeProfile(path, packaged) {
  const target = resolve(path);
  if (
    !packaged ||
    !target.startsWith(join(tmpdir(), "language-workbench-desktop-smoke-"))
  )
    throw new Error(
      "Desktop smoke data must use a packaged app and a dedicated temporary directory",
    );
  return target;
}

export async function backupDesktopDatabase(dataDir) {
  const sourcePath = join(dataDir, "workbench.sqlite");
  if (!existsSync(sourcePath)) return null;
  const backupDir = join(dataDir, "backups");
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const path = join(
    backupDir,
    `workbench-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.sqlite`,
  );
  const db = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(db, path);
  } finally {
    db.close();
  }
  return path;
}

export async function startDesktopBackend({
  dataDir,
  webDir,
  env,
  loadServer,
  log = console.info,
}) {
  if (activeBackend) throw new Error("Desktop backend is already running");
  activeBackend = { starting: true };
  let repository;
  try {
    if (webDir && !existsSync(join(webDir, "index.html")))
      throw new Error("Built frontend is missing from the desktop package");
    const backupPath = await backupDesktopDatabase(dataDir);
    log(`Desktop database: ${join(dataDir, "workbench.sqlite")}`);
    if (backupPath) log(`Desktop startup backup: ${backupPath}`);
    const { createApp, createRepository, ProviderRegistry, MockProvider } =
      await loadServer();
    repository = createRepository(dataDir);
    const registry = new ProviderRegistry({ repository, env });
    const app = createApp({
      repository,
      provider: new MockProvider(),
      registry,
      webDir,
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}`;
    log(`Desktop backend ready on ${url}`);
    let stopping = null;
    const stop = () => {
      if (stopping) return stopping;
      stopping = new Promise((resolve) => {
        const fallback = setTimeout(() => server.closeAllConnections(), 2000);
        server.close(() => {
          clearTimeout(fallback);
          repository.close();
          activeBackend = null;
          resolve();
        });
      });
      return stopping;
    };
    activeBackend = { port, url, stop };
    return activeBackend;
  } catch (error) {
    repository?.close();
    activeBackend = null;
    throw error;
  }
}
