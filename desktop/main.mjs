import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { appendFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
  desktopPaths,
  desktopSmokeProfile,
  startDesktopBackend,
} from "./runtime.mjs";

const productName = "Language Workbench";
app.setName(productName);
const appRoot = app.getAppPath();
const repoRoot = app.isPackaged ? "" : appRoot;
const smokeDir = process.env.WORKBENCH_DESKTOP_SMOKE_DIR;
const profile = smokeDir
  ? desktopSmokeProfile(smokeDir, app.isPackaged)
  : app.isPackaged
    ? join(app.getPath("appData"), productName)
    : join(repoRoot, "data", "desktop-dev", "shell");
let profileError = false;
try {
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath("userData", profile);
} catch {
  profileError = true;
}
if (profileError) {
  dialog.showErrorBox(
    "Language Workbench could not start",
    "The local application data folder could not be opened. Your database was not deleted.",
  );
  app.exit(1);
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  const paths = desktopPaths({
    packaged: app.isPackaged,
    userData: app.getPath("userData"),
    repoRoot,
    appRoot,
  });
  const { dataDir } = paths;
  const logPath = join(dataDir, "logs", "desktop.log");
  const log = (message) => {
    try {
      appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, {
        mode: 0o600,
      });
    } catch {
      console.error(
        "Desktop log is unavailable; check the application data folder.",
      );
    }
  };
  let preflightError = null;
  try {
    mkdirSync(join(dataDir, "logs"), { recursive: true, mode: 0o700 });
    const localEnv = join(dataDir, ".env");
    if (existsSync(localEnv)) chmodSync(localEnv, 0o600);
    dotenv.config({ path: localEnv, quiet: true });
    log(
      `Starting ${productName} ${app.getVersion()} (${app.isPackaged ? "packaged" : "desktop development"})`,
    );
  } catch {
    preflightError =
      "Desktop configuration could not be read from the local app data folder.";
  }
  let backend,
    quitting = false,
    window;
  const failure = (message) => {
    log(`Startup error: ${message}`);
    if (window && !window.isDestroyed())
      void window.loadURL(
        `data:text/html,${encodeURIComponent(`<html><body style="font:16px system-ui;padding:40px"><h1>Language Workbench could not start</h1><p>${message.replace(/[&<>"']/g, "")}</p><p>Your database was not reset. See the desktop log in the app data folder.</p></body></html>`)}`,
      );
  };
  app
    .whenReady()
    .then(async () => {
      window = new BrowserWindow({
        width: 1320,
        height: 860,
        minWidth: 700,
        minHeight: 600,
        show: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          preload: join(appRoot, "desktop", "preload.cjs"),
        },
      });
      window.setTitle(productName);
      await window.loadURL(
        `data:text/html,${encodeURIComponent('<html><body style="font:16px system-ui;padding:40px"><h1>Opening Language Workbench…</h1></body></html>')}`,
      );
      if (preflightError) {
        failure(preflightError);
        return;
      }
      try {
        const loadServer = () =>
          import(
            pathToFileURL(join(appRoot, "apps", "server", "dist", "index.js"))
              .href
          );
        backend = await startDesktopBackend({
          dataDir,
          webDir: paths.webDir,
          env: process.env,
          loadServer,
          log,
        });
        const origin = backend.url;
        const external = (url) => {
          try {
            const parsed = new URL(url);
            if (
              ["http:", "https:"].includes(parsed.protocol) &&
              parsed.origin !== origin
            )
              void shell.openExternal(url);
          } catch {}
        };
        window.webContents.setWindowOpenHandler(({ url }) => {
          external(url);
          return { action: "deny" };
        });
        window.webContents.on("will-navigate", (event, url) => {
          try {
            if (new URL(url).origin === origin) return;
          } catch {}
          event.preventDefault();
          external(url);
        });
        window.webContents.on("will-attach-webview", (event) =>
          event.preventDefault(),
        );
        window.webContents.on(
          "did-fail-load",
          (_event, _code, _description, url, mainFrame) => {
            if (mainFrame && url.startsWith(origin))
              failure(
                "The local frontend could not load. Check the desktop log.",
              );
          },
        );
        session.defaultSession.setPermissionRequestHandler(
          (contents, permission, callback) =>
            callback(
              contents.id === window.webContents.id &&
                ["clipboard-read", "clipboard-sanitized-write"].includes(
                  permission,
                ),
            ),
        );
        session.defaultSession.webRequest.onHeadersReceived(
          (details, callback) => {
            if (!details.url.startsWith(origin + "/"))
              return callback({ responseHeaders: details.responseHeaders });
            callback({
              responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'",
                ],
              },
            });
          },
        );
        session.defaultSession.on("will-download", (_event, item) => {
          if (smokeDir) {
            const exportsDir = join(dataDir, "exports");
            mkdirSync(exportsDir, { recursive: true, mode: 0o700 });
            item.setSavePath(join(exportsDir, item.getFilename()));
          } else
            item.setSaveDialogOptions({
              title: "Save finished piece",
              defaultPath: join(app.getPath("downloads"), item.getFilename()),
            });
        });
        ipcMain.handle("workbench:open-data-folder", (event) => {
          if (
            event.sender.id !== window.webContents.id ||
            new URL(event.sender.getURL()).origin !== origin
          )
            return;
          return shell.openPath(dataDir);
        });
        await window.loadURL(origin);
        const loaded = await window.webContents
          .executeJavaScript(`new Promise(resolve => {
          const deadline = Date.now() + 20000;
          const check = () => document.querySelector('[data-testid="save-state"]') ? resolve(true) : Date.now() > deadline ? resolve(false) : setTimeout(check, 200);
          check();
        })`);
        if (!loaded)
          throw new Error(
            "The local frontend did not finish loading. Check the desktop log.",
          );
        log(`Desktop window ready on ${origin}`);
      } catch (error) {
        failure(
          error instanceof Error
            ? error.message
            : "Backend startup failed. Check the desktop log.",
        );
      }
    })
    .catch((error) =>
      failure(
        error instanceof Error ? error.message : "Desktop startup failed.",
      ),
    );
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (!backend || quitting) return;
    event.preventDefault();
    quitting = true;
    backend
      .stop()
      .then(() => {
        log("Desktop backend closed");
        app.quit();
      })
      .catch(() => app.exit(1));
  });
}
