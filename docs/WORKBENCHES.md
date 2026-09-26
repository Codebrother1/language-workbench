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

Move between sections to return to their local workbenches. **Workbench history → Inspect this run** restores that run's instruction, answer, controls and response for review; it does not change the writing. The active inspected run survives a successful save/reload. Model/run provenance is recorded on new runs, variants and iteration history; older records may lack it.

A pending operation blocks switching documents with an explicit message. You may navigate sections while it runs; its response remains attached to the originating section rather than the current selection. There is one global writing-operation busy guard, not simultaneous independent section requests.

## A safe section workflow

1. Select a passage in one section, or use the section target. Check the target indicator.
2. Write an instruction. For creative work, **diagnose → answer in your own words → request proposals**. Lexical replacement and limited spelling assistance have direct-suggestion exceptions.
3. Review the response. Edit candidate wording if needed, reject it, or save it as a variant.
4. Apply only with the explicit acceptance/replacement action, or activate a saved variant. The original target text is retained as an original variant.
5. Wait for Saved; export important work.

A run captures its original target, offsets and section snapshot. Accept/Replace/Activate rechecks that anchor against the current document. If the source section changed, make a fresh selection and request rather than expecting automatic relocation. Editing an unrelated section need not invalidate the original target. Section merges retain prior runs, but stale anchors still fail closed. Run inspection never refreshes an obsolete anchor into permission to overwrite new text.

Original variants are text snapshots, not full rich-format backups. Section-wide replacement rebuilds paragraphs and can lose formatting. Whole-piece analysis and cross-section selections do not authorize whole-document rewriting. Live candidates are checked after generation against explicit count/line/short-bridge requests and nearby Segue prose; clear neighbor restatements are omitted, while lightweight cadence, motif and stock-prose mismatches receive brief quality notes. When a safe distinct option is missing, an output check says so instead of inventing one. This is a lexical heuristic, not reliable semantic understanding or a promise that every subtle paraphrase will be caught. No automatic extra model call is made to fill a missing variant. Whole-piece critique shows the requested revision question separately and flags missing deliverables.

## Choose models without changing text

Expand the context **model dropdown** to see the effective model and where it was inherited from. Its searchable pickers let you select a section model, restore inherited routing, set a section-type default, or select **Run with** for one operation. Model changes affect future requests, not existing prose or the provenance of old runs.

One resolver is shared by the frontend and backend:

| Priority | Choice | Where it lives |
| --- | --- | --- |
| 1 | One-off **Run with** | Current workbench; consumed by next single-model operation |
| 2 | Section override | Section metadata |
| 3 | Section-type default | Global routing settings |
| 4 | Task default | Global routing settings |
| 5 | Document default | Document metadata |
| 6 | Application default | Global preference, otherwise environment/offline default |

Word/Phrase Lens uses task **`words`** with exactly this priority. It does not bypass a section or section-type override to favor a special lexical model. Whole-document analysis has no section/type override.

**Diagnosis counts as the next operation.** If Run with is set before diagnosing, it is consumed by that diagnosis; the later proposal uses normal routing unless you set another one-off. Once dispatched, even a failed request consumes that one-off. A persistent section override is different and stays until cleared. Compare has explicit model references of its own and does not consume Run with.

In **AI provider settings**, choose a document default and, optionally, application, section-type or task defaults. Clearing an override restores inheritance. Unknown/disabled/unconfigured choices are not silently replaced by another model; a request reports the problem. This pass leaves the configured application default (Luna in the reported setup) untouched. If a writer prefers Sol for structural critique after a matched comparison, they can explicitly set a critique task default or use a one-off **Run with**; this pass does not change routing or silently add a higher-cost call.

## Compare models

1. Open **Model controls → Compare models**.
2. Select **2–4 distinct, implemented, configured and enabled models**. The two offline fixtures allow a no-key workflow check.
3. Supply your human answer for a creative comparison; lexical comparisons can generate directly.
4. Click **Compare selected models**. Each model receives the same captured target, material, controls and readable context.
5. Inspect independent results in local history or **Compare recent outputs**. Successful candidates are saved as variants with model/run provenance; activate only deliberately.

Comparison never overwrites a draft or automatically chooses a winner. Each provider outcome is independent; successful runs remain available when another model fails. Errors are shown rather than replaced with mock success. With live models, expect a request and possible charges per selected model.

The UI shows a busy state, errors, completed runs, and proposal outcomes. It is not a token-streaming/per-provider progress console. Recent-output review is vertical and limited to a small recent set, not a full comparison canvas. There is no favorites/recent-model picker UI, although history records the actual models used.

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
