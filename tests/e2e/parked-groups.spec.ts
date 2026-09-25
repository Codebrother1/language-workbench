import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  defaultSettings,
  newDocument,
  newSection,
  sectionText,
} from "../../packages/domain/src/index";

async function fresh(request: APIRequestContext) {
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  await request.put("/api/settings", { data: defaultSettings() });
  return (
    await request.post("/api/import", {
      data: { document: newDocument("A piece about the hallway") },
    })
  ).json();
}

async function save(page: Page) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}

async function writeInCard(page: Page, id: string, prefix: string) {
  const card = page.locator(`[data-section-id="${id}"]`);
  await card.locator(".section-focus").click();
  const prompt = card.getByTestId("card-writing").getByRole("button");
  if (await prompt.count()) await prompt.press("Enter");
  await expect(card.locator(".card-editor-host .writing-editor")).toBeVisible();
  await page.keyboard.insertText(prefix);
}

test("draft and parked capture, groups, reinclusion, labels and export share one section list", async ({
  page,
  request,
}) => {
  const original = await fresh(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const capture = page.getByLabel("New thought");
  const draft = [
    "The hallway light stayed on.",
    "I thought someone was waiting.",
    "It was the coat on the hook.",
    "I still walked more quietly.",
  ];
  for (const line of draft) {
    await capture.fill(line);
    await capture.press("Enter");
  }
  await page.getByLabel("Thought destination").selectOption("parked");
  const parked = [
    "The switch has a stubborn click.",
    "My sister always leaves a note there.",
    "Maybe the hallway should be shorter.",
  ];
  for (const line of parked) {
    await capture.fill(line);
    await capture.press("Enter");
    await expect(capture).toBeFocused();
  }
  await expect(page.getByRole("button", { name: "Draft · 4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Parked · 3" })).toBeVisible();
  const hiddenParked = page.locator(
    ".writing-editor > section[placement='parked']",
  );
  await expect(hiddenParked).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(hiddenParked.nth(i)).toBeHidden();
  await save(page);
  let doc = await (await request.get(`/api/documents/${original.id}`)).json();
  expect(
    doc.sections.map((section: { placement: string }) => section.placement),
  ).toEqual(["draft", "draft", "draft", "draft", "parked", "parked", "parked"]);
  const parkedIds: string[] = doc.sections
    .slice(4)
    .map((section: { id: string }) => section.id);

  for (const name of ["Interface", "Collaboration"]) {
    await page.getByRole("button", { name: "+ New parked group" }).click();
    await page.getByLabel("New parked group name").fill(name);
    await page.getByRole("button", { name: "Create group" }).click();
  }
  await page
    .locator(`[data-section-id="${parkedIds[0]}"] .section-focus`)
    .click();
  await page
    .getByLabel("Group for Freeform")
    .selectOption({ label: "Interface" });
  await page
    .locator(`[data-section-id="${parkedIds[1]}"] .section-focus`)
    .click();
  await page
    .getByLabel("Group for Freeform")
    .selectOption({ label: "Interface" });
  await expect(page.locator("[data-parked-group-heading]")).toContainText([
    "Interface · 2",
    "Collaboration · 0",
  ]);
  await page
    .locator(`[data-section-id="${parkedIds[1]}"] .section-focus`)
    .click();
  await page
    .getByLabel("Group for Freeform")
    .selectOption({ label: "Collaboration" });
  await expect(
    page.getByRole("button", { name: "Collapse Collaboration" }),
  ).toContainText("· 1");
  await page
    .getByLabel("Group for Freeform")
    .selectOption({ label: "Interface" });
  await page
    .locator("[data-parked-group-heading]")
    .filter({ hasText: "Collaboration" })
    .getByRole("button", { name: "Rename" })
    .click();
  await page.getByLabel("Rename Collaboration").fill("Collaborators");
  await page.getByLabel("Rename Collaboration").press("Enter");
  for (const [index, id] of parkedIds.entries())
    await writeInCard(page, id, `Side ${index + 1}: `);
  await page.getByRole("button", { name: "Collapse Interface" }).click();
  await expect(
    page.locator(`[data-section-id="${parkedIds[0]}"]`),
  ).toBeHidden();
  await save(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand Interface" }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-section-id="${parkedIds[0]}"]`),
  ).toBeHidden();
  await page.getByRole("button", { name: "Expand Interface" }).click();
  await expect(
    page.getByRole("button", { name: "Collapse Collaborators" }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-section-id="${parkedIds[0]}"]`),
  ).toBeVisible();
  const grouped = page.locator(`[data-section-id="${parkedIds[0]}"]`);
  await page
    .locator(`[data-section-id="${doc.sections[0].id}"] .section-focus`)
    .click();
  await page
    .locator(
      `[data-section-id="${doc.sections[0].id}"] .section-options summary`,
    )
    .click();
  await page
    .locator(`[data-section-id="${doc.sections[0].id}"] .section-options input`)
    .first()
    .fill("Threshold");
  await grouped.locator(".section-focus").click();
  await grouped.getByRole("button", { name: "Include in draft" }).click();
  const options = await grouped
    .getByLabel("Draft position")
    .locator("option")
    .allTextContents();
  expect(options).toContain(
    "Before 2. “I thought someone was waiting.” · Freeform",
  );
  expect(options).toContain("Before 1. “Threshold” · Freeform");
  await grouped.getByLabel("Draft position").selectOption(doc.sections[1].id);
  await grouped.getByRole("button", { name: "Include here" }).click();
  await expect(grouped).toHaveAttribute("data-placement", "draft");
  await grouped.getByRole("button", { name: "Park thought" }).click();
  await expect(grouped).toHaveAttribute("data-placement", "parked");
  await save(page);
  doc = await (await request.get(`/api/documents/${original.id}`)).json();
  expect(
    doc.sections
      .filter(
        (section: { placement: string }) => section.placement === "parked",
      )
      .map((section: { id: string }) => section.id),
  ).toEqual([parkedIds[2], parkedIds[1], parkedIds[0]]);
  const returning = doc.sections.find(
    (section: { id: string }) => section.id === parkedIds[0],
  );
  expect(returning.parkedGroupId).toBe(doc.parkedGroups[0].id);
  expect(sectionText(returning)).toContain("Side 1:");
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  const preview = await page
    .getByTestId("writing-editor")
    .evaluate((node) => node.innerText);
  expect(preview).not.toContain("Side 1:");
  await page.getByRole("button", { name: "Document actions" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Markdown" }).click(),
  ]);
  expect(readFileSync((await download.path())!, "utf8")).not.toContain(
    "Side 1:",
  );
});

test("parked cards reorder within Ungrouped and a named group with visible drop markers", async ({
  page,
  request,
}) => {
  await fresh(request);
  const doc = newDocument("Parked order", "Draft stays first.");
  doc.parkedGroups = [{ id: "g", name: "Interface", collapsed: false }];
  const a = newSection("Freeform", "Ungrouped A");
  const b = newSection("Freeform", "Ungrouped B");
  const c = newSection("Freeform", "Grouped C");
  const d = newSection("Freeform", "Grouped D");
  for (const section of [a, b, c, d]) section.placement = "parked";
  c.parkedGroupId = "g";
  d.parkedGroupId = "g";
  doc.sections.push(a, b, c, d);
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const [draftId, aId, bId, cId, dId] = imported.sections.map(
    (section: { id: string }) => section.id,
  );
  await page.goto("/");
  await expect(page.getByLabel("Document title")).toHaveValue("Parked order");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Parked · 4" }).click();
  const drag = async (sourceId: string, targetId: string) => {
    const source = page.locator(`[data-section-id="${sourceId}"] .grip`);
    const target = page.locator(`[data-section-id="${targetId}"]`);
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 22, to.y + Math.min(30, to.height / 2), {
      steps: 10,
    });
    const marker = page.getByTestId("drop-marker");
    await expect(marker).toHaveAttribute("data-drop-index", /\d+/);
    expect(
      await marker.evaluate(
        (node) => getComputedStyle(node, "::before").height,
      ),
    ).toBe("8px");
    await page.mouse.up();
  };
  await drag(bId, aId);
  await save(page);
  let stored = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(stored.sections.map((section: { id: string }) => section.id)).toEqual([
    draftId,
    bId,
    aId,
    cId,
    dId,
  ]);
  await drag(dId, cId);
  await save(page);
  stored = await (await request.get(`/api/documents/${imported.id}`)).json();
  expect(stored.sections.map((section: { id: string }) => section.id)).toEqual([
    draftId,
    bId,
    aId,
    dId,
    cId,
  ]);
  await page.locator(`[data-section-id="${dId}"] .section-focus`).click();
  await page
    .locator(`[data-section-id="${dId}"] .section-options summary`)
    .click();
  await page
    .locator(`[data-section-id="${dId}"]`)
    .getByRole("button", { name: "Move section down" })
    .click();
  await save(page);
  stored = await (await request.get(`/api/documents/${imported.id}`)).json();
  expect(stored.sections.map((section: { id: string }) => section.id)).toEqual([
    draftId,
    bId,
    aId,
    cId,
    dId,
  ]);
});

test("parked quick capture, group order and undo retain canonical membership", async ({
  page,
  request,
}) => {
  const original = await fresh(request);
  await page.goto("/");
  await page
    .getByLabel("Parked thought", { exact: true })
    .fill("A side thought.");
  await page.getByRole("button", { name: "Add parked thought" }).click();
  await save(page);
  let doc = await (await request.get(`/api/documents/${original.id}`)).json();
  const parkedId = doc.sections[1].id;
  expect(doc.sections[0].placement).toBe("draft");
  expect(sectionText(doc.sections[1])).toBe("A side thought.");
  for (const name of ["First", "Empty", "Last"]) {
    await page.getByRole("button", { name: "+ New parked group" }).click();
    await page.getByLabel("New parked group name").fill(name);
    await page.getByRole("button", { name: "Create group" }).click();
  }
  const card = page.locator(`[data-section-id="${parkedId}"]`);
  await card.locator(".section-focus").click();
  await card.getByLabel("Group for Freeform").selectOption({ label: "Last" });
  await expect(page.locator("[data-parked-group-heading]")).toContainText([
    "First · 0",
    "Empty · 0",
    "Last · 1",
  ]);
  await save(page);
  doc = await (await request.get(`/api/documents/${original.id}`)).json();
  expect(doc.sections[1].parkedGroupId).toBe(doc.parkedGroups[2].id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await save(page);
  doc = await (await request.get(`/api/documents/${original.id}`)).json();
  expect(doc.sections[1].parkedGroupId).toBeNull();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await save(page);
  doc = await (await request.get(`/api/documents/${original.id}`)).json();
  expect(doc.sections[1].parkedGroupId).toBe(doc.parkedGroups[2].id);
});

test("scoped card Select All replaces only one section while a true cross-section edit stays guarded", async ({
  page,
  request,
}) => {
  const original = await fresh(request);
  await page.goto("/");
  const capture = page.getByLabel("New thought");
  await capture.fill("First prose remains here.");
  await capture.press("Enter");
  await capture.fill("Second prose remains elsewhere.");
  await capture.press("Enter");
  await save(page);
  const before = await (
    await request.get(`/api/documents/${original.id}`)
  ).json();
  const first = page.locator(`[data-section-id="${before.sections[0].id}"]`);
  await first.locator(".section-focus").click();
  const prompt = first.getByTestId("card-writing").getByRole("button");
  if (await prompt.count()) await prompt.press("Enter");
  const editor = first.locator(".card-editor-host .writing-editor");
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await page.keyboard.insertText("A complete new first section.");
  await expect(first).toContainText("A complete new first section.");
  await save(page);
  const after = await (
    await request.get(`/api/documents/${original.id}`)
  ).json();
  expect(sectionText(after.sections[0])).toBe("A complete new first section.");
  expect(sectionText(after.sections[1])).toBe(
    "Second prose remains elsewhere.",
  );
  await editor.press("ControlOrMeta+A");
  await page.evaluate(async () =>
    navigator.clipboard.writeText("Pasted whole card."),
  );
  await editor.press("ControlOrMeta+V");
  await save(page);
  const pasted = await (
    await request.get(`/api/documents/${original.id}`)
  ).json();
  expect(sectionText(pasted.sections[0])).toBe("Pasted whole card.");
  expect(sectionText(pasted.sections[1])).toBe(
    "Second prose remains elsewhere.",
  );
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await page.getByTestId("writing-editor").click();
  await page.evaluate(
    ([firstId, secondId]) => {
      const firstText = document
        .getElementById(firstId)!
        .querySelector("p")!.firstChild!;
      const secondText = document
        .getElementById(secondId)!
        .querySelector("p")!.firstChild!;
      const range = document.createRange();
      range.setStart(firstText, 0);
      range.setEnd(secondText, 6);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    [pasted.sections[0].id, pasted.sections[1].id],
  );
  await page.keyboard.insertText("This must be blocked.");
  await save(page);
  const guarded = await (
    await request.get(`/api/documents/${original.id}`)
  ).json();
  expect(
    guarded.sections.map((section: { content: unknown }) =>
      sectionText(section as any),
    ),
  ).toEqual(
    pasted.sections.map((section: { content: unknown }) =>
      sectionText(section as any),
    ),
  );
});
