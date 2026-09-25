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

async function chooseLayout(page: Page, name: string) {
  await page.locator(".layout-menu summary").click();
  await page
    .getByRole("group", { name: "Layout presets" })
    .getByRole("button", { name, exact: true })
    .click();
}

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
