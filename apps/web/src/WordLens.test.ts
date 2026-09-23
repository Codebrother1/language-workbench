import { describe, it, expect } from "vitest";
import { newDocument, targetFor } from "./domain";
import { lexicalPreview } from "./WordLens";
describe("pure surgical previews", () => {
  it("replaces only the target in its surrounding sentence without mutating the document", () => {
    const doc = newDocument("Test", "His ass is larping. The rest stays mine.");
    const before = JSON.stringify(doc);
    const target = targetFor(doc, doc.sections[0].id, "word", 11, 18);
    const p = lexicalPreview(target, "posturing");
    expect(p.result).toBe("His ass is posturing. ");
    expect(p.protected).toBe("His ass is [TARGET]. ");
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("supports a multiword expression without touching the protected prefix", () => {
    const doc = newDocument("Test", "His ass is larping.");
    const target = targetFor(doc, doc.sections[0].id, "word", 11, 18);
    expect(lexicalPreview(target, "putting on airs").result).toBe(
      "His ass is putting on airs.",
    );
  });
  it("limits preview to the containing sentence with Unicode offsets intact", () => {
    const text = "First thought. Café people are larping. Next thought.";
    const doc = newDocument("Test", text);
    const start = text.indexOf("larping");
    const target = targetFor(doc, doc.sections[0].id, "word", start, start + 7);
    expect(lexicalPreview(target, "posturing").result).toBe(
      "Café people are posturing. ",
    );
  });
});
