import type { WritingSection } from "./domain";

export type SectionConceptCategory =
  "Opening" | "Development" | "Connection" | "Turn" | "Ending" | "Flexible";

export type SectionConcept = {
  name: WritingSection["kind"];
  shortDescription: string;
  rhetoricalJob: string;
  whenToUse: string;
  category: SectionConceptCategory;
};

/** Teaching metadata only. Section kinds and editing behavior remain in the domain model. */
const technicalConcept = (
  name: WritingSection["kind"],
  rhetoricalJob: string,
  shortDescription: string,
  whenToUse: string,
  category: SectionConceptCategory = "Development",
): SectionConcept => ({
  name,
  rhetoricalJob,
  shortDescription,
  whenToUse,
  category,
});
export const sectionConcepts: Record<WritingSection["kind"], SectionConcept> = {
  Title: {
    name: "Title",
    rhetoricalJob: "Name the piece",
    shortDescription: "Give the whole piece a name the reader can remember.",
    whenToUse: "The piece needs a name above the prose.",
    category: "Opening",
  },
  Headline: {
    name: "Headline",
    rhetoricalJob: "Give a reason to read",
    shortDescription:
      "Make the subject and its promise clear before the piece begins.",
    whenToUse: "A reader is deciding whether to open or continue the piece.",
    category: "Opening",
  },
  Subtitle: {
    name: "Subtitle",
    rhetoricalJob: "Add a little more detail",
    shortDescription:
      "Support the title with a useful detail or a clearer promise.",
    whenToUse: "The title alone leaves out a useful distinction.",
    category: "Opening",
  },
  Hook: {
    name: "Hook",
    rhetoricalJob: "Make them want the next line",
    shortDescription:
      "Open with something specific that gives the reader a reason to stay.",
    whenToUse: "The opening needs a concrete reason to keep reading.",
    category: "Opening",
  },
  "Cold Open": {
    name: "Cold Open",
    rhetoricalJob: "Drop into the action",
    shortDescription:
      "Begin inside a moment, then supply the background when it is needed.",
    whenToUse: "The scene can make sense before its full context arrives.",
    category: "Opening",
  },
  Setup: {
    name: "Setup",
    rhetoricalJob: "Set up what comes next",
    shortDescription:
      "Give the reader what they need to follow the next idea or event.",
    whenToUse: "A later point would otherwise lack context.",
    category: "Development",
  },
  Story: {
    name: "Story",
    rhetoricalJob: "Tell what happened",
    shortDescription:
      "Follow a person or situation through a meaningful change.",
    whenToUse:
      "Events and their consequences matter more than a static example.",
    category: "Development",
  },
  Beat: {
    name: "Beat",
    rhetoricalJob: "Hold one small moment",
    shortDescription:
      "Let a single action, image, or reaction land before moving on.",
    whenToUse: "A small moment needs attention without a whole new argument.",
    category: "Development",
  },
  Point: {
    name: "Point",
    rhetoricalJob: "Say what you mean",
    shortDescription:
      "Give one idea enough room to be clear and worth considering.",
    whenToUse: "You need to say what a passage means or claims.",
    category: "Development",
  },
  Example: {
    name: "Example",
    rhetoricalJob: "Make it concrete",
    shortDescription:
      "Show a particular case so the reader can picture the idea.",
    whenToUse: "A general point feels too abstract.",
    category: "Development",
  },
  Evidence: {
    name: "Evidence",
    rhetoricalJob: "Back it up",
    shortDescription:
      "Gives the reader a reason to believe a point: data, quote, source, observation, example, or proof.",
    whenToUse: "A point needs support the reader can inspect.",
    category: "Development",
  },
  Context: {
    name: "Context",
    rhetoricalJob: "Give the missing background",
    shortDescription: "Explain the circumstances that make this matter now.",
    whenToUse: "The reader needs to know what surrounds this moment or idea.",
    category: "Development",
  },
  Segue: {
    name: "Segue",
    rhetoricalJob: "Connect two thoughts",
    shortDescription:
      "Connects one idea to the next without announcing the transition.",
    whenToUse: "The next section would otherwise feel abrupt.",
    category: "Connection",
  },
  Transition: {
    name: "Transition",
    rhetoricalJob: "Move to the next part",
    shortDescription:
      "Help the reader follow a change of time, place, or direction.",
    whenToUse:
      "The piece changes direction and the reader needs a clear handoff.",
    category: "Connection",
  },
  Tension: {
    name: "Tension",
    rhetoricalJob: "Show what is unresolved",
    shortDescription:
      "Bring a question, conflict, or difficult choice into focus.",
    whenToUse: "Something important remains unsettled.",
    category: "Turn",
  },
  Escalation: {
    name: "Escalation",
    rhetoricalJob: "Raise the stakes",
    shortDescription:
      "Show what gets harder or more consequential as the piece develops.",
    whenToUse: "A problem develops rather than staying at the same level.",
    category: "Turn",
  },
  Reveal: {
    name: "Reveal",
    rhetoricalJob: "Let something click",
    shortDescription: "Delivers information intentionally held back earlier.",
    whenToUse: "Setup or tension already exists for the new information.",
    category: "Turn",
  },
  Callback: {
    name: "Callback",
    rhetoricalJob: "Bring an earlier detail back",
    shortDescription:
      "Brings back an earlier phrase, image, joke, or detail so the piece feels connected.",
    whenToUse: "An earlier element can return with a useful echo or change.",
    category: "Turn",
  },
  Reaction: {
    name: "Reaction",
    rhetoricalJob: "Say how it lands",
    shortDescription:
      "Show a response to an event, claim, or piece of source material.",
    whenToUse: "The response matters as much as the event itself.",
    category: "Turn",
  },
  Explanation: {
    name: "Explanation",
    rhetoricalJob: "Make it easier to understand",
    shortDescription:
      "Walk through how or why something works without skipping the important steps.",
    whenToUse:
      "The reader needs the reasoning or process, not just the result.",
    category: "Development",
  },
  Punchline: {
    name: "Punchline",
    rhetoricalJob: "Land the surprise",
    shortDescription:
      "Pay off the setup with a turn the reader did not quite expect.",
    whenToUse: "A prior setup has prepared a joke or pointed reversal.",
    category: "Turn",
  },
  Conclusion: {
    name: "Conclusion",
    rhetoricalJob: "Bring the ideas together",
    shortDescription:
      "Show what the preceding ideas add up to, rather than just repeating them.",
    whenToUse: "The piece needs a considered answer or synthesis.",
    category: "Ending",
  },
  Closer: {
    name: "Closer",
    rhetoricalJob: "Leave a last thought",
    shortDescription:
      "End on the image, line, or implication you want the reader to carry away.",
    whenToUse: "The piece has made its point and needs a final landing.",
    category: "Ending",
  },
  "Sign-off": {
    name: "Sign-off",
    rhetoricalJob: "Say goodbye in your voice",
    shortDescription:
      "Close the conversation in a way that fits you and your audience.",
    whenToUse: "The format calls for a personal or practical farewell.",
    category: "Ending",
  },
  Cliffhanger: {
    name: "Cliffhanger",
    rhetoricalJob: "Leave a question hanging",
    shortDescription:
      "Pause at an unresolved moment that gives the reader a reason to return.",
    whenToUse:
      "The unresolved outcome is intentional and a continuation is coming.",
    category: "Ending",
  },
  "To Be Continued": {
    name: "To Be Continued",
    rhetoricalJob: "Point toward what is next",
    shortDescription:
      "Signal that this is a stopping point, not the end of the larger piece.",
    whenToUse: "The current installment ends but the larger thread continues.",
    category: "Ending",
  },
  Goal: technicalConcept(
    "Goal",
    "Name the reader's aim",
    "State what the reader hopes to accomplish.",
    "The destination of the work matters.",
  ),
  Prerequisite: technicalConcept(
    "Prerequisite",
    "Surface an assumption",
    "Name what must already be true.",
    "A later action depends on earlier knowledge or setup.",
  ),
  Step: technicalConcept(
    "Step",
    "Describe an action",
    "Show one action in a possible sequence.",
    "The reader needs to do something.",
  ),
  "Expected Result": technicalConcept(
    "Expected Result",
    "Show what follows",
    "Describe an observable result.",
    "The reader needs to know what success might look like.",
  ),
  Verification: technicalConcept(
    "Verification",
    "Check the result",
    "Show how the reader might tell whether it worked.",
    "A claim or step needs a check.",
  ),
  Concept: technicalConcept(
    "Concept",
    "Name an idea",
    "Introduce an idea the reader can use.",
    "Understanding the idea changes later actions.",
  ),
  "Mental Model": technicalConcept(
    "Mental Model",
    "Offer a way to reason",
    "Describe a representation that helps explain behavior.",
    "A reader needs more than a command to reason about the system.",
  ),
  Counterexample: technicalConcept(
    "Counterexample",
    "Show a boundary",
    "Use a contrasting case to test an explanation.",
    "A successful example alone hides an important distinction.",
  ),
  Demo: technicalConcept(
    "Demo",
    "Make behavior observable",
    "Let the reader or audience see the system respond.",
    "Watching a result clarifies a claim.",
  ),
  Warning: technicalConcept(
    "Warning",
    "Mark a consequence",
    "Name a risk without assuming the reader made a mistake.",
    "A choice could have a significant cost.",
  ),
  Constraint: technicalConcept(
    "Constraint",
    "Name a limit",
    "Explain the boundary a design or procedure works within.",
    "A limitation changes the reader's options.",
  ),
  "Failure Mode": technicalConcept(
    "Failure Mode",
    "Explain how it can fail",
    "Show the condition under which an approach breaks.",
    "The happy path would conceal a consequential failure.",
    "Turn",
  ),
  Troubleshooting: technicalConcept(
    "Troubleshooting",
    "Investigate a symptom",
    "Link what the reader observes to evidence and possibilities.",
    "The reader needs to diagnose before acting.",
  ),
  Recovery: technicalConcept(
    "Recovery",
    "Find a way forward",
    "Describe a possible response after failure.",
    "A diagnosis without a way forward would strand the reader.",
  ),
  Reference: technicalConcept(
    "Reference",
    "Support lookup",
    "Present information the reader may need to find quickly.",
    "The reader returns for details rather than reading linearly.",
    "Flexible",
  ),
  "API Surface": technicalConcept(
    "API Surface",
    "Describe an interface",
    "Name the conditions and boundaries of an interface.",
    "The reader needs to locate precise interface details.",
  ),
  Decision: technicalConcept(
    "Decision",
    "Explain a choice",
    "Identify what was chosen and the relevant reasons.",
    "Readers need to understand why an option was taken.",
    "Turn",
  ),
  Alternative: technicalConcept(
    "Alternative",
    "Show another route",
    "Present a meaningful option without forcing a verdict.",
    "A choice becomes clearer in comparison.",
    "Turn",
  ),
  Tradeoff: technicalConcept(
    "Tradeoff",
    "Name what is exchanged",
    "Show what a choice gains and gives up.",
    "A one-sided account hides consequences.",
    "Turn",
  ),
  Assumption: technicalConcept(
    "Assumption",
    "Expose a premise",
    "Make a premise visible for readers to inspect.",
    "The reasoning depends on something not yet established.",
  ),
  Why: technicalConcept(
    "Why",
    "Explain causality",
    "Show a reason behind an action or behavior.",
    "The reader needs an explanation, not just a command.",
  ),
  Recap: technicalConcept(
    "Recap",
    "Reconnect the ideas",
    "Revisit useful distinctions without a compulsory lesson.",
    "Readers need to orient after several moves.",
    "Ending",
  ),
  "Next Step": technicalConcept(
    "Next Step",
    "Point beyond this part",
    "Suggest a direction for later work without creating a task.",
    "The reader has reached a useful stopping place.",
    "Ending",
  ),
  Freeform: {
    name: "Freeform",
    rhetoricalJob: "Get a thought down",
    shortDescription:
      "Write freely. You can decide what job this section does later.",
    whenToUse: "You want to write first and name its role later.",
    category: "Flexible",
  },
};

export function sectionConceptHelpText(kind: WritingSection["kind"]) {
  const concept = sectionConcepts[kind];
  return `${concept.shortDescription} Use when: ${concept.whenToUse}`;
}
