import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

for (const scale of [1, 1.25, 1.5, 2]) {
  test.describe(`controls at ${scale * 100}% display scale`, () => {
    test.use({ deviceScaleFactor: scale });
    test("menus select on press without a bezel and track a drag to its command", async ({
      page,
    }) => {
      const file = page.locator(".menu-trigger").filter({ hasText: "File" });
      const label = await file.locator("span").boundingBox();
      const box = await file.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(file).toHaveAttribute("aria-expanded", "true");
      await expect(file).toHaveCSS("box-shadow", "none");
      await expect(file).toHaveCSS("background-color", "rgb(0, 0, 128)");
      expect(await file.locator("span").boundingBox()).toEqual(label);
      await expect(page.locator(".tool-button").first()).toHaveCSS(
        "width",
        "32px",
      );
      await page.screenshot({ path: `artifacts/controls-${scale}.png` });
      const view = await page
        .locator(".menu-trigger")
        .filter({ hasText: "View" })
        .boundingBox();
      await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      const grid = page.locator(
        '.menu-dropdown:not([hidden]) [data-action="grid"]',
      );
      await expect(grid).toBeVisible();
      const item = await grid.boundingBox();
      await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
      await page.mouse.up();
      await expect
        .poll(() => page.evaluate(() => window.vector95.getState().grid))
        .toBe(true);
      await expect(page.locator(".menu-dropdown:not([hidden])")).toHaveCount(0);
      await page
        .locator(".toolbox")
        .screenshot({ path: `artifacts/toolbox-${scale}.png` });
      await page
        .locator(".app-controls")
        .screenshot({ path: `artifacts/caption-${scale}.png` });
    });
  });
}

test("a high-zoom resize follows the pointer through a transformed parent", async ({
  page,
}) => {
  await page.locator("#file-input").setInputFiles({
    name: "Tile.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g transform="translate(35 35) scale(.5)"><rect id="tile" width="60" height="40" fill="#44891a"/></g></svg>',
    ),
  });
  await expect(page.locator(".mdi-window.active .mdi-title-text")).toHaveText(
    "Tile.svg",
  );
  await page.locator('[data-tool="select"]').click();
  await page.locator(".mdi-window.active .stage").focus();
  await page.keyboard.press("Control+a");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.vector95.getState();
        return s.documents.find((doc) => doc.id === s.activeId).selected.length;
      }),
    )
    .toBe(1);
  for (let n = 0; n < 3; n++)
    await page
      .locator('.mdi-window.active [data-window-action="zoom-in"]')
      .click();
  const state = () =>
    page.evaluate(() => {
      const s = window.vector95.getState();
      return s.documents.find((d) => d.id === s.activeId);
    });
  const before = await state();
  expect(before.zoom).toBeGreaterThan(8);
  const handle = page.locator('.mdi-window.active [data-handle="se"]');
  const box = await handle.boundingBox(),
    start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 5; step++) {
    const x = start.x + step * 8,
      y = start.y + step * 5;
    await page.mouse.move(x, y);
    const next = await handle.boundingBox();
    expect(Math.abs(next.x + next.width / 2 - x)).toBeLessThan(1.5);
    expect(Math.abs(next.y + next.height / 2 - y)).toBeLessThan(1.5);
  }
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.vector95.getPendingPaintCount()))
    .toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await state()).layers).toEqual(before.layers);
});
