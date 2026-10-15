import { test, expect } from "@playwright/test";
const state = (page) => page.evaluate(() => window.vector95.getState());
const doc = async (page) => {
  const s = await state(page);
  return s.documents.find((d) => d.id === s.activeId);
};
const idle = (page) =>
  expect
    .poll(() => page.evaluate(() => window.vector95.getPendingPaintCount()))
    .toBe(0);
async function point(page, x, y) {
  const d = await doc(page),
    b = await page.locator(".mdi-window.active .stage").boundingBox();
  return {
    x: b.x + b.width / 2 + (x - d.width / 2) * d.zoom + d.pan.x,
    y: b.y + b.height / 2 + (y - d.height / 2) * d.zoom + d.pan.y,
  };
}
async function artwork(
  page,
  art = '<rect x="40" y="40" width="64" height="32" fill="#000000"/>',
) {
  await page.locator("#file-input").setInputFiles({
    name: "Feedback.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${art}</svg>`,
    ),
  });
  await expect.poll(async () => (await doc(page)).name).toBe("Feedback.svg");
  await page.keyboard.press("v");
  const p = await point(page, 72, 56);
  await page.mouse.click(p.x, p.y);
  await idle(page);
}
async function helpSearch(page, query) {
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search menu commands" });
  await expect(search).toBeFocused();
  await search.fill(query);
  return search;
}
const readout = (page) => page.locator(".mdi-window.active .transform-readout");
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Help searches actual commands, preserves text editing, and Enter runs a result", async ({
  page,
}) => {
  await page.locator(".mdi-window.active .stage").focus();
  const before = (await doc(page)).layers;
  const search = await helpSearch(page, "grid");
  await expect(page.locator('[data-search-action="grid"] kbd')).toHaveText(
    "Ctrl+'",
  );
  await search.press("Control+a");
  await search.press("Backspace");
  await search.pressSequentially("grid");
  expect((await doc(page)).layers).toEqual(before);
  await search.press("Enter");
  expect((await state(page)).grid).toBe(true);
  await expect(search).toBeHidden();
  await expect(page.locator(".mdi-window.active .stage")).toBeFocused();
  const again = await helpSearch(page, "no such menu command");
  await expect(page.locator(".command-search-message")).toHaveText(
    "No matching commands.",
  );
  await again.press("Enter");
  await expect(again).toBeVisible();
  await again.press("Escape");
  await expect(page.locator(".mdi-window.active .stage")).toBeFocused();
});

test("search reveals nested menu locations without executing, and reports unavailable commands", async ({
  page,
}) => {
  const before = await doc(page);
  await helpSearch(page, "horizontal axis");
  await page.locator('[data-search-reveal="symmetry:y"]').click();
  await expect(page.locator('#menus [data-action="symmetry:y"]')).toBeVisible();
  await expect(page.locator('#menus [data-action="symmetry:y"]')).toHaveClass(
    /search-revealed/,
  );
  expect((await doc(page)).drawingModes).toEqual(before.drawingModes);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await helpSearch(page, "paste");
  await expect(page.locator('[data-search-action="paste"]')).toBeDisabled();
  await expect(page.locator(".command-search-results")).toContainText(
    "Unavailable",
  );
  await page.locator('[data-search-reveal="paste"]').click();
  await expect(page.locator('#menus [data-action="paste"]')).toBeVisible();
  await expect(page.locator('#menus [data-action="paste"]')).toBeDisabled();
  expect((await doc(page)).layers).toEqual(before.layers);
});

test("search reflects remapped shortcuts, supports keyboard results, and fits a small window", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator('[data-action="preferences"]').click();
  await page.locator('[data-binding="preview"]').fill("F8");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.setViewportSize({ width: 800, height: 600 });
  const search = await helpSearch(page, "preview");
  await expect(page.locator('[data-search-action="preview"] kbd')).toHaveText(
    "F8",
  );
  const box = await search
    .locator("xpath=ancestor::div[contains(@class, 'menu-dropdown')]")
    .boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(800);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
  await page.screenshot({ path: "artifacts/search-transform/help-search.png" });
  await search.press("ArrowDown");
  await expect(page.locator('[data-search-action="preview"]')).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
  await search.press("Enter");
  await expect(page.locator("#artwork-preview")).toBeVisible();
});

test("moving shows original outlines, actual deltas and the constrained axis, then cancels cleanly", async ({
  page,
}) => {
  await artwork(page);
  const before = await doc(page),
    a = await point(page, 72, 56),
    b = await point(page, 80, 53);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await expect(readout(page)).toContainText("+8, −3 px");
  await expect(
    page.locator(".mdi-window.active .transform-ghost rect"),
  ).toHaveAttribute("x", "40");
  const exported = await page.evaluate(() => window.vector95.exportActive());
  expect(exported).not.toMatch(
    /transform-ghost|transform-readout|transform-origin/,
  );
  await page.keyboard.down("Shift");
  const c = await point(page, 92, 62);
  await page.mouse.move(c.x, c.y);
  await expect(readout(page)).toContainText("+20, +0 px · Horizontal axis");
  await expect(
    page.locator(".mdi-window.active .transform-axis"),
  ).toHaveAttribute("data-axis", "x");
  await page.screenshot({ path: "artifacts/search-transform/move.png" });
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await idle(page);
  await expect(readout(page)).toBeHidden();
  await expect(page.locator(".mdi-window.active .transform-ghost")).toHaveCount(
    0,
  );
  expect((await doc(page)).layers).toEqual(before.layers);
  expect((await doc(page)).history).toEqual(before.history);
});

test("resize hover identifies the fixed point and modifiers update it before dragging", async ({
  page,
}) => {
  await artwork(page);
  const before = await doc(page),
    handle = page.locator('.mdi-window.active [data-handle="se"]');
  await handle.hover();
  await expect(handle).toHaveClass(/active-transform/);
  await expect(
    page.locator(".mdi-window.active .transform-origin"),
  ).toHaveAttribute("data-origin", "corner");
  await expect(
    page.locator(".mdi-window.active .transform-origin"),
  ).toHaveAttribute("transform", "translate(40 40)");
  await page.keyboard.down("Alt");
  await expect(
    page.locator(".mdi-window.active .transform-origin"),
  ).toHaveAttribute("transform", "translate(72 56)");
  await page.keyboard.down("Shift");
  await expect(readout(page)).toContainText("Proportions locked");
  expect((await doc(page)).history).toEqual(before.history);
  await page.mouse.down();
  const target = await point(page, 120, 80);
  await page.mouse.move(target.x, target.y);
  await expect(readout(page)).toContainText(
    "96 × 48 px · From centre · Proportions locked",
  );
  await page.screenshot({ path: "artifacts/search-transform/resize.png" });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await idle(page);
  await expect(readout(page)).toBeHidden();
  await expect(
    page.locator(".mdi-window.active .transform-origin"),
  ).toHaveCount(0);
  expect((await doc(page)).history).toHaveLength(before.history.length + 1);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect((await doc(page)).layers).toEqual(before.layers);
});

test("rotation shows its pivot, original orientation and snapped angle at constant screen size", async ({
  page,
}) => {
  await artwork(page);
  const before = await doc(page),
    handle = page.locator('.mdi-window.active [data-handle="rotate"]');
  await handle.hover();
  const pivot = page.locator(".mdi-window.active .transform-origin circle");
  const size = await pivot.boundingBox();
  expect(size.width).toBeCloseTo(11, 1);
  await page.keyboard.press("Control+1");
  await handle.hover();
  expect((await pivot.boundingBox()).width).toBeCloseTo(size.width, 1);
  await page.mouse.down();
  const target = await point(page, 100, 70);
  await page.mouse.move(target.x, target.y);
  await expect(readout(page)).toContainText("Around centre");
  await page.keyboard.down("Shift");
  await expect(readout(page)).toContainText("120° · 15° steps");
  await expect(
    page.locator(".mdi-window.active .transform-rotation-angle"),
  ).toHaveAttribute("data-snapped", "true");
  await expect(
    page.locator(".mdi-window.active .transform-ghost rect"),
  ).toHaveAttribute("width", "64");
  await page.screenshot({ path: "artifacts/search-transform/rotate.png" });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await idle(page);
  await expect(readout(page)).toBeHidden();
  expect((await doc(page)).history).toHaveLength(before.history.length + 1);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect((await doc(page)).layers).toEqual(before.layers);
});
