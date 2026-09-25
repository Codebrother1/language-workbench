# Language Workbench

A local, single-user writing workspace. One TipTap/ProseMirror editor holds a document's sections; assistance reads context but proposes changes only to an explicit target. The human supplies the material, reviews proposals, and decides what to apply.

This repository is a working implementation, not a claim that every deep rhetorical workflow or dedicated control surface is complete. Workbench is the default view: ordered section cards, direct prose editing in the selected Comfortable card, separate Storyboard notes, an assembled preview, and section-local assistance. The same TipTap editor moves between the card and Document View; `Document.sections` remains the sole ordered content model. Sections can be parked in the same project without appearing in the reader draft. The Workbench, Preview, and Inspector panes can be resized, hidden, reopened, and restored from layout presets. Segue comparison reads adjacent draft sections without gaining permission to edit them. Word/Phrase Lens, the Personal Writing Library, scoped guides, and Structure remain available in the same application. See the [workspace shell verification](docs/WORKSPACE-SHELL.md), [parked-thought verification](docs/PARKED-THOUGHTS.md), [card composition verification](docs/PRIMARY-WRITING-VERIFICATION.md), [relational editing handoff](docs/RELATIONAL-EDITING.md), [refinement verification](docs/REFINEMENT-VERIFICATION.md), [workbench guide](docs/WORKBENCHES.md), [personal-library and Structure guide](docs/PERSONAL-LIBRARY.md), and [Known limitations](#known-limitations).

## Quick start

Requirements:

- **Node.js 22.17 or newer; Node 24 LTS recommended.** The backend uses built-in `node:sqlite`. Node 24 may still print an experimental SQLite API warning; that warning alone is not a startup failure.
- **pnpm 10.34.5**, matching `packageManager` in `package.json`.
- A current desktop browser. Automated browser checks target Chromium.

Run these commands from this same repository (`/agent/workspace/language-workbench` in the handoff workspace). The supported minimum is **Node 22.17.0**; check your active runtime and use exactly **pnpm 10.34.5**:

```sh
cd /agent/workspace/language-workbench # or your clone's repository root
node --version                      # v22.17.0 or newer
# If pnpm is not installed:
npm install --global pnpm@10.34.5
pnpm --version                      # 10.34.5

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

## Start without setup

Open a new document and use **Talk or type a thought**, or simply click the page and write. Wispr uses your normal desktop hotkey. The Writing Brief is optional and presented as **What are you making?**—before, during, or after writing.

After a rough thought, small next-step choices help you work a sentence, organize thoughts, make a Hook, or add the next part without automatic rewriting. Use **Cmd/Ctrl+K** or **Find a tool** when you do not know where something lives: try “synonyms”, “my hooks”, “structure”, “change model”, or “source”. The palette opens existing features; it is not another AI chat or editor. See [docs/WAYFINDING.md](docs/WAYFINDING.md) for behavior and verification.

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

When you invoke a real writing request, the backend sends the supplied document context (including brief, sources, and history), Style DNA, enabled knowledge-pack context, approved language references, up to 50 matching stored personal-library items and their resolved style context, and target/instructions to OpenAI. Structure requests also include raw notes, human-filled slots, scaffold, and preview. The library allowance prioritizes at most 40 rules/avoid records before references; it does not guarantee that every saved rule is included. A small edit target does **not** mean only that small text is transmitted. The adapter requests `store: false`; this is not a guarantee of zero provider-side retention. Do not include material you are not authorized to transmit. Language Radar research is a separate, explicit web-search operation.

**Live OpenAI calls have not been verified in this sandbox because no credential was available.** Provider tests exercise the official SDK through a fake HTTP transport, including request serialization and validation; they do not establish live account/model availability or output quality.

## Unrestricted section composition

Sections are an ordered array of reusable instances—not fixed Hook/Point/Segue slots. Repeat any type, omit any type, and reorder freely. Hover or keyboard-focus a boundary to reveal **+** and insert exactly there; **All section types** always remains available. Section options also provide Insert above/below, Duplicate section, conversion, drag/reorder, merge and confirmed deletion. The last deletion leaves an empty Freeform caret surface, with session undo available. See [docs/SECTION-INSTANCES.md](docs/SECTION-INSTANCES.md) for the invariant and verification.

## Timeline / relational editing

- **Workbench** is the primary default, including for older settings without a saved view. Click the selected Comfortable card's **Writing · reader-facing prose** area to edit its actual section content. The single TipTap editor moves into that card; there is no card-local prose draft to reconcile. **Edit in preview** moves it back to the assembled page, and **Document View** uses the same editor for whole-piece polish. View, density, preview visibility, and Inspector visibility persist as global layout preferences.
- **New thought** accepts native typing or dictation in a textarea. Enter adds the text as a Freeform section and leaves the capture field ready; Shift+Enter adds a line. The first thought fills an untouched empty starter section. Classification can come later.
- **Park thought** moves a section into the visible Parked Thoughts area below the draft without changing its ID, prose, notes, role, workbench, variants, or model choice. A parked thought stays editable in Workbench and is excluded from Document View, reader word count, text/Markdown export, and copy-all. **Include in draft** requires an explicit position before a draft section or at draft end. New thought remains quick Freeform capture; Add section and Add before/after open the role picker.
- **Layout** offers Writing, Review, Workbench only, All panes, and Reset layout. Drag a divider, or focus it and use Left/Right arrow keys, to resize visible panes. The Show/Hide buttons recover any pane; at least one remains visible. Widths and visibility persist. Workbench's **Draft** and **Parked** count buttons jump within its own scroll area without changing section placement.
- Comfortable puts reader-facing Writing ahead of the separately labeled private **Storyboard note** and secondary role. Overview shows a compact role, label, prose excerpt, and note cue for each card. Dragging shows the source and insertion marker before committing a reorder; Move Up/Down remain in section options. **Add before / Add after** opens the existing type picker.
- Notes and assistance directions use real native growing textareas (100–300 px, then internal scrolling). Notes are context, not prose; asking, inspecting, editing candidates, or comparing does not rewrite your text. Explicit Accept/Replace/Use this version is required.
- Select a Segue or Transition to read the actual previous/current/next sections, their roles, notes and prose. Neighbors are **read-only context** and must be selected separately to edit. An empty Segue can be coached from its note and neighbors; it need not contain placeholder prose. In offline mode, supply your own bridge wording—two lines give two human-furnished alternatives, or the mock returns supplied wording and a distinct conservative trim when possible. It does not invent a second choice.
- **Compare Segue versions** opens a wide dialog with previous context above, canonical prose and versions side by side, and next context below. Edit/copy candidates or explicitly Use this version; opening comparison never activates anything. Duplicate model/text candidates are collapsed. After one activation, other alternatives can become stale and still fail closed; there is **no automatic rebase**.
- Target and direction drafts survive navigation/reload. Section instructions stay section-scoped; word/selection instructions and answers are isolated by exact local range and text. A valid saved target restores exactly; a stale local target falls back to its surviving section, not a guessed occurrence. Acceptance stays in the same section, preserves Inspector/history scroll, and reclassifies a word replaced by a phrase as a selection. Blocked or no-change replacements are not recorded as accepted.
- **Ordinary cross-section typing, deletion, cut and paste are refused with guidance; cross-section copy remains allowed.** Single-section boundary selections are clamped inside that existing section, and copied rich section wrappers paste as content, not new section identities. Use explicit section commands for topology changes. There is no silent ID repair.
- The header's **Document sources** button shows the existing source count and opens the existing modal. Find a tool recognizes `source`, `sources`, `reference`, `reference material`, `transcript`, and `paste source`. Cmd/Ctrl+K remains available; **slash commands are deferred**, and `/` is ordinary text.

This is a layout/workflow correction, not a font or color-system redesign. On narrower screens the Workbench stays in the page flow: Inspector moves below at 1180 px and panels stack at 760 px. It is not a fullscreen drawer or fixed overlay; long vertical scrolling remains possible. See [RELATIONAL-EDITING.md](docs/RELATIONAL-EDITING.md) for engineering contracts and known friction.

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

### Personal library, scoped style, and Structure

Open **Personal library** explicitly to browse or edit saved language. Inspector tools (**Save to library**, contextual references, **Style for this target**, and **Structure · assemble a thought**) start collapsed; library and guide utilities open in dialogs only when requested. Expanding many tools can still produce a long Inspector scroll.

- Save a selection or candidate verbatim as a snippet, pattern, move, or style example. **Add to Hook Style** (or the current section type) saves a `style_example`, not an inferred style rule. **My Language** is a flag on an item, not another store. Nothing is learned, approved, or inserted automatically.
- Use **Style guides → Save style rule** for an actual explicit preference. Rules are library records, not a duplicate preference store. Authority is **current instruction → section notes → section-type guide → content-type guide → global Style DNA**. Matching named keys resolve deterministically; freeform directions are ordered for provider interpretation, not a guarantee of semantic conflict resolution. In notes/instructions, `rhythm:` is ignored; `rhythm: [clear]` explicitly clears that named value.
- Scope lists match **OR within each dimension, AND across dimensions**: section types, content types, exact case-insensitive audience labels, and register. A register restriction needs a known matching context. Custom tags are searchable, not restrictions. Search normalizes Unicode, case, accents and punctuation; literal partials such as `que`, `que sera`, and `sera` can find `Qué será` across all item types. Every query token must match; only tokens of four or more characters get a bounded one-edit fallback, ranked below literal matches. This is not semantic/embedding search. Your category filter is preserved; **Search all types** explicitly reveals matching items outside it.
- Contextual references never auto-insert. Preview a snippet/example for an exact target, then explicitly Accept/Replace. That accepted library preview can update its use count; frequent use lowers reference ranking. Manual copy does not mark use.
- Structure contains original practical notes for **17 relationships, 72 connector entries, and 52 scaffolds**, not copied handbook text. Start with your own A/B thoughts or segment raw notes into verbatim heuristic units, then choose the relation, register, and scaffold. Technical and conversational options differ; connector explanations are not blind replacement commands.
- Custom scaffolds use `[X]`, `[Y]`, and optional `[Z]`; an optional detail has a chosen job such as qualifier, example, or reveal. Slots never invent facts. Exact casing/punctuation is preserved, so tidy duplicated stops or connectors yourself. **Stage for target** creates a human proposal in the existing pipeline, not a canonical edit. Only explicit acceptance applies it.
- **Analyze relationship** and **Critique structure** return no proposals. **Propose a tighter version** requires both human thoughts and a complete preview, uses action `structure` through the same model hierarchy (including section type), and still requires acceptance. Favorite/Avoid connector choices are scoped library records; avoided connectors are hidden unless **Show avoided connectors** is checked.

See [docs/PERSONAL-LIBRARY.md](docs/PERSONAL-LIBRARY.md) for scope examples, saving patterns/moves, export/import, style conflict behavior, and important limits on provider context.

Sources currently open in a **modal dialog**, not a pinned reference pane visible while you write. Utilities use one-window dialogs; sustained side-by-side source work is a known limitation.

## Data, export, and backup

The default database is:

```text
<repository>/data/workbench.sqlite
```

SQLite uses WAL mode, so `workbench.sqlite-wal` and `workbench.sqlite-shm` may also exist. `DATA_DIR` can be an absolute directory or a path relative to the repository root, regardless of the process's working directory.

- The database holds documents (including optional section/document workbenches, model overrides, runs and variants), global preferences (Style DNA, knowledge packs, Language Radar, theme, routing defaults), a separate shared personal-library table with its own revision CAS (including guides and connector preferences), and a separate provider-catalog cache with enablement and refresh timestamps. It stores no provider credentials.
- JSON document export preserves structured content, brief, sources, metadata, variants, history, document/section model choices, persisted focus, and workbench drafts/runs/active run/proposal outcomes, including optional target-local instruction/answer drafts, Structure drafts and run inputs. It is **not a backup of the global personal library, global preferences, or provider catalog**. Import creates fresh document, section, source, variant, run, and proposal/history identities and remaps references, including focus and target-draft ownership; it is not an in-place database restore. Section duplication also remaps its target drafts. Global layout preferences are included in a full database backup, not document JSON. Older schema-version-1 documents without the optional focus/workbench/routing fields remain readable; export before testing older software, which may not preserve new fields.
- **Export library JSON** is separate from document export: it includes library items, style guides, connector preferences, scopes, provenance, and usage metadata. **Import library JSON** appends fresh item IDs and never overwrites existing items; repeated imports create copies. It excludes documents, global Style DNA, provider settings, and credentials.
- Text/Markdown exports and clipboard output are for sharing prose, not complete round-trip backups.
- The current in-memory document can be exported if an API/save failure leaves edits unsaved. Export before reloading or closing a failing session.

### Full backup / restore

1. Wait until both document and library report **Saved**. If either save fails, export the current document and/or library before leaving.
2. Stop every app/server process using the database.
3. Copy the **entire data directory**, including any WAL/SHM files present, to a safe location. Do not copy only the main database while the server is running.
4. To restore, stop the app, preserve the current data directory separately, then restore the backed-up directory and start the app with the corresponding `DATA_DIR`.

A full database backup includes persisted documents, the shared personal library (including guides), global preferences, and provider-catalog state, but not edits still only in browser memory. Keep `.env` separately and securely if you need to preserve local configuration; do not bundle a key in a shared document export.

Document autosave is debounced by **700 ms** and serialized. Revision compare-and-swap rejects conflicting document saves rather than overwriting a newer revision. It does not merge concurrent tabs. A before-unload warning helps with pending edits, but **there is no durable browser crash-recovery journal**: unflushed changes can be lost on a crash/forced close. Wait for Saved, especially after long dictation or a large paste. Library writes/imports have a separate serialized queue and revision CAS; a conflict is not an automatic multi-tab merge. Global settings still have no revision CAS.

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

**Current refinement verification:** [docs/REFINEMENT-VERIFICATION.md](docs/REFINEMENT-VERIFICATION.md). The prior Timeline / Relational Correction checkpoint passed 343 unit/integration and 71 browser tests, TypeScript, production build and restart/security smoke; details remain in [docs/RELATIONAL-VERIFICATION.md](docs/RELATIONAL-VERIFICATION.md). The earlier first-use/wayfinding checkpoint recorded **291 unit/integration tests, 58 browser tests, TypeScript, the production build, and the real-process restart/security smoke check**; see [docs/WAYFINDING.md](docs/WAYFINDING.md). Historical records do not verify later changes.

The extended production smoke covers model choices, local histories, routing, and catalog state across an actual server-process restart. Its credential-leak checks use a **synthetic fake key**, inspecting served static JavaScript and HTTP responses for raw-key exposure without real provider network calls. Neither this check nor SDK fake-transport tests establish live third-party verification. Actual Wispr OS-overlay testing must be performed on a supported desktop: see [docs/WISPR-QA.md](docs/WISPR-QA.md).

## Known limitations

- **Rhetorical depth:** core action routing and the human-first proposal workflow exist; not all deeper rhetoric, humor, reference, or technical explanation workflows have dedicated, complete UI.
- **Sources/layout:** source material is modal rather than persistently pinned beside the editor. Dialogs interrupt simultaneous reference-and-writing work. Relational comparison offers a wide canonical/version view, but ordinary recent-output history remains vertical and this is not a general multi-section editing canvas. Narrow layouts are in-flow rather than overlays and may require a long scroll. There is no favorites/recent-model picker UI, although run history records actual models. Slash-command activation is deferred; `/` remains ordinary text.
- **Truth and fidelity:** schema checks, protected quote/code text checks, forbidden-phrase and length guards reduce certain errors. They do not prove factual accuracy, semantic preservation, source support, or an appropriate voice. Review every proposal. A cited URL is not proof that it supports a generated claim.
- **Formatting:** generated replacements are text. A section-level replacement rebuilds paragraphs and is not a lossless rich-format rewrite. Original variants preserve text, not a full rich-document snapshot.
- **Recovery/concurrency:** unflushed browser edits have no crash recovery. Editor Undo/Redo is session-only, not persistent or universal metadata undo. Stale proposals/variants fail closed instead of being relocated automatically, including retained runs after section merges and alternatives after another version is activated; no automatic rebase is implemented. Document CAS is conflict detection, not collaboration or multi-tab merging. Only one writing operation is active globally at a time. The growing `useWorkspace` hook remains a maintenance risk; library CAS does not fix multi-tab settings overwrites.
- **Library/style/Structure:** no automatically learned style-guide GUI or automatic rule approval; references and keyword search are not semantic retrieval. Exact audience labels and register scopes require care. Raw segmentation and relationship suggestions are heuristics, not proof; literal `[X]/[Y]/[Z]` scaffolds preserve typed casing and punctuation rather than performing grammatical cleanup. The provider receives at most 50 matching items, with at most 40 rule/avoid records prioritized; a large library can omit applicable rules or avoids, so not all stored style is enforced. The local style display can show more rules than the bounded provider context.
- **Scale:** full document/workbench history is retained and sent as read context; request bodies are limited to 2 MB. The library schema allows at most 5,000 items, but whole-library saves/imports can hit the practical 2 MB limit earlier. Long-running documents can outgrow practical request/context limits. History compaction and bounded whole-document context selection are future work, not current guarantees.
- **Offline scope:** curated lexical fixtures (including distinctions around “larping”) are not a general dictionary, semantic model, or current-web source. Exact-fidelity mock replacement declines to claim certainty. Repeated Generate more can return the same deterministic fixtures.
- **Security:** the server binds to loopback, validates Host/Origin, and restricts cross-site requests. There is **no authentication and no application-level database encryption**. Other trusted local software is outside that protection boundary. Do not expose it through a public reverse proxy or change it to a public bind address without a security redesign.
- **External integrations:** real OpenAI output and actual Wispr dictation were not live-tested here. The app implements no microphone capture, transcription service, or custom speech recognizer.
- **Extension:** a future browser extension would be a thin local client; no extension UI is implemented. Current loopback Host/Origin restrictions would require an explicit, narrowly scoped extension authorization design.

## Repository map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/useWorkspace.ts`, `workspace-helpers.ts` | Workspace coordination plus pure workbench/run/proposal helpers; editor lifecycle, autosave and request ownership |
| `apps/web/src/editor.ts`, `section-boundary.ts` | One editor, target mapping/highlighting, ordered-ID guard and explicit structural/local authorization |
| `apps/web/src/target-drafts.ts` | Exact range draft isolation, focus persistence/restore, empty-target coaching eligibility |
| `apps/web/src/App.tsx`, `RelationalWorkspace.tsx`, `WritingLabShell.tsx`, `UtilityPanel.tsx` | Primary Workbench, relational projections/comparison, existing writing and utility UI |
| `apps/web/src/ui.tsx`, `styles.css` | Native growing textareas, target contrast, density and in-flow responsive layouts |
| `apps/web/src/ModelControls.tsx`, `ProviderSettings.tsx`, `WordLens.tsx`, `WorkbenchHistory.tsx` | Model selection/settings, lexical controls and isolated previews, local run review |
| `apps/web/src/PersonalLibrary.tsx`, `LibraryTools.tsx`, `StructureTool.tsx`, `library-helpers.ts` | Library/guide UI, contextual saves, scaffold builder, explicit item and human-preview helpers |
| `packages/domain/src/personal-library.ts`, `composition.ts`, `composition-knowledge.ts` | Library scope/style resolution, Structure schema and verbatim helpers, original composition notes |
| `packages/domain/src/index.ts`, `routing.ts`, `ai-output.ts` | Shared domain/workbench schemas, sole model resolver, structured output contract, target validation and defaults |
| `apps/server/src/app.ts` | Local HTTP API, validation and security boundary |
| `apps/server/src/repository.ts` | SQLite documents/settings/library/catalog persistence, import remapping, separate document/library revision CAS |
| `apps/server/src/writing-context.ts` | Shared server-side stored-library scoping, bounded disclosure, and style enrichment for single/compare/injected providers |
| `apps/server/src/provider-registry.ts` | Catalog/discovery, credential-safe provider status, model selection and shared SDK client |
| `apps/server/src/openai-provider.ts`, `mock-provider.ts`, `provider-policy.ts` | Provider adapters and common response safeguards |
| `tests/` | Server/provider, browser, and built-server restart checks |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design boundaries and maintenance risks.

## Checkpoint records — current first

- **Current refinement:** [REFINEMENT-VERIFICATION.md](docs/REFINEMENT-VERIFICATION.md) records the focused fixes and checks. [RELATIONAL-EDITING.md](docs/RELATIONAL-EDITING.md) and [RELATIONAL-VERIFICATION.md](docs/RELATIONAL-VERIFICATION.md) remain the previous checkpoint’s handoff and verification.
- **Historical first-use/wayfinding:** [WAYFINDING.md](docs/WAYFINDING.md).
- **Historical unrestricted section composition:** [SECTION-INSTANCES.md](docs/SECTION-INSTANCES.md).
- **Historical library, scoped-style, and Structure pass:** [LIBRARY-VERIFICATION.md](docs/LIBRARY-VERIFICATION.md). Results and limitations for that checkpoint.
- **Historical workbench milestone `266c0d0`:** [WORKBENCH-VERIFICATION.md](docs/WORKBENCH-VERIFICATION.md) — recorded 99 unit/integration and 27 browser tests, type checks, build, and extended real-process restart/security smoke.
- **Historical original baseline `4f681c6`:** [VERIFICATION.md](docs/VERIFICATION.md) — recorded 60 unit/integration and 15 browser tests. Preserved as its own baseline, not evidence for later additions.
