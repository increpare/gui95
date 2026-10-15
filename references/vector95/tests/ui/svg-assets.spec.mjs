import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.vector95);
});

test("bundled icons match their SVG sources in light and dark themes at multiple scales", async ({
  page,
}) => {
  const mismatches = await page.evaluate(async () => {
    const { icons, captions } = await import("/src/generated/svg-assets.js");
    const { icon } = await import("/src/icons.js");
    async function pixels(source, color, width, height) {
      const root = new DOMParser().parseFromString(
        source,
        "image/svg+xml",
      ).documentElement;
      root.setAttribute("width", width);
      root.setAttribute("height", height);
      root.style.color = color;
      const image = new Image();
      image.src =
        "data:image/svg+xml," +
        encodeURIComponent(new XMLSerializer().serializeToString(root));
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    }
    const mismatches = [];
    for (const [directory, names, width, height] of [
      ["icons", Object.keys(icons), 16, 16],
      ["captions", Object.keys(captions), 12, 10],
    ]) {
      for (const name of names) {
        const source = await (
          await fetch(`/src/assets/${directory}/${name}.svg`)
        ).text();
        for (const color of ["#000000", "#ffffff"])
          for (const scale of [1, 2]) {
            const original = await pixels(
              source,
              color,
              width * scale,
              height * scale,
            );
            const compiled = await pixels(
              icon(name),
              color,
              width * scale,
              height * scale,
            );
            if (original.some((value, index) => value !== compiled[index]))
              mismatches.push(`${name}, ${color}, ${scale}x`);
          }
      }
    }
    return mismatches;
  });
  expect(mismatches).toEqual([]);
});

test("an app icon opens as editable artwork and keeps theme colours through saving and reopening", async ({
  page,
}) => {
  const source = await fs.readFile(
    new URL("../../src/assets/icons/brush.svg", import.meta.url),
  );
  await page.locator("#file-input").setInputFiles({
    name: "brush.svg",
    mimeType: "image/svg+xml",
    buffer: source,
  });
  await expect(page.locator(".mdi-window.active .mdi-title-text")).toHaveText(
    "brush.svg",
  );
  const first = await page.evaluate(() => window.vector95.exportActive());
  expect(first).toContain("currentColor");
  expect(first).toContain('viewBox="0 0 16 16"');
  await page.locator("#file-input").setInputFiles({
    name: "brush-edited.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(first),
  });
  await expect(page.locator(".mdi-window.active .mdi-title-text")).toHaveText(
    "brush-edited.svg",
  );
  const reopened = await page.evaluate(() => {
    const state = window.vector95.getState();
    const doc = state.documents.find((doc) => doc.id === state.activeId);
    return {
      width: doc.width,
      height: doc.height,
      svg: window.vector95.exportActive(),
    };
  });
  expect(reopened.width).toBe(16);
  expect(reopened.height).toBe(16);
  expect(reopened.svg).toContain("currentColor");
});

test("bundled SVG drawings retain named layers and open with independent editing identities", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { forestLevel } = await import("/src/demos.js");
    const { allLayers } = await import("/src/hierarchy.js");
    const first = forestLevel(),
      second = forestLevel();
    const layers = allLayers(first);
    return {
      background: first.background,
      sky: { name: layers[0].name, locked: layers[0].locked },
      hasSlime: layers.some((layer) => layer.name === "Moss Slime"),
      active: layers.find((layer) => layer.id === first.activeLayer)?.name,
      distinct: !allLayers(second).some((layer) =>
        layers.some((old) => old.id === layer.id),
      ),
    };
  });
  expect(result).toEqual({
    background: "#b9dfe0",
    sky: { name: "Sky and hills", locked: true },
    hasSlime: true,
    active: "Creature",
    distinct: true,
  });
});
