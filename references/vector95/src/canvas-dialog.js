import { esc, clamp, layersMarkup, namespaceMarkup } from "./core.js";

const anchors = [
  ["nw", "Top left", 0, 0, "↖"],
  ["n", "Top centre", 0.5, 0, "↑"],
  ["ne", "Top right", 1, 0, "↗"],
  ["w", "Centre left", 0, 0.5, "←"],
  ["c", "Centre", 0.5, 0.5, "•"],
  ["e", "Centre right", 1, 0.5, "→"],
  ["sw", "Bottom left", 0, 1, "↙"],
  ["s", "Bottom centre", 0.5, 1, "↓"],
  ["se", "Bottom right", 1, 1, "↘"],
];

export function canvasDialogFields(doc, selection) {
  return `<div class="canvas-setup"><div class="dialog-fields"><label class="full">Drawing name<input id="setup-name" value="${esc(doc.name)}" required maxlength="100" /></label><label class="full">Background<select id="setup-background"><option value="#ffffff" ${doc.background === "#ffffff" ? "selected" : ""}>White</option><option value="#f6f3e9" ${doc.background === "#f6f3e9" ? "selected" : ""}>Warm paper</option><option value="none" ${doc.background === "none" ? "selected" : ""}>Transparent</option>${!["#ffffff", "#f6f3e9", "none"].includes(doc.background) ? `<option value="${esc(doc.background)}" selected>Current colour</option>` : ""}</select></label></div><fieldset><legend>Canvas Size</legend><div class="canvas-size-controls"><div class="dialog-fields"><label>Width (px)<input id="setup-width" type="number" step="any" value="${doc.width}" min="1" max="30000" required /></label><label>Height (px)<input id="setup-height" type="number" step="any" value="${doc.height}" min="1" max="30000" required /></label><div class="full canvas-size-actions"><button type="button" id="setup-crop-selection" ${selection ? "" : "disabled"}>Crop to Selection</button><button type="button" id="setup-reset">Reset Size</button></div></div><div class="canvas-anchor-control"><span id="setup-anchor-label">Anchor</span><div class="canvas-anchors" role="group" aria-labelledby="setup-anchor-label">${anchors.map(([key, label, , , arrow]) => `<button type="button" data-canvas-anchor="${key}" aria-label="${label} anchor" title="${label}" aria-pressed="${key === "c"}">${arrow}</button>`).join("")}</div></div></div><p id="setup-anchor-note">The centre stays fixed when you change the size.</p><svg id="setup-preview" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-label="Canvas preview" role="group"></svg><p class="canvas-preview-help">Drag edges to crop or expand. Drag inside to move the canvas.</p><p class="canvas-preview-help">Artwork keeps its size. Anything outside the canvas is retained.</p><output id="setup-size-note" aria-live="polite"></output></fieldset></div>`;
}

export function attachCanvasPreview(root, doc, selection) {
  const svg = root.querySelector("#setup-preview"),
    width = root.querySelector("#setup-width"),
    height = root.querySelector("#setup-height"),
    background = root.querySelector("#setup-background"),
    original = { x: 0, y: 0, w: doc.width, h: doc.height },
    prefix = `canvas-setup-${doc.id}`;
  let bounds = { ...original },
    anchor = anchors[4],
    drag = null;
  const artwork = namespaceMarkup(layersMarkup(doc), prefix);
  // The ghost reuses the artwork group, keeping all IDs and references unique.
  svg.innerHTML = `<defs>${namespaceMarkup(doc.defs || "", prefix)}<clipPath id="${prefix}-clip"><rect class="canvas-preview-clip"/></clipPath><pattern id="${prefix}-check" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fff"/><path d="M0 0H6V6H0ZM6 6H12V12H6Z" fill="#d4d4d4"/></pattern></defs><g opacity="0.22" pointer-events="none"><use href="#${prefix}-artwork"/></g><rect class="canvas-preview-paper" pointer-events="none"/><g clip-path="url(#${prefix}-clip)" pointer-events="none"><g id="${prefix}-artwork">${artwork}</g></g><rect class="canvas-preview-original" x="0" y="0" width="${doc.width}" height="${doc.height}" pointer-events="none"/><rect class="canvas-preview-frame" data-canvas-handle="move"><title>Drag to move the canvas</title></rect><g class="canvas-preview-handles">${anchors
    .filter(([key]) => key !== "c")
    .map(
      ([key, label]) =>
        `<rect data-canvas-handle="${key}" tabindex="0" role="button" aria-label="${label} canvas edge"><title>${label}: drag or use arrow keys</title></rect>`,
    )
    .join("")}</g>`;
  const rects = [
    svg.querySelector(".canvas-preview-clip"),
    svg.querySelector(".canvas-preview-paper"),
    svg.querySelector(".canvas-preview-frame"),
  ];
  const fmt = (value) => Number(value.toFixed(4));
  function fit() {
    const x = Math.min(0, bounds.x),
      y = Math.min(0, bounds.y),
      w = Math.max(doc.width, bounds.x + bounds.w) - x,
      h = Math.max(doc.height, bounds.y + bounds.h) - y,
      pad = Math.max(w, h) * 0.18;
    svg.setAttribute(
      "viewBox",
      `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`,
    );
  }
  function render(refit = true) {
    if (refit) fit();
    for (const rect of rects)
      for (const [key, value] of Object.entries({
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
      }))
        rect.setAttribute(key, value);
    svg
      .querySelector(".canvas-preview-paper")
      .setAttribute(
        "fill",
        background.value === "none"
          ? `url(#${prefix}-check)`
          : background.value,
      );
    const matrix = svg.getScreenCTM(),
      r = 4 / (matrix?.a || 1);
    for (const [key, , ax, ay] of anchors) {
      const handle = svg.querySelector(`[data-canvas-handle="${key}"]`);
      if (!handle) continue;
      handle.setAttribute("x", bounds.x + bounds.w * ax - r);
      handle.setAttribute("y", bounds.y + bounds.h * ay - r);
      handle.setAttribute("width", r * 2);
      handle.setAttribute("height", r * 2);
    }
    root
      .querySelectorAll("[data-canvas-anchor]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          button.dataset.canvasAnchor === anchor?.[0],
        ),
      );
    root.querySelector("#setup-anchor-note").textContent = anchor
      ? `The ${anchor[1].toLowerCase()} stays fixed when you change the size.`
      : "Custom position. Choose an anchor to align the canvas.";
    root.querySelector("#setup-size-note").textContent =
      `${fmt(bounds.w)} × ${fmt(bounds.h)} px`;
  }
  function syncSize() {
    width.value = bounds.w;
    height.value = bounds.h;
  }
  function setAnchor(next) {
    anchor = next;
    bounds.x = (doc.width - bounds.w) * anchor[2];
    bounds.y = (doc.height - bounds.h) * anchor[3];
    render();
  }
  function inputSize() {
    if (!width.validity.valid || !height.validity.valid) return;
    bounds.w = Number(width.value);
    bounds.h = Number(height.value);
    if (anchor) setAnchor(anchor);
    else render();
  }
  width.addEventListener("input", inputSize);
  height.addEventListener("input", inputSize);
  background.addEventListener("change", () => render());
  root
    .querySelectorAll("[data-canvas-anchor]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        setAnchor(anchors.find(([key]) => key === button.dataset.canvasAnchor)),
      ),
    );
  root.querySelector("#setup-reset").addEventListener("click", () => {
    bounds = { ...original };
    anchor = anchors[4];
    syncSize();
    render();
  });
  root.querySelector("#setup-crop-selection").addEventListener("click", () => {
    if (!selection) return;
    bounds = { ...selection };
    anchor = null;
    syncSize();
    render();
  });
  const point = (event) =>
    new DOMPoint(event.clientX, event.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
  function moveEdges(key, before, dx, dy) {
    const next = { ...before };
    if (key === "move") {
      next.x += dx;
      next.y += dy;
    } else {
      if (key.includes("w")) {
        next.w = clamp(before.w - dx, 1, 30000);
        next.x = before.x + before.w - next.w;
      }
      if (key.includes("e")) next.w = clamp(before.w + dx, 1, 30000);
      if (key.includes("n")) {
        next.h = clamp(before.h - dy, 1, 30000);
        next.y = before.y + before.h - next.h;
      }
      if (key.includes("s")) next.h = clamp(before.h + dy, 1, 30000);
    }
    bounds = next;
    anchor = null;
    syncSize();
    render(false);
  }
  svg.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-canvas-handle]");
    if (!handle || event.button !== 0 || drag) return;
    event.preventDefault();
    drag = {
      id: event.pointerId,
      key: handle.dataset.canvasHandle,
      start: point(event),
      before: { ...bounds },
      anchor,
    };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    const p = point(event);
    moveEdges(
      drag.key,
      drag.before,
      Math.round(p.x - drag.start.x),
      Math.round(p.y - drag.start.y),
    );
  });
  function endDrag(event, cancel = false) {
    if (!drag || (event && drag.id !== event.pointerId)) return;
    if (cancel) {
      bounds = drag.before;
      anchor = drag.anchor;
      syncSize();
    }
    const id = drag.id;
    drag = null;
    if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
    render();
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", (event) => endDrag(event, true));
  svg.addEventListener("lostpointercapture", (event) => endDrag(event, true));
  svg.addEventListener("keydown", (event) => {
    const key = event.target.dataset.canvasHandle;
    if (
      !key ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    moveEdges(
      key,
      bounds,
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
    );
    render();
  });
  const observer = new ResizeObserver(() => render(!drag));
  observer.observe(svg);
  render();
  return {
    read: () => ({ ...bounds }),
    dispose: () => {
      endDrag(null, true);
      observer.disconnect();
    },
  };
}
