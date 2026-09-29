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

test("empty parked groups delete deliberately; occupied groups keep every thought", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  await page.goto("/");
  await page.getByRole("button", { name: "+ New parked group" }).click();
  await page.getByLabel("New parked group name").fill("Scratchpad");
  await page.getByRole("button", { name: "Create group" }).click();
  const group = page
    .locator("[data-parked-group-heading]")
    .filter({ hasText: "Scratchpad" });
  const remove = group.getByRole("button", {
    name: "Delete parked group Scratchpad",
  });
  await expect(remove).toHaveAttribute(
    "title",
    "Delete parked group Scratchpad",
  );
  await remove.click();
  const prompt = group.getByRole("alertdialog", {
    name: "Delete parked group",
  });
  await expect(prompt).toContainText("Scratchpad");
  await page.keyboard.press("Escape");
  await expect(group).toBeVisible();
  await remove.click();
  await prompt.getByRole("button", { name: "Delete group" }).click();
  await expect(group).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Deleted group");
  await page.getByRole("button", { name: "+ New parked group" }).click();
  await page.getByLabel("New parked group name").fill("Still needed");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByLabel("Thought destination").selectOption("parked");
  await page.getByLabel("New thought").fill("A parked line worth keeping.");
  await page.getByLabel("New thought").press("Enter");
  const parked = page.locator('.structure-item[data-placement="parked"]');
  await parked.locator(".section-focus").click();
  await parked
    .getByLabel("Group for Freeform")
    .selectOption({ label: "Still needed" });
  await page
    .locator("[data-parked-group-heading]")
    .filter({ hasText: "Still needed" })
    .getByRole("button", { name: "Delete parked group Still needed" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Move its parked thoughts",
  );
  await save(page);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(stored.parkedGroups.map((item: any) => item.name)).toEqual([
    "Still needed",
  ]);
  expect(
    stored.sections.filter((item: any) => item.placement === "parked"),
  ).toHaveLength(1);
});

test("parked thought removal names its owner and session Undo restores group and placement", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  await page.goto("/");
  await page.getByRole("button", { name: "+ New parked group" }).click();
  await page.getByLabel("New parked group name").fill("Asides");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByLabel("Thought destination").selectOption("parked");
  await page.getByLabel("New thought").fill("Keep this detour.");
  await page.getByLabel("New thought").press("Enter");
  const card = page.locator('.structure-item[data-placement="parked"]');
  const id = await card.getAttribute("data-section-id");
  await card.locator(".section-focus").click();
  await card.getByLabel("Group for Freeform").selectOption({ label: "Asides" });
  await card.locator(".section-options > summary").click();
  await card.getByLabel("Label", { exact: true }).fill("Unsent detour");
  await card.getByRole("button", { name: "Remove section" }).click();
  const dialog = page.getByRole("dialog", { name: /Remove parked thought/ });
  await expect(dialog).toContainText("Unsent detour");
  await dialog.getByRole("button", { name: "Delete parked thought" }).click();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveAttribute(
    "data-placement",
    "parked",
  );
  await save(page);
  const restored = (
    await (await request.get(`/api/documents/${doc.id}`)).json()
  ).sections.find((section: any) => section.id === id);
  expect(restored.parkedGroupId).toBeTruthy();
  expect(restored.placement).toBe("parked");
});

test("Place in draft offers After-X choices with stable IDs, beginning and end", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  doc.sections[0].label = "Future tense";
  doc.sections[0].content = newSection("Freeform", "A first section.").content;
  const second = newSection("Point", "Voicemails belong next.");
  second.label = "Twin";
  const third = newSection("Point", "Another twin ending.");
  third.label = "Twin";
  const parked = newSection("Freeform", "A side thought stays unchanged.");
  parked.placement = "parked";
  parked.notes = "Keep this nearby.";
  doc.sections.push(second, third, parked);
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await page.goto("/");
  const card = page.locator(`[data-section-id="${parked.id}"]`);
  const place = async (value: string, expectedIndex: number) => {
    await card.locator(".section-focus").click();
    await card.getByRole("button", { name: "Include in draft" }).click();
    await card.getByLabel("Draft position").selectOption(value);
    await card.getByRole("button", { name: "Include here" }).click();
    await save(page);
    const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
    expect(
      stored.sections.findIndex((item: any) => item.id === parked.id),
    ).toBe(expectedIndex);
    expect(stored.sections[expectedIndex]).toMatchObject({
      id: parked.id,
      notes: "Keep this nearby.",
      placement: "draft",
    });
  };
  await card.locator(".section-focus").click();
  await card.getByRole("button", { name: "Include in draft" }).click();
  const options = await card
    .getByLabel("Draft position")
    .locator("option")
    .allTextContents();
  expect(options).toContain("At beginning of draft");
  expect(options).toContain("After “Future tense” · section 1 Freeform");
  expect(options).toContain("After “Twin” · section 2 Point");
  expect(options).toContain("At end of draft");
  await card.getByLabel("Draft position").selectOption(second.id);
  await card.getByRole("button", { name: "Include here" }).click();
  await save(page);
  expect(
    (await (await request.get(`/api/documents/${doc.id}`)).json()).sections[1]
      .id,
  ).toBe(parked.id);
  await card.getByRole("button", { name: "Park thought" }).click();
  await place(doc.sections[0].id, 0);
  await card.getByRole("button", { name: "Park thought" }).click();
  await place("__end__", 3);
});

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
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.locator(`[data-section-id="${parkedIds[0]}"]`),
  ).toBeHidden();
  await expect(
    page.locator(`[data-section-id="${parkedIds[2]}"]`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand Interface" }).press("Enter");
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
  expect(options).toContain("At beginning of draft");
  expect(options).toContain("After “Threshold” · section 1 Freeform");
  expect(options).toContain(
    "After “I thought someone was waiting.” · section 2 Freeform",
  );
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
      const firstParagraph = document
        .getElementById(firstId)!
        .querySelector("p")!;
      const secondParagraph = document
        .getElementById(secondId)!
        .querySelector("p")!;
      const firstText = document
        .createTreeWalker(firstParagraph, NodeFilter.SHOW_TEXT)
        .nextNode()!;
      const walker = document.createTreeWalker(
        secondParagraph,
        NodeFilter.SHOW_TEXT,
      );
      let secondText: Node | null;
      do secondText = walker.nextNode();
      while (secondText && (secondText.textContent?.length ?? 0) < 6);
      if (!secondText)
        throw new Error("Expected six characters in the next section");
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
