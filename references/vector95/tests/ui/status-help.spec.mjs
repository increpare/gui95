import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".mdi-window.active")).toBeVisible();
});

test("hover and keyboard focus describe controls and restore command feedback", async ({
  page,
}) => {
  const status = page.locator("#status"),
    before = await status.textContent();
  await page.getByRole("button", { name: "Hand", exact: true }).hover();
  await expect(status).toHaveText("Moves the drawing view.");
  await page.mouse.move(750, 950);
  await expect(status).toHaveText(before);
  await page.getByRole("button", { name: "Pencil", exact: true }).focus();
  await expect(status).toHaveText("Draws lines with a constant width.");
  await page.locator(".mdi-window.active .stage").focus();
  await expect(status).toHaveText(before);
  await page.getByRole("button", { name: "Hand", exact: true }).hover();
  await page.keyboard.press("Control+'");
  await expect(status).toHaveText("Grid visible.");
  await page.mouse.move(750, 950);
  await expect(status).toHaveText("Grid visible.");
});

test("menu keyboard navigation and mouse leaving restore the latest result", async ({
  page,
}) => {
  const status = page.locator("#status");
  await page.keyboard.press("Control+'");
  await expect(status).toHaveText("Grid visible.");
  await page.keyboard.press("Alt+f");
  await expect(status).toHaveText(
    "Creates a drawing with the name and size you specify.",
  );
  await page.keyboard.press("ArrowDown");
  await expect(status).toHaveText("Opens an SVG file in a drawing window.");
  await page.locator('.menu-dropdown [data-action="open"]').hover();
  await page.mouse.move(750, 950);
  await expect(status).toHaveText("Opens an SVG file in a drawing window.");
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Grid visible.");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.locator('.menu-dropdown [data-action="snap"]').hover();
  await expect(status).toHaveText(
    "Aligns shapes and object movements with the grid.",
  );
  await page.mouse.move(750, 950);
  await expect(status).toHaveText("Grid visible.");
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Grid visible.");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "View", exact: true }).hover();
  await page.mouse.move(750, 950);
  await expect(status).toHaveText("Grid visible.");
  await page.keyboard.press("Escape");
});

test("main toolbar exposes contextual tool settings without separate drawing or eraser modes", async ({
  page,
}) => {
  await expect(page.locator(".commandbar #brush-size")).toBeVisible();
  await expect(page.locator(".inspector .tool-properties")).toHaveCount(0);
  await page.getByRole("button", { name: "Hand", exact: true }).click();
  await expect(page.locator("#size-options")).toBeHidden();
  await expect(page.locator("#smoothing-options")).toBeHidden();
  await expect(page.locator("#pressure-options")).toBeHidden();
  await page.getByRole("button", { name: "Selection", exact: true }).click();
  await expect(page.locator("#size-options")).toBeHidden();
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await expect(page.locator("#size-options")).toBeVisible();
  await expect(page.locator("#smoothing-options")).toBeVisible();
  await expect(page.locator("#pressure-options")).toBeHidden();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await expect(page.locator("#size-options")).toBeVisible();
  await expect(page.locator("#smoothing-options")).toBeVisible();
  await expect(page.locator("#pressure-options")).toBeVisible();
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await expect(page.locator("#size-options")).toBeVisible();
  await expect(page.locator("#pressure-options")).toBeVisible();
  await expect(page.locator("#tool-options-description")).toHaveText(
    "Erases paint on the active layer.",
  );
  await expect(
    page.locator(
      "#drawing-options, #eraser-options, #paint-drawing, #object-drawing, #eraser-objects",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.locator("#size-options")).toBeHidden();
  await expect(page.locator("#brush-preview")).toBeHidden();
});

test("toolbar numeric values and sliders stay in sync and fit narrow windows", async ({
  page,
}) => {
  const size = page.getByRole("spinbutton", {
    name: "Size in pixels",
    exact: true,
  });
  await size.fill("");
  await size.pressSequentially("24.5");
  await size.press("Enter");
  await expect(
    page.getByRole("slider", { name: "Size", exact: true }),
  ).toHaveValue("24.5");
  expect(await page.evaluate(() => window.vector95.getState().size)).toBe(24.5);
  const smooth = page.getByRole("spinbutton", {
    name: "Smoothing percentage",
    exact: true,
  });
  await smooth.fill("60");
  await smooth.press("Tab");
  await expect(
    page.getByRole("slider", { name: "Smoothing", exact: true }),
  ).toHaveValue("60");
  await page.getByRole("slider", { name: "Smoothing", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(smooth).toHaveValue("59");
  await page
    .getByRole("checkbox", { name: "Use pen pressure", exact: true })
    .uncheck();
  expect(await page.evaluate(() => window.vector95.getState().pressure)).toBe(
    false,
  );
  for (const width of [1480, 1200, 1000, 800]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator(".commandbar").evaluate((bar) => {
      const options = bar
        .querySelector(".tool-properties")
        .getBoundingClientRect();
      const current = bar
        .querySelector(".current-tool")
        .getBoundingClientRect();
      return {
        width: bar.clientWidth,
        scrollWidth: bar.scrollWidth,
        top: options.top,
        currentBottom: current.bottom,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
    if (width > 1150) expect(geometry.top).toBeLessThan(geometry.currentBottom);
    else expect(geometry.top).toBeGreaterThanOrEqual(geometry.currentBottom);
    await expect(size).toBeInViewport();
    await expect(smooth).toBeInViewport();
  }
  await page.getByRole("button", { name: "Hand", exact: true }).click();
  await expect(page.locator(".tool-properties")).toBeHidden();
});
