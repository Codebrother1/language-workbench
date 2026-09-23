import type { WritingSection } from "./domain";

export type SectionPurpose = { purpose: string; description: string };

/** Teaching copy only: section kinds and their editing behavior stay unchanged. */
export const sectionPurposes: Record<WritingSection["kind"], SectionPurpose> = {
  Title: {
    purpose: "Name the piece",
    description: "Give the whole piece a name the reader can remember.",
  },
  Headline: {
    purpose: "Give a reason to read",
    description:
      "Make the subject and its promise clear before the piece begins.",
  },
  Subtitle: {
    purpose: "Add a little more detail",
    description: "Support the title with a useful detail or a clearer promise.",
  },
  Hook: {
    purpose: "Make them want the next line",
    description:
      "Open with something specific that gives the reader a reason to stay.",
  },
  "Cold Open": {
    purpose: "Drop into the action",
    description:
      "Begin inside a moment, then supply the background when it is needed.",
  },
  Setup: {
    purpose: "Set up what comes next",
    description:
      "Give the reader what they need to follow the next idea or event.",
  },
  Story: {
    purpose: "Tell what happened",
    description: "Follow a person or situation through a meaningful change.",
  },
  Beat: {
    purpose: "Hold one small moment",
    description:
      "Let a single action, image, or reaction land before moving on.",
  },
  Point: {
    purpose: "Say what you mean",
    description: "Give one idea enough room to be clear and worth considering.",
  },
  Example: {
    purpose: "Make it concrete",
    description: "Show a particular case so the reader can picture the idea.",
  },
  Evidence: {
    purpose: "Back it up",
    description:
      "Support a claim with a fact, observation, or attributable source.",
  },
  Context: {
    purpose: "Give the missing background",
    description: "Explain the circumstances that make this matter now.",
  },
  Segue: {
    purpose: "Connect two thoughts",
    description: "Show why the next idea belongs with the one before it.",
  },
  Transition: {
    purpose: "Move to the next part",
    description:
      "Help the reader follow a change of time, place, or direction.",
  },
  Tension: {
    purpose: "Show what is unresolved",
    description: "Bring a question, conflict, or difficult choice into focus.",
  },
  Escalation: {
    purpose: "Raise the stakes",
    description:
      "Show what gets harder or more consequential as the piece develops.",
  },
  Reveal: {
    purpose: "Let something click",
    description:
      "Share a detail that changes how the reader sees what came before.",
  },
  Callback: {
    purpose: "Bring an earlier detail back",
    description: "Return to an earlier image or idea with new meaning.",
  },
  Reaction: {
    purpose: "Say how it lands",
    description:
      "Show a response to an event, claim, or piece of source material.",
  },
  Explanation: {
    purpose: "Make it easier to understand",
    description:
      "Walk through how or why something works without skipping the important steps.",
  },
  Punchline: {
    purpose: "Land the surprise",
    description:
      "Pay off the setup with a turn the reader did not quite expect.",
  },
  Conclusion: {
    purpose: "Bring the ideas together",
    description:
      "Show what the preceding ideas add up to, rather than just repeating them.",
  },
  Closer: {
    purpose: "Leave a last thought",
    description:
      "End on the image, line, or implication you want the reader to carry away.",
  },
  "Sign-off": {
    purpose: "Say goodbye in your voice",
    description:
      "Close the conversation in a way that fits you and your audience.",
  },
  Cliffhanger: {
    purpose: "Leave a question hanging",
    description:
      "Pause at an unresolved moment that gives the reader a reason to return.",
  },
  "To Be Continued": {
    purpose: "Point toward what is next",
    description:
      "Signal that this is a stopping point, not the end of the larger piece.",
  },
  Freeform: {
    purpose: "Get a thought down",
    description:
      "Write freely. You can decide what job this section does later.",
  },
};
