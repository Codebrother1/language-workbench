import { sectionText } from "./domain";
import type { Workspace } from "./useWorkspace";
import "./wayfinding.css";

type WayfindingProps = {
  w: Workspace;
  onCommand: (id: string) => void;
};
type ActionLink = { id: string; label: string };

function ActionLinks({
  actions,
  onCommand,
}: {
  actions: ActionLink[];
  onCommand: WayfindingProps["onCommand"];
}) {
  return (
    <div className="wayfinding-links">
      {actions.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="wayfinding-link"
          onClick={() => onCommand(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A sibling overlay, never a second editor or part of the clipboard DOM. */
export function FirstMove({ w, onCommand }: WayfindingProps) {
  if (w.doc.sections.some((section) => sectionText(section).trim()))
    return null;
  return (
    <div className="first-move" aria-label="Ways to start writing">
      <p className="first-move-heading">Start with what’s in your head.</p>
      <div className="first-move-actions">
        <button
          type="button"
          className="first-move-primary"
          onClick={() => onCommand("write")}
        >
          Talk or type a thought
        </button>
        <p className="first-move-hint">
          Type here, or use your usual Wispr hotkey with the cursor in the page.
        </p>
        <div className="first-move-support">
          <button
            type="button"
            className="wayfinding-link"
            onClick={() => onCommand("paste")}
          >
            Paste something
          </button>
          <button
            type="button"
            className="wayfinding-link"
            onClick={() => onCommand("brief")}
          >
            I know what I’m writing
          </button>
          <button
            type="button"
            className="wayfinding-link"
            onClick={() => onCommand("insert")}
          >
            Start from structure
          </button>
        </div>
      </div>
    </div>
  );
}

export function NextSteps({ w, onCommand }: WayfindingProps) {
  if (!w.doc.sections.some((section) => sectionText(section).trim()))
    return null;
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  let actions: ActionLink[];
  switch (section?.kind ?? "Freeform") {
    case "Freeform":
      actions = [
        { id: "write", label: "Continue writing" },
        { id: "sentence", label: "Work on this sentence" },
        { id: "thoughts", label: "Organize these thoughts" },
        { id: "make-hook", label: "Make this a hook" },
      ];
      break;
    case "Hook":
    case "Cold Open":
      actions = [
        { id: "section", label: "Work on this opening" },
        { id: "add-setup", label: "Set up what comes next" },
        { id: "add-point", label: "Add a point" },
      ];
      break;
    case "Point":
      actions = [
        { id: "sentence", label: "Work on this sentence" },
        { id: "add-point", label: "Add another point" },
        { id: "add-example", label: "Add an example" },
      ];
      break;
    case "Segue":
    case "Transition":
      actions = [
        { id: "section", label: "Work on this connection" },
        { id: "structure", label: "Look at how it fits" },
        { id: "add-point", label: "Add the next point" },
      ];
      break;
    default:
      actions = [
        { id: "write", label: "Continue writing" },
        { id: "sentence", label: "Work on this sentence" },
        { id: "next-thought", label: "Add the next thought" },
      ];
  }
  if (w.isLensTarget)
    actions = [
      { id: "word", label: "Explore these words" },
      { id: "sentence", label: "Work in the sentence" },
      { id: "save", label: "Save these words" },
    ];
  return (
    <nav className="next-steps" aria-label="Possible next steps">
      <span className="next-steps-label">Next, if you want</span>
      <ActionLinks actions={actions} onCommand={onCommand} />
    </nav>
  );
}

export function ContextHelp({ w, onCommand }: WayfindingProps) {
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  let explanation: string;
  let actions: ActionLink[];
  if (w.isLensTarget || w.target?.scope === "word") {
    explanation =
      "Try another word or phrase without rewriting the sentence around it. Word Lens previews alternatives; applying one replaces only the selected words. You choose what stays.";
    actions = [
      { id: "word", label: "Explore word choices" },
      { id: "sentence", label: "Work on the sentence" },
      { id: "section", label: "See the whole section" },
      { id: "save", label: "Save something worth keeping" },
    ];
  } else if (section?.kind === "Hook" || section?.kind === "Cold Open") {
    explanation =
      "Start with your own observation, detail, or claim. Then try the first words, explore variants, or compare approaches. To build beyond the opening, insert a section at a gap; drag sections in the structure view when you want to change the order.";
    actions = [
      { id: "word", label: "Try the first words" },
      { id: "variants", label: "Explore opening variants" },
      { id: "compare", label: "Compare approaches" },
      { id: "insert", label: "Insert the next section" },
      { id: "sections", label: "Arrange sections" },
    ];
  } else if (section?.kind === "Segue" || section?.kind === "Transition") {
    explanation =
      "A connection helps the reader see why one thought follows another. Read this section with its neighbors, name the relationship, or try a different order in Structure. Your writing stays as it is until you choose a change.";
    actions = [
      { id: "section", label: "Work on the connection" },
      { id: "structure", label: "Explore the relationship" },
      { id: "sections", label: "See neighboring sections" },
      { id: "add-point", label: "Add the next point" },
    ];
  } else if (section?.kind === "Point") {
    explanation =
      "Give this idea one clear job. Work on a sentence, ground it in an example, or add another point when you have something different to say. You do not need to fill out a brief or follow a template.";
    actions = [
      { id: "sentence", label: "Clarify a sentence" },
      { id: "section", label: "Work on the whole point" },
      { id: "add-example", label: "Add an example" },
      { id: "add-point", label: "Add another point" },
    ];
  } else {
    explanation =
      "Keep writing in the page. Select a word or phrase for alternatives, or place the cursor in a sentence to work on it. You can explore your thoughts in Structure without changing the page. A writing brief is optional and can be added anytime.";
    actions = [
      { id: "word", label: "Explore a word or phrase" },
      { id: "sentence", label: "Work on a sentence" },
      { id: "thoughts", label: "Organize these thoughts" },
      { id: "sections", label: "Arrange or split sections" },
      { id: "brief", label: "Add an optional brief" },
    ];
  }
  return (
    <details className="context-help">
      <summary>What can I do here?</summary>
      <p className="context-help-object">
        {w.isLensTarget
          ? w.target?.scope === "word"
            ? "You’re working on a selected word."
            : "You’re working on a selected phrase."
          : section
            ? `You’re working on ${section.kind === "Freeform" ? "your own thought" : "a " + section.kind}.`
            : "Start with your own thought."}
      </p>
      <p>{explanation}</p>
      <ActionLinks actions={actions} onCommand={onCommand} />
    </details>
  );
}

export function EmptyInspectorIntro({ onCommand }: WayfindingProps) {
  return (
    <section className="empty-inspector-intro" aria-label="Getting started">
      <h2>Start anywhere</h2>
      <p>
        Type a thought, paste your own writing into the page, or use your usual
        Wispr hotkey. The tools here become useful when there’s something to
        work with. Nothing needs to be set up first.
      </p>
      <button
        type="button"
        className="wayfinding-link"
        onClick={() => onCommand("write")}
      >
        Go to the page
      </button>
    </section>
  );
}
