import { test, expect } from "@playwright/test";

const state = (page) => page.evaluate(() => window.vector95.getState());
const doc = async (page) => {
  const s = await state(page);
  return s.documents.find((d) => d.id === s.activeId);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Create Drawing", exact: true })
    .click();
});

test("toolbar sliders leave tool shortcuts and Space panning available", async ({
  page,
}) => {
  await page.locator("#brush-size").click();
  await expect(page.locator("#brush-size")).toBeFocused();
  await page.keyboard.press("y");
  expect((await state(page)).tool).toBe("pencil");

  await page.locator("#smoothing").click();
  await expect(page.locator("#smoothing")).toBeFocused();
  const before = await doc(page);
  await page.keyboard.down("Space");
  expect((await state(page)).space).toBe(true);
  await expect(page.locator(".mdi-window.active .stage")).toHaveAttribute(
    "data-tool",
    "hand",
  );
  const box = await page.locator(".mdi-window.active .stage").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 30,
    box.y + box.height / 2 + 20,
  );
  await page.mouse.up();
  expect((await doc(page)).pan).toEqual({
    x: before.pan.x + 30,
    y: before.pan.y + 20,
  });
  await page.keyboard.up("Space");
  expect((await state(page)).space).toBe(false);
  await expect(page.locator(".mdi-window.active .stage")).toHaveAttribute(
    "data-tool",
    "pencil",
  );
  expect((await doc(page)).layers[0].elements).toHaveLength(0);
});

test("toolbar checkbox permits Space panning without toggling pressure", async ({
  page,
}) => {
  const pressure = page.locator("#pressure");
  await pressure.click();
  await expect(pressure).toBeFocused();
  const checked = await pressure.isChecked();
  await page.keyboard.down("Space");
  expect((await state(page)).space).toBe(true);
  await page.keyboard.up("Space");
  expect(await pressure.isChecked()).toBe(checked);
  expect((await state(page)).pressure).toBe(checked);
  await page.keyboard.press("e");
  expect((await state(page)).tool).toBe("eraser");
});

test("sliders retain native value keys and numeric fields retain editing", async ({
  page,
}) => {
  const slider = page.locator("#brush-size");
  await slider.focus();
  const before = Number(await slider.inputValue());
  await page.keyboard.press("ArrowRight");
  expect(Number(await slider.inputValue())).toBeCloseTo(before + 0.1, 5);
  await page.keyboard.press("Home");
  expect(Number(await slider.inputValue())).toBe(1);

  const entry = page.locator("#size-display");
  await entry.fill("24");
  await entry.press("ArrowUp");
  expect(Number(await entry.inputValue())).toBeCloseTo(24.1, 5);
  await entry.press("e");
  expect((await state(page)).tool).toBe("brush");
  await entry.press("Space");
  expect((await state(page)).space).toBe(false);
  await entry.press("Control+a");
  await entry.press("Backspace");
  await expect(entry).toHaveValue("");
  expect((await state(page)).tool).toBe("brush");
});

test("file-input focus after async Open does not block selection shortcuts", async ({
  page,
}) => {
  await page.locator("#file-input").setInputFiles({
    name: "Shortcut.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect x="10" y="10" width="20" height="20" fill="#25384b"/></svg>',
    ),
  });
  await expect(page.locator(".mdi-window.active .mdi-title-text")).toHaveText(
    "Shortcut.svg",
  );
  await page.locator("#file-input").evaluate((input) => {
    input.hidden = false;
    input.focus();
  });
  await expect(page.locator("#file-input")).toBeFocused();
  await page.keyboard.press("Control+a");
  await expect.poll(async () => (await doc(page)).selected.length).toBe(1);
  await page.keyboard.press("v");
  expect((await state(page)).tool).toBe("select");
});

test("Layer Properties enforces a valid export-ID pattern and keeps dialog typing", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page.locator('.menu-dropdown [data-action="layer-properties"]').click();
  const entry = page.locator("#layer-export-id");
  expect(
    await entry.evaluate((input) =>
      new RegExp(input.pattern, "v").test("Base.part:one-2"),
    ),
  ).toBe(true);
  for (const id of ["9layer", "layer/name", "layer name"]) {
    await entry.fill(id);
    expect(
      await entry.evaluate((input) => input.validity.patternMismatch),
    ).toBe(true);
  }
  await entry.fill("Base.part:one-2");
  expect(await entry.evaluate((input) => input.validity.valid)).toBe(true);
  await page.locator("#layer-name").fill("Brush");
  await page.locator("#layer-name").press("Space");
  expect((await state(page)).space).toBe(false);
  expect((await state(page)).tool).toBe("brush");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  expect((await doc(page)).layers[0].svgId).toBe("Base.part:one-2");
});
