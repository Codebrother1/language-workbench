import { type EditTarget, quickWordIntents } from "./domain";
import type { Workspace } from "./useWorkspace";
import { Button, Field, Select, GrowingTextarea } from "./ui";
/** Pure preview. It never touches the editor, canonical document, or persistence. */
export function lexicalPreview(target: EditTarget, candidate: string) {
  const text = target.sectionSnapshot;
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text),
  ];
  const start =
    segments.find(
      (s) =>
        target.start >= s.index && target.start < s.index + s.segment.length,
    )?.index ?? 0;
  const last = segments.find(
    (s) => target.end > s.index && target.end <= s.index + s.segment.length,
  );
  const end = last ? last.index + last.segment.length : text.length;
  const before = text.slice(start, target.start),
    after = text.slice(target.end, end);
  return {
    current: text.slice(start, end),
    before,
    after,
    result: before + candidate + after,
    protected: before + "[TARGET]" + after,
  };
}
export function WordLensControls({ w }: { w: Workspace }) {
  const phrase = w.target?.scope !== "word";
  const preview = w.target ? lexicalPreview(w.target, w.target.text) : null;
  return (
    <section
      className="word-lens"
      aria-label={phrase ? "Phrase Lens" : "Word Lens"}
    >
      <div className="segmented" role="group" aria-label="Lens mode">
        {(["explore", "replace"] as const).map((mode) => (
          <Button
            key={mode}
            aria-pressed={w.lens.mode === mode}
            className={w.lens.mode === mode ? "on" : ""}
            onClick={() => w.setLens((l) => ({ ...l, mode }))}
          >
            {mode === "explore" ? "Explore" : "Replace"}
          </Button>
        ))}
      </div>
      {preview && (
        <div className="protected-sentence">
          <span className="eyebrow">Protected sentence</span>
          <p>
            {preview.before}
            <mark>[{w.target?.text}]</mark>
            {preview.after}
          </p>
          <small>Only the bracketed target can change.</small>
        </div>
      )}
      <Field
        label="Lexical direction"
        hint="Describe the meaning, audience, attitude, or era you need. Type or dictate naturally."
      >
        <GrowingTextarea
          rows={4}
          value={w.instruction}
          onChange={(e) => w.setInstruction(e.target.value)}
          placeholder="Keep the disrespect, lose the internet slang…"
        />
      </Field>
      <div className="form-grid">
        <Field label="Meaning fidelity">
          <Select
            value={w.lens.fidelity}
            onChange={(e) =>
              w.setLens((l) => ({
                ...l,
                fidelity: e.target.value as typeof l.fidelity,
              }))
            }
          >
            <option value="exact">Exact meaning</option>
            <option value="balanced">Balanced</option>
            <option value="loose">Loose · effect first</option>
          </Select>
        </Field>
        <Field label="Replacement shape">
          <Select
            value={w.lens.shape}
            onChange={(e) =>
              w.setLens((l) => ({
                ...l,
                shape: e.target.value as typeof l.shape,
              }))
            }
          >
            <option value="word">One word</option>
            <option value="phrase">Short phrase</option>
            <option value="expression">Fitting expression</option>
          </Select>
        </Field>
      </div>
      <details className="control-details">
        <summary>Intent, register & era</summary>
        <Field label="Quick word intent">
          <Select
            value={w.lens.intent}
            onChange={(e) =>
              w.setLens((l) => ({ ...l, intent: e.target.value }))
            }
          >
            {quickWordIntents.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </Select>
        </Field>
        <Field label="Persona / register / era">
          <input
            value={w.lens.persona}
            onChange={(e) =>
              w.setLens((l) => ({ ...l, persona: e.target.value }))
            }
            placeholder="An older audience; a British aristocrat…"
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={w.lens.technical}
            onChange={(e) =>
              w.setLens((l) => ({ ...l, technical: e.target.checked }))
            }
          />
          Technical precision
        </label>
        <p className="small muted">
          Historical plausibility and comedic approximation are different. The
          model must state uncertainty; current usage requires cited research.
        </p>
      </details>
      <Button
        className="primary full"
        disabled={w.busy || !w.ready}
        onClick={() => w.askLens(w.lens.mode)}
      >
        {w.busy
          ? "Searching…"
          : w.lens.mode === "explore"
            ? `Diagnose this ${phrase ? "phrase" : "word"}`
            : "Find replacements"}
      </Button>
      <p className="small muted">
        Exploration leaves your writing untouched. Only Replace activates a
        candidate.
      </p>
    </section>
  );
}
export function CandidatePreview({
  w,
  text,
  open = false,
}: {
  w: Workspace;
  text: string;
  open?: boolean;
}) {
  const target = w.responseTarget;
  if (!target) return null;
  const preview = lexicalPreview(target, text);
  return (
    <details className="candidate-preview" open={open}>
      <summary>Sentence preview · not applied</summary>
      <span className="eyebrow">Current</span>
      <p>{preview.current}</p>
      <span className="eyebrow">Preview</span>
      <p data-testid="sentence-preview">
        {preview.before}
        <mark>{text}</mark>
        {preview.after}
      </p>
      <div className="row wrap">
        <Button onClick={() => w.copy(preview.result)}>
          Copy resulting sentence
        </Button>
        <Button
          onClick={() => {
            void w.askAboutCandidate(target, text);
          }}
        >
          Ask about candidate
        </Button>
      </div>
    </details>
  );
}
