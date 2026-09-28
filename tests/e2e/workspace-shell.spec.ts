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
  emptyWorkbench,
  documentTarget,
  targetFor,
  sectionText,
} from "../../packages/domain/src/index";

async function seed(request: APIRequestContext) {
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("A desk for a long piece", "The opening stays here.");
  for (let i = 2; i <= 11; i++)
    doc.sections.push(
      newSection("Point", `Draft beat ${i} remains in reader order.`),
    );
  const side = newSection(
    "Example",
    "A useful detour belongs to this project.",
  );
  side.placement = "parked";
  side.notes = "Keep this example nearby while shaping the ending.";
  doc.sections.push(side);
  return (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
}

async function save(page: Page) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}

async function chooseLayout(page: Page, name: string) {
  await page.locator(".layout-menu summary").click();
  await page
    .getByRole("group", { name: "Layout presets" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("desktop shell fits viewport while panes scroll independently and narrow panes stack", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const bodyHeight = () =>
    page.evaluate(() => document.documentElement.scrollHeight);
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  const workbench = page.locator('[data-pane="workbench"]');
  const preview = page.locator('[data-pane="preview"]');
  expect(
    await workbench.locator(".structure").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    }),
  ).toBeGreaterThan(0);
  expect(
    await preview.locator(".writing").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    }),
  ).toBeGreaterThan(0);
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  await page.getByRole("button", { name: "Focus preview" }).click();
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  await page.getByRole("button", { name: "Restore panes" }).click();
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  await page.getByRole("button", { name: "Show Inspector" }).click();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  expect((await preview.boundingBox())!.y).toBeGreaterThan(
    (await workbench.boundingBox())!.y,
  );
});

test("selected seventh section restores by identity across reload and deleted selection falls back", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const seventh = doc.sections[6].id;
  await request.post("/api/import", {
    data: { document: newDocument("More recently modified", "Another draft.") },
  });
  await page.goto("/");
  await page.getByLabel("Switch document").selectOption(doc.id);
  await page.locator(`[data-section-id="${seventh}"] .section-focus`).click();
  await save(page);
  await page.reload();
  await expect(page.getByLabel("Switch document")).toHaveValue(doc.id);
  await expect(page.locator(`[data-section-id="${seventh}"]`)).toHaveClass(
    /active/,
  );
  expect(
    (await (await request.get(`/api/documents/${doc.id}`)).json())
      .selectedSectionId,
  ).toBe(seventh);
  await page.locator(`[data-section-id="${seventh}"] .section-focus`).click();
  await page
    .locator(`[data-section-id="${seventh}"] .section-options > summary`)
    .click();
  await page
    .locator(`[data-section-id="${seventh}"]`)
    .getByRole("button", { name: "Remove section" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete section" })
    .click();
  await save(page);
  await page.reload();
  await expect(page.locator(`[data-section-id="${seventh}"]`)).toHaveCount(0);
  const active = page.locator(".structure-item.active");
  await expect(active).toHaveCount(1);
  const selected = await active.getAttribute("data-section-id");
  expect(selected).not.toBe(seventh);
  expect(
    (await (await request.get(`/api/documents/${doc.id}`)).json())
      .selectedSectionId,
  ).toBe(selected);
});

for (const width of [1440, 1024])
  test(`reload, fresh load and document switching orient both panes at ${width}px`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    const id = doc.sections[8].id;
    const other = await (
      await request.post("/api/import", {
        data: { document: newDocument("Other draft", "The other document.") },
      })
    ).json();
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    await page.goto("/");
    await page.getByLabel("Switch document").selectOption(doc.id);
    await page.locator(`[data-section-id="${id}"] .section-focus`).click();
    if (width === 1024) {
      await page.getByRole("button", { name: /Diagnose this/ }).click();
      await expect(page.locator(".diagnosis")).toBeVisible();
    }
    await save(page);
    const workbench = page.locator(".dock-workbench .structure");
    const preview = page.locator(".dock-preview .writing");
    const card = page.locator(`[data-section-id="${id}"]`);
    const passage = page
      .locator(
        `[data-preview-section-id="${id}"], .dock-preview .writing-editor > section[id="${id}"]`,
      )
      .first();
    await workbench.evaluate((pane) => {
      pane.scrollTop = 0;
    });
    await preview.evaluate((pane) => {
      pane.scrollTop = 0;
    });
    if (width === 1024)
      await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
          if (
            document
              .querySelector('[data-testid="save-state"]')
              ?.textContent?.includes("Saved")
          ) {
            observer.disconnect();
            document
              .querySelector<HTMLInputElement>('[aria-label="Document title"]')
              ?.focus();
          }
        });
        observer.observe(document, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      });
    if (width !== 1024)
      await page.route("**/api/documents", async (route) => {
        if (route.request().method() === "GET")
          await new Promise((resolve) => setTimeout(resolve, 180));
        await route.continue();
      });
    await page.reload();
    await expect(page.getByLabel("Switch document")).toHaveValue(doc.id);
    await expect(card).toHaveClass(/active/);
    await expect
      .poll(() =>
        card.evaluate((node, selector) => {
          const pane = document.querySelector(selector)!;
          const a = node.getBoundingClientRect(),
            b = pane.getBoundingClientRect();
          return a.bottom > b.top + 40 && a.top < b.bottom - 40;
        }, ".dock-workbench .structure"),
      )
      .toBe(true);
    await expect
      .poll(() =>
        passage.evaluate((node, selector) => {
          const pane = document.querySelector(selector)!;
          const a = node.getBoundingClientRect(),
            b = pane.getBoundingClientRect();
          return a.bottom > b.top + 40 && a.top < b.bottom - 40;
        }, ".dock-preview .writing"),
      )
      .toBe(true);
    await expect(card).toBeInViewport();
    await expect(passage).toBeInViewport();
    await expect
      .poll(() => workbench.evaluate((pane) => pane.scrollTop))
      .toBeGreaterThan(0);
    await expect
      .poll(() => preview.evaluate((pane) => pane.scrollTop))
      .toBeGreaterThan(0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(card).toBeInViewport();
    await expect(passage).toBeInViewport();
    await expect(page.getByTestId("writing-editor")).not.toBeFocused();
    if (width === 1024) {
      await page.setViewportSize({ width: 1040, height: 810 });
      await workbench.evaluate((pane) =>
        pane.scrollTo({ top: 0, behavior: "instant" }),
      );
      await preview.evaluate((pane) =>
        pane.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(card).toBeInViewport();
      await expect(passage).toBeInViewport();
      await expect
        .poll(() => workbench.evaluate((pane) => pane.scrollTop))
        .toBeGreaterThan(0);
      await expect
        .poll(() => preview.evaluate((pane) => pane.scrollTop))
        .toBeGreaterThan(0);
    }
    await workbench.hover();
    await page.mouse.wheel(0, -3000);
    await preview.hover();
    await page.mouse.wheel(0, -3000);
    await workbench.evaluate((pane) => {
      pane.scrollTo({ top: 0, behavior: "instant" });
    });
    await preview.evaluate((pane) => {
      pane.scrollTo({ top: 0, behavior: "instant" });
    });
    await expect
      .poll(() => workbench.evaluate((pane) => pane.scrollTop))
      .toBeLessThan(6);
    await expect
      .poll(() => preview.evaluate((pane) => pane.scrollTop))
      .toBeLessThan(6);
    if (width === 1024) {
      await page.setViewportSize({ width: 1040, height: 810 });
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(await workbench.evaluate((pane) => pane.scrollTop)).toBeLessThan(
        6,
      );
      expect(await preview.evaluate((pane) => pane.scrollTop)).toBeLessThan(6);
    }
    await page.getByLabel("Switch document").selectOption(other.id);
    await expect(page.locator(`[data-section-id="${id}"]`)).toHaveCount(0);
    await expect(
      page.locator(`[data-section-id="${other.sections[0].id}"]`),
    ).toBeInViewport();
    await expect(
      page.locator(
        `.dock-preview .writing-editor > section[id="${other.sections[0].id}"]`,
      ),
    ).toBeInViewport();
    await page.getByLabel("Switch document").selectOption(doc.id);
    await expect
      .poll(() =>
        card.evaluate((node, selector) => {
          const a = node.getBoundingClientRect(),
            b = document.querySelector(selector)!.getBoundingClientRect();
          return a.bottom > b.top + 40 && a.top < b.bottom - 40;
        }, ".dock-workbench .structure"),
      )
      .toBe(true);
    await expect
      .poll(() =>
        passage.evaluate((node, selector) => {
          const a = node.getBoundingClientRect(),
            b = document.querySelector(selector)!.getBoundingClientRect();
          return a.bottom > b.top + 40 && a.top < b.bottom - 40;
        }, ".dock-preview .writing"),
      )
      .toBe(true);
    const fresh = await page.context().newPage();
    await fresh.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    await fresh.goto("/");
    await expect(fresh.getByLabel("Switch document")).toHaveValue(doc.id);
    await expect
      .poll(() =>
        fresh.locator(`[data-section-id="${id}"]`).evaluate((node) => {
          const a = node.getBoundingClientRect(),
            b = node.closest(".structure")!.getBoundingClientRect();
          return a.bottom > b.top + 40 && a.top < b.bottom - 40;
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        fresh
          .locator(
            `[data-preview-section-id="${id}"], .dock-preview .writing-editor > section[id="${id}"]`,
          )
          .first()
          .evaluate((node) => {
            const a = node.getBoundingClientRect(),
              b = node.closest(".writing")!.getBoundingClientRect();
            return a.bottom > b.top + 40 && a.top < b.bottom - 40;
          }),
      )
      .toBe(true);
    await expect(fresh.locator(`[data-section-id="${id}"]`)).toBeInViewport();
    await expect(
      fresh
        .locator(
          `[data-preview-section-id="${id}"], .dock-preview .writing-editor > section[id="${id}"]`,
        )
        .first(),
    ).toBeInViewport();
    await expect(fresh.getByTestId("writing-editor")).not.toBeFocused();
    await fresh.close();
  });

test("a new Preview section and manual scroll supersede a pending 1024px orientation", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const previous = doc.sections[8].id,
    next = doc.sections[5].id;
  const other = await (
    await request.post("/api/import", {
      data: { document: newDocument("Another place", "Other prose.") },
    })
  ).json();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByLabel("Switch document").selectOption(doc.id);
  await page.locator(`[data-section-id="${previous}"] .section-focus`).click();
  await save(page);
  await page.reload();
  await expect(page.locator(`[data-section-id="${previous}"]`)).toHaveClass(
    /active/,
  );
  await page.setViewportSize({ width: 1040, height: 810 });
  await page.setViewportSize({ width: 1024, height: 768 });
  const passage = page.locator(
    `.dock-preview .writing-editor > section[id="${next}"]`,
  );
  await passage.click();
  await expect(page.locator(`[data-section-id="${next}"]`)).toHaveClass(
    /active/,
  );
  const preview = page.locator(".dock-preview .writing");
  await preview.hover();
  await page.mouse.wheel(0, 160);
  await expect(passage).toBeInViewport();
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(passage).toBeInViewport();
  await expect(
    page.locator(`[data-section-id="${next}"] .card-essential`),
  ).toBeVisible();
  await page.getByLabel("Switch document").selectOption(other.id);
  await expect(page.locator(`[data-section-id="${previous}"]`)).toHaveCount(0);
  await expect(
    page.locator(`[data-section-id="${other.sections[0].id}"]`),
  ).toBeInViewport();
});

test("direct prose focus cancels stale reload orientation before responsive resize", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const id = doc.sections[8].id;
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await save(page);
  await page.reload();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveClass(/active/);
  await page.setViewportSize({ width: 1040, height: 810 });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByTestId("writing-editor").focus();
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  const workbench = page.locator(".dock-workbench .structure"),
    preview = page.locator(".dock-preview .writing");
  await workbench.evaluate((pane) =>
    pane.scrollTo({ top: 0, behavior: "instant" }),
  );
  await preview.evaluate((pane) =>
    pane.scrollTo({ top: 0, behavior: "instant" }),
  );
  await page.setViewportSize({ width: 1040, height: 810 });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await workbench.evaluate((pane) => pane.scrollTop)).toBeLessThan(6);
  expect(await preview.evaluate((pane) => pane.scrollTop)).toBeLessThan(6);
});

test("700px reload restores section identity without locking stacked pane scroll", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const id = doc.sections[7].id;
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/");
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await page.reload();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveClass(/active/);
  await expect(page.locator(`[data-section-id="${id}"]`)).toBeInViewport();
  await expect(
    page
      .locator(
        `[data-preview-section-id="${id}"], .dock-preview .writing-editor > section[id="${id}"]`,
      )
      .first(),
  ).toHaveCount(1);
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
});

test("stacked Saved takes returns to the originating card without losing its place", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const target = doc.sections[7];
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const card = page.locator(`[data-section-id="${target.id}"]`);
  await card.locator(".section-focus").click();
  await card.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Before cut");
  await page.getByRole("button", { name: "Save this take" }).click();
  await card.getByRole("button", { name: "1 take" }).click();
  await expect(page.locator(".variants")).toHaveAttribute("open", "");
  const labScroll = await page.evaluate(() => window.scrollY);
  await expect(
    page.getByRole("button", { name: "Return to section" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to section" }).click();
  await expect(card).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeLessThan(labScroll - 200);
  await expect(card).toHaveClass(/active/);
  await expect(page.getByLabel("Switch document")).toHaveValue(doc.id);
});

test("parked cards do not claim reader numbering until included", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const parked = doc.sections.at(-1)!;
  await page.goto("/");
  const card = page.locator(`[data-section-id="${parked.id}"]`);
  await expect(card.locator(".section-number")).toHaveText("P");
  await card.locator(".section-focus").click();
  await card.getByRole("button", { name: "Include in draft" }).click();
  await page.getByLabel("Draft position").selectOption("__end__");
  await page.getByRole("button", { name: "Include here" }).click();
  await expect(card.locator(".section-number")).toHaveText("12");
  await save(page);
  expect(
    (
      await (await request.get(`/api/documents/${doc.id}`)).json()
    ).sections.find((item: any) => item.id === parked.id).placement,
  ).toBe("draft");
});

test("dock resizing, pane visibility, presets and reload preserve one document", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const workbench = page.locator('[data-pane="workbench"]');
  const preview = page.locator('[data-pane="preview"]');
  const inspector = page.locator('[data-pane="inspector"]');
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  const startWidth = (await workbench.boundingBox())!.width;
  const divider = page.getByRole("separator", {
    name: "Resize Workbench and Preview",
  });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + 100, { steps: 8 });
  await page.mouse.up();
  expect((await workbench.boundingBox())!.width).toBeGreaterThan(
    startWidth + 70,
  );
  const rightDivider = page.getByRole("separator", {
    name: "Resize Preview and Inspector",
  });
  const rightBox = (await rightDivider.boundingBox())!;
  const previewBefore = (await preview.boundingBox())!.width;
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(
    rightBox.x + rightBox.width / 2 - 35,
    rightBox.y + 100,
    { steps: 5 },
  );
  await page.mouse.up();
  expect((await preview.boundingBox())!.width).toBeLessThan(previewBefore);
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await expect(inspector).toBeHidden();
  const savedWidths = (await (await request.get("/api/settings")).json()).layout
    .paneWidths;
  await page.reload();
  await expect(inspector).toBeHidden();
  expect((await workbench.boundingBox())!.width).toBeGreaterThan(
    startWidth + 70,
  );
  expect(
    (await (await request.get("/api/settings")).json()).layout.paneWidths,
  ).toEqual(savedWidths);
  await chooseLayout(page, "Review");
  await expect(inspector).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await preview.boundingBox())!.width).toBeGreaterThan(
    (await workbench.boundingBox())!.width,
  );
  await chooseLayout(page, "Writing");
  await expect(inspector).toBeHidden();
  expect((await workbench.boundingBox())!.width).toBeGreaterThan(
    (await preview.boundingBox())!.width * 1.5,
  );
  await chooseLayout(page, "Workbench only");
  await expect(workbench).toBeVisible();
  await expect(preview).toBeHidden();
  await expect(inspector).toBeHidden();
  await chooseLayout(page, "All panes");
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  await page
    .getByLabel("New thought")
    .fill("An unfinished capture stays here.");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Keep this sentence spare.");
  const keyboardDivider = page.getByRole("separator", {
    name: "Resize Workbench and Preview",
  });
  const beforeKey = Number(await keyboardDivider.getAttribute("aria-valuenow"));
  await keyboardDivider.focus();
  await keyboardDivider.press("ArrowRight");
  expect(
    Number(await keyboardDivider.getAttribute("aria-valuenow")),
  ).toBeGreaterThan(beforeKey);
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await expect(inspector).toBeHidden();
  await page.getByRole("button", { name: "Show Inspector" }).click();
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Keep this sentence spare.",
  );
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(workbench).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(preview).toBeHidden();
  await page.getByRole("button", { name: "Show preview" }).click();
  await page.getByRole("button", { name: "Hide Workbench" }).click();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(workbench).toBeHidden();
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(preview).toBeHidden();
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Show Workbench" }).click();
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(page.getByLabel("New thought")).toHaveValue(
    "An unfinished capture stays here.",
  );
  await expect(page.getByTestId("writing-editor")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await page.getByRole("button", { name: "Hide Workbench" }).click();
  await expect(preview).toBeVisible();
  await expect(workbench).toBeHidden();
  await expect(inspector).toBeHidden();
  await chooseLayout(page, "Reset layout");
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const afterLayout = await (
    await request.get(`/api/documents/${doc.id}`)
  ).json();
  expect(afterLayout.sections[0].workbench.instruction).toBe(
    "Keep this sentence spare.",
  );
  expect(
    afterLayout.sections.map(
      ({ workbench, ...section }: { workbench?: unknown }) => section,
    ),
  ).toEqual(
    doc.sections.map(
      ({ workbench, ...section }: { workbench?: unknown }) => section,
    ),
  );
});

test("Preview focus temporarily expands and restores the exact saved pane arrangement", async ({
  page,
  request,
}) => {
  await seed(request);
  const settings = await (await request.get("/api/settings")).json();
  settings.layout = {
    paneWidths: { workbench: 55, preview: 30, inspector: 15 },
  };
  await request.put("/api/settings", { data: settings });
  await page.goto("/");
  const workbench = page.locator('[data-pane="workbench"]');
  const preview = page.locator('[data-pane="preview"]');
  const inspector = page.locator('[data-pane="inspector"]');
  await expect(workbench).toBeVisible();
  const before = (await preview.boundingBox())!.width;
  await page.getByRole("button", { name: "Focus preview" }).click();
  await expect(page.getByTestId("preview-reading-state")).toHaveCount(0);
  await expect(workbench).toBeHidden();
  await expect(inspector).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Hide Workbench" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hide Inspector" }),
  ).toHaveCount(0);
  expect((await preview.boundingBox())!.width).toBeGreaterThan(before * 2);
  await page.getByRole("button", { name: "Restore panes" }).click();
  await expect(workbench).toBeVisible();
  await expect(inspector).toBeVisible();
  expect((await preview.boundingBox())!.width).toBeCloseTo(before, 0);
  expect(
    (await (await request.get("/api/settings")).json()).layout.paneWidths,
  ).toEqual(settings.layout.paneWidths);
});

test("Focus Preview restore brings the selected seventh section back to a readable preview position", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const id = doc.sections[6].id;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  const workbench = page.locator(".dock-workbench .structure");
  const preview = page.locator(".dock-preview .writing");
  await workbench.evaluate((pane) => {
    pane.scrollTop = 0;
  });
  await preview.evaluate((pane) => {
    pane.scrollTop = 0;
  });
  await page.getByRole("button", { name: "Focus preview" }).click();
  await page.getByRole("button", { name: "Restore panes" }).click();
  const section = page.locator(
    `.dock-preview .writing-editor > section[id="${id}"]`,
  );
  await expect
    .poll(() =>
      section.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const pane = element.closest(".writing")!.getBoundingClientRect();
        return (
          rect.top >= pane.top + 15 && rect.top < pane.top + pane.height * 0.65
        );
      }),
    )
    .toBe(true);
  const card = page.locator(`[data-section-id="${id}"]`);
  await expect(card).toHaveClass(/active/);
  await expect
    .poll(() =>
      card.evaluate((node) => {
        const a = node.getBoundingClientRect(),
          b = node.closest(".structure")!.getBoundingClientRect();
        return a.bottom > b.top + 40 && a.top < b.bottom - 40;
      }),
    )
    .toBe(true);
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
});

test("narrow Focus Preview restore keeps the selected section readable", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const id = doc.sections[6].id;
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/");
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await page.getByRole("button", { name: "Focus preview" }).click();
  await page.getByRole("button", { name: "Restore panes" }).click();
  const section = page.locator(
    `.dock-preview .writing-editor > section[id="${id}"]`,
  );
  await expect(section).toBeInViewport();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveClass(/active/);
});

test("parked-card editing visibly marks Preview as reading and returning to draft restores direct editing", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.sections[5].content = newSection(
    "Point",
    "A longer reading passage. ".repeat(180),
  ).content;
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await page.goto("/");
  const parked = page.locator('.structure-item[data-placement="parked"]');
  await parked.locator(".section-focus").click();
  await parked.getByTestId("card-writing").getByRole("button").click();
  await page.keyboard.insertText("Aside: ");
  await expect(page.locator(".dock-preview .assembled-readout")).toBeVisible();
  await expect(page.getByTestId("preview-reading-state")).toContainText(
    "Reading preview",
  );
  await expect(page.getByTestId("preview-reading-state")).toContainText(
    "Example · Section 12",
  );
  await expect(page.getByTestId("preview-reading-state")).toContainText(
    "parked thought",
  );
  const previewPane = page.locator(".dock-preview .writing");
  await previewPane.evaluate((pane) => {
    pane.scrollTop = pane.scrollHeight * 0.8;
  });
  expect(await previewPane.evaluate((pane) => pane.scrollTop)).toBeGreaterThan(
    300,
  );
  await expect
    .poll(() =>
      page.getByTestId("preview-reading-state").evaluate((node) => {
        const a = node.getBoundingClientRect(),
          b = node.closest(".writing")!.getBoundingClientRect();
        return (
          a.top >= b.top &&
          a.bottom <= b.bottom &&
          a.top >= 0 &&
          a.bottom <= innerHeight
        );
      }),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Edit draft in preview" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Edit draft in preview" }).click();
  await expect(page.locator(".dock-preview .writing-editor")).toBeVisible();
  await expect(page.getByTestId("preview-reading-state")).toHaveCount(0);
  await parked.locator(".section-focus").click();
  await parked.getByTestId("card-writing").getByRole("button").click();
  await expect(page.getByTestId("preview-reading-state")).toBeVisible();
  const draft = page.locator(`[data-section-id="${doc.sections[7].id}"]`);
  await draft.locator(".section-focus").click();
  await expect(page.locator(".dock-preview .writing-editor")).toBeVisible();
  await expect(page.getByTestId("preview-reading-state")).toHaveCount(0);
  await page
    .locator(
      `.dock-preview .writing-editor > section[id="${doc.sections[7].id}"]`,
    )
    .click();
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  await page.keyboard.insertText("! ");
  await expect(page.getByTestId("writing-editor")).toContainText("! ");
  await expect(parked).toContainText("Aside:");
  await expect(parked).toContainText("A useful detour belongs");
});

test("draft card reading preview explains its mode and offers direct edit", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  const card = page.locator(`[data-section-id="${doc.sections[7].id}"]`);
  await card.locator(".section-focus").click();
  await card.getByTestId("card-writing").getByRole("button").click();
  await expect(page.getByTestId("preview-reading-state")).toContainText(
    "Reading preview · Editing “Point · Section 8” in Workbench.",
  );
  await expect(page.locator(".dock-preview .assembled-readout")).toBeVisible();
  await page
    .getByRole("button", { name: "Edit this section in preview" })
    .click();
  await expect(page.locator(".dock-preview .writing-editor")).toBeVisible();
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  await expect(page.getByTestId("preview-reading-state")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Save take" })).toBeVisible();
});

for (const width of [1440, 1024])
  test(`Preview section changes reveal Workbench controls at ${width}px without pane locking`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    if (width === 1024) {
      doc.sections[8].content = newSection(
        "Point",
        "The ending carries a longer thought through this section. ".repeat(12),
      ).content;
      await request.put(`/api/documents/${doc.id}`, { data: doc });
    }
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/");
    const pane = page.locator(".dock-workbench .structure");
    await pane.evaluate((node) => {
      node.scrollTop = 0;
    });
    const preview = page.locator(".dock-preview .writing-editor");
    const seventh = doc.sections[6].id,
      ninth = doc.sections[8].id;
    await preview.locator(`section[id="${seventh}"]`).click();
    await expect(page.locator(`[data-section-id="${seventh}"]`)).toHaveClass(
      /active/,
    );
    await expect
      .poll(() =>
        page.locator(`[data-section-id="${seventh}"]`).evaluate((node) => {
          const a = node.getBoundingClientRect(),
            b = node.closest(".structure")!.getBoundingClientRect();
          return a.bottom > b.top + 50 && a.top < b.bottom - 50;
        }),
      )
      .toBe(true);
    const usableControls = (id: string) =>
      page
        .locator(`[data-section-id="${id}"] .card-essential`)
        .evaluate((row) => {
          const pane = row.closest(".structure")!,
            bounds = pane.getBoundingClientRect(),
            action = row.getBoundingClientRect();
          const header = pane
            .querySelector(".area-jump")
            ?.getBoundingClientRect();
          const lab = document
            .querySelector(".dock-inspector")
            ?.getBoundingClientRect();
          const blocked =
            lab &&
            lab.left < bounds.right &&
            lab.right > bounds.left &&
            lab.top < bounds.bottom &&
            lab.bottom > bounds.top;
          const bottom = Math.min(
            bounds.bottom,
            innerHeight,
            blocked ? lab!.top : bounds.bottom,
          );
          return (
            action.top >=
              Math.max(bounds.top, header?.bottom ?? bounds.top) + 4 &&
            action.bottom <= bottom - 8
          );
        });
    await expect.poll(() => usableControls(seventh)).toBe(true);
    await expect
      .poll(async () => {
        const first = await pane.evaluate((node) => node.scrollTop);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return Math.abs(
          (await pane.evaluate((node) => node.scrollTop)) - first,
        );
      })
      .toBeLessThan(1);
    const firstScroll = await pane.evaluate((node) => node.scrollTop);
    await page.keyboard.insertText("! ");
    await expect
      .poll(() => pane.evaluate((node) => node.scrollTop))
      .toBeCloseTo(firstScroll, 0);
    await expect(page.getByTestId("writing-editor")).toBeFocused();
    await preview.locator(`section[id="${ninth}"]`).click();
    await expect(page.locator(`[data-section-id="${ninth}"]`)).toHaveClass(
      /active/,
    );
    await expect
      .poll(() =>
        page.locator(`[data-section-id="${ninth}"]`).evaluate((node) => {
          const a = node.getBoundingClientRect(),
            b = node.closest(".structure")!.getBoundingClientRect();
          return a.bottom > b.top + 50 && a.top < b.bottom - 50;
        }),
      )
      .toBe(true);
    await expect(
      page
        .locator(`[data-section-id="${ninth}"]`)
        .getByRole("button", { name: "Save take" }),
    ).toBeVisible();
    await expect.poll(() => usableControls(ninth)).toBe(true);
  });

test("stacked Preview section changes retain the reading position without pane locking", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/");
  const id = doc.sections[7].id;
  const preview = page.locator(
    `.dock-preview .writing-editor > section[id="${id}"]`,
  );
  await preview.click();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveClass(/active/);
  await expect(preview).toBeInViewport();
  const pagePosition = await page.evaluate(() => window.scrollY);
  await page.keyboard.insertText("! ");
  await expect(preview).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(pagePosition, 0);
});

test("parked navigation, editing, reinclusion and narrow writing keep the single editor", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const pageScroll = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "Parked · 1" }).click();
  const parkedHeading = page.getByTestId("parked-area");
  const structure = page.getByRole("navigation", {
    name: "Document structure",
  });
  await expect
    .poll(() =>
      parkedHeading.evaluate((element, root) => {
        const a = element.getBoundingClientRect();
        const b = document.querySelector(root)!.getBoundingClientRect();
        return a.top >= b.top + 50 && a.top < b.bottom;
      }, ".structure"),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  await page.getByRole("button", { name: "Draft · 11" }).click();
  await expect(structure.locator(".section-group-label")).toBeInViewport();
  await page.getByRole("button", { name: "Parked · 1" }).click();
  const parked = page.locator('.structure-item[data-placement="parked"]');
  await parked.locator(".section-focus").click();
  await parked.getByTestId("card-writing").getByRole("button").press("Enter");
  await page.keyboard.insertText("Maybe later: ");
  await expect(parked).toContainText("Maybe later: A useful detour");
  await parked.getByRole("button", { name: "Include in draft" }).click();
  await parked.getByLabel("Draft position").selectOption(doc.sections[10].id);
  await parked.getByRole("button", { name: "Include here" }).click();
  await expect(page.getByRole("button", { name: "Parked · 0" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Maybe later: A useful detour",
  );
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await page.setViewportSize({ width: 850, height: 850 });
  const boxWorkbench = (await page
    .locator('[data-pane="workbench"]')
    .boundingBox())!;
  const boxPreview = (await page
    .locator('[data-pane="preview"]')
    .boundingBox())!;
  const boxInspector = (await page
    .locator('[data-pane="inspector"]')
    .boundingBox())!;
  expect(boxPreview.y).toBeGreaterThanOrEqual(
    boxWorkbench.y + boxWorkbench.height - 2,
  );
  expect(boxInspector.y).toBeGreaterThanOrEqual(
    boxPreview.y + boxPreview.height - 2,
  );
  await page.getByRole("button", { name: "Hide preview" }).click();
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.locator('[data-pane="preview"]')).toBeVisible();
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Document structure" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await structure.evaluate((element) => getComputedStyle(element).position),
  ).not.toBe("fixed");
  await page
    .getByLabel("New thought")
    .fill("A fresh line from a native input.");
  await page.getByLabel("New thought").press("Enter");
  await expect(page.getByRole("button", { name: "Draft · 13" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show preview" }),
  ).toBeVisible();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "A desk for a long piece",
  );
});

test("seven-section revision loop keeps reading, parked and Lab context without extra requests", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument(
    "Revision continuity",
    "An opening on the doorstep. We listened for a while.",
  );
  for (let i = 1; i < 7; i++)
    doc.sections.push(
      newSection(
        "Freeform",
        i === 1
          ? "We decide later. The kettle ticks while we wait."
          : `Draft thought ${i + 1} changes the angle. A second line holds the thread.`,
      ),
    );
  doc.sections[6].label = "Last door";
  doc.sections[6].content = newSection(
    "Freeform",
    "A repeated sentence. Keep this ending.",
  ).content;
  for (const text of [
    "An aside for later with more room to think.",
    "Another question stays outside the draft.",
  ]) {
    const parked = newSection("Freeform", text);
    parked.placement = "parked";
    doc.sections.push(parked);
  }
  const phrase = "decide later";
  const offset = sectionText(doc.sections[1]).indexOf(phrase);
  const localTarget = targetFor(
    doc,
    doc.sections[1].id,
    "selection",
    offset,
    offset + phrase.length,
  );
  const localId = "local-question";
  doc.sections[1].workbench = {
    ...emptyWorkbench(),
    activeRunId: localId,
    runs: [
      {
        id: localId,
        createdAt: doc.createdAt,
        target: localTarget,
        action: "coach",
        instruction: "Why the delay?",
        answer: "",
        controls: {},
        model: { providerId: "mock", modelId: "conservative" },
        response: {
          provider: "mock",
          diagnosis: "The phrase delays the choice.",
          mechanism: "It lets the pause do work.",
          question: "What are they waiting for?",
          missingIngredients: [],
          proposals: [],
          findings: [],
          lexical: [],
        },
      },
    ],
  };
  const critiqueId = "whole-critique";
  doc.workbench = {
    ...emptyWorkbench(),
    activeRunId: critiqueId,
    runs: [
      {
        id: critiqueId,
        createdAt: doc.createdAt,
        target: documentTarget(doc),
        action: "critique",
        instruction: "Where does repetition hurt?",
        answer: "",
        controls: {},
        model: { providerId: "mock", modelId: "conservative" },
        response: {
          provider: "mock",
          diagnosis: "The last door repeats the earlier delay.",
          mechanism: "Read the transitions together.",
          question: "Which recurrence earns its place?",
          missingIngredients: [],
          proposals: [],
          lexical: [],
          findings: [
            {
              sectionId: doc.sections[6].id,
              title: "Section 7 repeats the explanation.",
              detail: "Cut only the repeated line.",
              severity: "consider",
            },
          ],
        },
      },
    ],
  };
  doc.focusTarget = localTarget;
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const ids: string[] = imported.sections.map((s: { id: string }) => s.id);
  let modelCalls = 0;
  await page.route("**/api/ai", (route) => {
    modelCalls++;
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Revision continuity",
  );
  await page.getByLabel("New thought").fill("A new thought belongs here.");
  await page.getByLabel("New thought").press("Enter");
  await expect(page.getByRole("button", { name: "Draft · 8" })).toBeVisible();
  await page.locator(`[data-section-id="${ids[1]}"] .section-focus`).click();
  await expect(page.locator(".response-original")).toContainText(phrase);
  await page.getByRole("button", { name: "Return to selection" }).click();
  await expect(page.locator(`[data-section-id="${ids[1]}"]`)).toHaveClass(
    /active/,
  );
  await expect(page.locator(`[id="${ids[1]}"] .target-highlight`)).toHaveCount(
    1,
  );
  const inspectorScroll = await page
    .locator(".inspector")
    .evaluate((node) => node.scrollTop);
  await page.getByRole("button", { name: "Focus preview" }).click();
  await expect(page.locator(".app")).toHaveClass(/preview-reading/);
  await expect(page.locator(`[id="${ids[1]}"] .target-highlight`)).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator('[data-pane="inspector"]')).toBeHidden();
  await page.getByRole("button", { name: "Restore panes" }).click();
  await expect(page.locator(".app")).not.toHaveClass(/preview-reading/);
  await expect(page.locator('[data-pane="inspector"]')).toBeVisible();
  await expect
    .poll(() => page.locator(".inspector").evaluate((node) => node.scrollTop))
    .toBe(inspectorScroll);
  await expect(page.locator(".response-original")).toContainText(phrase);
  await save(page);
  expect(
    (await (await request.get(`/api/documents/${imported.id}`)).json())
      .revisionTrail,
  ).toEqual([]);
  await page.locator(`[id="${ids[1]}"] p`).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Another hesitation.");
  await save(page);
  const localEdit = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(localEdit.revisionTrail).toHaveLength(1);
  expect(localEdit.revisionTrail[0]).toMatchObject({
    runId: localEdit.sections[1].workbench.runs[0].id,
    sectionId: ids[1],
    findingIndex: null,
    savedRevision: localEdit.revision,
  });
  await page.locator(`[data-section-id="${ids[5]}"] .section-focus`).click();
  await expect(page.locator(`[id="${ids[5]}"]`)).toBeVisible();
  await expect
    .poll(() =>
      page.locator(`[id="${ids[5]}"]`).evaluate((element) => {
        const pane = element.closest(".writing")!;
        const ratio =
          (element.getBoundingClientRect().top -
            pane.getBoundingClientRect().top) /
          pane.clientHeight;
        return (
          ratio < 0.55 ||
          pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2
        );
      }),
    )
    .toBe(true);
  await page.locator(`[data-section-id="${ids[8]}"] .section-focus`).click();
  await expect(page.getByTestId("lab-return")).toContainText(
    "Return to question",
  );
  await page
    .getByRole("button", { name: "Read parked thought in Preview" })
    .click();
  await expect(page.locator(`[id="${ids[8]}"]`)).toBeVisible();
  await expect(page.locator('[data-pane="preview"]')).toBeVisible();
  await expect(page.locator('[data-pane="workbench"]')).toBeHidden();
  await page.locator(`[id="${ids[8]}"] p`).click();
  await page.keyboard.insertText("Still thinking: ");
  await expect(page.locator(`[id="${ids[8]}"]`)).toContainText(
    "Still thinking:",
  );
  await page.getByRole("button", { name: "Return to draft" }).click();
  await expect(page.locator(`[data-section-id="${ids[5]}"]`)).toHaveClass(
    /active/,
  );
  await expect(page.locator('[data-pane="workbench"]')).toBeVisible();
  await page.getByTestId("lab-return").getByRole("button").click();
  await expect(page.locator(".response-original")).toContainText(phrase);
  await page.getByRole("button", { name: /Review saved critique/ }).click();
  await page
    .locator(".finding-references .button")
    .filter({ hasText: "Last door" })
    .click();
  await page.getByTestId("writing-editor").evaluate((root) => {
    const p = root.querySelector(
      `[id="${root.querySelectorAll("section")[6].id}"] p`,
    )!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode()!;
    let last = first;
    let remaining = "A repeated sentence.".length;
    while (remaining > last.textContent!.length) {
      remaining -= last.textContent!.length;
      last = walker.nextNode()!;
    }
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(first, 0, last, remaining);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("finding-return")).toContainText(
    "Based on an earlier draft",
  );
  await save(page);
  const after = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(after.revisionTrail).toHaveLength(2);
  expect(after.revisionTrail[1]).toMatchObject({
    runId: after.workbench.runs[0].id,
    sectionId: ids[6],
    findingIndex: 0,
    savedRevision: after.revision,
  });
  await page.locator(".revision-trail > summary").click();
  await expect(page.locator(".revision-trail")).toContainText(
    "Viewed before edit",
  );
  await page.getByRole("button", { name: /Return to finding/ }).click();
  await expect(page.getByTestId("analysis-state")).toHaveText(
    "Based on an earlier draft",
  );
  expect(modelCalls).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: /Review saved critique/ }).click();
  await expect(page.getByTestId("analysis-state")).toHaveText(
    "Based on an earlier draft",
  );
  const saved = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(
    sectionText(saved.sections.find((s: { id: string }) => s.id === ids[8])),
  ).toContain("Still thinking:");
  expect(modelCalls).toBe(0);
});
