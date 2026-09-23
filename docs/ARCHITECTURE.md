# Architecture

This describes the implemented local application and its boundaries, not a roadmap presented as finished functionality. Installation and operational commands are in [README.md](../README.md).

## Components and data flow

```text
Browser: React + one TipTap/ProseMirror editor
  App / WritingLabShell / UtilityPanel
                 |
           useWorkspace
                 | same-origin /api requests
                 v
Express application: loopback-only HTTP boundary
      |                               |
      v                               v
SQLite Repository                 LLMProvider interface
  documents JSON + revision         |-- deterministic MockProvider
  singleton settings JSON           `-- OpenAI Responses SDK adapter
                                         | structured writing output
                                         ` separate web-search research

Shared domain: packages/domain/src/index.ts
Zod schemas, target validation, document helpers, export, defaults
```

Development uses Vite on `127.0.0.1:5173` with `/api` proxied to `127.0.0.1:4318`. Production serves the Vite build from the same Express server as the API. `config.ts` resolves the repository root from the module path, loads root `.env`, and resolves relative `DATA_DIR` paths against that root rather than the current working directory.

`createApp` accepts an injected repository and provider. Importing it does not bind a port, read credentials, or open a database. `index.ts` is the process bootstrap and graceful-shutdown boundary.

## Canonical domain

The shared domain module is the contract between browser, API, storage, and providers. Important records:

- **Document** (`schemaVersion: 1`): ID, timestamps, revision, writing brief, ordered sections, sources, and iteration history.
- **WritingSection:** stable ID, kind/label, rich-node content, notes, and variants.
- **EditTarget:** document ID/revision, scope, section ID, text offsets, selected text, and the source section's text snapshot.
- **Variant:** text, original/human/AI origin, label, timestamp, and target anchor.
- **Iteration:** target, instruction, coach question, human answer, proposal, decision state, and provider label.
- **Settings:** Style DNA, enabled/disabled knowledge packs, Language Radar records and decisions, and theme. Settings are global, not embedded in document export.
- **AIRequest / AIResponse:** explicit readable context, edit target, action, stage, controls, and structured diagnosis/questions/findings/lexical results/proposals.

Zod parses requests and stored domain records. `schemaVersion: 1` is a format identifier, not a general migration framework. Future schema changes need deliberate migration and round-trip tests; parsing defaults alone should not be treated as a migration plan.

## Editor and state ownership

There is **one rich-text editor**, not a separate editor per section. The custom document node requires `writingSection+`; section nodes contain `block+`, are defining/isolating, and carry section identity/kind/label. A plugin repairs missing or duplicate section IDs after editor transactions.

`editor.ts` converts between canonical section data and the editor tree, maps textual target offsets to ProseMirror positions, and decorates the active target. It does not own persistence. Normal keyboard input, clipboard operations, and composition use browser/editor behavior; no speech capture pipeline is installed.

`useWorkspace` is the central coordinator for the active document, document list, editor, target, proposals, save state, preferences, and UI panels. Refs retain current values for asynchronous operations. Rich-editor updates reconstruct section content while a single-document metadata cache retains notes and variants, including metadata needed when editor undo resurrects a removed section. Loading another document resets that cache and the ProseMirror state/history.

**Maintenance risk:** this hook is already large. Editor transactions, metadata restoration, in-memory snapshots, saving, and provider requests are coupled. ProseMirror undo is not a universal undo transaction for every preference or metadata action. Preserve regression coverage for split/merge/reorder, undo/redo, section IDs, notes/variants, asynchronous saves, and document switches before splitting responsibilities into smaller modules.

## Read context is not edit permission

A writing request may include the entire document and preferences as **read context**. A separate **edit target** is the only authorized replacement range.

1. Identify a word, passage, or section target in the editor. Cross-section selections do not become replacement permission.
2. Validate document identity, section existence, the source section snapshot, and the target text/range before asking the provider.
3. Diagnose and ask a question first for creative work. A nonblank human answer is required before creative proposals. Word/spelling actions have limited exceptions.
4. Validate structured output and common provider policy at the API boundary.
5. Present proposals without changing the writing. The user may edit, reject, save as a variant, or explicitly apply.
6. On apply/variant activation, validate the target against the **current browser document** again, map it into the current editor, and change only that range. Preserve original target text as an original variant.

Document-wide critique and template analysis are analysis-only; they cannot replace the document. Provider adapters have no persistence capability. `/api/ai` returns an answer rather than writing the repository.

The section snapshot check is intentionally conservative: a change elsewhere in the same section can invalidate a target. An unrelated section edit or autosave revision increment need not invalidate an unchanged target. `documentRevision` is recorded for provenance, but target validity is not simply equality with the latest save revision. Database revision CAS is a separate persistence concern.

Stale variants **fail closed** instead of searching for similar text and guessing where it belongs. Original variants are text snapshots, not complete rich-format versions. Section replacement builds paragraphs from text; it can discard local rich formatting.

## Providers and safeguards

`LLMProvider` exposes `run(request)` and `researchCulture(query)` plus capability flags. Startup chooses one provider:

- No key: deterministic, explicitly offline mock behavior, with no live research capability.
- Key configured: official OpenAI SDK Responses adapter. It uses structured Zod output with `responses.parse`, `store: false`, a timeout, and bounded retries. A failure is surfaced, never silently replaced with mock output.

Enabled knowledge packs and saved/approved radar references are filtered for writing context. Disliked and never-suggest entries participate in exclusion checks. Writing calls have no web-search tool. Research is a separate operation: require web search, collect tool URL citations, then extract structured radar records referencing those exact URLs. New research records are `maybe`, not automatically approved. Verification timestamps are not dates of first usage or proof of present popularity.

`provider-policy.ts` and domain validation enforce mechanically testable restrictions: diagnosis-only boundaries, target/range checks, proposal counts/IDs, known section IDs in findings, word scope, requested word/character counts, forbidden phrases, and preservation of recognizable quoted/backtick/fenced text spans. These checks also run at the API boundary for injected/future adapters.

**Limits:** textual quote/code safeguards are not a semantic verifier or a complete rich-node protection system. They cannot prove that all code, transcript meaning, claims, uncertainty, emotional intent, or source evidence survived unchanged. Source citation membership verifies a URL came from the search result, not that it supports the claim. Human review remains necessary. Editing a proposal manually does not make its claims verified.

Live OpenAI execution has not been tested here without a credential. Tests using the official SDK with a fake HTTP transport cover serialization and response validation, not real provider availability, research quality, latency, or billing.

## Persistence and concurrency

`Repository` uses synchronous built-in `node:sqlite` with WAL mode and a busy timeout. The current tables are:

```text
documents(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)
settings(id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL)
```

A document's complete canonical JSON is stored in `body`. A save checks the incoming revision and updates with `WHERE id = ? AND revision = ?`, then increments the revision. A conflict returns HTTP 409 rather than overwriting a newer save. This is compare-and-swap, not real-time collaboration or conflict merging.

The browser debounces changes by 700 ms, serializes saves, and loops if more edits arrived during an in-flight save. It merges the returned revision/timestamp without replacing newer in-memory text. Document navigation attempts to flush pending writes. Failed saves retain the in-memory document and expose an error; export it before reload if necessary.

There is a pending-edit before-unload warning but **no durable browser crash-recovery journal**. A browser crash/forced close can lose unflushed edits. Settings use a serialized client queue but server-side singleton settings writes do not have document-style CAS; multiple tabs can still overwrite preferences.

Import validates a document and creates new document/section/source/variant/history identities, remapping target references. It is a new copy, not an in-place restore. JSON document export excludes global settings. For a full persisted backup, stop the server and copy the entire data directory, including any SQLite WAL/SHM files. See the README for recovery precautions.

## Local security and portability

- The process binds to `127.0.0.1` only.
- Host and Origin checks allow loopback hosts; cross-site fetch metadata is rejected. Mutations require `application/json`, including DELETE.
- API responses use `Cache-Control: no-store`; JSON request bodies have a size limit.
- OpenAI credentials exist only on the backend. No browser `VITE_*` key or proprietary hosting dependency is required.
- There is **no authentication, encrypted database, multi-user isolation, or hardened public-server deployment model**. Loopback restrictions do not protect against arbitrary local processes or compromised trusted local applications.

A future browser extension should be a thin client to the local API with minimal permissions. No extension UI/manifest is implemented. Existing Host/Origin restrictions do not constitute extension authorization: extension origins would need explicit, narrowly scoped support, pairing/authentication, and a threat-model review rather than a broad CORS exception.

## UI scope and verification boundary

The current UI exposes the brief, sources, section metadata, variants, history, Style DNA/packs, and radar alongside core writing/proposal flows. Sources are modal rather than a pinned side-by-side reference. Utilities use one-window dialogs. Broad action/schema coverage is not evidence that every deep rhetorical mode has a complete dedicated UI.

Verification is layered: domain/editor tests, repository/API tests, provider transport/policy tests, Chromium E2E, and a real built-server restart smoke check. Final results and counts are recorded separately in [VERIFICATION.md](VERIFICATION.md). Chromium-on-Linux input/clipboard checks are not a live Wispr OS-overlay test; the required desktop checklist is in [WISPR-QA.md](WISPR-QA.md).
