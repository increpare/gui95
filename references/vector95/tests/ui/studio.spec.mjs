import { test, expect } from "@playwright/test";
import { openExamples } from "./helpers/examples.mjs";

const state = (page) => page.evaluate(() => window.vector95.getState());
const allLayers = (layers) =>
  layers.flatMap((layer) => [layer, ...allLayers(layer.children || [])]);
const active = async (page) => {
  const s = await state(page);
  return s.documents.find((d) => d.id === s.activeId);
};
async function clickArt(page, x, y, modifiers = []) {
  const doc = await active(page),
    box = await page.locator(".mdi-window.active .stage").boundingBox();
  await page.locator(".mdi-window.active .stage").click({
    position: {
      x: box.width / 2 + (x - doc.width / 2) * doc.zoom + doc.pan.x,
      y: box.height / 2 + (y - doc.height / 2) * doc.zoom + doc.pan.y,
    },
    modifiers,
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("game examples use editable named layers and clean artboard bounds", async ({
  page,
}) => {
  await openExamples(page);
  const s = await state(page);
  expect(s.documents.map((d) => d.name)).toEqual([
    "Forest prop kit.svg",
    "Mosswood clearing.svg",
  ]);
  const scene = await active(page);
  expect(
    allLayers(scene.layers).some((layer) => layer.name === "Moss Slime"),
  ).toBe(true);
  expect(
    allLayers(scene.layers)
      .flatMap((layer) => layer.elements)
      .some((element) => element.type === "group"),
  ).toBe(false);
  await expect(page.locator(".object-tree")).toHaveCount(0);
  await expect(
    page.locator(`[data-layer-row="${scene.activeLayer}"]`),
  ).toHaveClass(/active/);
  const svg = await page.evaluate(() => window.vector95.exportActive());
  expect(svg).toContain('id="slime-face"');
  expect(svg).toContain('id="chest"');
  const bounds = await page
    .locator(".mdi-window.active .artwork")
    .evaluate((nodes) => {
      const b = nodes.getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.w).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.h).toBeLessThanOrEqual(240);
  await page.screenshot({
    path: "artifacts/layer-ui-checks/game-art-scene.png",
  });
  await page
    .getByRole("button", { name: "Forest prop kit.svg", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/layer-ui-checks/game-art-kit.png" });
});

test("eyedropper reuses nested and locked artwork colors without changing art", async ({
  page,
}) => {
  await openExamples(page);
  const before = await active(page);
  await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
  await clickArt(page, 41, 164);
  expect((await state(page)).fill).toBe("#e76b59");
  expect((await active(page)).history).toHaveLength(before.history.length);
  await page.locator("#palette-source").selectOption("recent");
  await expect(page.locator('#swatches [data-color="#e76b59"]')).toBeVisible();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await clickArt(page, 89, 182, ["Alt"]);
  expect((await state(page)).fill).toBe("#78b668");
  expect((await state(page)).tool).toBe("brush");
  expect((await active(page)).history).toHaveLength(before.history.length);
  await clickArt(page, 258, 41, ["Alt"]);
  expect((await state(page)).fill).toBe("#fff1c1");
  await page.locator("#palette-source").selectOption("document");
  await expect(page.locator('#swatches [data-color="#e76b59"]')).toBeVisible();
  await expect(page.locator('#swatches [data-color="#b9dfe0"]')).toBeAttached();
});

test("font preview, apply, export and cancel keep typography predictable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await clickArt(page, 30, 85);
  await page.locator("#text-content").fill("LEVEL 01");
  await page.locator("#text-font").selectOption("Verdana, sans-serif");
  await page.locator("#text-size").fill("18");
  await page.locator("#text-face").selectOption("700|italic");
  await page.locator("#text-anchor").selectOption("middle");
  await page.locator("#text-spacing").fill("1.5");
  await expect(page.locator("#text-preview")).toHaveText("LEVEL 01");
  await expect(page.locator("#text-preview text")).toHaveCSS(
    "font-weight",
    "700",
  );
  await page.screenshot({
    path: "artifacts/layer-ui-checks/game-art-font-dialog.png",
  });
  expect((await active(page)).dirty).toBe(false);
  await page.getByRole("button", { name: "Add Text", exact: true }).click();
  const doc = await active(page),
    element = allLayers(doc.layers)
      .flatMap((l) => l.elements)
      .find((e) => e.type === "text");
  expect(element.attrs).toMatchObject({
    text: "LEVEL 01",
    "font-family": "Verdana, sans-serif",
    "font-size": 18,
    "font-weight": "bold",
    "font-style": "italic",
    "text-anchor": "middle",
    "letter-spacing": 1.5,
  });
  const svg = await page.evaluate(() => window.vector95.exportActive());
  expect(svg).toContain('font-style="italic"');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await clickArt(page, 60, 80);
  await page.locator("#text-content").fill("Cancelled");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    allLayers((await active(page)).layers)
      .flatMap((l) => l.elements)
      .filter((e) => e.type === "text"),
  ).toHaveLength(1);
});
