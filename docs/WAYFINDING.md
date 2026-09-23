# First move, wayfinding and progressive disclosure

UX-only checkpoint built on **6e79df8**. The editor, provider architecture, domain models, color system, fonts and existing writing capabilities are retained. This pass changes how people enter and discover those capabilities.

## First use

An empty document says **“Start with what’s in your head.”** The dominant action, **Talk or type a thought**, focuses the existing rich-text editor. Wispr uses the user's normal desktop hotkey; there is no microphone capture or custom speech pipeline.

The guidance is a sibling overlay outside the editor. Its background passes pointer events through to the canvas; only the entry buttons are interactive. Clicking directly in the writing surface and typing works without using a prompt. Guidance disappears when authored text exists; no setup, audience, content type or brief is required.

Secondary entry points:

- **Paste something** creates a reference using the same Add reference action and focuses its ordinary source textarea. It never reads the clipboard automatically. The source remains distinct from authored writing. Pasting directly into the canvas remains available.
- **I know what I’m writing** opens the existing optional Writing Brief.
- **Start from structure** opens the existing unrestricted section picker.

The empty Inspector offers only short starter guidance and tool search. It does not show the model/structure/variant control stack. Explicitly asking for Structure through search can still open it on an empty page; advanced tools are not permanently gated behind authored prose.

## Writing first, organizing second

After an initial single-part Freeform thought, the Inspector shows a small set of next steps instead of requiring the user to understand workbench terminology. Contextual suggestions change for Hooks, Points and Segues.

Examples include Continue writing, Work on this sentence, Organize these thoughts, Make this a hook, Add a point and Add an example. These invoke the existing actions:

- Making a Hook changes the section role, not its text.
- Organizing thoughts copies the selected material (or the current part when the cursor is collapsed) into the existing Structure scratch area and invokes its verbatim thought segmentation. Existing raw notes are preserved rather than silently replaced.
- Turning thoughts into sections reveals the current structure view and explains drag/split controls. It does not automatically split or reorder canonical text.
- Adding a section uses the same insertion transaction and undo boundaries as the plus menu.

## Find a tool

Use **Cmd/Ctrl+K** or the visible **Find a tool** button. Search for the job, e.g. synonyms, replace word, save this, my hooks, add segue, closer, style guide, writing brief, change model, language radar, slang, structure, technical writing, copy document, source, or variants.

The command palette is a routing layer, not a second implementation of these features:

- `commands.ts` contains static labels, descriptions, keywords and ranking only.
- `wayfinding.ts` owns ephemeral disclosure/navigation state and delegates to the existing workspace actions.
- `CommandPalette.tsx` handles search, Arrow Up/Down, Enter and Escape.
- Data, editor state, model routing, persistence and AI requests remain owned by the existing workspace/provider architecture.
- Library commands initialize the existing library's query/view rather than creating a parallel library.
- Tool commands expand and scroll the existing Inspector controls; selecting a tool generally does not run generation. The explicitly labelled Whole-piece critique command invokes the existing critique action.

The palette ignores shortcut events during composition. Slash is deliberately not reserved, so ordinary writing is unaffected. Both Ctrl and Meta shortcut paths are browser-tested on Linux; this is not a claim of native macOS or Wispr certification.

## Context help and human labels

**What can I do here?** is collapsed by default. It explains the active Hook, Segue, Point, word/phrase, or raw thought and links to a few relevant existing actions. Formal names remain available as teaching labels.

Writing Brief is presented as **What are you making?**, with explicit optional/partial/anytime guidance. Its familiar field labels and data semantics are retained.

The plus picker pairs every semantic type with a purpose. Examples include Say what you mean — Point, Connect two thoughts — Segue, Make it concrete — Example, Back it up — Evidence, and Get a thought down — Freeform. Search matches purpose as well as type. All 27 types remain selectable; this adds no template restrictions.

## Verification — 2026-09-23

| Check | Result |
|---|---|
| TypeScript | Passed |
| Unit/integration | **291 passed** |
| Browser tests | **58 passed** |
| Production build | Passed |
| Actual process restart/security smoke | Passed |

All prior **267 unit/integration and 45 browser tests** remain unchanged and passing. Added 19 command-catalog/search tests, 5 clipboard serializer tests and 13 first-use browser scenarios.

The complete requested newcomer sequence was exercised in real Chromium using the visible product controls, not a separate demo UI:

1. Open a new document with no setup.
2. Talk/type path focuses the actual editor; direct canvas input also works.
3. Insert a messy raw thought.
4. Discover Make this a hook; verify the original text is identical.
5. Add a Point from the contextual suggestion.
6. Insert a Segue using the purpose-labelled plus picker.
7. Find Word Lens via synonyms/replace-word search, then select a word.
8. Find saved snippets in the existing library.
9. Find Structure Builder and focus its ordinary thought field.
10. Find model selection, then return to normal writing.

Additional browser checks cover keyboard palette selection/Escape, absence of automatic AI requests during discovery, optional brief before/after writing, separate source paste, unchanged canonical text during thought organization, active-object help, technical tool routing, slash input, native clipboard/undo/redo, Cmd/Meta shortcut handling, and empty-page Structure access. Light/dark screenshots are under `docs/screenshots/first-use-*.png` and `command-palette-dark.png`.

The running pages were visually inspected at 1440×1000 and 1280×900. This is engineering verification and a simulated first-use walkthrough, not an independent novice usability study.

## Defects fixed while exercising the flow

- A deferred command dispatch could close the palette before the requested insertion/focus finished, allowing immediately typed text to miss the new section. The native palette closes before synchronous routing, and section focus uses the existing editor view directly.
- Rapid Home/End navigation exposed a timing race between browser selectionchange and subsequent input/paste. The existing editor now commits document-edge selection synchronously to both ProseMirror and the native selection, including Shift-extension, without changing authored content. The two affected regression flows passed ten repetitions each after the fix.
- Native full-document copy exposed leading blank lines from wrapper serialization. A ProseMirror clipboard serializer now preserves selected authored whitespace and real paragraph/section boundaries without adding wrapper-generated prefixes. It does not intercept copy/cut/paste keyboard shortcuts or replace rich HTML clipboard output.
- Discovery routes needed to reveal the correct existing fields after render, including source text and Structure slots; stable field markers are used rather than duplicating inputs.
- The new Continue writing suggestion avoids colliding with the existing Keep writing confirmation action. Existing regression tests were not weakened to accommodate duplicate accessible names.
- Context routes return from document analysis to the existing local tools when appropriate, without expanding a selected word's edit authority.

## Remaining friction / limits

- Tool search is keyword/alias-based, not semantic AI search. Novel phrasing may require a shorter query.
- Word Lens still requires selecting actual language; when no word is selected, the route explains that first move rather than guessing an edit target.
- Deep workbenches can still require scrolling. Sources, provider administration and library metadata remain existing utility dialogs.
- Paste something opens a blank source reference; cancelling after opening may leave that blank reference for removal. No automatic clipboard inspection was introduced.
- Content in unsaved utility-dialog drafts follows the existing dialog behavior; no new draft-recovery layer was added.
- Actual Wispr OS integration and live provider quality remain unverified here. The existing manual checklist still applies.
- Prior persistence/concurrency/context-size limits remain. The build retains a non-failing main-bundle-size advisory (~879 kB / 270 kB gzip).

Next useful step: have the owner run this first-use path without guidance and record where they hesitate. Refine search aliases and contextual wording from that evidence, not by adding more permanent controls.
