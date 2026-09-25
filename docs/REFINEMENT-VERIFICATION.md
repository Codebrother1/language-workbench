# Workbench refinement verification

2026-09-25. Built from clean `main` at tagged checkpoint `b5e7279` (`hyperagent-final-b5e7279`). `Document.sections`, the single TipTap editor, exact-position insertion, and read-only Segue neighbors remain the existing architecture.

## Changes checked

| Refinement | Regression evidence |
| --- | --- |
| Local selection at a section seam | Unit tests cover a selection containing only the prior wrapper edge plus the next section's prose, a true two-section prose selection, and local target mapping. Browser tests paste into the following Reveal, preserve the preceding Segue and all six IDs, and keep Labs on **Selected passage**. |
| Timeline scale | A 15-section browser fixture verifies Overview rows are under 80 px, less than half the Comfortable row height, the timeline is wider than preview, the first six beats fit in the timeline viewport, and density survives reload. |
| Scoped prose entry | A browser test hides preview, clicks **Edit in preview**, verifies the real editor has a collapsed caret in the chosen section, inserts and replaces prose there, preserves its neighbor, and reloads the saved result. |
| Stale copy | A browser test checks that “Nothing added until you choose” is absent after writing; the existing “Human-led writing” footer remains. |

The selection guard still refuses a real cross-section prose selection and checks that ordinary local edits leave all neighboring section nodes unchanged. Native paste and input do not gain structural authority.

## Commands and results

| Check | Before changes | After changes |
| --- | --- | --- |
| `pnpm typecheck` | Passed | Passed |
| `pnpm test` | 343/343 passed | 346/346 passed |
| `pnpm build` | Passed | Passed |
| `pnpm test:e2e` | 61/71 passed on macOS; 10 tests used Linux-style `Control` shortcuts or repeated keyboard selection | 74/74 passed after portable `ControlOrMeta` shortcuts and deterministic native range selection; prior behavioral assertions retained |
| `pnpm test:production` | Not run before edits | Passed: compiled-server restart, persistence, and synthetic credential checks |

One full post-change browser run initially found a timing-dependent assertion that compared entire saved section records after word inspection. The inspection correctly persisted a workbench run without changing authored prose. The test now waits for save and compares canonical section identity, metadata, and content while allowing the expected workbench record. The final full run passed 74/74.

## Manual built-app pass

Started `pnpm start` on isolated port 4320 with a temporary `DATA_DIR`, leaving the normal database untouched. In the production UI, wrote a first section, inserted a Segue at the end, hid preview, reopened it with **Edit in preview**, wrote Segue prose, selected the entire sentence, confirmed Labs showed **Selected passage**, pasted a replacement, and saw only the Segue change. The first section and two section identities remained. Overview showed compact rows. The temporary server and browser tab were closed.

No live model output or actual Wispr OS overlay was exercised. The build retains the existing Vite advisory for a main chunk over 500 kB; it did not fail the build.
