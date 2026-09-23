# Verification record — 2026-09-23

Continued the existing repository from `b12a2cf`; no replacement architecture or second editor/client/store was introduced. This record covers the verification/refinement commit containing this file. Use `git log -1` for its exact hash.

## Executed results

Environment: Node **24.14.1**, pnpm **10.34.5**, Linux, real headless Chromium **153** driven by Playwright. Browser checks exercised the production bundle, not a mock UI. No actual OpenAI credential or Wispr desktop installation was available.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; checked-in lockfile and approved esbuild install scripts |
| `pnpm typecheck` | Passed for domain, server, and frontend |
| `pnpm test` | **60 passed**: 17 API/repository, 35 provider/SDK-policy, 8 editor coordinate/selection tests |
| `pnpm build` | Passed: Vite frontend and tsup Node backend |
| `pnpm test:production` | Passed: starts actual production process from another working directory, serves frontend/API, persists state through shutdown and restart |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium pnpm test:e2e` | **15 passed**, one worker; about 22 seconds on final run |
| `git diff --check` | Passed before commit |

On normal developer machines, install Playwright Chromium and run `pnpm test:e2e` without the sandbox-specific executable override. The npm-packaged Chromium was used because only npm-registry dependency access was required for this environment.

### Non-failing build notices

- Built-in `node:sqlite` emits an experimental API warning on this Node version.
- Vite reports a large main JavaScript chunk: approximately **752 kB / 231 kB gzip**. This is a remaining optimization opportunity, not a failed build.
- No `.env` is required for mock mode; Node reports its absence informationally.

## Running UI exercised

Actual browser interaction covered:

1. Typing and selection; native **Ctrl+C / V / X / A / Z / Shift+Z**; rich clipboard paste including bold/italic; pasted text remains editable.
2. Cursor-based sentence targets, exact word selections, section workbenches, and cross-section AI replacement refusal.
3. Full-document and source read context in captured API requests, with only the selected sentence replaced after acceptance. Neighbors and sources remained unchanged.
4. Human-first diagnosis with no creative proposals until an answer; editable proposals; copy before acceptance; explicit acceptance/rejection/save.
5. Original text preserved and restored through variant activation; variant copying; independent iteration IDs on repeated model calls.
6. Word nuance for the curated `assumed / figured / believed` fixture; honest mock label. Whole-piece critique produces findings without editing.
7. Native structure drag/reorder; split at cursor; merge with next; section metadata/variants retained through deletion undo and reload.
8. Document create, duplicate, rename, JSON export/import, delete confirmation/cancellation, and persistence after reload.
9. Style DNA and content-type brief changes, with writing unchanged; theme persisted across reload.
10. Rapid insertion of roughly 8,000 characters and synthetic composition events. This is **not** a real IME/Wispr certification.
11. Copy target/section and whole-document plain text byte-for-byte against the domain text.
12. Delayed in-flight autosave followed by additional typing and navigation; no lost edits. Typing before bootstrap completes also survives reload with stable section IDs.
13. Rich list paste retains block separators in plain-text context and supports an exact local edit without changing the neighboring item.
14. Stale proposals reject application after manual changes to their source section; unrelated context changes and save revision increments do not automatically invalidate unchanged targets.
15. Readable 22px / 1.75 writing typography, collapsed secondary controls, accurate highlight/Inspector agreement, menus, disabled offline research, and no horizontal overflow at **1440×1000** and **1280×900**.

The running screenshots were also visually inspected; they are included under [screenshots](screenshots/). Text in these screenshots is test fixture prose, not production user data.

## Real process restart verification

`tests/production-smoke.mjs` uses an isolated temporary database and an actual built Node subprocess. It writes a document, brief, source, section notes, variant, and iteration history; writes Style DNA, knowledge packs, a synthetic radar record, and theme; gracefully stops the process; starts a new process; and compares the persisted objects exactly. It also verifies production frontend serving and mock-provider selection without a key. The temporary database is removed afterward.

E2E uses a separate temporary data directory on port 4319, not the normal user database. The app was additionally started and inspected on the standard port **4318**.

## Bugs found and fixed

- **Production startup:** tsup stripped `node:` from prefix-only `node:sqlite`, so a successful build crashed on launch. `tsup.config.ts` now preserves Node protocols and targets Node 22.
- **Delete:** Express `req.is()` returns null for a bodyless DELETE. MIME-header validation now permits JSON DELETE while retaining CSRF/origin restrictions.
- **Compilation:** duplicate `key` prop via spread in range controls.
- **Scope after autosave:** a strict revision equality check rejected unchanged selections. Scope validation now relies on document identity, exact section snapshot, and range rather than unrelated save increments.
- **Caret race:** dispatching highlight transactions inside selection callbacks could restore an old caret during native navigation. Highlights are now derived by the existing ProseMirror plugin without nested selection dispatch.
- **Sentence targeting:** end-of-section caret could select the first sentence; automatic sentence selection included adjacent whitespace. Both boundaries now have regression tests.
- **State consistency:** bootstrap could mix imported/remapped IDs with local section IDs; pending initial typing is now preserved with consistent IDs.
- **Undo metadata:** a section resurrected through undo could lose notes/variants. A single-document metadata cache now restores them.
- **Iteration history:** deterministic provider IDs collided across repeated requests. Durable client iteration IDs are unique per response.
- **List context:** nested list text was concatenated without separators. Plain context and editor offset mapping now agree on item boundaries.
- **Accessible fields:** wrapping textarea text inside its label produced unstable accessible names. Shared Field now uses explicit label/control association.
- **Highlight mismatch after loading:** the Inspector could show a previous target while the editor highlighted the new initial sentence. The target is resynchronized after editor-state reset.
- **Presentation:** overly small/faint controls, an empty Inspector full of controls, invisible document-menu affordance, remote font dependency, and copy feedback that shifted the writing surface. Fonts are local; controls are readable; power is disclosed contextually; feedback is a non-layout-shifting toast.
- **Provider safeguards:** API independently validates future provider output; quote/code preservation handles additional common spans; invalid finding IDs and repeated proposal IDs are rejected; blocked radar language participates in exclusion checks.

## Explicitly not verified / incomplete

- **Live OpenAI:** official SDK serialization, structured parsing, refusals, policies, and citation requirements are tested using a fake HTTP transport. No live generation, billing/account availability, or live culture-research result is claimed.
- **Wispr / native IME / macOS:** actual desktop overlay and Command-based shortcuts require local testing. Follow [WISPR-QA.md](WISPR-QA.md).
- **Sources:** editable source/reference utilities are implemented, but remain modal rather than a pinned side-by-side pane.
- **Deep language engines:** shared configurations and real-provider routing exist; the entire advanced rhetorical/comedic/reference curriculum is not a finished set of bespoke interfaces. The offline provider is deliberately limited, not a substitute for a model.
- **Variants:** text preservation is verified; full rich-format snapshots, automatic reanchoring, and complete universal metadata undo are not implemented.
- **Data resilience:** 700ms unflushed edits remain vulnerable to browser crashes; document conflicts fail closed, not automatic multi-tab merges; global settings are last-writer-wins.
- **Scale:** full-document/history request bodies are limited to 2MB, and long histories/context budgeting need future work. Rich-text import is validated in the UI against the editor schema; arbitrary API clients should not be treated as trusted import sanitizers.
- **Security:** loopback-only personal app; no authentication or database encryption. Never expose this server publicly without a separate security design.

## Highest-value next milestone

Run the local Wispr checklist and a small, paid live-provider acceptance set using the user's own non-sensitive writing. Include source-accurate quote/commentary, one-sentence replies, section-local hooks/segues, and current-language citation quality. Then prioritize a pinned source pane and a durable unsaved-draft recovery journal based on observed daily writing friction. Do not add another editor, provider client, or state store.
