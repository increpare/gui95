import { asepritePalettes } from "./palette-data.js";

// Keep the familiar Classic swatch layout, using Arne16's original colours.
export const classicColors = [
  "#000000",
  "#493c2b",
  "#be2633",
  "#e06f8b",
  "#9d9d9d",
  "#a46422",
  "#eb8931",
  "#f7e26b",
  "#ffffff",
  "#1b2632",
  "#2f484e",
  "#44891a",
  "#a3ce27",
  "#005784",
  "#31a2f2",
  "#b2dcef",
];

export const paletteChoices = [
  { id: "classic", label: "Classic (Arne16)", colors: classicColors },
  { id: "document", label: "Drawing" },
  { id: "recent", label: "Recent" },
  ...asepritePalettes
    .filter((palette) => palette.id !== "arne16")
    .map((palette) => ({ ...palette, preset: true })),
];

function renderPreview(preview, colors) {
  const signature = colors.join(",");
  if (preview.dataset.colors === signature) return;
  preview.dataset.colors = signature;
  preview.replaceChildren(
    ...colors.map((color) => {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = color;
      return swatch;
    }),
  );
}

// Customizable native selects retain keyboard navigation, type-ahead and dismissal.
export function populatePaletteSelect(
  select,
  palettes,
  selected = select.value,
  getColors = (palette) => palette.colors || [],
) {
  select.replaceChildren();
  select.classList.add("palette-select");
  const dynamicPreviews = [];
  let previousPreset = false;
  for (const palette of palettes) {
    if (palette.preset && !previousPreset) {
      select.append(document.createElement("hr"));
    }
    const option = document.createElement("option");
    option.value = palette.id;
    const name = document.createElement("span");
    name.className = "palette-option-name";
    name.textContent = palette.label;
    const preview = document.createElement("span");
    preview.className = "palette-mini-swatches";
    preview.setAttribute("aria-hidden", "true");
    renderPreview(preview, getColors(palette));
    if (!palette.colors) dynamicPreviews.push({ palette, preview });
    option.append(name, preview);
    select.append(option);
    previousPreset = !!palette.preset;
  }
  select.value = selected;
  return () => {
    for (const { palette, preview } of dynamicPreviews) {
      renderPreview(preview, getColors(palette));
    }
  };
}
