# Maintainer contract

This is a **current, agent-neutral** contract for a coding maintainer taking over without private conversation history. Begin with [DEVELOPMENT.md](DEVELOPMENT.md) for reproducible commands, [ARCHITECTURE.md](ARCHITECTURE.md) for ownership, and [DESKTOP.md](DESKTOP.md) before touching app data or recovery. Earlier verification files describe historical checkpoints; do not infer current test totals from them. This is an existing product: investigate call paths and regression tests before proposing a replacement architecture.

## Authorial authority and one document

- **One source of truth:** `Document.sections[]` contains the ordered canonical rich-node prose. Parked thoughts retain section IDs in that same document; neither the assembled reading view nor delivered exports is another saved final draft.
- **Analyze globally, edit locally.** Brief, Sources, neighbor sections, Style DNA, Personal Library and history can be _read context_; they are not permission to edit another section. Explicit structural actions are distinct from local prose edits. Keep the one TipTap editor and section-boundary guard.
- **AI proposes; writer decides.** No silent canonical prose overwrite. Diagnosis, proposals, previews, comparisons, research, contextual suggestions and Lab results do not apply themselves. Acceptance/Take activation is an explicit guarded action; **iteration != replacement**.
- **Historical analysis target != current editable target. Caret != explicit target != saved-run target.** Saved runs retain exact original section identity, text snapshot, model and question. A changed or unresolved target cannot become writable by guessing where it moved. An incidental caret is not durable writer intent; manual writer selection is authoritative.
- Workbench is the **primary creation surface**. Document View is the assembled reading, final-polish and export surface for those same sections, not another document. Piece Memory, Revision checkpoint and Revision Plan remain distinct writer metadata. Takes preserve alternatives; Sources/Brief supply context; Style DNA and Personal Library supply guidance. Do not remove Takes, routing layers, roles or structural tools because a single session did not use them.

## Voice and the diagnostic tools

Preserve natural cadence, slang, profanity, fragments and humor where authored. Do **not** “professionalize” voice by default or automatically impose a three-part formula, an ending lesson or a template. Conventions are lenses, not laws; deliberate inversion may be the right choice. Technical Writing is **diagnostic, not prescriptive**: answer the writer's actual question, distinguish evidence from assumptions and action/result/verification, and offer tradeoffs rather than mandatory headings, replacement prose or invented technical facts. Current prompt boundaries live in `apps/server/src/provider-policy.ts`; they do not prove that every live model response is correct.

The writer chooses which model for which task and scope. The one resolver in `packages/domain/src/routing.ts` is authoritative:

```text
one-off → section → section type → task → document → application
```

Keep exact `{providerId, modelId}` records and saved-run identity. **No silent paid fallback** or provider/model migration on an error, missing key or catalog refresh. Model discovery is metadata, not capability proof. Compare choices and manual IDs use the same availability rules. A change to a credential or routing preference is not a prose revision.

## Protect data and verification integrity

- Browser development defaults to `<repo>/data/workbench.sqlite`; desktop development uses `<repo>/data/desktop-dev/workbench.sqlite`; installed desktop uses macOS Application Support. Tests and packaged smokes must use temp profiles. **Never point `DATA_DIR` or a test profile at real daily-driver data**; first make a backup before touching any existing writer data. Desktop startup SQLite snapshots do not contain the encrypted credential record; a manually copied app-support folder may.
- Keep `.env`, SQLite/WAL/SHM files, Keychain credential records, logs and real document prose out of Git, screenshots, reports and model fixtures. Renderer code never receives a saved plaintext key. Real Test connection and explicit Lab runs may incur usage; do not run them merely to pass automation.
- Preserve CAS/stale-target checks, native clipboard/IME/dictation paths, independent pane scrolling, undo/redo and explicit archive/delete confirmations. A full browser-suite failure must be diagnosed in suite context; **synthetic drag failures alone are not grounds to rewrite drag behavior** or weaken a meaningful assertion. Distinguish application defects from timing and browser/OS behavior.
- Run the scoped tests, full unit/browser gates, typecheck, production build and compiled-server smoke for relevant changes. For desktop changes, also build the arm64 `.app` and run its disposable smoke. Record actual failures, OS-manual gaps and live-provider status truthfully; see [DEVELOPMENT.md](DEVELOPMENT.md). Do not push until reviewed.

Intentional future work (not an excuse to strip existing systems): signing/notarization, auto-update, direct Notion/Obsidian sync, cloud accounts, additional providers/local models, a Body of Work view, and a full migration framework. Keep the existing system viable for these without pretending they already exist.
