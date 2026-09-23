# Workbench, model routing, and lexical lens — verified checkpoint

Date: 2026-09-23. This pass extends protected baseline **4f681c6**, also retained as Git tag `verified-base-4f681c6`. No reset, editor replacement, parallel AI client, or second state store was introduced. The baseline record remains in [VERIFICATION.md](VERIFICATION.md). The new commit is the commit containing this record; `git log -1` gives its exact hash.

## Final results

| Check | Result |
|---|---|
| Workspace TypeScript checks | Passed: domain, server, frontend |
| Unit/integration tests | **99 passed** in 7 files |
| Production frontend and backend build | Passed |
| Playwright on the production bundle | **27 passed**, including all original 15; final run about 38 seconds |
| Real process restart and persistence | Passed, including new models, drafts, histories, defaults, and catalogs |
| Synthetic credential exposure checks | Passed against HTTP responses and served production JavaScript |
| Original regression test files | Unchanged from 4f681c6; no coverage removed or assertions weakened |

Environment: Node 24.14.1, pnpm 10.34.5, real headless Chromium 153 / Playwright on Linux. Desktop viewports: 1440×1000 and 1280×900, light and dark. Standard development-machine browser command is `pnpm exec playwright install chromium && pnpm test:e2e`; this sandbox used `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium` with the npm-packaged Chromium executable.

The final build has a non-failing Vite main-chunk advisory: approximately 777 kB JavaScript / 238 kB gzip. Node may print its built-in SQLite experimental warning.

## Test inventory

Original coverage retained unchanged:
- 17 API/repository tests.
- 35 provider serialization/policy tests.
- 8 editor coordinate/selection tests.
- 15 browser regression flows.

Added:
- 12 provider routing, catalog, security, comparison, and import tests.
- 13 lexical request, shape, fidelity, and provider-policy tests.
- 11 pure section-workbench state/lineage tests.
- 3 pure sentence-preview tests.
- 12 browser flows for the new UI.

`tests/production-smoke.mjs` was extended, not replaced. It still checks the original stored objects and actual built entrypoint, and now checks additional persistence and credential boundaries.

## New flows actually exercised in the running browser

1. **Local Hook/Segue workbenches:** different instructions, answers, diagnosis runs, proposal runs, and active histories survive switching sections and page reload. Generating and editing candidates leaves canonical content identical.
2. **Section routing:** Hook and Segue retain different model references. A one-off Run with choice changes only its operation; the persistent Hook model remains unchanged and the next operation inherits it again.
3. **Defaults:** document fallback and section-type defaults resolve in the expected order. Model changes leave authored content byte-for-byte unchanged.
4. **Global awareness/local edit:** a Segue request contains the Hook, Point, Closer, brief and sources. Explicit acceptance alters only the Segue; neighboring rich content is compared unchanged.
5. **Word Lens:** `larping` in `His ass is larping.` creates an exact range. Candidate generation changes no canonical text. Copy Candidate and Copy Resulting Sentence work before acceptance. Replace changes only that range; Undo restores the original normally.
6. **Phrase/fidelity/context:** phrase shape, exact/balanced/loose settings, freeform instructions, persona/era, technical mode and audience reach the request. A manually edited phrase candidate replaces only `larping`; selecting the resulting short phrase opens Phrase Lens. Offline exact fidelity honestly declines unsupported semantic guarantees.
7. **Comparison:** two offline fixtures receive equivalent context and controls, producing separate saved variants and runs with model provenance. No output is merged or activated automatically. The API also tests partial failures and bounds of 2–4 distinct choices.
8. **Async ownership:** a delayed Hook response arrives in the Hook's history after the user moves to the Segue; it neither appears in the Segue response nor overwrites the newer Segue draft.
9. **Provider settings:** supported versus unimplemented states, masked metadata, no password input, offline Test Connection, manual OpenAI model registration and searchable selection. Adding an ID does not require rebuilding or pretend that the model was contacted.
10. **Import lineage:** duplicating a document with outstanding candidates remaps response/history/run/decision identities consistently. Accepting in the copy updates the copy's history and text, not the original document.
11. **Dark desktop:** word preview is visually distinct from canonical writing, with readable controls and no horizontal overflow at 1280px.
12. **Ask About Candidate:** after the cursor moves to another word, the question remains attached to the candidate's original target, not the new selection.

Screenshots under `docs/screenshots/` show actual running test fixtures, not static mockups. The writing surface remains the existing continuous editor. Section workbenches, lexical controls, model selection and histories appear only in the existing Inspector; provider administration stays in a utility dialog.

## Routing and provider verification

The same `resolveModel` function is used in UI and server selection:

`one-off → section → section type → task → document → application`

The server uses stored global settings as authority. Unsaved document/section choices travel in the document context. Unknown, disabled or unconfigured models fail explicitly; there is no fallback to a different model just because it works. Culture research uses its task default and document fallback, but requires positively known web-search support.

The implemented live adapter is **OpenAI Direct**, using one official SDK client within the registry. Responses structured output, model listing, manual IDs, cached catalogs/refresh times, connection testing, routed generation, cited research, and comparison paths are implemented. They were verified with deterministic adapters and the official SDK using fake HTTP transports, **not a live key**.

OpenRouter, Vercel AI Gateway, and custom OpenAI-compatible entries are **architecture/settings metadata only**. They are explicitly unimplemented and disabled, with no network requests. They are not functioning third-party adapters.

The offline `conservative` and `plain` choices are explicitly deterministic fixtures, not two real language models. Their lexical differences make routing/comparison testable without pretending live quality, current slang, historical authenticity, or broad dictionary coverage.

## Security and restart checks

The actual compiled Node server is launched with a temporary data directory, written to, gracefully stopped, and started again from another working directory. Exact comparisons verify:

- Existing documents, rich content, brief, sources, notes, variants and history.
- Two sections with different model assignments and local working drafts.
- Persisted run responses and model provenance.
- Global task/section-type routing defaults.
- Cached catalog/manual model entries.
- Style DNA, knowledge packs, radar and theme.

A further subprocess starts with a **synthetic fake credential** solely to configure the adapter. Catalog responses expose only its suffix. `/providers`, `/settings`, `/documents`, `/health`, HTML, and served JavaScript are checked for the full value. No provider call is made using it. Literal environment variable names in setup instructions are public labels, not credentials. Raw keys remain environment-only; no credential-save endpoint or browser localStorage path exists.

## Integration defects found and corrected

- Short-phrase detection initially treated complete selected sentences as lexical targets. Complete punctuated selections retain the original sentence workbench, while short phrases get the lens.
- Workbench responses needed explicit model/run/lens provenance while preserving the existing strict provider output schema. Transport metadata is attached outside that base schema.
- Model settings and generation could race; generation waits for pending preference writes before server-side routing.
- Culture requests needed the document ID after flushing, so document-level fallback is honored.
- Merging sections initially omitted the second section's diagnosis-only runs; retained histories now survive, with old targets intentionally stale rather than guessed onto merged content.
- Imported response proposal IDs and iteration IDs could diverge; coordinated remapping keeps outcomes linked.
- Candidate questions could follow the moved cursor; Ask About Candidate now explicitly targets its original range.
- Scope-aware provider labels and document critique controls now reflect the current route/context rather than the startup provider or a misleading local target.
- Repeating protected punctuation outside a lexical target is rejected rather than producing doubled punctuation.
- Model administration collapses when moving to a different object/scope; generated lexical results do not repeat the whole exploration glossary before showing candidates. Only the Inspector scrolls to a finished response; focus and document scrolling are not taken over.

## What remains unverified or incomplete

- No live OpenAI generation, live model discovery, live comparison, or actual current-culture result was verified. Provider access, cost, latency and model quality require a real-key acceptance pass.
- OpenRouter, Vercel and custom compatible adapters remain unimplemented. No favorites/recent-model picker, credential vault/key-entry UI, or custom base-URL transport is provided.
- Model catalog capabilities are not guessed. Unknown models can attempt structured writing, but web research requires known support; refreshing IDs does not certify every operation.
- Meaning fidelity is an instruction and review criterion, not a mathematical semantic guarantee. Historical/persona flavor may be an approximation; sources still require human verification.
- The offline dictionary is deliberately small. Exact mode may return no replacement, and repeated searches can repeat fixtures. Candidate generation is not evidence of broad lexical intelligence.
- Comparison is stacked in the narrow Inspector, not a large side-by-side canvas. Deep histories and controls still require scrolling.
- One writing request runs globally at a time. Section navigation is supported during it; document navigation is blocked with an explicit message until completion. No streaming/cancel UI is implemented.
- Full document/history context has a 2 MB request boundary; history compaction and context budgeting remain future work. The coordinator hook is large despite extracted pure helpers.
- Baseline limitations remain: modal sources, text-only variants rather than rich-format snapshots, no unsaved browser crash journal or multi-tab merge, no authentication/encryption for public deployment.
- Actual Wispr and native macOS/IME behavior remain a local manual checklist, not certified by browser simulations.

## Next milestone

Run a small live-key acceptance set across two real OpenAI models using non-sensitive user-authored Hook/Segue/technical/lexical examples. Confirm routing, source fidelity, comparative usefulness, cost, and actual Wispr insertion into the new composer fields. Then add bounded history/context management before longer daily use. Implement one additional provider adapter only after those concrete workflows justify it.
