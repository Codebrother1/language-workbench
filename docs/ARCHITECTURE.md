# Architecture

This describes the implemented local application and its boundaries, not a roadmap presented as finished functionality. Installation and operational commands are in [README.md](../README.md); workflows are in [WORKBENCHES.md](WORKBENCHES.md).

## Components and data flow

```text
Browser: React + one TipTap/ProseMirror editor
  App / WritingLabShell / UtilityPanel
  ModelControls / ProviderSettings / WordLens / WorkbenchHistory
                      |
         useWorkspace + pure workspace-helpers
                      | same-origin /api requests
                      v
Express application: loopback-only HTTP boundary (app.ts)
       |                                  |
       v                                  v
SQLite Repository                  One ProviderRegistry
  documents JSON + revision          catalog, availability, routing
  singleton settings JSON            one shared OpenAI SDK client
  provider_catalog JSON                      |
                                     LLMProvider interface
                                       |-- MockProvider: conservative/plain
                                       `-- OpenAIProvider: selected model
                                             | structured Responses output
                                             ` separate web-search research

Shared domain: packages/domain/src/
  index.ts      document/workbench schemas, targets, exports, defaults
  routing.ts    model/catalog/lens schemas + sole resolveModel algorithm
  ai-output.ts  common structured response schema
```

Development uses Vite on `127.0.0.1:5173` with `/api` proxied to `127.0.0.1:4318`. Production serves the Vite build from the same Express server as the API. `config.ts` resolves the repository root from the module path, loads root `.env`, and resolves relative `DATA_DIR` paths against that root rather than the current working directory.

`createApp` accepts an injected repository/provider and optional registry. Normal bootstrap supplies the registry; direct provider injection remains useful for isolated tests. Importing the app does not bind a port, load credentials, or open a database. `index.ts` owns startup and graceful shutdown. `OPENAI_MODEL` uses a centralized environment default.

There is no second writer or provider-specific document persistence path. One registry selects adapters through the same `LLMProvider` contract; OpenAI adapters reuse its shared official SDK client. OpenRouter, Vercel AI Gateway, and custom OpenAI-compatible entries are metadata/settings placeholders, explicitly unimplemented and disabled—not working adapters.

## Canonical domain

The shared domain module is the contract between browser, API, storage, and providers. Important records:

- **Document** (`schemaVersion: 1`): ID, timestamps, revision, brief, ordered sections, sources, history; optional `defaultModel` and document `workbench`.
- **WritingSection:** stable ID, kind/label, rich-node content, notes, variants; optional `modelOverride` and `workbench`.
- **SectionWorkbench:** instruction/answer drafts, action/controls, lens options, one-off model, comparison choices, runs, `activeRunId`, and proposal-state map.
- **WorkbenchRun:** ID/time, captured target/action/instruction/answer/controls/lens, actual model reference, and full structured response with routing provenance.
- **EditTarget:** document ID/revision, scope, section ID, text offsets, selected text, and the source section's text snapshot.
- **Variant:** text, original/human/AI origin, label, timestamp, target anchor, and optional model/run references.
- **Iteration:** target, instruction, question, answer, proposal, decision state, provider label, and optional model/run references.
- **Settings:** Style DNA, packs, radar, theme, and optional application/type/task routing defaults. Global settings are not embedded in document export.
- **ModelRef/catalog:** provider/model identity, provider implementation/configuration/enablement, model capability knowledge, and cache timestamp.
- **AIRequest / AIResponse:** explicit readable context, edit target, action, stage, controls, and structured diagnosis/questions/findings/lexical results/proposals.

Canonical **prose** is section rich-node content. Drafts/candidates/runs are persisted metadata, not a second canonical text. Each section owns its optional workbench; whole-piece critique/template analysis uses the optional document workbench separately. Persisted `activeRunId` restores the inspected response after reload. Diagnosis-only runs survive even when no proposal/iteration exists.

`workspace-helpers.ts` provides pure workbench read/update, lens classification, run capture/inspection/append, proposal editing, and fork-provenance helpers. Runs get fresh proposal IDs, avoiding collisions across fixtures/models. Successful comparison creates independent runs and saved variants. Human candidate edits update stored candidates/history, not prose.

New workbench/routing fields are optional: older version-1 documents remain readable without destructive conversion. This does not promise that older binaries preserve new fields. Zod parses requests and stored domain records. `schemaVersion: 1` is a format identifier, not a general migration framework. Future schema changes need deliberate migration and round-trip tests; parsing defaults alone should not be treated as a migration plan.

## Editor and state ownership

There is **one rich-text editor**, not a separate editor per section. The custom document node requires `writingSection+`; section nodes contain `block+`, are defining/isolating, and carry section identity/kind/label. A plugin repairs missing or duplicate section IDs after editor transactions.

`editor.ts` converts between canonical section data and the editor tree, maps textual target offsets to ProseMirror positions, and decorates the active target. It does not own persistence. Normal keyboard input, clipboard operations, and composition use browser/editor behavior; no speech capture pipeline is installed.

`useWorkspace` is the central coordinator for the active document, document list, editor, target, proposals, save state, preferences, and UI panels. Refs retain current values for asynchronous operations. Rich-editor updates reconstruct section content while a single-document metadata cache retains notes, variants, workbenches and model overrides, including metadata needed when editor undo resurrects a removed section. Loading another document resets that cache and the ProseMirror state/history.

Requests capture the originating target and owner; completion patches the latest document, not a request-time snapshot. Section navigation can continue while a request is pending; late responses stay with the originating section. Removed origins fail closed. Document navigation during a pending run is blocked with an explicit error. One global busy guard prevents simultaneous section operations (one comparison operation can still fan out internally).

Inspecting a run restores its draft/control context and active response, not its prose. Section merge retains old runs but does not fabricate safe new anchors; obsolete snapshots/references fail the usual stale-target checks.

**Maintenance risk:** helpers are modular, but this hook remains large. Editor transactions, metadata restoration, in-memory snapshots, saving, and provider requests are coupled. ProseMirror undo is not a universal undo transaction for every preference or metadata action. Preserve regression coverage for split/merge/reorder, undo/redo, section IDs, notes/variants, asynchronous saves, and document switches before splitting responsibilities into smaller modules.

## Read context is not edit permission

A writing request may include the entire document and preferences as **read context**. A separate **edit target** is the only authorized replacement range.

1. Identify a word, passage, or section target in the editor. Cross-section selections do not become replacement permission.
2. Validate document identity, section existence, the source section snapshot, and the target text/range before asking the provider.
3. Diagnose and ask a question first for creative work. A nonblank human answer is required before creative proposals. Word/spelling actions have limited exceptions.
4. Validate structured output and common provider policy at the API boundary.
5. Present proposals without changing the writing. The user may edit, reject, save as a variant, or explicitly Replace/Accept/Activate. Model changes and run inspection are not activation.
6. On apply/variant activation, validate the target against the **current browser document** again, map it into the current editor, and change only that range. Preserve original target text as an original variant.

Document-wide critique and template analysis are analysis-only; they cannot replace the document. Provider adapters have no persistence capability. `/api/ai` and `/api/ai/compare` return results rather than writing canonical content. Workbench metadata uses the ordinary document autosave path.

The section snapshot check is intentionally conservative: a change elsewhere in the same section can invalidate a target. An unrelated section edit or autosave revision increment need not invalidate an unchanged target. `documentRevision` is recorded for provenance, but target validity is not simply equality with the latest save revision. Database revision CAS is a separate persistence concern.

Stale variants **fail closed** instead of searching for similar text and guessing where it belongs. Original variants are text snapshots, not complete rich-format versions. Section replacement builds paragraphs from text; it can discard local rich formatting.

## Providers and safeguards

`LLMProvider` exposes `run(request)` and `researchCulture(query)` plus capability flags. The registry selects one adapter per resolved model:

- Offline conservative/plain: deterministic fixtures, no network or live research.
- OpenAI Direct: official SDK Responses adapter, structured Zod output with `responses.parse`, `store: false`, timeout, bounded retries. Failures surface without silently changing models or falling back to mock.

Catalog descriptors, enablement and `lastRefreshedAt` persist in SQLite. OpenAI discovery lists model IDs; refresh preserves manual entries and concurrent disable/manual-add changes. A failed refresh retains the cache. Manual OpenAI IDs require no rebuild but do not prove availability. Unknown capabilities remain absent/unknown; unknown structured-output support can be attempted with strict response validation, while explicit unsupported status is rejected. Research requires `webSearch === true`, so newly discovered/manual models with unknown web-search capability cannot research. Known capability metadata is not live account verification.

Keys come only from the backend environment/root `.env`. No credential-write API or browser key-entry UI exists. Status exposes only configuration and the final four characters for keys longer than four characters; shorter keys have no suffix. Catalog persistence contains metadata, not credentials. Placeholder providers remain unimplemented/disabled even when an environment key exists.

OpenAI **Test connection sends an actual tiny Responses request and may charge**. The endpoint accepts an optional model ID; the UI omits it, so the first catalog model is tested. Success is not certification of structured writing/research support.

Enabled knowledge packs and saved/approved radar references are filtered for writing context. Disliked and never-suggest entries participate in exclusion checks. Writing calls have no web-search tool. Research is a separate operation: require web search, collect tool URL citations, then extract structured radar records referencing those exact URLs. New research records are `maybe`, not automatically approved. Verification timestamps are not dates of first usage or proof of present popularity.

`provider-policy.ts` and domain validation enforce mechanically testable restrictions: diagnosis-only boundaries, target/range checks, proposal counts/IDs, known section IDs in findings, word scope, requested word/character counts, forbidden phrases, and preservation of recognizable quoted/backtick/fenced text spans. These checks also run at the API boundary for injected/future adapters.

**Limits:** textual quote/code safeguards are not a semantic verifier or a complete rich-node protection system. They cannot prove that all code, transcript meaning, claims, uncertainty, emotional intent, or source evidence survived unchanged. Source citation membership verifies a URL came from the search result, not that it supports the claim. Human review remains necessary. Editing a proposal manually does not make its claims verified.

Live OpenAI execution has not been tested here without a credential. Tests using the official SDK with a fake HTTP transport cover serialization and response validation, not real provider availability, research quality, latency, or billing.

## Model routing, comparison, and Word/Phrase Lens

`routing.ts::resolveModel` is the sole UI/server precedence algorithm:

```text
one-off Run with > section override > section-type default > task default
                > document default > application preference/environment default
```

Lens requests use task `words` in the same chain. Whole-document analysis has no section override/type. Application/type/task defaults are global preferences; section/document defaults travel with the document. No route grants fallback or edit permission.

The searchable context dropdown shows effective model and route. Run with is consumed by the next dispatched **single-model operation, including diagnosis**; it is not a diagnose-and-propose session override. Failed dispatched requests do not restore it. Compare uses its own explicit list of 2–4 distinct model references, leaving one-off choice untouched.

The compare endpoint clones the same request context per model and executes independently through the registry. Each result is a response or per-model error. Successful results are model-labelled runs and saved variants; no winner is activated automatically. UI feedback is a busy indication, errors and completed history/outcomes—not token streaming or a persistent per-provider progress log. Recent outputs are a vertical review, not a full comparison canvas. Favorites/recent-model picker UI is absent; run history records actual models.

`isLensTarget` routes word targets and explicit nonempty selections of at most eight words without terminal `.`, `!`, or `?` to Word/Phrase Lens. Whole punctuated sentences remain in Sentence Lab. Server policy separately requires a bounded local single-line lexical target. Explore returns analysis/lexical entries without proposals; Replace may propose without an interview but still cannot apply automatically.

Requests include natural instruction, exact/balanced/loose fidelity, word/phrase/expression shape, intent, persona/register/era, technical precision and document audience. Generated candidates are single-line and shape-checked: one whitespace-delimited token, at most eight tokens, or at most 24 tokens. This is a generation safeguard; humans can manually edit candidate text afterward.

`WordLens.tsx::lexicalPreview` is a pure function using sentence segmentation and an unchanged prefix/suffix around the candidate. It never dispatches an editor transaction or writes persistence. Current/proposed sentence previews and copy do not broaden the narrow target; only explicit Replace applies through stale guards.

Fidelity is a requested constraint, not semantic proof. The mock declines exact-fidelity replacements it cannot guarantee. Its curated “larping” and assumption/inference/conviction entries are not general intelligence, a comprehensive dictionary, historical authenticity or current-web research. Unknown definitions are not invented; repeated Generate more can return the same deterministic fixtures.

### HTTP routes

`apps/server/src/app.ts` defines all endpoints behind the same local security boundary:

| Route | Behavior |
| --- | --- |
| `GET /api/health` | Startup/default provider status |
| `GET/POST /api/documents`, `GET/PUT/DELETE /api/documents/:id` | List/create/read/CAS save/delete |
| `POST /api/import` | Validated identity-remapped document copy |
| `GET/PUT /api/settings` | Non-secret global preferences, including routing |
| `GET /api/providers` | Sanitized catalog, status and environment default |
| `PATCH /api/providers/:id` | Enable/disable implemented provider; `enabled` only |
| `POST /api/providers/:id/models` | Register OpenAI model ID and optional display name |
| `POST /api/providers/:id/models/refresh` | Refresh/cache model IDs and timestamp |
| `POST /api/providers/:id/test` | Connection test; optional `modelId` |
| `POST /api/ai` | Validated single-model response |
| `POST /api/ai/compare` | 2–4 distinct explicit models; independent outcomes |
| `POST /api/culture/refresh` | Explicit research; optional document/one-off routing context |

## Persistence and concurrency

`Repository` uses synchronous built-in `node:sqlite` with WAL mode and a busy timeout. The current tables are:

```text
documents(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)
settings(id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL)
provider_catalog(id TEXT PRIMARY KEY, body TEXT NOT NULL)
```

The catalog table is added with `CREATE TABLE IF NOT EXISTS`. A document's complete JSON, including optional workbenches and active-run selection, is stored in `body`. A save checks the incoming revision and updates with `WHERE id = ? AND revision = ?`, then increments the revision. A conflict returns HTTP 409 rather than overwriting a newer save. This is compare-and-swap, not real-time collaboration or conflict merging.

The browser debounces changes by 700 ms, serializes saves, and loops if more edits arrived during an in-flight save. It merges the returned revision/timestamp without replacing newer in-memory text. Document navigation attempts to flush pending writes. Failed saves retain the in-memory document and expose an error; export it before reload if necessary.

There is a pending-edit before-unload warning but **no durable browser crash-recovery journal**. A browser crash/forced close can lose unflushed edits. Settings use a serialized client queue but server-side singleton settings writes do not have document-style CAS; multiple tabs can still overwrite preferences.

Import validates a document and remaps document/section/source/variant identities, workbench run IDs, proposal/history IDs, active-run selection, proposal-state keys, target/finding references and run links. It is a new copy, not an in-place restore. JSON document export includes local workbenches/model defaults but excludes global settings/catalog/credentials. For a full persisted backup, stop the server and copy the entire data directory, including any SQLite WAL/SHM files. See the README for recovery precautions.

**Scale limits:** JSON request bodies are capped at 2 MB. Full responses, section snapshots and workbench histories grow the stored document and AI read context. There is no current history compaction or bounded-context policy; large histories can exceed HTTP/provider limits. The single-document metadata cache also has memory cost. Archival and bounded-context selection are future work, not current guarantees.

## Local security and portability

- The process binds to `127.0.0.1` only.
- Host and Origin checks allow loopback hosts; cross-site fetch metadata is rejected. Mutations require `application/json`, including DELETE.
- API responses use `Cache-Control: no-store`; JSON request bodies have a size limit.
- OpenAI credentials exist only on the backend. No browser `VITE_*` key or proprietary hosting dependency is required.
- There is **no authentication, encrypted database, multi-user isolation, or hardened public-server deployment model**. Loopback restrictions do not protect against arbitrary local processes or compromised trusted local applications.

A future browser extension should be a thin client to the local API with minimal permissions. No extension UI/manifest is implemented. Existing Host/Origin restrictions do not constitute extension authorization: extension origins would need explicit, narrowly scoped support, pairing/authentication, and a threat-model review rather than a broad CORS exception.

## UI scope and verification boundary

The current UI exposes the brief, sources, section metadata, variants, history, Style DNA/packs, and radar alongside core writing/proposal flows. Sources are modal rather than a pinned side-by-side reference. Utilities use one-window dialogs. Broad action/schema coverage is not evidence that every deep rhetorical mode has a complete dedicated UI.

Verification is layered: domain/editor tests, repository/API tests, provider transport/policy tests, Chromium E2E, and a real built-server restart smoke check. The unchanged historical [VERIFICATION.md](VERIFICATION.md) records baseline `4f681c6`. Final extension results belong in the separate [WORKBENCH-VERIFICATION.md](WORKBENCH-VERIFICATION.md), finalized after the new pass; baseline counts do not verify new code. The extended smoke covers model/local-history/routing/catalog persistence across an actual restart and synthetic-key absence from static JS/HTTP responses without live provider requests. No new final counts or live-third-party success are asserted here. Chromium-on-Linux input/clipboard checks are not a live Wispr OS-overlay test; the required desktop checklist is in [WISPR-QA.md](WISPR-QA.md).
