import { namespaceMarkup } from "./core.js";
import { icon } from "./icons.js";

export function createArtworkPreview(desktop, currentDocument, artworkSvg) {
  const panel = document.createElement("section");
  panel.id = "artwork-preview";
  panel.className = "artwork-preview";
  panel.setAttribute("aria-label", "Artwork preview");
  panel.hidden = true;
  panel.innerHTML = `<div class="mdi-title preview-title"><span class="preview-caption">Preview</span><div class="mdi-title-controls"><button type="button" aria-label="Close preview">${icon("close")}</button></div></div><div class="preview-controls"><label>Scale <select aria-label="Preview scale"><option value="0.25">25%</option><option value="0.5">50%</option><option value="1" selected>100%</option><option value="2">200%</option></select></label><span class="preview-size"></span></div><div class="preview-viewport"></div>`;
  desktop.append(panel);
  const viewport = panel.querySelector(".preview-viewport"),
    scaleControl = panel.querySelector("select");
  let timer,
    scale = 1,
    dragging,
    rendering = false,
    again = false,
    worker,
    sequence = 0;
  const requests = new Map();
  function finishLayer(layer, strokeId) {
    if (!worker) {
      worker = new Worker(new URL("./paint-worker.js", import.meta.url));
      worker.onmessage = ({ data }) => {
        const pending = requests.get(data.id);
        if (!pending) return;
        requests.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.layer);
      };
      worker.onerror = () => {
        for (const pending of requests.values())
          pending.reject(new Error("Preview worker unavailable."));
        requests.clear();
        worker.terminate();
        worker = null;
      };
    }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      requests.set(id, { resolve, reject });
      worker.postMessage({ id, layer, strokeId });
    });
  }
  async function render() {
    timer = null;
    if (panel.hidden) return;
    if (rendering) {
      again = true;
      return;
    }
    const doc = currentDocument();
    if (!doc) {
      viewport.replaceChildren();
      panel.querySelector(".preview-caption").textContent = "Preview";
      panel.querySelector(".preview-size").textContent = "";
      return;
    }
    rendering = true;
    try {
      const source = await artworkSvg(doc);
      if (panel.hidden || currentDocument()?.id !== doc.id) return;
      panel.querySelector(".preview-caption").textContent =
        `Preview — ${doc.name}`;
      panel.querySelector(".preview-size").textContent =
        `${doc.width} × ${doc.height}`;
      // Inline SVG keeps vector rendering and works offline under the desktop CSP.
      const xml = new DOMParser().parseFromString(source, "image/svg+xml");
      const svg = xml.documentElement;
      if (svg.localName !== "svg") return;
      const container = document.createElement("div");
      container.innerHTML = namespaceMarkup(
        new XMLSerializer().serializeToString(svg),
        `preview-${doc.id}`,
      );
      const image = container.firstElementChild;
      image.removeAttribute("preserveAspectRatio");
      image.setAttribute("width", doc.width * scale);
      image.setAttribute("height", doc.height * scale);
      image.setAttribute("aria-label", `Preview of ${doc.name}`);
      image.style.pointerEvents = "none";
      viewport.replaceChildren(image);
    } catch {
      panel.querySelector(".preview-size").textContent = "Updating…";
    } finally {
      rendering = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }
  function schedule() {
    if (!panel.hidden && !timer) timer = setTimeout(render, 100);
  }
  function toggle() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
    else {
      clearTimeout(timer);
      timer = null;
    }
  }
  panel.querySelector("button").addEventListener("click", toggle);
  scaleControl.addEventListener("change", () => {
    scale = Number(scaleControl.value);
    render();
  });
  const title = panel.querySelector(".preview-title");
  title.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const box = panel.getBoundingClientRect(),
      parent = desktop.getBoundingClientRect();
    dragging = {
      x: event.clientX,
      y: event.clientY,
      left: box.left - parent.left,
      top: box.top - parent.top,
    };
    title.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  title.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    panel.style.left = `${Math.max(0, Math.min(desktop.clientWidth - 80, dragging.left + event.clientX - dragging.x))}px`;
    panel.style.top = `${Math.max(0, Math.min(desktop.clientHeight - 24, dragging.top + event.clientY - dragging.y))}px`;
    panel.style.right = "auto";
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    title.addEventListener(name, () => {
      dragging = null;
    });
  return {
    schedule,
    finishLayer,
    toggle,
    get visible() {
      return !panel.hidden;
    },
  };
}
