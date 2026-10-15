import { esc } from "./core.js";
import { icon } from "./icons.js";

// Expansion is workspace UI state, so it does not dirty or change the drawing.
const expansion = new WeakMap();

function activeAncestors(layers, activeId, ancestors = []) {
  for (const layer of layers || []) {
    if (layer.id === activeId) return ancestors;
    const found = activeAncestors(layer.children, activeId, [
      ...ancestors,
      layer.id,
    ]);
    if (found) return found;
  }
  return null;
}

function expansionFor(doc) {
  let state = expansion.get(doc);
  if (!state) {
    state = { expanded: new Set(), activeId: undefined };
    expansion.set(doc, state);
  }
  // Reveal a newly chosen drawing layer, while still allowing the artist to
  // collapse its parent manually until the drawing target changes again.
  if (state.activeId !== doc.activeLayer) {
    for (const id of activeAncestors(doc.layers, doc.activeLayer) || [])
      state.expanded.add(id);
    state.activeId = doc.activeLayer;
  }
  return state;
}

export function setLayerExpanded(doc, id, expanded) {
  const state = expansionFor(doc);
  if (expanded) state.expanded.add(id);
  else state.expanded.delete(id);
  return !!expanded;
}

export function toggleLayerExpanded(doc, id) {
  return setLayerExpanded(doc, id, !expansionFor(doc).expanded.has(id));
}

export function layerMarkup(doc) {
  if (!doc) return "";
  const { expanded } = expansionFor(doc);
  function rows(
    layers,
    depth = 0,
    parentId = "",
    parentHidden = false,
    parentLocked = false,
  ) {
    return [...(layers || [])]
      .reverse()
      .map((layer) => {
        const id = esc(layer.id),
          name = esc(layer.name || "Layer");
        const children = layer.children || [];
        const open = children.length > 0 && expanded.has(layer.id);
        const active = layer.id === doc.activeLayer;
        const hidden = parentHidden || layer.visible === false;
        const locked = parentLocked || !!layer.locked;
        const visibilityHelp = `${layer.visible === false ? "Show" : "Hide"} ${name}${parentHidden ? " (parent layer is hidden)" : ""}`;
        const lockHelp = `${layer.locked ? "Unlock" : "Lock"} ${name}${parentLocked ? " (parent layer is locked)" : ""}`;
        const row = `<div class="layer-row${active ? " active" : ""}${hidden ? " layer-hidden" : ""}" data-layer-row="${id}" data-layer-parent="${esc(parentId)}" data-layer-depth="${depth}" style="--layer-depth:${depth}" role="treeitem" aria-level="${depth + 1}" aria-selected="${active}"${children.length ? ` aria-expanded="${open}"` : ""}>
        ${children.length ? `<button class="layer-expand" data-layer-expand="${id}" aria-label="${open ? "Collapse" : "Expand"} ${name}" title="${open ? "Collapse" : "Expand"} ${name}" aria-expanded="${open}">${icon(open ? "minus" : "plus", 12)}</button>` : '<span class="layer-expand-spacer" aria-hidden="true"></span>'}
        <button class="layer-name" draggable="true" data-layer-select="${id}" title="${name}${active ? " — current drawing layer" : " — click to draw on this layer"}${locked ? "; locked" : ""}. Double-click for properties; drag to move."${active ? ' aria-current="true"' : ""}>${icon("layers", 14)}<span>${name}</span></button>
        <button class="layer-visibility" data-layer-visible="${id}" title="${visibilityHelp}" aria-label="${visibilityHelp}" aria-pressed="${layer.visible !== false}">${icon(layer.visible === false ? "hidden" : "eye", 14)}</button>
        <button class="layer-lock" data-layer-lock="${id}" title="${lockHelp}" aria-label="${lockHelp}" aria-pressed="${!!layer.locked}">${icon(layer.locked ? "lock" : "unlock", 14)}</button>
      </div>`;
        return (
          row +
          (open ? rows(children, depth + 1, layer.id, hidden, locked) : "")
        );
      })
      .join("");
  }
  return rows(doc.layers);
}
