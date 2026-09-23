# Language Workbench

A local, single-user writing workspace. One TipTap/ProseMirror editor holds a document's sections; assistance reads context but proposes changes only to an explicit target. The human supplies the material, reviews proposals, and decides what to apply.

This repository is a working implementation, not a claim that every deep rhetorical workflow or dedicated control surface is complete. Section-local workbenches preserve the conversation around a piece of writing without making its experiments canonical. See the [workbench guide](docs/WORKBENCHES.md) and [Known limitations](#known-limitations) before relying on it for important work.

## Quick start

Requirements:

- **Node.js 22.17 or newer; Node 24 LTS recommended.** The backend uses built-in `node:sqlite`. Node 24 may still print an experimental SQLite API warning; that warning alone is not a startup failure.
- **pnpm 10.34.5**, matching `packageManager` in `package.json`.
- A current desktop browser. Automated browser checks target Chromium.

Run these commands from the repository root:

```sh
# If pnpm is not installed:
npm install --global pnpm@10.34.5

pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. Development runs Vite on port 5173 and the API on **127.0.0.1:4318**. Vite proxies `/api` to port 4318. Keep the default backend port in development unless you also change that proxy.

For the built application:

```sh
pnpm build && pnpm start
```

Open **http://127.0.0.1:4318**. The Node server serves both the built frontend and the API. This is still a local application, not an authenticated public deployment. Stop the process with Ctrl+C.

No proprietary hosting service is needed: clone/copy the Git repository, install its locked dependencies, and run it locally. The private database and `.env` are not a substitute for a backup and should not be committed to Git.

## Provider configuration

**No API key is required to try the app.** With no key, it uses an explicitly identified, deterministic **mock provider**. Its limited transformations and coaching fixtures exercise the workflow; they are not live model intelligence, current cultural research, or evidence of trending language. Mock mode does not provide live Language Radar research.

To use OpenAI, copy `.env.example` to `.env` in the **repository root** and edit it locally:

```dotenv
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4.1-mini
DATA_DIR=./data
PORT=4318
```

Restart the server after changing configuration. The key is read by the backend only. **Never put it in a `VITE_*` variable, browser code, a document, or Git.** An already-set process environment variable takes precedence over `.env`.

**Implemented providers:** OpenAI Direct uses the official OpenAI SDK and Responses API; Offline offers deterministic `conservative` and `plain` fixtures. OpenRouter, Vercel AI Gateway, and custom OpenAI-compatible providers are **metadata/settings placeholders only**: their adapters are unimplemented, explicitly disabled, and send no requests even if an environment key exists. They are not working integrations or live-verified providers.

Open **AI provider settings** to enable/disable implemented providers, refresh and cache model IDs, see the last-refresh timestamp, or add an OpenAI model ID manually without rebuilding. The catalog is local metadata, not proof of model access or capability. Unknown capabilities stay unknown; text generation is attempted with strict structured-output validation at response time. Web research requires a model whose web-search capability is explicitly known true. A provider/model failure is shown as an error; it does **not** silently select another model, fall back to mock results, or apply text.

`OPENAI_MODEL` supplies the centralized environment default (otherwise `gpt-4.1-mini`); no key defaults to Offline conservative. Application routing preferences can override that default. Keys are environment-only, never written by the app to SQLite or entered through the browser. Provider settings expose configuration status and, for keys longer than four characters, only the final four characters—not the raw key.

**Test connection is not a passive credential check.** For OpenAI it sends a tiny actual Responses request and may incur usage charges. The UI tests the first catalog model; the endpoint also accepts a model ID. A successful connection does not establish that all writing/research operations are supported.

When you invoke a real writing request, the backend sends the supplied document context (including brief, sources, and history), Style DNA, enabled knowledge-pack context, approved language references, and target/instructions to OpenAI. A small edit target does **not** mean only that small text is transmitted. The adapter requests `store: false`; this is not a guarantee of zero provider-side retention. Do not include material you are not authorized to transmit. Language Radar research is a separate, explicit web-search operation.

**Live OpenAI calls have not been verified in this sandbox because no credential was available.** Provider tests exercise the official SDK through a fake HTTP transport, including request serialization and validation; they do not establish live account/model availability or output quality.

## Working with a document

1. Write or paste into the editor. Add, label, reorder, split, or merge sections as needed. Section names describe the writing; they are not mandatory templates.
2. Use the brief for purpose, audience, destination, constraints, and framework preferences. Add source text and references separately from your own prose.
3. Put the cursor in a passage or select a word/passage within one section. Check the indicated target before asking for assistance. Whole-piece critique is analysis-only, and cross-section selections are not replacement targets.
4. For creative work, follow **diagnose → answer in your own words → request proposals**. Word/spelling assistance has limited direct-suggestion exceptions. Asking for assistance does not itself replace your writing.
5. Review and, if useful, edit the proposal. Apply explicitly, reject it, or save it as a variant. Applying preserves the original target text as an original variant. A changed target requires a fresh selection/request rather than a guessed replacement.
6. Check the save indicator. Export important work and keep database backups.

The current UI includes section metadata and notes, variants/originals, iteration history, document brief and sources, Style DNA, editable knowledge packs, and Language Radar records/preferences. Action schemas cover a broader range of writing techniques than the depth of the present UI: not every rhetorical mechanism has a bespoke, fully developed interaction.

### Local workbenches, model routing, and Word/Phrase Lens

- Each section can retain its own instruction and answer drafts, action/controls, lens settings, one-off and comparison choices, run history, proposal outcomes, and active inspected run. Whole-document critique has a separate document workbench. These optional records autosave with the document in SQLite; switching sections does not share or erase drafts.
- **Inspect, generate, compare, edit a candidate, or change a model never applies that candidate.** Only explicit Replace/Accept/Activate changes canonical prose through the guarded proposal/variant workflow. The editor remains directly editable by the human.
- Expand the context model dropdown to search models, override this section, set a section-type default, or choose **Run with** for the next single-model operation. Diagnosis counts as that operation. Provider settings also expose document, application, section-type, and task defaults.
- One shared resolver chooses **one-off → section → section type → task → document → application**. Word/Phrase Lens uses task `words` with this same precedence, not a separate preferred-model rule. Compare uses its own explicit model list and does not consume Run with.
- Compare **2–4 configured, enabled models** against the same target, material, and context. Successful outputs become independent model-labelled runs and saved variants, never automatic activations; failed models report errors rather than substitutions. Live comparison can charge for each model request.
- Select a word or a short phrase (up to eight words, not ending in `.`, `!`, or `?`) for Word/Phrase Lens. Whole punctuated sentences remain in Sentence Lab. Explore explains distinctions; Replace requests candidates with exact/balanced/loose fidelity and one-word/short-phrase/expression shape. Natural instructions, quick intents, persona/register/era, and technical precision direct the request. Sentence previews protect everything outside the selected target and never mutate the editor.
- Pending requests block document navigation with an explicit error. Section navigation remains available; late results belong to the originating section. A single global busy guard currently prevents simultaneous section requests.

See [docs/WORKBENCHES.md](docs/WORKBENCHES.md) for persistence, comparison, fidelity, stale-target behavior, and honest offline examples.

Sources currently open in a **modal dialog**, not a pinned reference pane visible while you write. Utilities use one-window dialogs; sustained side-by-side source work is a known limitation.

## Data, export, and backup

The default database is:

```text
<repository>/data/workbench.sqlite
```

SQLite uses WAL mode, so `workbench.sqlite-wal` and `workbench.sqlite-shm` may also exist. `DATA_DIR` can be an absolute directory or a path relative to the repository root, regardless of the process's working directory.

- The database holds documents (including optional section/document workbenches, model overrides, runs and variants), global preferences (Style DNA, knowledge packs, Language Radar, theme, routing defaults), and a separate provider-catalog cache with enablement and refresh timestamps. It stores no provider credentials.
- JSON document export preserves structured content, brief, sources, metadata, variants, history, document/section model choices, and workbench drafts/runs/active run/proposal outcomes. It is **not a backup of global preferences or the provider catalog**. Import creates fresh document, section, source, variant, run, and proposal/history identities and remaps references; it is not an in-place database restore. Older schema-version-1 documents without the optional workbench/routing fields remain readable; export before testing older software, which may not preserve new fields.
- Text/Markdown exports and clipboard output are for sharing prose, not complete round-trip backups.
- The current in-memory document can be exported if an API/save failure leaves edits unsaved. Export before reloading or closing a failing session.

### Full backup / restore

1. Wait until the app reports **Saved**. If saving fails, export the current document first.
2. Stop every app/server process using the database.
3. Copy the **entire data directory**, including any WAL/SHM files present, to a safe location. Do not copy only the main database while the server is running.
4. To restore, stop the app, preserve the current data directory separately, then restore the backed-up directory and start the app with the corresponding `DATA_DIR`.

A full database backup includes persisted documents, global preferences, and provider-catalog state, but not edits still only in browser memory. Keep `.env` separately and securely if you need to preserve local configuration; do not bundle a key in a shared document export.

Document autosave is debounced by **700 ms** and serialized. Revision compare-and-swap rejects conflicting document saves rather than overwriting a newer revision. It does not merge concurrent tabs. A before-unload warning helps with pending edits, but **there is no durable browser crash-recovery journal**: unflushed changes can be lost on a crash/forced close. Wait for Saved, especially after long dictation or a large paste. Global settings are not protected by document revision CAS.

## Verification

From the repository root:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:production
```

`pnpm check` runs type checking, unit/integration tests, and the build; it does not run E2E or the production smoke script. Build before browser/smoke checks because they exercise the built server/frontend.

The E2E configuration starts a separate server on **127.0.0.1:4319**, sets an empty API key, and uses a temporary database directory. It does not use or modify your normal `data/` database. It refuses to reuse an existing test server; free port 4319 if it is occupied. The production smoke script uses its own temporary data directory and port, and verifies persistence across a real process restart.

On an ordinary developer machine, prefer Playwright's installed Chromium. In a headless sandbox with an existing compatible Chromium executable, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select it:

```sh
# POSIX shell example; substitute an actual installed executable path.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium pnpm test:e2e
```

The repository also includes an npm-packaged Chromium dependency for sandbox use. This workaround is optional, not the recommended desktop installation path.

Verification records are checkpoint-specific. [docs/VERIFICATION.md](docs/VERIFICATION.md) remains the unchanged historical baseline for verified commit `4f681c6` (60 unit/integration and 15 browser tests). The workbench/model-routing extension passed **99 unit/integration tests, 27 browser tests, type checks, the production build, and the extended real-process restart/security smoke check**. Its current record is [docs/WORKBENCH-VERIFICATION.md](docs/WORKBENCH-VERIFICATION.md). The original test files were retained unchanged.

The extended production smoke covers model choices, local histories, routing, and catalog state across an actual server-process restart. Its credential-leak checks use a **synthetic fake key**, inspecting served static JavaScript and HTTP responses for raw-key exposure without real provider network calls. Neither this check nor SDK fake-transport tests establish live third-party verification. Actual Wispr OS-overlay testing must be performed on a supported desktop: see [docs/WISPR-QA.md](docs/WISPR-QA.md).

## Known limitations

- **Rhetorical depth:** core action routing and the human-first proposal workflow exist; not all deeper rhetoric, humor, reference, or technical explanation workflows have dedicated, complete UI.
- **Sources/layout:** source material is modal rather than persistently pinned beside the editor. Dialogs interrupt simultaneous reference-and-writing work. Recent-output comparison is a vertical review, not a full comparison canvas. There is no favorites/recent-model picker UI, although run history records the actual models used.
- **Truth and fidelity:** schema checks, protected quote/code text checks, forbidden-phrase and length guards reduce certain errors. They do not prove factual accuracy, semantic preservation, source support, or an appropriate voice. Review every proposal. A cited URL is not proof that it supports a generated claim.
- **Formatting:** generated replacements are text. A section-level replacement rebuilds paragraphs and is not a lossless rich-format rewrite. Original variants preserve text, not a full rich-document snapshot.
- **Recovery/concurrency:** unflushed browser edits have no crash recovery. Stale proposals/variants fail closed instead of being relocated automatically, including retained runs after section merges. Document CAS is conflict detection, not collaboration or multi-tab merging. Only one writing operation is active globally at a time.
- **Scale:** full document/workbench history is retained and sent as read context; request bodies are limited to 2 MB. Long-running documents can outgrow practical request/context limits. History compaction and bounded-context selection are future work, not current guarantees.
- **Offline scope:** curated lexical fixtures (including distinctions around “larping”) are not a general dictionary, semantic model, or current-web source. Exact-fidelity mock replacement declines to claim certainty. Repeated Generate more can return the same deterministic fixtures.
- **Security:** the server binds to loopback, validates Host/Origin, and restricts cross-site requests. There is **no authentication and no application-level database encryption**. Other trusted local software is outside that protection boundary. Do not expose it through a public reverse proxy or change it to a public bind address without a security redesign.
- **External integrations:** real OpenAI output and actual Wispr dictation were not live-tested here. The app implements no microphone capture, transcription service, or custom speech recognizer.
- **Extension:** a future browser extension would be a thin local client; no extension UI is implemented. Current loopback Host/Origin restrictions would require an explicit, narrowly scoped extension authorization design.

## Repository map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/useWorkspace.ts`, `workspace-helpers.ts` | Workspace coordination plus pure workbench/run/proposal helpers; editor lifecycle, autosave and request ownership |
| `apps/web/src/editor.ts` | Custom section nodes, target highlighting, rich-text/target coordinate mapping |
| `apps/web/src/App.tsx`, `WritingLabShell.tsx`, `UtilityPanel.tsx` | Workspace and utility UI |
| `apps/web/src/ModelControls.tsx`, `ProviderSettings.tsx`, `WordLens.tsx`, `WorkbenchHistory.tsx` | Model selection/settings, lexical controls and isolated previews, local run review |
| `packages/domain/src/index.ts`, `routing.ts`, `ai-output.ts` | Shared domain/workbench schemas, sole model resolver, structured output contract, target validation and defaults |
| `apps/server/src/app.ts` | Local HTTP API, validation and security boundary |
| `apps/server/src/repository.ts` | SQLite documents/settings/catalog persistence, import remapping and document revision CAS |
| `apps/server/src/provider-registry.ts` | Catalog/discovery, credential-safe provider status, model selection and shared SDK client |
| `apps/server/src/openai-provider.ts`, `mock-provider.ts`, `provider-policy.ts` | Provider adapters and common response safeguards |
| `tests/` | Server/provider, browser, and built-server restart checks |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design boundaries and maintenance risks.
