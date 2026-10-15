import { clamp } from "./core.js";
import { solidColor } from "./colors.js";
import { populatePaletteSelect } from "./palettes.js";

// The classic Windows dialog uses 0–239 hue and 0–240 saturation/luminance.
function rgbToHsl(rgb, previousHue = 0) {
  const [r, g, b] = rgb.map((value) => value / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const delta = max - min,
    l = (max + min) / 2;
  if (!delta) return [previousHue, 0, l];
  let h =
    max === r
      ? (g - b) / delta
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  h = (h / 6 + 1) % 1;
  return [h, delta / (1 - Math.abs(2 * l - 1)), l];
}

function hslToRgb([h, s, l]) {
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + h * 12) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  });
}

const toHex = (rgb) =>
  `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
const toRgb = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((n) => parseInt(n, 16));

export function colorDialogFields() {
  const field = (id, label, max) =>
    `<label for="color-${id}">${label}</label><input id="color-${id}" type="number" min="0" max="${max}" step="1" required />`;
  return `<div class="classic-color-picker">
    <div class="color-palette-panel">
      <label for="color-palette-source">Palette</label>
      <select id="color-palette-source" aria-label="Colour palette scheme"></select>
      <div id="color-palette-swatches" role="group" aria-label="Palette colours"></div>
    </div>
    <div class="color-custom-panel">
    <div class="color-spectrum-row">
      <div class="color-spectrum-frame">
        <canvas id="color-spectrum" width="256" height="192" tabindex="0" role="group" aria-label="Hue and saturation" aria-describedby="color-spectrum-help"></canvas>
        <span id="color-crosshair" aria-hidden="true"></span>
      </div>
      <div id="color-luminance" tabindex="0" role="slider" aria-label="Luminance" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="240"><span id="color-luminance-arrow" aria-hidden="true"></span></div>
    </div>
    <span id="color-spectrum-help" class="color-sr-only">Use left and right arrow keys for hue, up and down for saturation. Hold Shift for larger steps.</span>
    <div class="color-components">
      <div class="color-sample"><div class="color-picker-swatch"><span id="color-preview"></span></div><span>Colour</span></div>
      <div class="color-component-fields">${field("hue", "Hue:", 239)}${field("sat", "Sat:", 240)}${field("lum", "Lum:", 240)}</div>
      <div class="color-component-fields">${field("red", "Red:", 255)}${field("green", "Green:", 255)}${field("blue", "Blue:", 255)}</div>
    </div>
    <div class="color-opacity-row"><label for="opacity">Opacity (%)</label><input id="color-alpha" type="range" min="0" max="100" step="1" aria-label="Opacity slider" /><input id="opacity" type="number" min="0" max="100" step="1" required aria-label="Opacity" /></div>
    <label class="color-hex-row" for="precise-hex">Hex colour<input id="precise-hex" type="text" maxlength="7" required spellcheck="false" autocomplete="off" /></label>
    </div>
  </div>`;
}

export function attachColorPicker(
  root,
  initialColor,
  initialOpacity,
  { palettes, selectedPalette },
) {
  const $ = (selector) => root.querySelector(selector);
  const hex = $("#precise-hex"),
    opacity = $("#opacity"),
    alpha = $("#color-alpha");
  const spectrum = $("#color-spectrum"),
    luminance = $("#color-luminance");
  const hslFields = ["hue", "sat", "lum"].map((id) => $(`#color-${id}`));
  const rgbFields = ["red", "green", "blue"].map((id) => $(`#color-${id}`));
  let color =
    initialColor === "none" ? "none" : solidColor(initialColor) || "#000000";
  let rgb = toRgb(color === "none" ? "#000000" : color);
  let hsl = rgbToHsl(rgb);
  hex.value = color;
  opacity.value = alpha.value = Math.round(initialOpacity * 100);
  const paletteSource = $("#color-palette-source");
  const paletteSwatches = $("#color-palette-swatches");
  populatePaletteSelect(paletteSource, palettes, selectedPalette);

  function renderPaletteSelection() {
    paletteSwatches.querySelectorAll("button").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.dataset.paletteColor === color,
      );
    });
  }
  function renderPalette() {
    const palette = palettes.find((item) => item.id === paletteSource.value);
    paletteSwatches.replaceChildren();
    paletteSwatches.setAttribute("aria-label", `${palette.label} colours`);
    for (const value of palette.colors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-palette-swatch";
      button.dataset.paletteColor = value;
      button.style.backgroundColor = value;
      button.title = value;
      button.setAttribute("aria-label", `Choose ${value}`);
      button.addEventListener("click", () => {
        color = value;
        rgb = toRgb(color);
        hsl = rgbToHsl(rgb, hsl[0]);
        render();
      });
      paletteSwatches.append(button);
    }
    if (!palette.colors.length) {
      const empty = document.createElement("span");
      empty.className = "palette-empty";
      empty.textContent = "Pick a colour and apply it to keep it here.";
      paletteSwatches.append(empty);
    }
    renderPaletteSelection();
  }
  paletteSource.addEventListener("change", renderPalette);
  renderPalette();

  const context = spectrum.getContext("2d");
  const pixels = context.createImageData(spectrum.width, spectrum.height);
  for (let y = 0; y < spectrum.height; y++) {
    for (let x = 0; x < spectrum.width; x++) {
      const offset = (y * spectrum.width + x) * 4;
      pixels.data.set(
        [
          ...hslToRgb([
            ((x / (spectrum.width - 1)) * 239) / 240,
            1 - y / (spectrum.height - 1),
            0.5,
          ]),
          255,
        ],
        offset,
      );
    }
  }
  context.putImageData(pixels, 0, 0);

  function render(source) {
    hslFields.forEach((field, i) => {
      if (field !== source)
        field.value = Math.min(i === 0 ? 239 : 240, Math.round(hsl[i] * 240));
    });
    rgbFields.forEach((field, i) => {
      if (field !== source) field.value = rgb[i];
    });
    if (source !== hex) hex.value = color;
    hex.setCustomValidity("");
    $("#color-crosshair").style.left = `${((hsl[0] * 240) / 239) * 100}%`;
    $("#color-crosshair").style.top = `${(1 - hsl[1]) * 100}%`;
    luminance.style.background = `linear-gradient(to bottom, #fff, ${toHex(hslToRgb([hsl[0], hsl[1], 0.5]))}, #000)`;
    luminance.setAttribute("aria-valuenow", Math.round(hsl[2] * 240));
    $("#color-luminance-arrow").style.top = `${(1 - hsl[2]) * 100}%`;
    renderPaletteSelection();
    renderAlpha();
  }
  function renderAlpha() {
    const preview = $("#color-preview");
    preview.style.background =
      color === "none"
        ? "linear-gradient(135deg,#fff 45%,#f00 46% 54%,#fff 55%)"
        : color;
    preview.style.opacity =
      color === "none" ? 1 : clamp(Number(opacity.value) / 100, 0, 1);
    alpha.style.setProperty("--alpha-color", toHex(rgb));
  }
  function changeHsl(source) {
    rgb = hslToRgb(hsl);
    color = toHex(rgb);
    render(source);
  }
  hslFields.forEach((field, i) =>
    field.addEventListener("input", () => {
      if (!field.validity.valid) return;
      hsl[i] = Number(field.value) / 240;
      changeHsl(field);
    }),
  );
  rgbFields.forEach((field, i) =>
    field.addEventListener("input", () => {
      if (!field.validity.valid) return;
      rgb[i] = Number(field.value);
      hsl = rgbToHsl(rgb, hsl[0]);
      color = toHex(rgb);
      render(field);
    }),
  );
  hex.addEventListener("input", () => {
    const value = hex.value.trim().toLowerCase();
    const normalized =
      value === "none" || value.startsWith("#") ? value : `#${value}`;
    const valid = /^(#[a-f\d]{6}|none)$/.test(normalized);
    hex.setCustomValidity(
      valid ? "" : "Enter a six-digit hex colour, or none.",
    );
    if (!valid) return;
    color = normalized;
    if (color !== "none") {
      rgb = toRgb(color);
      hsl = rgbToHsl(rgb, hsl[0]);
    }
    render(hex);
  });
  opacity.addEventListener("input", () => {
    if (!opacity.validity.valid) return;
    alpha.value = opacity.value;
    renderAlpha();
  });
  alpha.addEventListener("input", () => {
    opacity.value = alpha.value;
    renderAlpha();
  });
  function trackPointer(element, update) {
    const move = (event) => {
      const rect = element.getBoundingClientRect();
      update(
        clamp((event.clientX - rect.left) / rect.width, 0, 1),
        clamp((event.clientY - rect.top) / rect.height, 0, 1),
      );
      changeHsl();
    };
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      element.focus();
      element.setPointerCapture(event.pointerId);
      move(event);
    });
    element.addEventListener("pointermove", (event) => {
      if (element.hasPointerCapture(event.pointerId)) move(event);
    });
    element.addEventListener("pointerup", (event) => {
      if (!element.hasPointerCapture(event.pointerId)) return;
      move(event);
      element.releasePointerCapture(event.pointerId);
    });
  }
  trackPointer(spectrum, (x, y) => {
    hsl[0] = (x * 239) / 240;
    hsl[1] = 1 - y;
  });
  trackPointer(luminance, (_x, y) => {
    hsl[2] = 1 - y;
  });
  spectrum.addEventListener("keydown", (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const i = ["ArrowLeft", "ArrowRight"].includes(event.key) ? 0 : 1;
    const direction = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
    hsl[i] = clamp(
      hsl[i] + (direction * (event.shiftKey ? 10 : 1)) / 240,
      0,
      i === 0 ? 239 / 240 : 1,
    );
    changeHsl();
  });
  luminance.addEventListener("keydown", (event) => {
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const direction = ["ArrowUp", "ArrowRight", "PageUp"].includes(event.key)
      ? 1
      : -1;
    hsl[2] =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 1
          : clamp(
              hsl[2] +
                (direction *
                  (event.shiftKey || event.key.startsWith("Page") ? 10 : 1)) /
                  240,
              0,
              1,
            );
    changeHsl();
  });
  render();
  return () => ({ color, opacity: Number(opacity.value) / 100 });
}
