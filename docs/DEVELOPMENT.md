# Development and verification

Start with [MAINTAINER-HANDOFF.md](MAINTAINER-HANDOFF.md) for the product contract and [ARCHITECTURE.md](ARCHITECTURE.md) for ownership boundaries. Run every command below from the root of **your own clone** (the directory containing `pnpm-workspace.yaml`). Older verification records describe their own historical checkpoints, not the current test count.

## Layout and install

- `apps/web`: React, TipTap, Workbench, Document View, Lab, tools and delivery renderers.
- `apps/server`: Express API, repository, provider registry/policy, offline/OpenAI adapters.
- `packages/domain`: shared document, target, export and routing contracts.
- `desktop`: Electron shell, backend lifecycle, startup SQLite snapshots and Keychain-backed credential storage.
- `tests` and colocated `*.test.ts`: unit/integration, browser, built-server and packaged-app checks. `docs` holds living guides alongside labeled historical verification.

Use Node **22.17.0 or newer** (Node 24 recommended) and **pnpm 10.34.5**. macOS desktop builds currently target **Apple Silicon (arm64)**. The checked-in `pnpm-workspace.yaml` approves the Electron and esbuild install scripts; do not loosen those approvals to work around installation failures.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Browser development runs Vite on `127.0.0.1:5173`, proxying `/api` to the Node server on `127.0.0.1:4318`. The default DB is `<repo>/data/workbench.sqlite` regardless of process working directory. A repository-root `.env` is optional; without an OpenAI key the explicitly labeled Offline provider works. For the compiled local browser runtime use `pnpm build && pnpm start`, then `http://127.0.0.1:4318`. These commands do **not** require Electron.

**DATA_DIR WARNING:** `DATA_DIR` overrides that repository-local DB path. Never point browser development, a test, or another backend at `~/Library/Application Support/Language Workbench` or any real daily-driver writing directory. Two processes writing the same SQLite database are not a supported workflow. Desktop development instead runs `pnpm desktop:dev` and uses `<repo>/data/desktop-dev/workbench.sqlite`; packaged desktop data is separate. See [DESKTOP.md](DESKTOP.md).

## Gates

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium # once on a new machine
pnpm test:e2e
pnpm test:production
pnpm desktop:build
pnpm desktop:smoke
```

Build before browser and compiled-server tests: they exercise the built frontend and server. `pnpm check` omits browser, compiled-server and desktop gates. Playwright runs one worker on port **4319**, starts its own server with an empty OpenAI key and a process-specific directory under the OS temp folder, and refuses to reuse an existing server. The production smoke also uses a disposable DB. `desktop:smoke` launches the packaged `.app` with an isolated temp profile and synthetic/intercepted OpenAI responses; it does **not** make a live or paid OpenAI call. Never substitute the real desktop profile into a smoke command.

Focused examples:

```sh
pnpm exec vitest run tests/desktop.test.ts
pnpm exec playwright test tests/e2e/workspace-shell.spec.ts
pnpm exec playwright test tests/e2e/workspace-shell.spec.ts -g 'Preview focus temporarily expands'
```

For a formatting **check** without modifying files, run:

```sh
pnpm exec prettier --check "apps/*/src/**/*.{ts,tsx,css}" "packages/*/src/*.ts" "tests/**/*.{ts,mjs}" "desktop/*.{mjs,cjs}" "*.{ts,json,yaml}"
```

`pnpm format` is **write mode**. Documentation Markdown is not covered by that script; review it separately. On a new Mac, normal Playwright Chromium installation is preferred over the optional sandbox-only packaged Chromium workaround described in README.

## Working-tree discipline

Before and after work, run `git status --short --branch` and `git diff --check`. Build outputs, `data/`, temp reports, `.env`, `.sqlite`/WAL files and `provider-credentials.json` are ignored; **do not force-add them**. Preserve user changes. Run relevant focused tests before full gates, review the diff, and commit locally only when requested. Do not push until reviewed. Use a disposable profile and backup before any manual exercise involving pre-existing writing data. The current validation status must come from a fresh run, not from counts in historical checkpoint documents.
