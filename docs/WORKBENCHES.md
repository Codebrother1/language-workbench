# Section workbenches, model choices, and Word/Phrase Lens

A workbench holds the experiments around a piece of writing. It is not a second editor that silently takes over the document. **Generating, inspecting, comparing, editing a candidate, or choosing a model never makes that candidate canonical.** In the assistance workflow, only explicit Replace/Accept/Activate changes the selected prose. You can still edit the main document directly. The first Lab view puts the current target, your direction and a primary action before secondary model/options controls. An offline note beside each action explains the deterministic operation before it runs; unsupported creative directions receive no invented answer. Cards with saved work link back to their existing variants, Structure draft or run history.

For installation, commands, backup and security, see [README.md](../README.md). Implementation boundaries and API routes are in [ARCHITECTURE.md](ARCHITECTURE.md).

## What belongs to each writing object

Each section can save its own:

- Instruction and human-answer drafts; selected action and controls.
- Word/Phrase Lens mode, fidelity, shape, intent, persona/register/era and technical setting.
- Section model override, next-operation model choice and comparison model list.
- Diagnosis and proposal runs, captured targets, model identity, questions, lexical entries, findings and candidates.
- The currently inspected run and proposal outcomes; associated variants and document iteration records.

These are optional fields in the document JSON and autosave to SQLite with the document. They are not transient chat state. Wait for **Saved** before reloading; there is no durable browser crash-recovery journal for unflushed edits. Earlier schema-version-1 documents without these fields still load. Whole-document critique/template analysis uses a **separate document workbench**, so it does not overwrite a section's drafts or propose whole-document replacement.

Move between sections to return to their local workbenches. A whole-piece finding keeps its source run and finding position when you jump to a section: **Return to finding** restores that exact historical run without asking a model, and a small breadcrumb shows immediately when the draft has changed. **Review saved critique** restores a run after reload; **Analyze revised draft** is a separate explicit request and never overwrites the earlier analysis. Draft-state badges compare the captured canonical prose with the current draft, not merely timestamps or metadata-only revisions. Finding cards render known section IDs as human-facing labels or numbered roles, with individual jump controls when a finding references several sections. Unknown UUID-like text is not silently remapped. Phrase Lens keeps the selected phrase's local reading first; longer analysis and related draft echoes are disclosed separately, with jumps to their actual cards. **Workbench history → Inspect this run** restores that run's instruction, answer, controls and response for review; it does not change the writing. The active inspected run survives a successful save/reload. History and the Lab keep known target kinds human-readable—**Quoted turn**, **Current sentence**, **Selected passage** or **Whole section**—rather than collapsing them into model task names. Inspecting a run or using Return to question restores the historical question without focusing canonical prose; the writer can deliberately refocus prose to edit. Incidental caret suggestions are not persisted as selected passages. Legacy sentence-shaped focus records with no saved Lab direction/run and no explicit-focus marker fall back to section focus on reload; a writer's actual selection or saved Lab direction remains restorable. Model/run provenance is recorded on new runs, variants and iteration history; older records may lack it.

The answer field belongs to a saved run/question, not just its passage: a different follow-up question starts blank, while reopening the same saved question restores its answer. Previous answers remain in history and remain attached to the questions that received them.

A section-local diagnosis also offers **Return to selection**, **Return to section**, or **Return to parked thought** as appropriate. Moving away from its section leaves a small **Return to question** breadcrumb; these actions inspect the saved run and navigate the existing card without a new model request. The collapsed **Revision trail** records only a run/finding viewed before a subsequent human prose edit in that section, with the save revision once persisted. It does not record every keystroke, duplicate prose, or claim the model made the edit. Metadata-only saves and mere finding navigation do not create trail entries.

A human revision-loop check on an isolated offline eight-section fixture confirmed finding → Section 8 → prose edit/save → return to the same earlier-draft finding → explicit new analysis. No generated prose was accepted. The browser regression also verifies that the breadcrumb changes to earlier-draft status before autosave completes.

A pending operation blocks switching documents with an explicit message. You may navigate sections while it runs; its response remains attached to the originating section rather than the current selection. There is one global writing-operation busy guard, not simultaneous independent section requests.

## A safe section workflow

1. Select a passage in one section, or use the section target. Check the target indicator.
2. Write an instruction. For creative work, **diagnose → answer in your own words → request proposals**. Lexical replacement and limited spelling assistance have direct-suggestion exceptions.
3. Review the response. Edit candidate wording if needed, reject it, or save it as a take.
4. Apply only with the explicit acceptance/replacement action, or activate a saved take. The text from before an accepted edit remains available as **Original before apply**.
5. Wait for Saved; export important work.

A run captures its original target, offsets and section snapshot. Reload resolves the saved run against the current section again, so changed and unresolved states remain visible without a guessed highlight. Inspecting a saved run keeps that original visible as history: an unchanged or uniquely surviving selection can be restored exactly; a replacement bracketed by unique stable neighboring text is labeled **Target changed since this run** and shows its current passage separately; without reliable anchors it is **unresolved** and does not highlight a substitute. **Return to current passage** only navigates there; **Use current passage** or a fresh text selection is required for a new Lab request. An unresolved selection cannot be used for another run. Accept/Replace and older AI variant activation recheck that anchor against the current document. If their source section changed, make a fresh selection and request rather than expecting automatic relocation. A writer-saved human take is the explicit section-wide exception: Activate confirms document and section identity, targets the current prose in that same surviving section, and preserves the draft being left when needed. Editing an unrelated section need not invalidate the original target. Section merges retain prior runs, but stale anchors still fail closed. Run inspection never refreshes an obsolete anchor into permission to overwrite new text. Return to section restores card context, Return to selection scrolls to an exact highlighted passage when still resolvable, and Return to question restores its saved result and direction without a model call or prose focus. Stacked page scrolling only occurs for an explicit return action.

**Save take** on the selected section captures its current prose as a human-authored, optionally named take without a model call or prose edit. Deleting a saved take or source requires explicit confirmation and reports the removal; neither changes canonical prose. Identical human takes are not saved twice; punctuation, case and spacing remain distinct. The card’s take count opens Saved takes for rename, compare, copy, explicit Activate and delete. Activating a take replaces only that same section through the guarded editor; if the prose being left is not already saved, it is preserved as another human take first. This editor change supports undo/redo. On Split, existing takes remain with the original half; the new half starts with none. Duplicate section retains the established deep-copy behavior, including independent copies of saved takes with targets rebound to the new section ID. Accepted edits save the original target text and an immutable source-target snapshot independently of the current replacement anchor; the saved original is not named after a proposal. Take names remain writer-editable. Compare distinguishes original target, current draft text and saved takes or proposals; identical wording appears once with its provenance rather than as duplicate blocks. Compare keeps punctuation-only edits precise and uses bounded token alignment for larger plain-text rewrites so unchanged phrases stay unmarked. Comparisons over 200,000 token-pair cells or 750 tokens on one side fall back to a single changed span; this is a reading aid, not a rich-format diff editor or a prose edit. Saved takes are text snapshots, not full rich-format backups. Section-wide replacement rebuilds paragraphs and can lose formatting. Whole-piece analysis and cross-section selections do not authorize whole-document rewriting. Live candidates are checked after generation against explicit count/line/short-bridge requests and nearby Segue prose; clear neighbor restatements are omitted, while lightweight cadence, motif and stock-prose mismatches receive brief quality notes. When Propose returns no option, the Lab shows its specific safe-result/capability reason near the response, or states that the completed provider response offered no reason. A provider failure remains an error, not an empty-success result; no proposal is invented. This is a lexical heuristic, not reliable semantic understanding or a promise that every subtle paraphrase will be caught. No automatic extra model call is made to fill a missing variant. Whole-piece critique shows the requested revision question separately and flags missing deliverables.

## Choose models without changing text

Expand the context **model dropdown** to see the effective model and where it was inherited from. Its searchable pickers let you select a section model, restore inherited routing, set a section-type default, or select **Run with** for one operation. Model changes affect future requests, not existing prose or the provenance of old runs.

One resolver is shared by the frontend and backend:

| Priority | Choice | Where it lives |
| --- | --- | --- |
| 1 | One-off **Run with** | Current workbench; captured for the next logical run chain on its exact target |
| 2 | Section override | Section metadata |
| 3 | Section-type default | Global routing settings |
| 4 | Task default | Global routing settings |
| 5 | Document default | Document metadata |
| 6 | Application default | Global preference, otherwise environment/offline default |

Word/Phrase Lens uses task **`words`** with exactly this priority. It does not bypass a section or section-type override to favor a special lexical model. Whole-document analysis has no section/type override.

**Diagnosis starts a logical run chain.** If Run with is set before diagnosing, the pending picker clears on dispatch, but the chosen model stays pinned to that exact target through its follow-up answer, proposal and comparison. A new diagnosis starts a new chain and uses normal routing unless Run with is chosen again. An explicit new Run with choice replaces the chain choice; clearing Run with discards the chain. Compare still requires 2–4 explicit models and must include the chain model when one is pinned; choosing additional models is an explicit potentially paid request. An unavailable or unsupported pinned model reports the problem and requires a deliberate provider change, never a fallback to the application default.

In **AI provider settings**, choose a document default and, optionally, application, section-type or task defaults. Clearing an override restores inheritance. Provider cards show enabled/disabled separately from configured/unconfigured, and toggles report which provider changed. Style DNA warns before discarding unsaved preferences; Save voice preferences is still explicit. Unknown/disabled/unconfigured choices are not silently replaced by another model; a request reports the problem. This pass leaves the configured application default (Luna in the reported setup) untouched. If a writer prefers Sol for structural critique after a matched comparison, they can explicitly set a critique task default or use a one-off **Run with**; this pass does not change routing or silently add a higher-cost call.

## Compare models

1. Open **Model controls → Compare models**.
2. Select **2–4 distinct, implemented, configured and enabled models**. The two offline fixtures allow a no-key workflow check.
3. Supply your human answer for a creative comparison; lexical comparisons can generate directly.
4. Click **Compare selected models**. Each model receives the same captured target, material, controls and readable context.
5. Inspect independent results in local history or **Compare recent outputs**. Successful candidates are saved as takes with model/run provenance; activate only deliberately.

Comparison never overwrites a draft or automatically chooses a winner. Each provider outcome is independent; successful runs remain available when another model fails. Errors are shown rather than replaced with mock success. With live models, expect a request and possible charges per selected model.

The UI shows a task-specific Analyzing/Proposing/Comparing state and the chosen model while a request is pending; duplicate submissions are disabled and errors clear the busy state. It is not a token-streaming/per-provider progress console, and no percentage is inferred. Recent-output review is vertical and limited to a small recent set, not a full comparison canvas. There is no favorites/recent-model picker UI, although history records the actual models used.

### Matched live generation check — 2026-09-25

With explicit approval, sent the same synthetic three-section Segue request through OpenAI Direct once to `gpt-6-luna` and once to `gpt-6-sol`. The previous section placed refrigerator light on an empty floor; the next stated that a repair bill meant the house could not be kept. The instruction requested **one short, one-line bridge**, carrying the refrigerator image without restating the bill; the supplied human material was “The refrigerator hummed after the voices stopped.” Both runs returned exactly that one line, with no repeated bill proposition, invented claim, extra sentence or quality warning. Luna described the visual-to-sound pivot; Sol more explicitly identified the repeated light in the existing bridge and avoided attributing a cause to the stopped voices. In this single matched task Sol's diagnosis was marginally more pointed, but the generated wording was identical human-supplied material, so this does **not** establish that either model generates better alternatives. Neither candidate was accepted or stored in a document; the isolated test store had zero persisted documents afterward. Additional live writing samples are needed to evaluate cadence preservation, endings and long-form critique. No automatic routing change was made.

## Word/Phrase Lens

### Enter and frame the target

Select a word, or a short phrase of up to **eight words** that does **not** end with `.`, `!`, or `?`. Whole punctuated selected sentences stay in **Sentence Lab** rather than being treated as lexical fragments. Cross-section selections are not replacement targets.

The lens displays the surrounding sentence with the narrow target bracketed. The prefix and suffix are protected: an instruction such as “make this more literary” does not authorize rewriting the whole sentence.

### Explore versus Replace

- **Explore** diagnoses or explains lexical distinctions; it returns no replacement proposals.
- **Replace** requests replacement candidates without requiring the creative interview. “Find replacements” still does not apply them.
- Open **Sentence preview · not applied** to compare the current and proposed sentence. Preview and “Copy resulting sentence” do not edit the document.
- Use **Ask about candidate** to request a comparison in context, not a silent replacement.
- Only the explicit **Replace** action on a candidate applies it through the same target checks used elsewhere.

The sentence preview is built by an isolated pure function: unchanged prefix + candidate + unchanged suffix. It has no editor/persistence side effects. A preview is a display of what the local substitution would look like, not proof of grammar, meaning or factual fidelity.

### Delivery view

The **Delivery** toggle uses this same Lens and `words` task routing for a selected mark, phrase, sentence, or short passage (up to 60 words, 400 characters and four lines). It is not an auto-correction mode. **Explore delivery** quotes the local wording, then separates its possible effect, the reason it can read that way, and one relevant writer question. Periods, pauses, case, spacing, fragments and even missing punctuation may be intentional. If the writer asks "what if?", an optional compact contrast may vary punctuation or case while keeping lexical words in order; contrasts are observations, never replacement proposals. The server rejects generated proposals and dictionary substitutions in this view, and omits labeled contrasts that change lexical words. Neither a Lens result nor a contrast edits `Document.sections`.

A balanced straight- or curly-double-quoted turn can be chosen separately from the current sentence, selection and whole section. The target keeps its unit, exact text and section-local range in saved runs; ambiguous or unmatched quotation marks yield no quoted-turn option. A later edit follows the same exact/changed/unresolved historical-target checks rather than jumping to another quote. Manual selections are never expanded until the writer explicitly chooses a different target.

Find a tool recognizes punctuation, pause, cadence, rhythm, timing, semicolon, dash, ellipsis, exclamation and casing as Delivery intent within this existing Lens. Explicit **Delivery Lens** and **Work this sentence** commands reveal a hidden Inspector and focus the Delivery question or Lab direction field; simply showing the Inspector does not move text focus. If a suitable target/input is unavailable, the command does not send typing into canonical prose.

Offline Delivery offers a limited descriptive reading of visible marks, not fresh model-quality interpretation. A configured live model receives the same local target, neighbor context and Style DNA as other Lens requests, with instructions to avoid grammar-police certainty and invented emotional intent. Delivery does not change default or task routing, and no live-model call is made automatically.

### Direct the lexical request

Use **Lexical direction** for natural instructions—typed or inserted through your operating system's dictation tool. For example: “Keep the disrespect, lose the internet slang; this is for an older audience.” The app does not record audio or implement a speech recognizer; actual Wispr overlay compatibility needs the desktop checklist in [WISPR-QA.md](WISPR-QA.md).

| Control | Meaning and limit |
| --- | --- |
| Exact meaning | Ask to preserve meaning, referent, connotation and certainty; no candidate is better than an unsupported guarantee |
| Balanced | Permit modest nuance changes, explained in the response |
| Loose · effect first | Permit larger changes of effect, with the shift made explicit |
| One word | Generated candidate must be exactly one whitespace-delimited token |
| Short phrase | Generated candidate must be at most eight tokens |
| Fitting expression | Generated candidate must be at most 24 tokens |

Generated candidates must also be single-line. These shape checks run at generation/response validation. Humans can manually edit candidates afterward, including changing their length; explicit acceptance remains a human editorial decision, not a fresh provider guarantee.

Quick intents include clearer, shorter, more precise/formal/conversational, technical, literary, funnier, stronger/softer, less cliché and period-flavored. Persona/register/era and technical precision travel with the request alongside audience context. They direct the model; they do not certify historical authenticity or preservation of every technical distinction. Period flavor is a modern approximation, not a verified historical quotation.

### Honest offline behavior

The **Offline conservative** and **Offline plain** options are deterministic fixtures, not live language models. Curated entries around “larping” distinguish literal role-play from figurative performance/identity and explain why alternatives such as “pretending” lose nuance. Other fixtures distinguish assumption, inference and conviction. This is not a comprehensive dictionary, general semantic intelligence or current cultural research.

Exact-fidelity mock replacement deliberately declines to guarantee a match. Balanced/loose fixtures may offer curated candidates; they do not genuinely reason about every arbitrary persona or instruction. For unrecognized entries, the mock does not invent definitions. **Generate more can return the same fixtures repeatedly.** No offline result demonstrates fresh model creativity, historical verification or current-web knowledge.

## Provider setup and catalog limits

Only **OpenAI Direct** and the two **Offline** fixtures execute in this checkpoint. OpenRouter, Vercel AI Gateway and custom OpenAI-compatible entries are architecture/settings metadata only; their adapters are unimplemented, disabled, and send no requests. Setting those environment variables does not turn them into working integrations.

For OpenAI, put `OPENAI_API_KEY` in the repository-root `.env` and restart. `OPENAI_MODEL` sets the centralized environment default; without a key, the startup default is Offline conservative. Never put credentials in `VITE_*`, the browser, source material, exports, or Git. The app writes no provider credentials to SQLite. Status reveals at most the final four characters, and no suffix for a key of four characters or fewer.

Provider settings support:

- Enable/disable implemented providers.
- Refresh model IDs and see their cached last-refresh timestamp.
- Add an OpenAI model ID manually, without a rebuild. Refresh retains manual entries; discovery failure retains cached data.
- Test connection. **For OpenAI this sends a real tiny Responses request and may incur charges.** The current UI tests the first catalog model; the API can take a specific model ID. Offline tests use no network.

Catalog inclusion is not proof of account access or capability. Unfamiliar models keep unknown capabilities rather than receiving guessed support flags. Writing can attempt unknown structured-output support and strictly validate the response; incompatible outputs fail visibly. Newly discovered/manual models cannot perform web research unless web-search capability is explicitly known true. There is no silent model/provider fallback.

Live requests may transmit the full supplied document, sources, brief, workbench history and preference context—not just the selected word. OpenAI requests use `store: false`, which is not a guarantee of zero provider-side retention. Research is a separate explicit operation. Citation URL membership is checked, but that does not prove the cited page supports the generated statement.

**No real third-party credential was available for live verification in this environment.** Fake-transport SDK tests and synthetic-key leakage checks test implementation boundaries, not live provider availability or output quality.

## Export, recovery, and remaining limits

JSON document export includes optional local workbench drafts, controls, lens settings, runs, active-run ID, proposal outcomes, section/document model choices and variants. Import creates a new document and remaps section/run/proposal/history identities and links. It does not restore global routing preferences or provider catalogs; a full stopped-server data-directory backup does. Keep `.env` separately and securely.

Autosave is debounced and revision-checked, not multi-tab collaboration or crash-proof journaling. Export the current in-memory document before closing a failed-save session. Settings/catalog writes do not have document-style multi-tab CAS. Source material remains a modal dialog, not a pinned reference pane.

Full workbench histories and snapshots grow both stored JSON and AI context. The HTTP body limit is **2 MB**; automatic history compaction/bounded-context selection is not implemented. Long-lived documents can eventually hit request or model-context limits. Workbench metadata remains in a single-document cache coordinated by a still-large `useWorkspace` hook, despite pure helper extraction.

For checkpoint evidence, keep the historical [VERIFICATION.md](VERIFICATION.md) baseline (`4f681c6`) distinct from the latest extension pass in [WORKBENCH-VERIFICATION.md](WORKBENCH-VERIFICATION.md). The new pass record is finalized separately; this guide does not assert unconfirmed final test counts. Production smoke for the extension covers persisted model choices, local histories, routing and catalog state across an actual process restart, plus synthetic fake-key checks of static JavaScript/HTTP without real provider network calls.
