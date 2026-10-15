import { esc, elementMarkup, namespaceMarkup } from "./core.js";
import {
  fallbackFonts,
  familyName,
  installedFonts,
  faceStyle,
  styleKey,
  recentFonts,
} from "./fonts.js";
import { editTextAttrs, changedTextFields } from "./text-layout.js";

export function textDialogFields(attrs) {
  const family = attrs["font-family"] || fallbackFonts[0];
  const families = [...new Set([family, ...recentFonts(), ...fallbackFonts])];
  const anchor = attrs["text-anchor"] || "start";
  const styles = [
    ["Regular", { "font-weight": "normal", "font-style": "normal" }],
    ["Bold", { "font-weight": "bold", "font-style": "normal" }],
    ["Italic", { "font-weight": "normal", "font-style": "italic" }],
    ["Bold Italic", { "font-weight": "bold", "font-style": "italic" }],
  ];
  const key = styleKey(attrs);
  if (!styles.some(([, a]) => styleKey(a) === key))
    styles.unshift(["Current style", attrs]);
  return `<div class="text-dialog-fields">
    <label class="text-content-label">Text<textarea id="text-content" rows="3" required maxlength="2000">${esc(attrs.text ?? "Text")}</textarea></label>
    <fieldset><legend>Font</legend><div class="dialog-fields">
      <label class="full">Family<div class="font-search-row"><input id="text-font-search" type="search" aria-label="Search font families" placeholder="Search fonts…" autocomplete="off"/><button id="text-load-fonts" type="button" title="Browse fonts installed on this computer">Installed fonts</button></div><select id="text-font">${families.map((font) => `<option value="${esc(font)}" ${family === font ? "selected" : ""}>${esc(familyName(font))}</option>`).join("")}</select></label>
      <label>Style<select id="text-face">${styles.map(([name, attrs]) => `<option value="${styleKey(attrs)}" ${styleKey(attrs) === key ? "selected" : ""}>${name}</option>`).join("")}</select></label>
      <label>Size (px)<input id="text-size" type="number" min="1" max="1000" step="0.5" value="${parseFloat(attrs["font-size"]) || 24}" required /></label>
      <label>Alignment<select id="text-anchor"><option value="start" ${anchor === "start" ? "selected" : ""}>Left</option><option value="middle" ${anchor === "middle" ? "selected" : ""}>Centre</option><option value="end" ${anchor === "end" ? "selected" : ""}>Right</option></select></label>
      <label>Letter spacing (px)<input id="text-spacing" type="number" min="-20" max="100" step="0.5" value="${parseFloat(attrs["letter-spacing"]) || 0}" required /></label>
      <label>Line spacing<input id="text-line-height" type="number" min="0.1" max="10" step="0.1" value="${Number(attrs.lineHeight) || 1.2}" required ${attrs.textPath ? "disabled" : ""}/></label>
    </div><p id="text-font-status" class="font-status" aria-live="polite"></p></fieldset>
    ${attrs.textPath ? `<fieldset><legend>Along path</legend><div class="dialog-fields"><label>Position (%)<input id="text-path-offset" type="number" min="0" max="100" step="1" value="${Number(attrs.textPath.startOffset) || 0}" required/></label><label>Baseline offset (px)<input id="text-path-rise" type="number" min="-1000" max="1000" step="0.5" value="${Number(attrs.textPath.rise) || 0}" required/></label></div><label class="check-row"><input id="text-path-reverse" type="checkbox" ${attrs.textPath.reverse ? "checked" : ""}/>Reverse direction</label></fieldset>` : ""}
    <fieldset><legend>Preview</legend><div class="font-preview" aria-label="SVG text preview"><svg id="text-preview" xmlns="http://www.w3.org/2000/svg"></svg></div><label class="check-row"><input id="text-preview-dark" type="checkbox"/>Dark background</label></fieldset>
  </div>`;
}
export function readTextFields(root = document) {
  const value = (id) => root.querySelector(`#text-${id}`);
  const [weight, style, stretch = "normal"] = value("face").value.split("|");
  return {
    text: value("content").value,
    "font-family": value("font").value,
    "font-size": Number(value("size").value),
    "font-weight":
      weight === "400" ? "normal" : weight === "700" ? "bold" : weight,
    "font-style": style,
    "font-stretch": stretch,
    "letter-spacing": Number(value("spacing").value),
    "text-anchor": value("anchor").value,
    lineHeight: Number(value("line-height").value),
  };
}
export function attachTextPreview(
  root,
  element,
  { defs = "", onPreview = () => {}, prepare = (e) => e } = {},
) {
  const preview = root.querySelector("#text-preview");
  const initial = readTextFields(root);
  const content = root.querySelector("#text-content");
  const validate = () =>
    content.setCustomValidity(
      element.attrs.textPath && content.value.includes("\n")
        ? "Text on a path uses one line. Detach it before adding line breaks."
        : "",
    );
  let frame;
  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!root.isConnected) return;
      validate();
      if (!root.checkValidity()) return;
      const attrs = editTextAttrs(
        element.attrs,
        changedTextFields(readTextFields(root), initial),
      );
      if (attrs.textPath) {
        attrs.textPath = {
          ...attrs.textPath,
          startOffset: Number(root.querySelector("#text-path-offset").value),
          rise: Number(root.querySelector("#text-path-rise").value),
          reverse: root.querySelector("#text-path-reverse").checked,
        };
      }
      const draft = prepare({ ...element, attrs });
      preview.innerHTML = namespaceMarkup(
        `<defs>${defs}</defs>${elementMarkup(draft)}`,
        "text-preview",
      );
      const box = preview.getBBox(),
        padding = 10;
      preview.setAttribute(
        "viewBox",
        `${box.x - padding} ${box.y - padding} ${Math.max(20, box.width + padding * 2)} ${Math.max(20, box.height + padding * 2)}`,
      );
      preview.setAttribute("width", Math.max(20, box.width + padding * 2));
      preview.setAttribute("height", Math.max(60, box.height + padding * 2));
      preview.parentElement.classList.toggle(
        "dark",
        root.querySelector("#text-preview-dark").checked,
      );
      onPreview(draft);
    });
  }
  root.addEventListener("input", update);
  content.addEventListener("input", validate);
  root.addEventListener("change", update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener("input", update);
    root.removeEventListener("change", update);
  };
}
export function attachFontPicker(root) {
  const picker = root.querySelector("#text-font"),
    search = root.querySelector("#text-font-search"),
    status = root.querySelector("#text-font-status"),
    style = root.querySelector("#text-face"),
    load = root.querySelector("#text-load-fonts");
  let faces = [],
    families = [
      ...new Set([
        ...recentFonts(),
        ...[...picker.options].map((o) => o.value),
      ]),
    ];
  let chosen = picker.value;
  function previewFamily(option) {
    option.style.fontFamily = option.value;
    option.title = option.textContent;
    return option;
  }
  [...picker.options].forEach(previewFamily);
  picker.style.fontFamily = chosen;
  function filter() {
    const query = search.value.trim().toLowerCase();
    const matches = families.filter((name) =>
      familyName(name).toLowerCase().includes(query),
    );
    // Searching never changes the selected family or the artwork.
    picker.replaceChildren(
      ...[...new Set([chosen, ...matches])].map((name) =>
        previewFamily(
          new Option(familyName(name), name, false, name === chosen),
        ),
      ),
    );
    status.textContent = query
      ? `${matches.length} matching families. Choose a family to preview it.`
      : "";
  }
  function styles() {
    const list = faces.filter(
      (face) => face.family.toLowerCase() === familyName(chosen).toLowerCase(),
    );
    if (!faces.length) return;
    const key = style.value,
      options = new Map(
        list.map((face) => [styleKey(faceStyle(face)), face.style]),
      );
    if (!options.has(key)) options.set(key, "Current style (unavailable)");
    style.replaceChildren(
      ...[...options].map(
        ([value, label]) => new Option(label, value, false, value === key),
      ),
    );
    status.textContent = list.length
      ? ""
      : "This font is not installed; SVG will use a fallback.";
  }
  search.addEventListener("input", (event) => {
    event.stopPropagation();
    filter();
  });
  picker.addEventListener("change", () => {
    chosen = picker.value;
    picker.style.fontFamily = chosen;
    styles();
  });
  load.addEventListener("click", async () => {
    load.disabled = true;
    status.textContent = "Loading installed fonts…";
    try {
      faces = await installedFonts();
      if (!root.isConnected) return;
      families = [
        ...new Set([
          ...recentFonts(),
          chosen,
          ...fallbackFonts,
          ...faces
            .map((face) => face.family)
            .sort((a, b) => a.localeCompare(b)),
        ]),
      ];
      filter();
      styles();
      load.hidden = true;
    } catch (error) {
      if (root.isConnected) {
        status.textContent = error.message;
        load.disabled = false;
      }
    }
  });
  if (globalThis.vector95Desktop) load.click();
}

export function movableTextDialog(dialog) {
  const title = dialog.querySelector(".dialog-title");
  let drag;
  const down = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const box = dialog.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    title.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event) => {
    if (!drag) return;
    dialog.style.margin = "0";
    dialog.style.left = `${Math.max(0, Math.min(innerWidth - dialog.offsetWidth, drag.left + event.clientX - drag.x))}px`;
    dialog.style.top = `${Math.max(0, Math.min(innerHeight - dialog.offsetHeight, drag.top + event.clientY - drag.y))}px`;
  };
  const up = () => {
    drag = null;
  };
  title.addEventListener("pointerdown", down);
  title.addEventListener("pointermove", move);
  title.addEventListener("pointerup", up);
  title.addEventListener("lostpointercapture", up);
  return () => {
    title.removeEventListener("pointerdown", down);
    title.removeEventListener("pointermove", move);
    title.removeEventListener("pointerup", up);
    title.removeEventListener("lostpointercapture", up);
    dialog.style.margin = "";
    dialog.style.left = "";
    dialog.style.top = "";
  };
}
