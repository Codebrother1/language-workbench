import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  defaultSettings,
  newDocument,
  newSection,
  sectionKinds,
  sectionText,
} from "../../packages/domain/src/index";

async function seed(request: APIRequestContext) {
  for (const doc of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + doc.id);
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("Concept help", "A first thought.");
  doc.sections[0].kind = "Hook";
  doc.sections[0].label = "Hook";
  doc.sections.push(newSection("Point", "A second thought."));
  return (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
}

test("insertion concepts explain themselves on hover and focus without changing insertion", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await page
    .getByTestId("structure-item")
    .first()
    .locator(".section-focus")
    .click();
  await page.getByRole("button", { name: "+ Add after" }).click();
  const dialog = page.getByRole("dialog", { name: "Insert section" });
  const help = dialog.getByRole("tooltip");
  await dialog.getByRole("button", { name: "Insert Segue" }).hover();
  await expect(help).toContainText("Connects one idea to the next");
  await expect(help).toContainText("abrupt");
  await dialog.getByRole("button", { name: "Insert Point" }).focus();
  await expect(help).toContainText("Point");
  await expect(help).toContainText("one idea");
  await expect(page.getByTestId("structure-item")).toHaveCount(2);

  const menu = dialog.getByLabel("All section types");
  await expect(menu.locator("option")).toHaveCount(sectionKinds.length);
  await menu.focus();
  await menu.selectOption("Reveal");
  await expect(menu).toBeFocused();
  await expect(help).toContainText("intentionally held back");
  await expect(help).toContainText("Setup or tension");
  await expect(menu).toHaveAttribute(
    "aria-describedby",
    "section-insertion-concept-help",
  );
  await dialog.getByRole("button", { name: "Insert selected type" }).click();
  await page.keyboard.insertText("The withheld detail belongs here.");
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await page.getByTestId("save-state").click();
  const saved = await (await request.get("/api/documents/" + doc.id)).json();
  expect(
    saved.sections.map((section: { kind: string }) => section.kind),
  ).toEqual(["Hook", "Reveal", "Point"]);
  expect(sectionText(saved.sections[1])).toBe(
    "The withheld detail belongs here.",
  );
});

test("semantic kind hover and keyboard focus help leave native dictation-style typing and selection intact", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const first = page.getByTestId("structure-item").first();
  await first.locator(".section-focus").click();
  await first.locator(".section-options summary").click();
  const semantic = page.getByLabel("Semantic kind");
  await expect(semantic.locator("option")).toHaveCount(sectionKinds.length);
  await semantic.hover();
  await expect(page.getByRole("tooltip")).toContainText("Hook");
  await expect(page.getByRole("tooltip")).toContainText("reason to stay");
  await semantic.focus();
  await semantic.selectOption("Callback");
  await expect(semantic).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("earlier phrase");
  await expect(page.getByRole("tooltip")).toContainText("earlier element");

  const capture = page.getByLabel("New thought");
  await capture.click();
  await page.keyboard.insertText("A thought from a native text input.");
  await capture.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  await expect(capture).toHaveValue("A thought from a native text input.");
  await capture.press("Enter");
  await expect(capture).toBeFocused();
  await expect(page.getByTestId("structure-item")).toHaveCount(3);

  await first.locator(".section-focus").click();
  await first.getByTestId("card-writing").getByRole("button").click();
  const editor = first.locator(".card-editor-host .writing-editor");
  await expect(editor).toBeFocused();
  await editor.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = node.textContent?.indexOf("first thought") ?? -1;
      if (start < 0) continue;
      window.getSelection()?.setBaseAndExtent(node, start, node, start + 13);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error("Prose node missing");
  });
  await page.keyboard.insertText("returning detail");
  await expect(first.getByTestId("writing-section").first()).toContainText(
    "A returning detail.",
  );
  await expect(page.getByTestId("writing-editor")).toHaveCount(1);
  await page.getByTestId("save-state").click();
  const saved = await (await request.get("/api/documents/" + doc.id)).json();
  expect(saved.sections[0].id).toBe(doc.sections[0].id);
  expect(saved.sections[0].kind).toBe("Callback");
  expect(sectionText(saved.sections[0])).toBe("A returning detail.");
  expect(sectionText(saved.sections[2])).toBe(
    "A thought from a native text input.",
  );
});
