# Personal Writing Library + Thought Assembly — verification

2026-09-23. Built on **266c0d0**, retained as `verified-base-266c0d0`. No reset or replacement editor/provider/state architecture. Prior records remain in `VERIFICATION.md` and `WORKBENCH-VERIFICATION.md`. This record belongs to the new library/structure commit; `git log -1` identifies it.

## Results

| Check | Result |
|---|---|
| TypeScript — domain, server, web | Passed |
| Unit/integration | **223 passed**, 13 files |
| Production web/API build | Passed |
| Playwright on production bundle | **38 passed**, including all original 27 |
| Compiled-server restart smoke | Passed, extended rather than replaced |
| Synthetic credential checks | Passed, including the new library endpoint |
| Original regression assertions | Retained; no test deletion or coverage reduction |

Environment: Node 24.14.1, pnpm 10.34.5, Playwright with real Chromium 153 on Linux. Desktop writing remains 22px/1.75; browser flows run at 1440×1000 with existing 1280px checks and light/dark coverage. Screenshots show running UI, not mockups.

Commands:

```sh
pnpm check
pnpm test:production
pnpm exec playwright install chromium
pnpm test:e2e
```

In the sandbox, the last command used `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium` for the npm-packaged browser. No actual OpenAI credential or Wispr OS overlay was available. Vite still reports a non-failing large-chunk advisory (~843 kB / 258 kB gzip); Node prints its SQLite experimental warning.

## Coverage added

The baseline 99 unit/integration tests and 27 browser tests remain. Added unit/integration coverage:

- 71 composition-handbook, scaffold, relationship and verbatim segmentation tests.
- 30 personal-style scoping, precedence, search and contextual ranking tests.
- 7 library API/storage/import/CAS/enrichment tests.
- 8 Structure provider/SDK/scope tests.
- 5 library helper and non-destructive preview tests.
- 3 explicit style-directive edge cases.

Eleven new browser flows exercise:

1. Save selected `que sera sera` as an exact snippet, add meaning/notes and custom tags/effects, reload, search, and surface it for Closer but not Hook. No automatic insertion.
2. Save a generated candidate as a style example without accepting it or making an inferred rule.
3. Save separate Hook and Segue preferences; verify no cross-section application, section-note override, immediate instruction override, and Closer fallback.
4. Fill two thoughts, select contrast, inspect `[X], but [Y].`, stage an exact human preview, accept only into Hook, and undo. Neighbors remain unchanged.
5. Segment a spoken-style rant into four verbatim chunks; raw text and offset-based reconstruction remain exact. Fill A/B from chunks; send the chosen relationship/scaffold to the existing routed AI action with no default rewrite.
6. Switch conversational to technical options; inspect `however` versus `that said`; save favorite/avoid connectors in the same library; preserve their scopes and hide avoided choices by default.
7. Save moves and scaffold patterns; export/import library JSON; preserve original items while assigning fresh identities to imported copies.
8. Explicitly preview a library snippet, verify no canonical change, then accept into the exact selected target. Usage count changes on actual acceptance, not surfacing.
9. Keep builder drafts local to sections; inspect dark-mode preview; request tightening without silently applying it.
10. Save a narration-specific style guide; reload it and change the brief to Article, confirming it drops out while global fallback remains.
11. Reuse a saved `[X]/[Y]` pattern in editable builder slots and verify Structure uses its task-model default through the existing resolver.

## Persistence and security

`tests/production-smoke.mjs` starts the compiled server from a different working directory, writes data, stops it, restarts it, and compares exact stored values. Added checks include:

- Every personal-library object kind: snippet, pattern, move, style example, style rule, connector.
- Custom tags/effects, My Language marking, register and section/content scopes.
- Favorite/avoid preferences and both section/content style rules.
- Raw thoughts, user-filled slots, relationship, register, chosen connector/scaffold and custom template.

The existing document, source, variant/history, Style DNA, model routing, catalog and theme checks remain. A synthetic fake credential configures the adapter without making a provider request; full credential values must be absent from served HTML/JS and all checked API responses, including `/api/library`.

Library storage is separate from Style DNA and document JSON: a revisioned SQLite singleton. Explicit user saves/imports are the only persistence path. AI responses never save style observations automatically. Import appends fresh copies without overwriting existing records; revision conflicts preserve unsaved local state and report an error instead of silently overwriting newer server content.

## Style and context semantics

One shared resolver orders **current instruction → section notes → section-type style → content-type style → global Style DNA**. Matching named keys resolve deterministically. `key: value` syntax in notes/instructions makes those conflicts testable; blank values do not accidentally erase a fallback, and `[clear]` is an explicit clearing marker.

Free prose remains ordered guidance for model interpretation, not a claimed deterministic natural-language conflict solver. Source accuracy, protected quotations/code and exact edit boundaries remain hard safeguards.

Scopes are case-insensitive OR within each list and AND across specified dimensions. Audience labels are exact matches, not substring guesses. Blank register is unrestricted; a specified register requires a known matching value. Custom tags support discovery rather than silently restricting applicability.

The backend reads the stored library, replaces client-supplied personalization, and bounds provider context at 50 matching items (up to 40 rules/avoid records, then relevant references). Small-edit permission still does not mean small read context. The frontend no longer echoes the entire global library in every AI request. Context references are never instructions to insert their literal language.

## Defects and friction corrected during this pass

- Empty named directives could override a valid fallback with an accidental blank. Blank input is ignored; intentional clearing is explicit.
- Register-restricted items previously matched absent context. Strict matching now avoids accidental cross-register use.
- Client-side style preview lacked register context; request resolution now carries the structure register or normal Style DNA register consistently with server enrichment.
- Generic action controls could attempt a Structure request without its required draft. The Structure path now supplies its scaffold and human slots through the existing request pipeline.
- Accepted library previews needed usage accounting while generation/surfacing remained non-destructive. Usage increments only after explicit acceptance.
- Saved patterns needed a reuse path instead of only copying. Patterns with `[X]` and `[Y]` can load into the builder without filling or applying slots.
- Personal My Language references needed an explicit distinction from live cultural research. They are user-approved references, not evidence of current usage.
- A new reload test initially skipped the existing 700ms document save boundary. It now waits for Saved before asserting persisted builder register; forced-close crash recovery remains a documented limitation, not a hidden test bypass.

## Remaining limits

- No live OpenAI or real Wispr verification. Normal textareas/inputs are used; there is no speech recognizer.
- Rant segmentation and local relationship suggestions are conservative heuristics. They preserve exact language but do not claim semantic decomposition or causal proof.
- Named style keys resolve mechanically; prose conflicts, taste, voice fidelity and historical/technical nuance require model judgment and human review.
- There is no automatic style-learning/suggestion approval workflow. All rules are manually saved; Add to Hook/Segue/Closer Style saves an example, not an inferred rule.
- Library search is keyword-based, not embedding/semantic retrieval. Lists are not virtualized for very large collections.
- The 5,000-item schema limit does not supersede the 2MB HTTP body limit. Large libraries/histories require future incremental APIs and context budgeting; the 50-item provider cap does not guarantee every applicable saved rule is sent.
- Literal scaffold placeholders have no escaping mechanism. Existing casing, punctuation, or conjunctions in slots are preserved and may need human edits. Connector exploration does not mechanically substitute incompatible connector grammars.
- Full library backup is separate from document JSON. A stopped-server database backup includes both; document export alone does not export global library preferences.
- Library and guide administration use existing utility dialogs. Normal quick-save and Structure interactions stay inline/collapsed, but deep work can require substantial Inspector scrolling.
- Prior limits remain: modal sources, no browser crash journal, no multi-tab merge, text-only variants, and a growing central coordinator hook despite extracted pure helpers.

## Next highest-value milestone

Exercise a week of real personal writing with local Wispr and a real provider: especially whether saved guides help without overfitting, whether the chosen relationships/scaffolds teach useful choices, and whether library surfacing is relevant. Then prioritize bounded context/history, better search/ranking feedback, and crash recovery before expanding the handbook or adding unrelated feature surfaces.
