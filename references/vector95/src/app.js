import {
  uid,
  clone,
  clamp,
  esc,
  pressureValue,
  brushRadius,
  strokeOutline,
  pencilPath,
  bezierPath,
  makeDocument,
  makeElement,
  resizeCanvas,
  checkpoint,
  snapshot,
  undo,
  redo,
  layersMarkup,
  namespaceMarkup,
  exportSvg,
  elementMarkup,
} from "./core.js";
import {
  drawingModes,
  modesEnabled,
  tiled,
  tileOffsets,
  transformPoint,
  repeatInstances,
} from "./drawing-modes.js";
import {
  entries,
  walkElements,
  findEntry,
  containers,
  scopedElements,
  scopeHit,
  validateExportId,
  renameExportId,
  allLayers,
  layerEntries,
  findLayer,
  migrateLayers,
  parentMatrix,
  elementMatrix,
  multiply,
  inverse,
  identity,
  prependMatrix,
  detachToWorld,
} from "./hierarchy.js";
import {
  layerMarkup,
  toggleLayerExpanded,
  setLayerExpanded,
} from "./layer-ui.js";
import {
  newLayer,
  layerWorldMatrix,
  moveLayer,
  selectionToLayer,
  flattenLayer,
} from "./layer-ops.js";
import { icon } from "./icons.js";
import { canvasDialogFields, attachCanvasPreview } from "./canvas-dialog.js";
import {
  classicColors as palette,
  paletteChoices,
  populatePaletteSelect,
} from "./palettes.js";
import { createMenus } from "./menus.js";
import { resizeOrigin, transformFeedback } from "./transform-feedback.js";
import { createStatusHelp } from "./status-help.js";
import {
  createBindings,
  gestureDefinitions,
  combineSelection,
  bindingErrors,
  bindingOverrides,
} from "./input-bindings.js";
import { preferencesFields, attachPreferences } from "./input-preferences.js";
import { createArtworkPreview } from "./artwork-preview.js";
import { botanical, sketchbook } from "./demos.js";
import { importSvg } from "./svg-io.js";
import { VECTOR95_VERSION } from "./svg-format.js";
import { createPaintEngine, isPaintFill } from "./paint.js";
import { sliceElement } from "./sculpt.js";
import { createSpringTools } from "./spring-tools.js";
import { BrushPreview, RepeatBrushPreview } from "./brush-preview.js";
import { patchPaintLayers } from "./paint-queue.js";
import { createSeamRenderer } from "./seam-renderer.js";
import { nodeOverlay } from "./node-overlay.js";
import { LayerReplica } from "./layer-replica.js";
import { SculptClient } from "./sculpt-client.js";
import { GPUViewport } from "./gpu-viewport.js";
import { curveBounds } from "./curve-bounds.js";
const modulesReadyMs = performance.now();
const startupCheckpoints = [];
const startupCheckpoint = (name) =>
  startupCheckpoints.push({ name, elapsedMs: performance.now() });
startupCheckpoint("modules-ready");
const gpuViewports = new Map();
import {
  snapCoordinate,
  wholePixelBounds,
  artworkBounds,
} from "./precision.js";
import {
  createCurveEditor,
  canConvertToCurves,
  refreshCurve,
  nextNode,
  insertCurveNode,
  deleteCurveNode,
  setNodeKind,
  moveCurveHandle,
  rotateElements,
} from "./curves.js";
import { createCurvePreview } from "./curve-commands.js";
const curveEditor = createCurveEditor(globalThis.paper);
startupCheckpoint("curve-editor-created");
let activeNode = null;
let lockAspect = false;
let transformHover = null;
import { solidColor, documentColors, sampleArtworkColor } from "./colors.js";
import { colorDialogFields, attachColorPicker } from "./color-dialog.js";
import {
  textDialogFields,
  readTextFields,
  attachTextPreview,
  attachFontPicker,
  movableTextDialog,
} from "./text-dialog.js";
import { rememberFont } from "./fonts.js";
import { editTextAttrs, changedTextFields } from "./text-layout.js";
import { canAttachText, attachTextPath, detachTextPath } from "./text-path.js";
import { outlineText } from "./text-outline.js";
let textPreviewSession = null;
const paintEngine = createPaintEngine(globalThis.paper);
startupCheckpoint("paint-engine-created");
const isPaintArtwork = isPaintFill;
const previews = new Map(),
  paintQueues = new Map(),
  workerRequests = new Map();
const paintMetrics = [];
const floatingSelections = new Map();
const boundsCache = new WeakMap();
// DOM nodes are replaced on redraw; geometry survives until its shape or world
// transform changes, including transforms inherited from ancestor layers.
const geometryBoundsCache = new WeakMap();
const smoothSessions = new WeakMap();
let sculptClient = new SculptClient(
  new Worker(new URL("./sculpt-worker.js", import.meta.url)),
);
const denseNodeOverlays = new Map();
const retainedGestures = new WeakMap();
const seamRefresh = new Set();
const seamRenderer = createSeamRenderer(
  new Worker(new URL("./seam-worker.js", import.meta.url)),
  {
    deferred: (doc) =>
      state.interaction?.docId === doc.id || paintQueues.has(doc.id),
    changed: (doc) => {
      if (state.interaction?.docId === doc.id || seamRefresh.has(doc)) return;
      seamRefresh.add(doc);
      requestAnimationFrame(() => {
        seamRefresh.delete(doc);
        if (
          state.documents.includes(doc) &&
          state.interaction?.docId !== doc.id
        )
          renderStage(doc);
      });
    },
  },
);
function liftSelection(doc) {
  const modes = drawingModes(doc);
  if (tiled(modes)) {
    for (const el of selected(doc).filter(isPaintFill)) {
      el.repeat = {
        modes: { ...modes, mirrorX: false, mirrorY: false },
        width: doc.width,
        height: doc.height,
        parent: parentMatrix(doc, el.id),
      };
    }
  }
  const ids = [
    ...new Set([
      ...(floatingSelections.get(doc.id)?.ids || []),
      ...doc.selected.filter(
        (id) => editable(doc, id) && isPaintFill(findElement(doc, id)),
      ),
    ]),
  ];
  if (ids.length)
    floatingSelections.set(doc.id, { ...floatingSelections.get(doc.id), ids });
}
function completeSelection(doc, place = false) {
  const floating = floatingSelections.get(doc?.id);
  if (!floating?.ids.length) return;
  if (floating.pending && !place) return;
  floatingSelections.delete(doc.id);
  queuePaint(doc, { selectionIds: floating.ids });
}
function placeCopy(doc) {
  if (!floatingSelections.get(doc.id)?.pending) return;
  checkpoint(doc);
  completeSelection(doc, true);
  changed(doc, "Copy placed.");
}
const paintWorker = new Worker(new URL("./paint-worker.js", import.meta.url));
startupCheckpoint("geometry-workers-created");
const paintReplicas = new Map();
let requestId = 0;
let workerFailure = null;
paintWorker.onmessage = ({ data }) => {
  const request = workerRequests.get(data.id);
  if (!request) return;
  if (data.progress) {
    request.progress?.(data.progress);
    return;
  }
  workerRequests.delete(data.id);
  if (data.error) {
    if (request.key) {
      paintReplicas.delete(request.key);
      paintWorker.postMessage({ forget: [request.key] });
    }
    request.reject(new Error(data.error));
  } else {
    try {
      if (data.delta) data.layer = request.replica.apply(data.delta);
      request.resolve(data);
    } catch (error) {
      request.reject(error);
    }
  }
};
paintWorker.onerror = (event) => {
  workerFailure = new Error(event.message || "Paint worker unavailable");
  for (const request of workerRequests.values()) request.reject(workerFailure);
  workerRequests.clear();
};
function workerPaint(layer, operation) {
  return new Promise((resolve, reject) => {
    if (workerFailure) {
      reject(workerFailure);
      return;
    }
    const id = ++requestId;
    const { onProgress, ...payload } = operation;
    let replica;
    if (layer) {
      replica = paintReplicas.get(layer.id);
      if (!replica) paintReplicas.set(layer.id, (replica = new LayerReplica()));
      replica.docId ||= state.documents.find((doc) =>
        findLayer(doc, layer.id),
      )?.id;
    }
    workerRequests.set(id, {
      resolve,
      reject,
      progress: onProgress,
      replica,
      key: layer?.id,
    });
    try {
      paintWorker.postMessage({
        id,
        ...(replica
          ? { key: layer.id, delta: replica.encode(layer) }
          : { layer }),
        ...payload,
      });
    } catch (error) {
      workerRequests.delete(id);
      if (layer) {
        paintReplicas.delete(layer.id);
        paintWorker.postMessage({ forget: [layer.id] });
      }
      reject(error);
    }
  });
}
function waitForPaint(doc) {
  return (async () => {
    let task;
    while ((task = paintQueues.get(doc?.id))) await task;
  })();
}
const pendingPaint = new Set();
function bucketFill(doc, point, fill = state.fill) {
  const layerId = doc.activeLayer,
    opacity = state.opacity,
    visibleBoundaries = state.bucketVisible;
  if (fill !== "none" && opacity <= 0) {
    setStatus("Choose a visible colour to fill an area.");
    return;
  }
  setStatus("Filling connected area…");
  queueMutation(doc, async () => {
    const layer = findLayer(doc, layerId);
    if (!layer || !layerEditable(doc, layerId)) return;
    const owner = layerEntries(doc).find((entry) => entry.layer.id === layerId);
    if (
      [...owner.ancestors, layer].some(
        (l) =>
          l.attrs?.["clip-path"] ||
          l.attrs?.mask ||
          (l.wrappers || []).some((w) => w["clip-path"] || w.mask),
      )
    )
      throw new Error("Paint Bucket cannot fill clipped or masked layers.");
    const matrix = inverse(layerWorldMatrix(doc, layerId)),
      artboard = makeElement("rect", {
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
        fill: "#000000",
      });
    artboard.matrix = matrix;
    let boundaryElements;
    if (visibleBoundaries) {
      boundaryElements = [];
      const collect = (siblings) => {
        for (const candidate of siblings) {
          const entry = layerEntries(doc).find(
            (e) => e.layer.id === candidate.id,
          );
          if (!entry.visible) continue;
          const chain = [...entry.ancestors, candidate];
          if (
            chain.some(
              (l) =>
                l.attrs?.["clip-path"] ||
                l.attrs?.mask ||
                (l.wrappers || []).some((w) => w["clip-path"] || w.mask),
            )
          )
            throw new Error(
              "Paint Bucket cannot use clipped or masked boundary layers.",
            );
          const alpha = chain.reduce(
            (a, l) =>
              a * Number(l.opacity ?? 1) * Number(l.attrs?.opacity ?? 1),
            1,
          );
          if (alpha <= 0) continue;
          collect(candidate.children || []);
          for (const original of candidate.elements) {
            const el = clone(original);
            prependMatrix(
              el,
              multiply(matrix, layerWorldMatrix(doc, candidate.id)),
            );
            el.attrs.opacity = Number(el.attrs.opacity ?? 1) * alpha;
            boundaryElements.push(el);
          }
        }
      };
      collect(doc.layers);
    }
    const response = await workerPaint(layer, {
      floodFill: {
        point: {
          x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
          y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
        },
        artboard,
        fill,
        opacity,
        boundaryElements,
      },
    });
    paintMetrics.push({
      tool: "bucket",
      samples: 0,
      duration: response.duration,
      backend: response.backend,
    });
    if (paintMetrics.length > 30) paintMetrics.shift();
    if (!response.result.filled) {
      setStatus(
        "No fill needed here. Click an area inside the artboard, away from its outline.",
      );
      return;
    }
    checkpoint(doc);
    layer.elements = response.layer.elements;
    doc.selected = [];
    changed(
      doc,
      `Connected area ${fill === "none" ? "cleared" : "filled"} on ${layer.name}.`,
    );
  });
}
const deferredPointers = new Map();
const interactionWaiters = new Set();
async function waitForLiveInteraction() {
  while (state.interaction)
    await new Promise((resolve) => interactionWaiters.add(resolve));
}
const queuedMutations = new Map();
const paintAliases = new Map();
function resolvedIds(doc, ids) {
  const aliases = paintAliases.get(doc.id);
  return [
    ...new Set(
      ids.map((id) => {
        const seen = new Set();
        while (!findElement(doc, id) && aliases?.has(id) && !seen.has(id)) {
          seen.add(id);
          id = aliases.get(id);
        }
        return id;
      }),
    ),
  ];
}
function pointerSnapshot(event, doc) {
  const keys = [
    "type",
    "button",
    "buttons",
    "pointerId",
    "pointerType",
    "pressure",
    "altKey",
    "ctrlKey",
    "metaKey",
    "shiftKey",
  ];
  return {
    ...Object.fromEntries(keys.map((key) => [key, event[key]])),
    heldKeys: inputBindings.heldKeys(),
    world: worldPoint(event, doc, false, true),
    elementId: hitElement(event, doc),
    handle: event.target.closest("[data-handle]")?.dataset.handle,
    node: event.target.closest("[data-node]")
      ? { ...event.target.closest("[data-node]").dataset }
      : null,
  };
}
function replayPointer(sample, doc) {
  const stage = windows.get(doc.id).querySelector(".stage"),
    rect = stage.getBoundingClientRect(),
    box = viewBox(doc),
    elementId = resolvedIds(doc, [sample.elementId])[0];
  return {
    ...sample,
    clientX: rect.left + (sample.world.x - box.x) * doc.zoom,
    clientY: rect.top + (sample.world.y - box.y) * doc.zoom,
    replayedElementId: elementId,
    target:
      (sample.handle &&
        stage.querySelector(`[data-handle="${sample.handle}"]`)) ||
      (sample.node &&
        stage.querySelector(
          `[data-node-element="${sample.node.nodeElement}"][data-node="${sample.node.node}"]`,
        )) ||
      stage.querySelector(`[data-element="${elementId}"]`) ||
      stage,
    preventDefault() {},
  };
}
let inlinePaint = null,
  replayingPointers = false;
let nudgeSequence = null;
const heldNudgeKeys = new Set();
function endNudgeSequence() {
  nudgeSequence = null;
  heldNudgeKeys.clear();
}
function nudgeGesture(doc, key, event) {
  const now = performance.now(),
    ids = [...doc.selected],
    sameSelection =
      nudgeSequence?.docId === doc.id &&
      JSON.stringify(resolvedIds(doc, nudgeSequence.ids).sort()) ===
        JSON.stringify(resolvedIds(doc, ids).sort()),
    continuous =
      sameSelection &&
      ((event.repeat && heldNudgeKeys.has(key)) ||
        now - nudgeSequence.lastInput < 300);
  if (!continuous) nudgeSequence = { docId: doc.id, ids, historyEntry: null };
  nudgeSequence.lastInput = now;
  heldNudgeKeys.add(key);
  return nudgeSequence;
}
function queueMutation(doc, mutate, ready = Promise.resolve()) {
  queuedMutations.set(doc.id, (queuedMutations.get(doc.id) || 0) + 1);
  const previous = paintQueues.get(doc.id) || Promise.resolve();
  const task = previous
    .then(async () => {
      await (typeof ready === "function" ? ready() : ready);
      const operations = [];
      inlinePaint = operations;
      let result;
      try {
        result = mutate();
      } finally {
        inlinePaint = null;
      }
      await result;
      for (const run of operations) await run();
    })
    .catch((error) => {
      console.error(error);
      toast(error.message);
    })
    .finally(() => {
      const count = queuedMutations.get(doc.id) - 1;
      if (count) queuedMutations.set(doc.id, count);
      else queuedMutations.delete(doc.id);
      if (paintQueues.get(doc.id) === task) paintQueues.delete(doc.id);
      seamRenderer.flush();
    });
  paintQueues.set(doc.id, task);
  return task;
}
function queueSelectionMutation(doc, ids, mutate) {
  return queueMutation(doc, async () => {
    const selection = doc.selected;
    const target = resolvedIds(doc, ids).filter((id) => editable(doc, id));
    const keepResult =
      JSON.stringify(resolvedIds(doc, selection)) === JSON.stringify(target);
    doc.selected = target;
    try {
      if (doc.selected.length) await mutate();
    } finally {
      if (!keepResult)
        doc.selected = selection.filter((id) => findElement(doc, id));
    }
    renderStage(doc);
    if (doc.id === state.activeId) renderInspector();
  });
}
function deferPointer(event, doc) {
  springTools?.use();
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  const styleKeys = [
    "tool",
    "fill",
    "stroke",
    "size",
    "opacity",
    "smoothing",
    "smoothStrength",
    "nudgeStrength",
    "pressure",
    "snap",
    "gridSize",
    "snapOffset",
    "space",
    "drawingStyle",
  ];
  const record = {
    events: [pointerSnapshot(event, doc)],
    doc,
    style: clone(Object.fromEntries(styleKeys.map((key) => [key, state[key]]))),
    release,
  };
  deferredPointers.set(event.pointerId, record);
  event.preventDefault();
  setStatus("Finishing paint… Your edit will follow when the paint is ready.");
  const stage = windows.get(doc.id).querySelector(".stage");
  stage.setPointerCapture(event.pointerId);
  queueMutation(
    doc,
    () => {
      const style = clone(
          Object.fromEntries(styleKeys.map((key) => [key, state[key]])),
        ),
        cursor = state.cursor;
      replayingPointers = true;
      Object.assign(state, record.style);
      let sculptFinished;
      try {
        pointerDown(replayPointer(record.events[0], doc), doc);
        sculptFinished = smoothSessions.get(state.interaction)?.finished;
        for (const sample of record.events.slice(1)) {
          const event = replayPointer(sample, doc);
          if (sample.type === "pointermove") pointerMove(event, doc);
          else pointerEnd(event, doc, sample.type !== "pointerup");
        }
      } finally {
        Object.assign(state, style);
        state.cursor = cursor;
        replayingPointers = false;
        renderInspector();
        springTools?.flush();
      }
      return sculptFinished;
    },
    async () => {
      await ready;
      await waitForLiveInteraction();
    },
  );
}
function queuePaint(doc, operation) {
  if (typeof operation === "string") operation = { strokeId: operation };
  // Earlier results update later gesture snapshots before they reach the worker.
  const entry = {
    docId: doc.id,
    source: snapshot(doc),
    history: new Set(doc.history),
  };
  pendingPaint.add(entry);
  const run = async () => {
    const source = entry.source;
    const layers = containers(source).filter((layer) =>
      layer.elements.some((el) =>
        operation.strokeId
          ? el.id === operation.strokeId
          : operation.selectionIds.includes(el.id),
      ),
    );
    const responses = [];
    // Finish every affected layer before applying the transaction.
    for (const layer of layers)
      responses.push(
        await workerPaint(
          {
            id: layer.id,
            visible: true,
            locked: false,
            elements: layer.elements,
          },
          operation,
        ),
      );
    const result = clone(source);
    for (const container of containers(result)) {
      const response = responses.find((item) => item.layer.id === container.id);
      if (response) container.elements = response.layer.elements;
    }
    const patch = (target) =>
      patchPaintLayers(
        target,
        source,
        result,
        operation.strokeId ? [operation.strokeId] : operation.selectionIds,
      );
    patch(doc);
    const aliases = paintAliases.get(doc.id) || new Map();
    for (const response of responses)
      for (const [from, to] of Object.entries(response.result.aliases || {}))
        aliases.set(from, to);
    paintAliases.set(doc.id, aliases);
    doc.history.filter((item) => !entry.history.has(item)).forEach(patch);
    for (const pending of pendingPaint)
      if (pending !== entry && pending.docId === doc.id) patch(pending.source);
    if (state.interaction?.docId === doc.id && state.interaction.before)
      patch(state.interaction.before);
    previews.get(operation.strokeId)?.remove();
    previews.delete(operation.strokeId);
    doc.selected = resolvedIds(doc, doc.selected).filter((id) =>
      findElement(doc, id),
    );
    paintMetrics.push({
      samples:
        source.layers
          .flatMap((layer) => layer.elements)
          .find((el) => el.id === operation.strokeId)?.points?.length || 0,
      duration: responses.reduce((total, item) => total + item.duration, 0),
      backend: responses.every((item) => item.backend === "wasm")
        ? "wasm"
        : "paper",
    });
    if (paintMetrics.length > 30) paintMetrics.shift();
    renderStage(doc);
    updateDocChrome(doc);
    if (!state.interaction) renderInspector();
    autosave();
    if (!state.interaction && doc.id === state.activeId) {
      const merged = responses.reduce(
          (total, item) => total + item.result.merged,
          0,
        ),
        cut = responses.reduce((total, item) => total + item.result.cut, 0);
      const erasedLines = responses.reduce(
        (total, item) => total + (item.result.erasedLines || 0),
        0,
      );
      const outlinedLines = responses.reduce(
        (total, item) => total + (item.result.outlinedLines || 0),
        0,
      );
      const warnings = [
        ...new Set(responses.flatMap((item) => item.result.warnings || [])),
      ];
      setStatus(
        responses.some((item) => item.result.erased)
          ? `Erased ${cut} paint region${cut === 1 ? "" : "s"}${erasedLines ? ` and ${erasedLines} line${erasedLines === 1 ? "" : "s"}` : ""} on this layer.${outlinedLines ? " Cut lines now use editable outline boundaries." : ""}${warnings.length ? ` ${warnings.join(" ")}` : ""}`
          : merged || cut
            ? `Paint applied. ${[merged && `${merged} region${merged === 1 ? "" : "s"} joined`, cut && `${cut} region${cut === 1 ? "" : "s"} cut`].filter(Boolean).join(", ")}.`
            : "Paint applied.",
      );
      if (warnings.length) toast(warnings.join(" "));
    }
  };
  const recover = (error) => {
    const failed = findElement(doc, operation.strokeId);
    // Recovery never performs booleans on the input thread.
    if (failed?.erase) {
      const before = snapshot(doc),
        after = clone(before);
      for (const layer of containers(after))
        layer.elements = layer.elements.filter((el) => el.id !== failed.id);
      const recover = (target) =>
        patchPaintLayers(target, before, after, [failed.id]);
      recover(doc);
      doc.history.filter((item) => !entry.history.has(item)).forEach(recover);
      for (const pending of pendingPaint)
        if (pending !== entry && pending.docId === doc.id)
          recover(pending.source);
      if (state.interaction?.docId === doc.id && state.interaction.before)
        recover(state.interaction.before);
    } else if (failed) {
      const before = snapshot(doc),
        after = clone(before);
      for (const layer of containers(after))
        for (const el of layer.elements)
          if (el.id === failed.id) delete el.erase;
      const recover = (target) =>
        patchPaintLayers(target, before, after, [failed.id]);
      recover(doc);
      doc.history.filter((item) => !entry.history.has(item)).forEach(recover);
      for (const pending of pendingPaint)
        if (pending !== entry && pending.docId === doc.id)
          recover(pending.source);
      if (state.interaction?.docId === doc.id && state.interaction.before)
        recover(state.interaction.before);
    }
    previews.get(operation.strokeId)?.remove();
    previews.delete(operation.strokeId);
    renderStage(doc);
    toast(
      failed?.erase
        ? "The eraser could not finish. Your paint was kept."
        : "Paint could not join. Your artwork was kept as separate objects.",
    );
    console.error("Background paint failed", error);
  };
  const execute = () =>
    run()
      .catch(recover)
      .finally(() => pendingPaint.delete(entry));
  if (inlinePaint) {
    inlinePaint.push(execute);
    return;
  }
  const previous = paintQueues.get(doc.id) || Promise.resolve();
  const task = previous.then(execute).finally(() => {
    if (paintQueues.get(doc.id) === task) paintQueues.delete(doc.id);
    seamRenderer.flush();
  });
  paintQueues.set(doc.id, task);
  return task;
}

const $ = (selector) => document.querySelector(selector);
const desktop = $("#desktop");
const tools = [
  [
    "select",
    "Selection",
    "V, M",
    "Move and resize objects. Modifiers add, subtract or intersect selections.",
  ],
  [
    "node",
    "Node Edit",
    "A",
    "Select an anchor to reshape curves. Convert shapes with Convert to Curves.",
  ],
  [
    "brush",
    "Brush",
    "B",
    "Left paints Primary; right paints Secondary. None erases paint and lines.",
  ],
  ["pencil", "Pencil", "Y", "Sketch a clean, constant-width vector line."],
  [
    "smooth",
    "Smooth",
    "S",
    "Left-drag softens bumps; right-drag sharpens existing detail. Selection limits the edit.",
  ],
  [
    "nudge",
    "Nudge",
    "N",
    "Push lines and filled contours. Size sets the area; Strength sets how far they follow your drag. Selection limits the edit.",
  ],
  [
    "slice",
    "Slice",
    "K",
    "Cut paint and lines. Set Size to 0 to split lines without removing any length.",
  ],
  ["pen", "Pen", "P", "Click for corners. Drag for curves. Enter to finish."],
  [
    "eraser",
    "Eraser",
    "E",
    "Erase paint and lines on the active layer. Text stays intact.",
  ],
  [
    "bucket",
    "Paint Bucket",
    "G",
    "Left fills with Primary; right fills with Secondary. None clears connected paint.",
  ],
  ["rect", "Rectangle", "U", "Drag a rectangle. Hold Shift for a square."],
  [
    "ellipse",
    "Ellipse",
    "Shift+U",
    "Drag an ellipse. Hold Shift for a circle.",
  ],
  ["line", "Line", "L", "Draw a line. Hold Shift for 45° increments."],
  ["text", "Text", "T", "Click the artboard to add editable text."],
  [
    "eyedropper",
    "Eyedropper",
    "I",
    "Pick a colour from artwork. Shift picks the outline. Alt-click with Brush or Pencil to pick temporarily.",
  ],
  ["hand", "Hand", "H", "Drag to move around your drawing."],
  ["zoom", "Zoom", "Z", "Click to zoom in. Alt-click to zoom out."],
];
const state = {
  documents: [],
  activeId: null,
  tool: "brush",
  fill: "#000000",
  stroke: "none",
  size: 12,
  opacity: 1,
  smoothing: 35,
  smoothStrength: 35,
  nudgeStrength: 25,
  pressure: true,
  grid: false,
  snap: false,
  gridSize: 1,
  snapOffset: 0,
  nudgeSize: 1,
  z: 2,
  mdiMaximized: false,
  interaction: null,
  space: false,
  clipboard: [],
  clipboardLayers: {},
  clipboardDocument: null,
  drawingStyle: null,
  pen: null,
  cursor: null,
  recentColors: [],
  paintInside: false,
  bucketVisible: false,
};
const windows = new Map();
const rememberedSelections = new WeakMap();
const strokeEndpoints = new WeakMap();
function setSelection(doc, ids) {
  if (doc.selected.length) rememberedSelections.set(doc, [...doc.selected]);
  doc.selected = [...new Set(ids)].filter((id) => editable(doc, id));
}
let recoveryTimer, toastTimer;
const active = () => state.documents.find((doc) => doc.id === state.activeId);
const activeLayer = (doc) => findLayer(doc, doc.activeLayer) || doc.layers[0];
const allElements = (doc) => entries(doc).map((entry) => entry.element);
const selected = (doc) =>
  doc.selected.length === 1
    ? [findElement(doc, doc.selected[0])].filter(Boolean)
    : allElements(doc).filter((el) => doc.selected.includes(el.id));
const findElement = (doc, id) => findEntry(doc, id)?.element;
const layerEditable = (doc, id) => {
  const entry = layerEntries(doc).find((e) => e.layer.id === id);
  return (
    !!entry &&
    [...entry.ancestors, entry.layer].every(
      (l) => l.visible !== false && !l.locked,
    )
  );
};
const editable = (doc, id) => {
  const entry = findEntry(doc, id);
  return !!entry && layerEditable(doc, entry.layer.id);
};
const hasParentTransform = (doc, id) =>
  parentMatrix(doc, id).some((n, i) => n !== identity[i]);
function transformWorld(doc, el, matrix, original = el) {
  const parent = parentMatrix(doc, el.id);
  const start = clone(original);
  // Each pointer move starts from the same geometry, including absent fields.
  // Retaining a matrix added by the previous move compounds the transform.
  for (const key of ["matrix", "wrappers"]) delete el[key];
  Object.assign(el, start);
  prependMatrix(el, multiply(multiply(inverse(parent), matrix), parent));
}
function translateWorld(doc, el, dx, dy, original = el) {
  const m = inverse(parentMatrix(doc, el.id));
  el.tx = original.tx + m[0] * dx + m[2] * dy;
  el.ty = original.ty + m[1] * dx + m[3] * dy;
}
function rotateSelection(doc, originals, center, degrees) {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (const original of originals) {
    const el = findElement(doc, original.id);
    if (!hasParentTransform(doc, el.id)) {
      rotateElements([el], [original], center, degrees);
      continue;
    }
    transformWorld(
      doc,
      el,
      [
        c,
        s,
        -s,
        c,
        center.x - c * center.x + s * center.y,
        center.y - s * center.x - c * center.y,
      ],
      original,
    );
    // Keep the inspector's rotation editable while the matrix preserves the
    // parent's scale and skew. Both forms describe the same local transform.
    el.rotation = original.rotation + degrees;
    const r = (-el.rotation * Math.PI) / 180;
    el.matrix = multiply(
      [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0],
      el.matrix,
    );
    el.wrappers[0].transform = `matrix(${el.matrix.join(" ")})`;
  }
}
function insertArtwork(doc, el) {
  const layer = activeLayer(doc);
  const m = layerWorldMatrix(doc, layer.id);
  if (m.some((n, i) => n !== identity[i])) prependMatrix(el, inverse(m));
  layer.elements.push(el);
}
function attachDrawingRepeat(doc, el) {
  const modes = drawingModes(doc);
  if (!modesEnabled(modes)) return;
  el.repeat = {
    modes,
    width: doc.width,
    height: doc.height,
    parent: layerWorldMatrix(doc, activeLayer(doc).id),
  };
}
function finishRepeatedLines(doc, el) {
  if (!el.repeat) return [el.id];
  const spec = el.repeat;
  const copies = repeatInstances({
    ...el,
    repeat: { ...spec, modes: { ...spec.modes, tileX: false, tileY: false } },
  }).map(({ element }, index) => {
    element.id = index ? uid() : el.id;
    if (index) delete element.svgId;
    if (tiled(spec.modes))
      element.repeat = {
        ...spec,
        modes: { ...spec.modes, mirrorX: false, mirrorY: false },
      };
    return element;
  });
  const layer = findEntry(doc, el.id).layer;
  layer.elements.splice(layer.elements.indexOf(el), 1, ...copies);
  return copies.map((copy) => copy.id);
}
const commandHelp = {
  "tile-mode":
    "Repeat the artboard along X, Y, or both axes and draw across its seams.",
  "symmetry-mode":
    "Mirror new drawing and erasing around draggable vertical or horizontal axes.",
  "symmetry-center": "Return the symmetry axes to the centre of this artboard.",
  "selection-layer": "Moves selected artwork to a new separate layer.",
  "select-layer": "Selects the active layer’s drawing contents.",
  "flatten-layer": "Combines visible sub-layers into the active paint sheet.",
  "layer-properties": "Changes the layer name, export ID, and opacity.",
  new: "Creates a drawing with the name and size you specify.",
  open: "Opens an SVG file in a drawing window.",
  save: "Saves the active drawing as an SVG file.",
  "save-as": "Saves the active drawing with a new name or location.",
  "export-svg": "Exports the drawing or selected artwork as an SVG file.",
  "document-setup":
    "Crop or expand the canvas without resizing artwork. Change the name and background.",
  "crop-selection":
    "Fits the canvas around selected artwork, including outlines. Keeps all artwork.",
  "close-doc": "Closes the active drawing.",
  undo: "Undoes the last change to the active drawing.",
  redo: "Repeats the last change you undid.",
  cut: "Removes selected artwork and places it on the clipboard.",
  copy: "Copies selected artwork to the clipboard.",
  paste: "Inserts artwork from the clipboard.",
  duplicate: "Creates a selected copy. Drag to place it, or press Enter.",
  delete: "Deletes selected artwork.",
  "select-all": "Selects editable artwork on the active layer.",
  deselect: "Clears the current selection.",
  reselect: "Restores the previous object selection.",
  "invert-selection":
    "Selects the unselected editable objects on the active layer.",
  preferences: "Customise keyboard shortcuts and canvas gestures.",
  "keyboard-settings": "Customise keyboard shortcuts and canvas gestures.",
  "command-search": "Find a command by name, menu location or shortcut.",
  preview: "Shows the active drawing at game size in a live preview window.",
  fit: "Fits the artboard in the drawing window.",
  "actual-size": "Displays the drawing at 100 percent.",
  "zoom-in": "Enlarges the drawing view.",
  "zoom-out": "Reduces the drawing view.",
  grid: "Shows or hides the drawing grid.",
  snap: "Aligns shapes and object movements with the grid.",
  "grid-settings":
    "Sets grid spacing, pixel alignment, and arrow-key movement.",
  fullscreen:
    "Displays the application in full screen or returns to the window.",
  "bring-front": "Moves selected artwork to the front of its layer.",
  "send-back": "Moves selected artwork to the back of its layer.",
  "flip-h": "Flips selected artwork horizontally.",
  "flip-v": "Flips selected artwork vertically.",
  "edit-text": "Changes the words, font, and size of selected text.",
  cascade: "Arranges drawing windows so their title bars remain visible.",
  "tile-vertical": "Arranges drawing windows in vertical columns.",
  "tile-horizontal": "Arranges drawing windows in horizontal rows.",
  "arrange-icons":
    "Arranges minimised drawings at the bottom of the workspace.",
  "next-doc": "Activates the next drawing window.",
  "previous-doc": "Activates the previous drawing window.",
  "close-all": "Closes all drawing windows.",
  "minimize-doc": "Minimises the active drawing window.",
  "maximize-doc": "Maximises or restores the active drawing window.",
  shortcuts: "Lists keyboard shortcuts for tools and commands.",
  "tablet-help": "Explains pen pressure and tablet input.",
  about: "Displays information about Vector 95.",
  "swap-colors": "Exchanges the primary and secondary colours for new artwork.",
  "add-layer": "Adds a layer to the active drawing.",
  "layer-up": "Moves the active layer up.",
  "layer-down": "Moves the active layer down.",
  "delete-layer": "Deletes the active layer and its artwork.",
  "convert-curves":
    "Turns selected shapes and paint into editable curves; keeps their fill and outline.",
  "node-add":
    "Adds an anchor halfway to the next node without changing the curve's shape.",
  "node-delete": "Deletes the selected anchor and joins its neighbours.",
  "node-corner": "Lets the selected anchor's two handles move independently.",
  "node-smooth": "Aligns the selected anchor's handles for a smooth join.",
  "align-left":
    "Aligns left edges within the selection; one object aligns to the artboard.",
  "align-center":
    "Centres horizontally within the selection; one object centres on the artboard.",
  "align-right":
    "Aligns right edges within the selection; one object aligns to the artboard.",
  "align-top":
    "Aligns top edges within the selection; one object aligns to the artboard.",
  "align-middle":
    "Centres vertically within the selection; one object centres on the artboard.",
  "align-bottom":
    "Aligns bottom edges within the selection; one object aligns to the artboard.",
  "app-minimize": "Minimises the application window.",
  "app-maximize": "Maximises or restores the application window.",
  "app-close": "Closes Vector 95.",
};
const toolHelp = {
  select: "Selects, moves, and resizes artwork.",
  node: "Edits curve anchors. Smooth handles stay aligned; Alt-drag makes a corner.",
  brush: "Paints filled strokes on the active layer.",
  pencil: "Draws lines with a constant width.",
  smooth:
    "Left smooths lines and filled contours. Right sharpens existing bumps. Size sets the area; Strength controls the effect.",
  pen: "Draws paths with straight and curved segments.",
  eraser: "Erases paint and lines on the active layer.",
  rect: "Draws rectangles and squares.",
  ellipse: "Draws ellipses and circles.",
  line: "Draws straight lines.",
  text: "Adds text to the drawing.",
  hand: "Moves the drawing view.",
  zoom: "Enlarges the drawing view; Alt-click reduces it.",
};
const statusHelp = createStatusHelp($("#status"), (button) => {
  if (!button) return "";
  if (button.dataset.tool) return toolHelp[button.dataset.tool] || "";
  const action = button.dataset.action || button.dataset.windowAction;
  if (action?.startsWith("open-recent:")) return `Opens ${button.title}.`;
  if (action?.startsWith("activate-document:") || button.dataset.documentTab)
    return "Activates this drawing window.";
  if (action?.startsWith("tile:")) return commandHelp["tile-mode"];
  if (action?.startsWith("symmetry:")) return commandHelp["symmetry-mode"];
  const windowActions = {
    minimize: "minimize-doc",
    maximize: "maximize-doc",
    close: "close-doc",
  };
  return commandHelp[windowActions[action] || action] || "";
});
const setStatus = (message) => {
  statusHelp.setMessage(message);
};
function toast(message) {
  setStatus(message);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2800);
}
function autosave() {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        "vector95-session-v1",
        JSON.stringify(
          state.documents.map((doc) => ({
            name: doc.name,
            svg: exportSvg(doc, { seams: false }),
            dirty: doc.dirty,
            window: doc.window,
            minimized: doc.minimized,
            maximized: doc.maximized,
            minimizedRect: doc.minimizedRect,
            floating: floatingSelections.get(doc.id)?.ids || [],
          })),
        ),
      );
    } catch {
      setStatus(
        "Session recovery storage is full. Save your drawings as SVG files.",
      );
    }
  }, 500);
}
function changed(doc, message) {
  doc.dirty = true;
  updateDocChrome(doc);
  renderStage(doc);
  renderInspector();
  autosave();
  if (message) setStatus(message);
}

document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
$("#tools").innerHTML = tools
  .map(
    ([id, name, key]) =>
      `<button class="tool-button ${id === state.tool ? "active" : ""}" data-tool="${id}" title="${name} (${key})" aria-label="${name}" aria-pressed="${id === state.tool}">${icon(id)}</button>`,
  )
  .join("");
const refreshPalettePreviews = populatePaletteSelect(
  $("#palette-source"),
  paletteChoices,
  $("#palette-source").value,
  (choice) => paletteColors(choice.id),
);
startupCheckpoint("icons-and-palettes-created");
// The selected name can wrap inside the narrow toolbox. The dropdown keeps
// its colour previews; they do not crowd the closed selector's label.
const paletteButton = document.createElement("button");
paletteButton.type = "button";
paletteButton.append(document.createElement("selectedcontent"));
$("#palette-source").prepend(paletteButton);
$("#swatches").innerHTML = palette
  .map(
    (color) =>
      `<button class="swatch" data-color="${color}" style="background-color:${color}" title="${color} · Left-click: primary · Right-click: secondary" aria-label="Primary ${color}"></button>`,
  )
  .join("");
let recentFiles = [];
async function refreshRecentFiles() {
  if (window.vector95Desktop?.recent)
    recentFiles = await window.vector95Desktop.recent();
}
function recentFileLabel(file) {
  if (file.length <= 64) return file;
  const name = file.split(/[\\/]/).pop();
  const prefix = file.slice(0, Math.max(3, 60 - name.length));
  const boundary = Math.max(prefix.lastIndexOf("\\"), prefix.lastIndexOf("/"));
  const folder = prefix.slice(0, boundary + 1);
  const shortName =
    name.length > 56 ? name.slice(0, 26) + "..." + name.slice(-27) : name;
  return `${folder}...\\${shortName}`;
}
const menuDefinitions = {
  File: () => [
    ["&New Drawing…", "new", "Ctrl+N"],
    ["&Open SVG…", "open", "Ctrl+O"],
    ["&Save", "save", "Ctrl+S"],
    ["Save &As…", "save-as", "Ctrl+Shift+S"],
    ["&Export SVG…", "export-svg", "Ctrl+Alt+Shift+S"],
    null,
    ["Document Set&up…", "document-setup", "C"],
    ["Crop to Se&lection", "crop-selection", ""],
    null,
    ["&Close Drawing", "close-doc", "Ctrl+W"],
    ...(recentFiles.length
      ? [
          null,
          ...recentFiles.map((file, index) => [
            `${index < 9 ? "&" : ""}${index + 1} ${recentFileLabel(file).replaceAll("&", "&&")}`,
            `open-recent:${index}`,
            "",
            file,
          ]),
        ]
      : []),
    ...(window.vector95Desktop ? [null, ["E&xit", "app-close", "Alt+F4"]] : []),
  ],
  Edit: [
    ["&Undo", "undo", "Ctrl+Z"],
    ["&Redo", "redo", "Ctrl+Shift+Z"],
    null,
    ["Cu&t", "cut", "Ctrl+X"],
    ["&Copy", "copy", "Ctrl+C"],
    ["&Paste", "paste", "Ctrl+V"],
    ["Dupl&icate", "duplicate", "Ctrl+Alt+D"],
    ["&Delete", "delete", "Del"],
    null,
    ["Select &All", "select-all", "Ctrl+A"],
    ["D&eselect", "deselect", "Ctrl+D, Escape"],
    ["Rese&lect", "reselect", "Ctrl+Shift+D"],
    ["In&vert Selection", "invert-selection", "Ctrl+Shift+I"],
    null,
    ["&Keyboard Shortcuts…", "keyboard-settings", "Ctrl+Alt+Shift+K"],
    ["Pre&ferences…", "preferences", "Ctrl+K"],
  ],
  View: [
    ["&Fit Artboard", "fit", "Ctrl+0"],
    ["&Actual Size", "actual-size", "1, Ctrl+1"],
    ["Zoom &In", "zoom-in", "Ctrl+Plus"],
    ["Zoom &Out", "zoom-out", "Ctrl+-"],
    ["&Preview", "preview", "F7"],
    null,
    ["&Grid", "grid", "Ctrl+'"],
    ["&Snap to Grid", "snap", "Shift+S"],
    ["Grid S&ettings…", "grid-settings", ""],
    null,
    [
      "&Tiled Mode",
      "tile-mode",
      "",
      "",
      [
        ["&None", "tile:off"],
        ["Tiled in &Both Axes", "tile:both"],
        ["Tiled in &X Axis", "tile:x"],
        ["Tiled in &Y Axis", "tile:y"],
      ],
    ],
    [
      "S&ymmetry Options",
      "symmetry-mode",
      "",
      "",
      [
        ["&None", "symmetry:off"],
        ["&Vertical Axis", "symmetry:x"],
        ["&Horizontal Axis", "symmetry:y"],
        ["&Both Axes", "symmetry:both"],
        null,
        ["&Centre Axes", "symmetry-center"],
      ],
    ],
    null,
    ["F&ull Screen", "fullscreen", "F11"],
  ],
  Layer: [
    ["&New Layer", "add-layer", "Shift+N"],
    ["&Selection to New Layer", "selection-layer", "Ctrl+Shift+J"],
    ["Select Layer &Contents", "select-layer", ""],
    ["&Flatten", "flatten-layer", "Ctrl+Alt+F"],
    ["Layer &Properties…", "layer-properties", "F2, Shift+P"],
    null,
    ["Move &Up", "layer-up", ""],
    ["Move &Down", "layer-down", ""],
    ["De&lete Layer", "delete-layer", ""],
  ],
  Arrange: [
    ["Bring to &Front", "bring-front", "]"],
    ["Send to &Back", "send-back", "["],
    ["Flip &Horizontally", "flip-h", "Shift+H"],
    ["Flip &Vertically", "flip-v", "Shift+V"],
    ["Convert to &Curves", "convert-curves", ""],
    null,
    ["Edit &Text…", "edit-text", ""],
    ["Convert Text to &Paths", "outline-text", ""],
    [
      "&Attach Text to Path",
      "attach-text-path",
      "",
      "Uses a copy of the selected curve as an editable text baseline.",
    ],
    ["&Edit Text Path", "edit-text-path", ""],
    ["&Detach Text from Path", "detach-text-path", ""],
  ],
  Window: () => [
    ["&Cascade Windows", "cascade", ""],
    ["Tile &Vertically", "tile-vertical", ""],
    ["Tile &Horizontally", "tile-horizontal", ""],
    ["&Arrange Icons", "arrange-icons", ""],
    null,
    ["&Next Window", "next-doc", "Ctrl+Tab"],
    ["&Previous Window", "previous-doc", "Ctrl+Shift+Tab"],
    ["Close A&ll Drawings", "close-all", "Ctrl+Shift+W"],
    ["&Minimise Drawing", "minimize-doc", ""],
    ["Ma&ximise / Restore Drawing", "maximize-doc", ""],
    null,
    ...state.documents.map((doc, index) => [
      `${index < 9 ? "&" : ""}${index + 1} ${doc.name.replaceAll("&", "&&")}`,
      `activate-document:${doc.id}`,
      "",
    ]),
  ],
  Help: [
    ["&Search Commands…", "command-search", "Ctrl+Space"],
    ["&Keyboard Shortcuts", "shortcuts", "?"],
    ["&Tablet && Pen Input", "tablet-help", ""],
    ["&Example Drawings…", "examples", ""],
    ["&About Vector 95", "about", ""],
  ],
};
const bindingDefinitions = tools.map(([id, label, binding]) => ({
  id: `tool:${id}`,
  label,
  binding,
  group: "Tools",
}));
function collectCommands(entries) {
  for (const entry of entries) {
    if (!entry) continue;
    const [label, id, shortcut = "", , children] = entry;
    if (children) {
      collectCommands(children);
      continue;
    }
    if (
      id.startsWith("activate-document:") ||
      id.startsWith("open-recent:") ||
      id.startsWith("app-")
    )
      continue;
    if (!bindingDefinitions.some((d) => d.id === id))
      bindingDefinitions.push({
        id,
        label: label
          .replace(/&&/g, "\u0000")
          .replace(/&/g, "")
          .replace(/\u0000/g, "&")
          .replace(/…$/, ""),
        binding: shortcut
          .replace(/\bEsc\b/g, "Escape")
          .replace(/\bDel\b/g, "Delete")
          .replace("−", "-")
          .replace(/^\+$/, "Plus"),
        group: "Commands",
      });
  }
}
for (const entries of Object.values(menuDefinitions))
  collectCommands(typeof entries === "function" ? entries() : entries);
for (const [id, binding] of [
  ["redo", "Ctrl+Y"],
  ["close-doc", "Ctrl+F4"],
  ["next-doc", "Ctrl+F6"],
  ["previous-doc", "Ctrl+Shift+F6"],
  ["zoom-in", "Ctrl+="],
])
  bindingDefinitions.find((d) => d.id === id).binding += `, ${binding}`;
bindingDefinitions.push(
  ...[
    ["finish", "Finish path / place copy", "Enter"],
    ["backstep", "Remove pen anchor / delete", "Backspace"],
    ["nudge-left", "Nudge left", "Arrowleft"],
    ["nudge-right", "Nudge right", "Arrowright"],
    ["nudge-up", "Nudge up", "Arrowup"],
    ["nudge-down", "Nudge down", "Arrowdown"],
    ["menu", "Activate menu", "F10"],
    ["swap-colors", "Swap colours", "X"],
    ["size-increase", "Increase brush size", "Plus, ="],
    ["size-decrease", "Decrease brush size", "-"],
  ].map(([id, label, binding]) => ({ id, label, binding, group: "Commands" })),
  ...gestureDefinitions,
);
for (const id of Object.keys(commandHelp)) {
  if (
    id.startsWith("app-") ||
    bindingDefinitions.some((d) => d.id === id) ||
    ["tile-mode", "symmetry-mode"].includes(id)
  )
    continue;
  bindingDefinitions.push({
    id,
    label: id
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" "),
    binding: "",
    group: "Commands",
  });
}
let savedBindings = {};
let legacyBindings = false;
startupCheckpoint("bindings-storage-start");
try {
  const current = localStorage.getItem("vector95-bindings-v2");
  legacyBindings = !current;
  savedBindings = JSON.parse(
    current || localStorage.getItem("vector95-bindings-v1") || "{}",
  );
} catch {}
startupCheckpoint("bindings-storage-end");
let inputBindings = createBindings(
  bindingDefinitions,
  bindingOverrides(bindingDefinitions, savedBindings, legacyBindings),
);
if (bindingErrors(bindingDefinitions, inputBindings.values).size)
  inputBindings = createBindings(bindingDefinitions);
if (legacyBindings && Object.keys(savedBindings || {}).length) {
  try {
    localStorage.setItem(
      "vector95-bindings-v2",
      JSON.stringify(
        bindingOverrides(bindingDefinitions, inputBindings.values),
      ),
    );
  } catch {}
}
const gesture = (id, event = {}) =>
  inputBindings.matches(`gesture:${id}`, event);
const artworkPreview = createArtworkPreview(desktop, active, async (doc) => {
  const draft = snapshot(doc);
  for (const layer of allLayers(draft)) {
    const strokes = layer.elements.filter((el) => el.brush || el.erase);
    for (const stroke of strokes) {
      const result = await artworkPreview.finishLayer(layer, stroke.id);
      layer.elements = result.elements;
    }
  }
  return exportSvg(draft, { plain: true });
});
function updateBindingLabels() {
  const hold = (id, description) => {
    const key = inputBindings.get(`gesture:${id}`);
    return key ? ` Hold ${key} to ${description}.` : "";
  };
  const finish = inputBindings.get("finish");
  const hints = {
    select: `Move, resize or rotate objects.${hold("copy-selection", "copy when you start dragging")}${hold("move-axis", "lock movement to one axis")}`,
    pen: `Click for corners. Drag for curves.${finish ? ` ${finish} to finish.` : ""}`,
    rect: `Drag a rectangle.${hold("constrain", "draw a square")}${hold("from-center", "draw from centre")}${hold("move-origin", "move its origin")}`,
    ellipse: `Drag an ellipse.${hold("constrain", "draw a circle")}${hold("from-center", "draw from centre")}${hold("move-origin", "move its origin")}`,
    line: `Draw a line.${hold("constrain", "snap to 45° increments")}`,
    eyedropper: `Pick a colour from artwork.${hold("sample-outline", "pick the outline")}${hold("sample", "sample temporarily with a painting tool")}`,
    zoom: `Click to zoom in.${hold("zoom-out", "zoom out")}`,
  };
  for (const tool of tools) if (hints[tool[0]]) tool[3] = hints[tool[0]];
  toolHelp.zoom = hints.zoom;
  toolHelp.node = `Edits curve anchors.${hold("break-handle", "break a linked handle")}`;
  for (const button of document.querySelectorAll(".tool-button[data-tool]")) {
    const definition = tools.find(([id]) => id === button.dataset.tool);
    const binding = inputBindings.get(`tool:${definition[0]}`);
    button.title = `${definition[1]}${binding ? ` (${binding})` : ""}`;
  }
  for (const button of document.querySelectorAll(".commandbar [data-action]")) {
    const definition = bindingDefinitions.find(
      (d) => d.id === button.dataset.action,
    );
    if (definition)
      button.title = `${definition.label}${inputBindings.get(definition.id) ? ` (${inputBindings.get(definition.id)})` : ""}`;
  }
}
const menus = createMenus(
  $("#menus"),
  menuDefinitions,
  commandState,
  (action) => doAction(action).catch((error) => toast(error.message)),
  () => statusHelp.clearWithin($("#menus")),
  {
    shortcut: (action, fallback) =>
      bindingDefinitions.some((d) => d.id === action)
        ? inputBindings.get(action)
        : fallback,
    isMenuKey: (event) => inputBindings.action(event) === "menu",
  },
);
const closeMenus = () => menus.close();
startupCheckpoint("menus-created");
function commandState(action) {
  const doc = active(),
    items = doc ? selected(doc) : [];
  if (
    [
      "new",
      "open",
      "shortcuts",
      "preferences",
      "keyboard-settings",
      "command-search",
      "tablet-help",
      "examples",
      "about",
    ].includes(action)
  )
    return {};
  if (action === "app-close" || action.startsWith("open-recent:")) return {};
  if (action === "fullscreen") return { checked: !!document.fullscreenElement };
  if (action === "preview")
    return { enabled: !!doc, checked: artworkPreview.visible };
  if (action === "reselect")
    return {
      enabled:
        !!doc &&
        resolvedIds(doc, rememberedSelections.get(doc) || []).some((id) =>
          editable(doc, id),
        ),
    };
  if (action === "grid" || action === "snap") return { checked: state[action] };
  if (["tile-mode", "symmetry-mode"].includes(action))
    return { enabled: !!doc };
  if (action.startsWith("tile:") || action.startsWith("symmetry:")) {
    const m = doc && drawingModes(doc),
      isTile = action.startsWith("tile:");
    const x = isTile ? m?.tileX : m?.mirrorX,
      y = isTile ? m?.tileY : m?.mirrorY;
    return {
      enabled: !!doc,
      checked:
        !!doc &&
        action.split(":")[1] === (x ? (y ? "both" : "x") : y ? "y" : "off"),
    };
  }
  if (action === "symmetry-center")
    return {
      enabled:
        !!doc && (drawingModes(doc).mirrorX || drawingModes(doc).mirrorY),
    };
  if (action.startsWith("activate-document:"))
    return { checked: doc?.id === action.split(":")[1] };
  if (action === "selection-layer" || action === "crop-selection")
    return { enabled: items.length > 0 };
  if (action === "undo") return { enabled: !!doc?.history.length };
  if (action === "redo") return { enabled: !!doc?.future.length };
  if (action === "paste") return { enabled: !!doc && !!state.clipboard.length };
  if (
    [
      "cut",
      "copy",
      "duplicate",
      "delete",
      "bring-front",
      "send-back",
      "flip-h",
      "flip-v",
      "deselect",
    ].includes(action)
  )
    return { enabled: !!items.length };
  if (action === "edit-text")
    return { enabled: items.some((el) => el.type === "text") };
  if (action === "outline-text")
    return { enabled: items.some((el) => el.type === "text") };
  if (action === "attach-text-path") return { enabled: canAttachText(items) };
  if (["edit-text-path", "detach-text-path"].includes(action))
    return { enabled: items.length === 1 && !!items[0].attrs.textPath };
  if (action === "convert-curves")
    return { enabled: items.some(canConvertToCurves) };
  if (action.startsWith("node-")) {
    const el = currentNodeElement(doc);
    return {
      enabled:
        !!el && (action !== "node-add" || nextNode(el, activeNode.index) >= 0),
    };
  }
  if (action === "next-doc" || action === "previous-doc")
    return { enabled: state.documents.length > 1 };
  if (action === "arrange-icons")
    return { enabled: state.documents.some((item) => item.minimized) };
  return { enabled: !!doc };
}

let springTools = null;
function chooseTool(
  id,
  { temporary = false, spring = false, restoring = false } = {},
) {
  if (!spring) springTools?.reset();
  endNudgeSequence();
  if (state.pen && id !== "pen" && (!temporary || restoring)) finishPen();
  state.tool = id;
  transformHover = null;
  if (
    !["select", "node", "hand", "zoom", "nudge", "slice", "smooth"].includes(id)
  ) {
    restoreDrawingStyle();
    const doc = active();
    if (doc && !temporary) setSelection(doc, []);
  }
  if (temporary && ["select", "node"].includes(id) && active()?.selected.length)
    syncSelectionAppearance(active());
  document.querySelectorAll("[data-tool].tool-button").forEach((button) => {
    const on = button.dataset.tool === id;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", on);
  });
  const info = tools.find((t) => t[0] === id);
  $("#current-tool-icon").innerHTML = icon(id);
  $("#current-tool-name").textContent = info[1];
  $("#current-tool-hint").textContent = info[3];
  updateColors();
  for (const doc of state.documents) renderStage(doc);
  renderInspector();
  setStatus(info[3]);
}
function restoreDrawingStyle() {
  if (!state.drawingStyle) return;
  Object.assign(state, state.drawingStyle);
  state.drawingStyle = null;
  updateColors();
}
function setDrawingStyle(attributes) {
  Object.assign(state, attributes);
  if (state.drawingStyle)
    for (const key of Object.keys(state.drawingStyle))
      if (key in attributes) state.drawingStyle[key] = attributes[key];
  for (const value of [attributes.fill, attributes.stroke]) {
    const color = solidColor(value);
    if (color)
      state.recentColors = [
        color,
        ...state.recentColors.filter((item) => item !== color),
      ].slice(0, 16);
  }
}
function paletteColors(source) {
  const drawingColors = source === "document" ? documentColors(active()) : [];
  return source === "document"
    ? drawingColors.length > 1
      ? drawingColors
      : palette
    : source === "recent"
      ? state.recentColors
      : paletteChoices.find((item) => item.id === source)?.colors || palette;
}
function renderPalette() {
  const source = $("#palette-source").value;
  const colors = paletteColors(source);
  $("#swatches").setAttribute(
    "aria-label",
    source === "classic"
      ? "Arne16 colour palette"
      : `${$("#palette-source").selectedOptions[0].textContent} colours`,
  );
  const signature = colors.join(",");
  if ($("#swatches").dataset.colors !== signature) {
    $("#swatches").dataset.colors = signature;
    $("#swatches").innerHTML =
      colors
        .map(
          (color) =>
            `<button class="swatch" data-color="${color}" style="background-color:${color}" aria-label="Primary ${color}" title="${color}"></button>`,
        )
        .join("") ||
      '<span class="palette-empty">Pick a colour to keep it here.</span>';
  }
  $("#swatches")
    .querySelectorAll(".swatch")
    .forEach((el) => {
      el.classList.toggle("selected", el.dataset.color === state.fill);
      el.title = `${el.dataset.color} · Left-click: primary · Right-click: secondary`;
    });
}
function updateColors() {
  refreshPalettePreviews();
  renderPalette();
  for (const which of ["fill", "stroke"]) {
    const chip = $(`#${which}-chip`);
    chip.style.background =
      state[which] === "none"
        ? "linear-gradient(135deg,#fff 45%,#f00 46% 54%,#fff 55%)"
        : state[which];
    chip.title = `${which === "fill" ? "Primary" : "Secondary"}: ${state[which]} · Click to choose a precise colour and opacity`;
  }
  document.querySelectorAll(".swatch").forEach((el) => {
    el.classList.toggle("selected", el.dataset.color === state.fill);
    el.title = `${el.dataset.color} · Left-click: primary · Right-click: secondary`;
  });
  renderBrushPreview();
}
function renderBrushPreview() {
  const doc = active(),
    items = doc ? selected(doc) : [],
    el = ["select", "node"].includes(state.tool) ? items[0] : null,
    brush = el
      ? el.brush || (el.paint && isPaintArtwork(el))
      : state.tool === "brush" || state.tool === "eraser",
    color = el
      ? brush
        ? el.attrs.fill
        : el.attrs.stroke
      : brush || ["pencil", "pen"].includes(state.tool)
        ? state.fill === "none"
          ? state.stroke
          : state.fill
        : state.stroke,
    min =
      (el && items.some((item) => item.brush)) ||
      ["brush", "pencil", "eraser", "nudge", "smooth"].includes(state.tool)
        ? 1
        : 0;
  const max = ["nudge", "smooth"].includes(state.tool) ? 500 : 100;
  state.size = clamp(state.size, min, max);
  $("#brush-size").max = max;
  $("#size-display").max = max;
  $("#brush-size").min = min;
  $("#brush-size").value = state.size;
  const points = Array.from({ length: 100 }, (_, i) => ({
    x: 20 + i * 2,
    y: 29 - Math.sin((i / 99) * Math.PI * 2) * 6,
    p: state.pressure ? Math.sin((i / 99) * Math.PI) * 0.9 + 0.03 : 0.5,
  }));
  $("#brush-preview").innerHTML =
    state.tool === "smooth"
      ? '<path d="M20 30L65 30L90 15L115 36L140 15L165 30H220" fill="none" stroke="#808080" stroke-width="1"/><path d="M20 30H65C90 30 93 23 115 23S140 30 165 30H220" fill="none" stroke="#000080" stroke-width="2"/>'
      : state.tool === "nudge"
        ? '<path d="M20 32H78C95 32 98 12 120 12S145 32 162 32H220" fill="none" stroke="#000080" stroke-width="2"/>'
        : state.tool === "slice" && state.size === 0
          ? '<path d="M20 27H220M120 5V49" fill="none" stroke="#000080" stroke-width="1"/>'
          : brush
            ? `<path d="${strokeOutline(points, Math.min(state.size, 27), el?.pressure ?? state.pressure)}" fill="${esc(color)}"/>`
            : `<path d="${pencilPath(points)}" fill="none" stroke="${esc(color)}" stroke-width="${Math.min(state.size, 27)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  $("#size-display").min = min;
  if (document.activeElement !== $("#size-display"))
    $("#size-display").value = state.size;
  const effect =
    state.tool === "nudge"
      ? state.nudgeStrength
      : state.tool === "smooth"
        ? state.smoothStrength
        : state.smoothing;
  const effectMax = state.tool === "nudge" ? 100 : 90;
  $("#smoothing").max = effectMax;
  $("#smoothing-display").max = effectMax;
  if (document.activeElement !== $("#smoothing-display"))
    $("#smoothing-display").value = effect;
  $("#smoothing").value = effect;
  renderToolOptions();
}
function renderToolOptions() {
  const doc = active(),
    items = doc ? selected(doc) : [],
    selectionTool = ["select", "node"].includes(state.tool),
    editing = selectionTool && items.length > 0,
    brush = state.tool === "brush",
    shape = ["rect", "ellipse"].includes(state.tool),
    erasePaint = ["eraser", "slice"].includes(state.tool),
    widthEditable =
      editing &&
      items.some(
        (el) =>
          (!el.paint && el.brush && el.points?.length) ||
          (!el.paint &&
            el.type !== "import" &&
            el.attrs.stroke &&
            el.attrs.stroke !== "none"),
      ),
    showAppearance = editing && items.every(supportsSelectionAppearance),
    showSize = editing
      ? widthEditable && !items.every(supportsBorder)
      : ["brush", "pencil", "pen", "line", "nudge", "smooth"].includes(
          state.tool,
        ) ||
        shape ||
        erasePaint;
  $("#size-options").hidden = !showSize;
  $("#brush-preview").toggleAttribute("hidden", !showSize);
  $("#smoothing-options").hidden =
    editing ||
    !(
      brush ||
      ["pencil", "smooth", "nudge"].includes(state.tool) ||
      (erasePaint && state.size > 0)
    );
  const strengthTool = ["nudge", "smooth"].includes(state.tool);
  $('label[for="smoothing"]').textContent = strengthTool
    ? "Strength"
    : "Smoothing";
  $("#smoothing-display").setAttribute(
    "aria-label",
    strengthTool ? "Strength percentage" : "Smoothing percentage",
  );
  $("#pressure-options").hidden =
    editing || !(brush || (erasePaint && state.size > 0));
  $("#paint-inside-options").hidden = editing || !brush;
  $("#bucket-boundary-options").hidden = state.tool !== "bucket";
  $(".pressure-meter").hidden =
    editing || !(brush || (erasePaint && state.size > 0));
  const appearance = $("#selection-appearance-options");
  appearance.hidden = !showAppearance;
  const markup = showAppearance ? selectionAppearanceControls(items) : "";
  if (appearance.innerHTML !== markup) appearance.innerHTML = markup;
  const name = tools.find((tool) => tool[0] === state.tool)?.[1] || "Tool";
  $(".tool-properties").setAttribute(
    "aria-label",
    editing ? "Selected artwork" : `${name} settings`,
  );
  $("#tool-options-description").textContent = editing
    ? showAppearance && items.every(supportsBorder)
      ? "Set the fill and border here; position and dimensions are in the Selection panel."
      : widthEditable
        ? "Set the stroke colour here; Size changes the selected artwork's stroke width."
        : showAppearance
          ? "Set the fill here; position and dimensions are in the Selection panel."
          : "Position and dimensions are in the Selection panel."
    : brush
      ? `Paint on ${activeLayer(doc)?.name || "the active layer"}. Other layers stay separate.`
      : selectionTool
        ? "Select artwork to edit its properties."
        : [
              "hand",
              "zoom",
              "text",
              "eyedropper",
              "bucket",
              "nudge",
              "slice",
              "smooth",
            ].includes(state.tool)
          ? tools.find((tool) => tool[0] === state.tool)?.[3]
          : state.tool === "eraser"
            ? erasePaint
              ? "Erases paint on the active layer."
              : "Removes each object you touch."
            : shape
              ? "Primary fills the shape; secondary sets its border."
              : "Settings apply to new artwork.";
}
function supportsBorder(el) {
  return (
    ["path", "rect", "ellipse", "text"].includes(el.type) &&
    !el.pencil &&
    !(el.points && !el.brush)
  );
}
function supportsSelectionAppearance(el) {
  return ["path", "rect", "ellipse", "line", "text"].includes(el.type);
}
function selectionFillKey(el) {
  return el.type === "line" || el.pencil || (el.points && !el.brush)
    ? "stroke"
    : "fill";
}
function documentWindowRect(index) {
  const width = desktop.clientWidth,
    height = desktop.clientHeight;
  const x = Math.min(
      index ? Math.min(195, width * 0.18) : 22,
      Math.max(0, width - 330),
    ),
    y = Math.min(index ? 82 : 20, Math.max(0, height - 250));
  return {
    x,
    y,
    w: Math.max(330, Math.min(index ? 850 : 900, width - x - 12)),
    h: Math.max(250, Math.min(670, height - y - 12)),
  };
}
function addDocument(doc, { focus = true, rect = null, fit = true } = {}) {
  migrateLayers(doc);
  doc.window = rect || documentWindowRect(state.documents.length ? 1 : 0);
  if (state.mdiMaximized) doc.maximized = true;
  state.documents.push(doc);
  const el = document.createElement("article");
  el.className = "mdi-window";
  // Every child owns a stacking context, including examples opened unfocused.
  // Otherwise a background window's resize handles can sit above the active art.
  el.style.zIndex = ++state.z;
  el.dataset.document = doc.id;
  el.setAttribute("aria-label", doc.name);
  el.innerHTML = `<div class="mdi-title">${icon("new")}<span class="mdi-title-text"></span><span class="mdi-title-size"></span><div class="mdi-title-controls"><button data-window-action="minimize" title="Minimise drawing" aria-label="Minimise drawing">${icon("minimize")}</button><button data-window-action="maximize" title="Maximise drawing" aria-label="Maximise drawing">${icon("maximize")}</button><button data-window-action="close" title="Close drawing" aria-label="Close drawing">${icon("close")}</button></div></div><div class="mdi-body"><div class="ruler-corner">⌖</div><div class="ruler-top"></div><div class="ruler-left"></div><div class="viewport"><svg class="stage" xmlns="http://www.w3.org/2000/svg" tabindex="0" aria-label="Drawing canvas"></svg></div></div><div class="mdi-footer"><span class="doc-info"></span><span class="paper-label"><i></i> SVG ARTBOARD</span><button data-window-action="zoom-out" aria-label="Zoom out">${icon("minus")}</button><button class="zoom-value" data-window-action="actual-size" title="Actual size"></button><button data-window-action="zoom-in" aria-label="Zoom in">${icon("plus")}</button><button data-window-action="fit" aria-label="Fit artboard">${icon("fit")}</button></div>${["n", "e", "s", "w", "nw", "ne", "se", "sw"].map((edge) => `<span class="window-resize" data-window-resize="${edge}" aria-hidden="true"></span>`).join("")}`;
  windows.set(doc.id, el);
  desktop.appendChild(el);
  applyWindowRect(doc);
  updateDocChrome(doc);
  const stage = el.querySelector(".stage");
  stage.parentElement.insertAdjacentHTML(
    "beforeend",
    '<div class="transform-readout" hidden aria-live="off"></div>',
  );
  stage.addEventListener("pointerdown", (event) => pointerDown(event, doc));
  stage.addEventListener("pointermove", (event) => pointerMove(event, doc));
  stage.addEventListener("pointerleave", () => {
    if (state.cursor?.docId === doc.id) state.cursor = null;
    if (transformHover?.docId === doc.id) {
      transformHover = null;
      renderSelection(doc);
    }
    renderBrushCursor(doc);
  });
  stage.addEventListener("pointerup", (event) => pointerEnd(event, doc));
  stage.addEventListener("pointercancel", (event) =>
    pointerEnd(event, doc, true),
  );
  stage.addEventListener("lostpointercapture", (event) => {
    if (state.interaction?.pointerId === event.pointerId)
      pointerEnd(event, doc, true);
  });
  stage.addEventListener("wheel", (event) => wheel(event, doc), {
    passive: false,
  });
  stage.addEventListener("dblclick", (event) => {
    const id = hitElement(event, doc);
    if (id && findElement(doc, id)?.type === "text") {
      doc.selected = [id];
      textDialog(findElement(doc, id));
    } else if (state.tool === "pen") finishPen();
  });
  stage.addEventListener("contextmenu", (event) => event.preventDefault());
  el.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      if (state.activeId !== doc.id) activateDocument(doc.id);
      const edge = event.target.closest("[data-window-resize]")?.dataset
        .windowResize;
      if (edge) startWindowDrag(event, doc, edge);
      else if (
        event.target.closest(".mdi-title") &&
        !event.target.closest("button")
      )
        startWindowDrag(event, doc);
    },
    true,
  );
  el.querySelector(".mdi-title").addEventListener("dblclick", (event) => {
    if (!event.target.closest("button"))
      windowAction(doc, doc.minimized ? "minimize" : "maximize");
  });
  new ResizeObserver(() => {
    renderStage(doc);
  }).observe(el.querySelector(".viewport"));
  if (focus) activateDocument(doc.id);
  else renderStage(doc);
  if (fit) requestAnimationFrame(() => fitDocument(doc));
  renderTabs();
  autosave();
}
function updateMaximizeButton(
  button,
  maximized,
  maximizeLabel = "Maximise drawing",
  restoreLabel = "Restore drawing",
) {
  const name = maximized ? "restore" : "maximize";
  if (button.dataset.icon !== name) {
    button.dataset.icon = name;
    button.innerHTML = icon(name);
  }
  button.title = maximized ? restoreLabel : maximizeLabel;
  button.setAttribute("aria-label", button.title);
}
function applyWindowRect(doc) {
  const el = windows.get(doc.id);
  const rect = doc.minimized ? doc.minimizedRect : doc.window;
  Object.assign(el.style, {
    left: `${Math.round(rect.x)}px`,
    top: `${Math.round(rect.y)}px`,
    width: `${Math.round(rect.w)}px`,
    height: `${Math.round(rect.h)}px`,
  });
  el.classList.toggle("minimized", doc.minimized);
  el.classList.toggle("maximized", doc.maximized && !doc.minimized);
  updateMaximizeButton(
    el.querySelector('[data-window-action="maximize"]'),
    doc.maximized && !doc.minimized,
  );
}
function activateDocument(id) {
  if (state.pen && state.pen.docId !== id) finishPen();
  state.activeId = id;
  artworkPreview.schedule();
  for (const doc of state.documents)
    windows.get(doc.id).classList.toggle("active", doc.id === id);
  windows.get(id).style.zIndex = ++state.z;
  renderTabs();
  renderInspector();
  syncFrame();
}
function syncFrame() {
  const doc = active(),
    shown = state.mdiMaximized && doc && !doc.minimized;
  $(".title-subtitle").textContent = shown
    ? `[${doc.name}${doc.dirty ? " *" : ""}]`
    : "SVG Editor";
  document.title = `Vector 95 - ${shown ? doc.name : "SVG Editor"}`;
  const controls = $("#mdi-child-controls");
  controls.hidden = !shown;
  if (shown) controls.dataset.document = doc.id;
}
function setMdiMaximized(value) {
  state.mdiMaximized = value;
  for (const doc of state.documents) {
    doc.maximized = value;
    applyWindowRect(doc);
  }
  syncFrame();
}
function nextDocument(direction = 1) {
  if (!state.documents.length) return;
  const index = state.documents.findIndex((doc) => doc.id === state.activeId);
  const doc =
    state.documents[
      (index + direction + state.documents.length) % state.documents.length
    ];
  doc.minimized = false;
  applyWindowRect(doc);
  activateDocument(doc.id);
  autosave();
}
function nextVisibleDocument(excludedId) {
  return state.documents
    .filter((doc) => doc.id !== excludedId && !doc.minimized)
    .sort(
      (a, b) =>
        Number(windows.get(b.id).style.zIndex) -
        Number(windows.get(a.id).style.zIndex),
    )[0];
}
function renderTabs() {
  artworkPreview.schedule();
  $("#document-tabs").innerHTML =
    state.documents
      .map(
        (doc) =>
          `<button class="doc-tab ${doc.id === state.activeId ? "active" : ""} ${doc.dirty ? "dirty" : ""}" data-document-tab="${doc.id}" title="${esc(doc.name)}" aria-label="${esc(doc.name)}">${icon("new")}<span class="tab-name">${esc(doc.name)}</span><span class="tab-dot"></span>${doc.minimized ? '<span aria-hidden="true">_</span>' : ""}</button>`,
      )
      .join("") +
    `<button class="new-tab" data-action="new" title="New Drawing" aria-label="New Drawing">${icon("plus", 14)}</button>`;
}
function updateDocChrome(doc) {
  const el = windows.get(doc.id);
  if (!el) return;
  el.querySelector(".mdi-title-text").textContent =
    doc.name + (doc.dirty ? " *" : "");
  el.querySelector(".mdi-title-size").textContent =
    `${Math.round(doc.width * 100) / 100} × ${Math.round(doc.height * 100) / 100}`;
  el.querySelector(".doc-info").textContent =
    `${allElements(doc).length} object${allElements(doc).length === 1 ? "" : "s"} · ${allLayers(doc).length} layer${allLayers(doc).length === 1 ? "" : "s"}`;
  el.querySelector(".zoom-value").textContent =
    `${Math.round(doc.zoom * 100)}%`;
  renderTabs();
  syncFrame();
}
function viewBox(doc) {
  const stage = windows.get(doc.id).querySelector(".stage"),
    w = stage.clientWidth || 600,
    h = stage.clientHeight || 400;
  return {
    x: doc.width / 2 - w / (doc.zoom * 2) - doc.pan.x / doc.zoom,
    y: doc.height / 2 - h / (doc.zoom * 2) - doc.pan.y / doc.zoom,
    w: w / doc.zoom,
    h: h / doc.zoom,
  };
}
function fitDocument(doc = active()) {
  if (!doc) return;
  const stage = windows.get(doc.id).querySelector(".stage");
  const modes = drawingModes(doc);
  doc.zoom = clamp(
    Math.min(
      (stage.clientWidth - 64) / (doc.width * (modes.tileX ? 3 : 1)),
      (stage.clientHeight - 64) / (doc.height * (modes.tileY ? 3 : 1)),
    ),
    0.02,
    8,
  );
  doc.pan = { x: 0, y: 0 };
  renderStage(doc);
  updateDocChrome(doc);
}
function zoomDocument(doc, factor, point = null) {
  if (!doc) return;
  const previous = doc.zoom;
  doc.zoom = clamp(doc.zoom * factor, 0.02, 32);
  if (point) {
    const stage = windows.get(doc.id).querySelector(".stage"),
      r = stage.getBoundingClientRect();
    const cx = point.x - r.left - r.width / 2,
      cy = point.y - r.top - r.height / 2;
    const ratio = doc.zoom / previous;
    doc.pan.x = cx - (cx - doc.pan.x) * ratio;
    doc.pan.y = cy - (cy - doc.pan.y) * ratio;
  }
  renderStage(doc);
  updateDocChrome(doc);
}
function worldPoint(event, doc, snap = state.snap, raw = false) {
  const stage = windows.get(doc.id).querySelector(".stage"),
    r = stage.getBoundingClientRect(),
    box = viewBox(doc);
  let x = box.x + (event.clientX - r.left) / doc.zoom,
    y = box.y + (event.clientY - r.top) / doc.zoom;
  const interaction = state.interaction;
  if (!raw && interaction?.docId === doc.id && interaction.inputMatrix) {
    ({ x, y } = transformPoint({ x, y }, interaction.inputMatrix));
  }
  if (snap && !gesture("snap-bypass", event)) {
    x = snapCoordinate(x, state.gridSize, state.snapOffset);
    y = snapCoordinate(y, state.gridSize, state.snapOffset);
  }
  return { x, y };
}
function localPoint(point, el) {
  const m = inverse(parentMatrix(active(), el.id));
  point = {
    x: m[0] * point.x + m[2] * point.y + m[4],
    y: m[1] * point.x + m[3] * point.y + m[5],
  };
  const angle = (-el.rotation * Math.PI) / 180,
    dx = point.x - el.tx,
    dy = point.y - el.ty;
  const local = {
    x: (dx * Math.cos(angle) - dy * Math.sin(angle)) / el.sx,
    y: (dx * Math.sin(angle) + dy * Math.cos(angle)) / el.sy,
  };
  if (!el.matrix) return local;
  const [a, b, c, d, e, f] = el.matrix,
    det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return local;
  return {
    x: (d * (local.x - e) - c * (local.y - f)) / det,
    y: (a * (local.y - f) - b * (local.x - e)) / det,
  };
}
function renderStage(doc) {
  artworkPreview.schedule();
  const el = windows.get(doc.id);
  if (!el || doc.minimized) return;
  const stage = el.querySelector(".stage"),
    box = viewBox(doc);
  stage.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  stage.dataset.tool = state.space ? "hand" : state.tool;
  if (renderGPUStage(doc, stage, box)) return;
  const prefix = `grid-${doc.id}`;
  if (
    state.interaction?.docId === doc.id &&
    state.interaction.type === "hand" &&
    !tiled(drawingModes(doc)) &&
    stage.querySelector(".artwork") &&
    ![...previews.values()].some((preview) => preview.docId === doc.id)
  ) {
    const background = stage.querySelector(":scope > rect");
    for (const [key, value] of Object.entries({
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
    }))
      background.setAttribute(key, value);
    renderSelection(doc);
    renderSymmetryAxes(stage, doc);
    renderRulers(doc, box);
    renderBrushCursor(doc);
    return;
  }
  const gesture =
    state.interaction?.docId === doc.id &&
    [
      "move",
      "resize",
      "rotate",
      "node-drag",
      "rect",
      "ellipse",
      "line",
      "pencil",
      "pen",
    ].includes(state.interaction.type) &&
    !tiled(drawingModes(doc))
      ? state.interaction
      : null;
  const retained = gesture && retainedGestures.get(gesture);
  const gestureIds =
    gesture?.elementId && gesture.type !== "node-drag"
      ? [gesture.elementId]
      : doc.selected;
  if (
    retained &&
    !(
      gesture.type === "node-drag" &&
      findElement(doc, gesture.elementId)?.attrs.textPath
    ) &&
    retained.every((record) => record.node.isConnected) &&
    retained.map((record) => record.id).join() === gestureIds.join()
  ) {
    for (const record of retained) {
      const element = findElement(doc, record.id);
      const delta = multiply(elementMatrix(element), inverse(record.matrix));
      const transform = multiply(delta, record.outer);
      record.node.setAttribute("transform", `matrix(${transform.join(" ")})`);
      if (
        ["node-drag", "rect", "ellipse", "line", "pencil", "pen"].includes(
          gesture.type,
        )
      ) {
        const shape = record.node.querySelector(element.type);
        if (shape)
          for (const key of [
            "d",
            "x",
            "y",
            "width",
            "height",
            "cx",
            "cy",
            "rx",
            "ry",
            "x1",
            "x2",
            "y1",
            "y2",
          ]) {
            if (element.attrs[key] !== undefined)
              shape.setAttribute(key, element.attrs[key]);
          }
      }
      boundsCache.delete(record.node);
    }
    renderSelection(doc);
    renderBrushCursor(doc);
    return;
  }
  const floating = floatingSelections.get(doc.id);
  const renderOptions = {
    excludeElements: new Set(floating?.ids || []),
    seamProvider: (layer, elements) => seamRenderer.paths(doc, layer, elements),
  };
  let gridStep = state.gridSize;
  while (gridStep * doc.zoom < 6) gridStep *= 2;
  stage.innerHTML = `<defs><pattern id="${prefix}" x="${state.snapOffset}" y="${state.snapOffset}" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse"><path d="M ${gridStep} 0 L 0 0 0 ${gridStep}" fill="none" stroke="#808080" stroke-width="${0.6 / doc.zoom}" opacity="0.32"/></pattern><pattern id="check-${doc.id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#ffffff"/><path d="M0 0H8V8H0ZM8 8H16V16H8Z" fill="#c0c0c0"/></pattern></defs><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#808080"/><rect x="${4 / doc.zoom}" y="${5 / doc.zoom}" width="${doc.width}" height="${doc.height}" fill="#000000"/><rect width="${doc.width}" height="${doc.height}" fill="${doc.background === "none" ? `url(#check-${doc.id})` : esc(doc.background)}"/><g class="artwork">${layersMarkup(textPreviewSession?.docId === doc.id ? textPreviewSession.document() : doc, true, renderOptions)}</g>${state.grid ? `<rect width="${doc.width}" height="${doc.height}" fill="url(#${prefix})" pointer-events="none"/>` : ""}<rect width="${doc.width}" height="${doc.height}" fill="none" stroke="#000000" stroke-width="${1 / doc.zoom}" pointer-events="none"/><g class="overlay"></g>`;
  if (doc.defs)
    stage
      .querySelector("defs")
      .insertAdjacentHTML("afterbegin", namespaceMarkup(doc.defs, doc.id));
  const modes = drawingModes(doc);
  if (doc.clipToArtboard && !tiled(modes)) {
    const clipId = `artboard-${doc.id}`;
    stage
      .querySelector("defs")
      .insertAdjacentHTML(
        "beforeend",
        `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect width="${doc.width}" height="${doc.height}"/></clipPath>`,
      );
    stage
      .querySelector(".artwork")
      .setAttribute("clip-path", `url(#${clipId})`);
  }
  if (tiled(modes)) renderTiles(stage, doc, box, prefix);
  if (floating) {
    for (const layer of allLayers(doc))
      for (const element of layer.elements) {
        if (!floating.ids.includes(element.id)) continue;
        for (const node of stage.querySelectorAll(
          `[data-element="${element.id}"]`,
        ))
          node.parentNode.append(node);
      }
  }
  renderSelection(doc);
  for (const preview of previews.values())
    if (preview.docId === doc.id) preview.show(stage, box);
  renderModeErasers(stage, doc);
  renderSymmetryAxes(stage, doc);
  renderRulers(doc, box);
  stage.insertAdjacentHTML(
    "beforeend",
    '<g class="brush-cursor" aria-hidden="true" pointer-events="none" display="none"><circle class="cursor-halo" fill="none" stroke="#fff" stroke-width="3" vector-effect="non-scaling-stroke"/><circle class="cursor-edge" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></g>',
  );
  renderBrushCursor(doc);
  if (textPreviewSession?.docId === doc.id) textPreviewSession.show();
  if (gesture) {
    const records = gestureIds.map((id) => {
      const element = findElement(doc, id),
        node = stage.querySelector(`[data-element="${id}"]`);
      if (
        !element ||
        !node ||
        element.repeat ||
        element.paintRender ||
        element.paintUnderlay ||
        element.type === "raw"
      )
        return null;
      const angle = (element.rotation * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
      return {
        id,
        node,
        matrix: elementMatrix(element),
        outer: [
          c * element.sx,
          s * element.sx,
          -s * element.sy,
          c * element.sy,
          element.tx,
          element.ty,
        ],
      };
    });
    if (records.length && records.every(Boolean))
      retainedGestures.set(gesture, records);
  }
}
function renderGPUStage(doc, stage, box) {
  let view = gpuViewports.get(doc.id);
  if (
    textPreviewSession?.docId === doc.id ||
    tiled(drawingModes(doc)) ||
    [...previews.values()].some(
      (preview) => preview.docId === doc.id && preview.erase,
    ) ||
    !HTMLCanvasElement.prototype.transferControlToOffscreen ||
    new URLSearchParams(location.search).get("renderer") === "svg"
  ) {
    view?.hide();
    return false;
  }
  if (!view) {
    view = new GPUViewport(stage, () => {
      if (windows.has(doc.id)) renderStage(doc);
    });
    gpuViewports.set(doc.id, view);
  }
  if (view.failed) return false;
  const interaction =
    state.interaction?.docId === doc.id ? state.interaction : null;
  const fast =
    view.active &&
    interaction &&
    view.interaction === interaction &&
    [
      "hand",
      "move",
      "resize",
      "rotate",
      "node-drag",
      "rect",
      "ellipse",
      "line",
      "pencil",
      "pen",
    ].includes(interaction.type);
  let supported;
  if (fast) {
    const ids =
      interaction.elementId && interaction.type !== "node-drag"
        ? [interaction.elementId]
        : doc.selected;
    supported =
      interaction.type === "hand" ||
      view.updateElements(
        ids.map((id) => findElement(doc, id)).filter(Boolean),
        interaction.type === "node-drag" && interaction.nodePath?.byteLength
          ? new Map([[interaction.elementId, interaction.nodePath]])
          : undefined,
      );
  } else
    supported = view.sync(
      doc,
      (layer, elements) => seamRenderer.paths(doc, layer, elements),
      new Set(floatingSelections.get(doc.id)?.ids || []),
    );
  if (!supported) {
    view.hide();
    return false;
  }
  // The live ink canvas is an overlay. Keep SVG compositing while ink must
  // pass below another object or inherit a group's opacity.
  for (const [id, preview] of previews) {
    if (preview.docId !== doc.id) continue;
    const position = view.order.indexOf(id),
      record = view.records.get(id);
    if (
      record?.groups.length ||
      (position >= 0 &&
        view.order
          .slice(position + 1)
          .some((key) => !view.records.get(key).hidden))
    ) {
      view.hide();
      return false;
    }
  }
  for (const [id, preview] of previews) {
    const record = view.records.get(id);
    if (preview.docId === doc.id && record)
      view.update({ ...record, hidden: true });
  }
  view.interaction = interaction;
  view.view(doc, box);
  if (!view.ready) return false;
  const prefix = `gpu-grid-${doc.id}`;
  view.show(
    `<defs><pattern id="gpu-check-${doc.id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><path d="M0 0H8V8H0ZM8 8H16V16H8Z" fill="#c0c0c0"/></pattern></defs><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#808080"/><rect x="${4 / doc.zoom}" y="${5 / doc.zoom}" width="${doc.width}" height="${doc.height}" fill="#000"/><rect width="${doc.width}" height="${doc.height}" fill="${doc.background === "none" ? `url(#gpu-check-${doc.id})` : esc(doc.background)}"/>`,
    box,
  );
  let gridStep = state.gridSize;
  while (gridStep * doc.zoom < 6) gridStep *= 2;
  if (!(fast && interaction.type === "node-drag"))
    stage.innerHTML = `<defs><pattern id="${prefix}" x="${state.snapOffset}" y="${state.snapOffset}" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse"><path d="M ${gridStep} 0 L 0 0 0 ${gridStep}" fill="none" stroke="#808080" stroke-width="${0.6 / doc.zoom}" opacity="0.32"/></pattern></defs>${state.grid ? `<rect width="${doc.width}" height="${doc.height}" fill="url(#${prefix})" pointer-events="none"/>` : ""}<rect width="${doc.width}" height="${doc.height}" fill="none" stroke="#000" stroke-width="${1 / doc.zoom}" pointer-events="none"/><g class="overlay"></g><g class="brush-cursor" aria-hidden="true" pointer-events="none" display="none"><circle class="cursor-halo" fill="none" stroke="#fff" stroke-width="3" vector-effect="non-scaling-stroke"/><circle class="cursor-edge" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`;
  renderSelection(doc);
  for (const preview of previews.values())
    if (preview.docId === doc.id) preview.show(stage, box);
  renderModeErasers(stage, doc);
  renderSymmetryAxes(stage, doc);
  renderRulers(doc, box);
  renderBrushCursor(doc);
  return true;
}
function renderTiles(stage, doc, box, prefix) {
  const modes = drawingModes(doc),
    clipId = `tile-clip-${doc.id}`;
  stage
    .querySelector("defs")
    .insertAdjacentHTML(
      "beforeend",
      `<clipPath id="${clipId}"><rect width="${doc.width}" height="${doc.height}"/></clipPath>`,
    );
  const content = stage.querySelector(".artwork").outerHTML;
  stage.querySelector(".artwork").remove();
  // Each view shares element identities, while SVG definition IDs are unique.
  // Copies are view content only and never enter the document or its history.
  const tiles = tileOffsets(modes)
    .map(({ x, y }) => {
      const local = `tile-${doc.id}-${x}-${y}`;
      const artwork =
        x || y
          ? namespaceMarkup(
              `${doc.defs ? `<defs>${namespaceMarkup(doc.defs, doc.id)}</defs>` : ""}${content}`,
              local,
            )
          : content;
      return `<g class="tile-view" data-tile-x="${x}" data-tile-y="${y}" transform="translate(${x * doc.width} ${y * doc.height})"><rect width="${doc.width}" height="${doc.height}" fill="${doc.background === "none" ? `url(#check-${doc.id})` : esc(doc.background)}"/><g clip-path="url(#${clipId})">${artwork}</g>${state.grid ? `<rect width="${doc.width}" height="${doc.height}" fill="url(#${prefix})" pointer-events="none"/>` : ""}<rect width="${doc.width}" height="${doc.height}" fill="none" stroke="${x || y ? "#606060" : "#000000"}" stroke-width="${(x || y ? 0.5 : 1) / doc.zoom}" pointer-events="none"/></g>`;
    })
    .join("");
  // Keep definitions and the workspace background; replace the single paper.
  const defs = stage.querySelector("defs").outerHTML;
  stage.innerHTML = `${defs}<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#808080"/>${tiles}<g class="overlay"></g>`;
}
function renderSymmetryAxes(stage, doc) {
  const modes = drawingModes(doc),
    box = viewBox(doc),
    size = 10 / doc.zoom;
  const axes = tileOffsets(modes)
    .flatMap(({ x, y }) => {
      const ox = x * doc.width,
        oy = y * doc.height;
      return [
        modes.mirrorX && {
          axis: "x",
          x: modes.axisX + ox,
          y: Math.max(oy, box.y) + size,
          line: `x1="${modes.axisX + ox}" x2="${modes.axisX + ox}" y1="${oy}" y2="${oy + doc.height}"`,
        },
        modes.mirrorY && {
          axis: "y",
          x: Math.max(ox, box.x) + size,
          y: modes.axisY + oy,
          line: `x1="${ox}" x2="${ox + doc.width}" y1="${modes.axisY + oy}" y2="${modes.axisY + oy}"`,
        },
      ]
        .filter(Boolean)
        .map(
          (a) =>
            `<g class="symmetry-axis"><line ${a.line} stroke="#fff" stroke-width="3" vector-effect="non-scaling-stroke" pointer-events="none"/><line ${a.line} stroke="#0055aa" stroke-width="1" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" pointer-events="none"/><rect data-symmetry-axis="${a.axis}" data-axis-tile-x="${x}" data-axis-tile-y="${y}" x="${a.x - size / 2}" y="${a.y - size / 2}" width="${size}" height="${size}" fill="#fff" stroke="#0055aa" stroke-width="1" vector-effect="non-scaling-stroke" style="cursor:${a.axis === "x" ? "ew" : "ns"}-resize"><title>Drag ${a.axis === "x" ? "vertical" : "horizontal"} symmetry axis</title></rect></g>`,
        );
    })
    .join("");
  stage.insertAdjacentHTML("beforeend", axes);
}
function renderModeErasers(stage, doc) {
  for (const layer of allLayers(doc)) {
    const erasers = layer.elements.filter(
      (el) => el.erase && el.repeat && !previews.has(el.id),
    );
    if (!erasers.length) continue;
    for (const source of stage.querySelectorAll(
      `[data-element="${erasers[0].id}"]`,
    )) {
      const tile = source.closest(".tile-view") || stage;
      const maskId = `mode-erase-${erasers[0].id}-${tile.dataset.tileX || 0}-${tile.dataset.tileY || 0}`;
      const footprints = erasers
        .map((eraser) => {
          tile
            .querySelector(`[data-element="${eraser.id}"]`)
            ?.setAttribute("visibility", "hidden");
          const footprint = clone(eraser);
          footprint.seamStroke = false;
          footprint.attrs.fill = "#000000";
          footprint.attrs.opacity = 1;
          return namespaceMarkup(elementMarkup(footprint), maskId);
        })
        .join("");
      stage
        .querySelector("defs")
        .insertAdjacentHTML(
          "beforeend",
          `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="-1000000" y="-1000000" width="2000000" height="2000000"><rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="#fff"/>${footprints}</mask>`,
        );
      for (const el of layer.elements.filter(isPaintFill)) {
        const original = tile.querySelector(`[data-element="${el.id}"]`);
        if (!original) continue;
        const fill = original.cloneNode(true);
        fill.removeAttribute("data-element");
        fill.removeAttribute("id");
        for (const shape of fill.querySelectorAll("path,rect,ellipse"))
          shape.setAttribute("stroke", "none");
        for (const shape of original.querySelectorAll("path,rect,ellipse"))
          shape.setAttribute("fill", "none");
        const wrapper = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        wrapper.setAttribute("mask", `url(#${maskId})`);
        wrapper.setAttribute("pointer-events", "none");
        original.before(wrapper);
        wrapper.append(fill);
      }
    }
  }
}
function renderBrushCursor(doc) {
  const group = windows.get(doc.id)?.querySelector(".brush-cursor");
  if (!group) return;
  const cursor = state.cursor;
  const visible =
    cursor?.docId === doc.id &&
    ["brush", "pencil", "eraser", "nudge", "slice", "smooth"].includes(
      state.tool,
    ) &&
    !state.space &&
    cursor.pointerType !== "touch";
  group.setAttribute("display", visible ? "inline" : "none");
  if (!visible) return;
  const point = worldPoint(cursor, doc, false, true);
  const radius = ["nudge", "smooth"].includes(state.tool)
    ? state.size / (2 * doc.zoom)
    : Math.max(
        0.5 / doc.zoom,
        brushRadius(
          state.size,
          cursor.p,
          ["brush", "eraser", "slice"].includes(state.tool) && state.pressure,
        ),
      );
  for (const circle of group.children) {
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", radius);
  }
}
function updateBrushCursor(event, doc) {
  state.cursor = {
    docId: doc.id,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType,
    p:
      event.pointerType === "pen" && event.buttons
        ? pressureValue(event, state.pressure)
        : 0.5,
  };
  renderBrushCursor(doc);
}
function elementBounds(doc, el) {
  const view = gpuViewports.get(doc.id);
  if (view?.active) {
    if (state.interaction?.type === "node-drag" && el.nodes) {
      const record = view.records.get(el.id);
      if (record) return curveBounds(el.nodes, record.matrix, el.closed);
    }
    return view.bounds(el.id, paintEngine, globalThis.paper);
  }
  const stage = windows.get(doc.id)?.querySelector(".stage");
  const central =
    stage?.querySelector('.tile-view[data-tile-x="0"][data-tile-y="0"]') ||
    stage;
  const node = central?.querySelector(`[data-element="${el.id}"]`);
  if (!node) return null;
  if (boundsCache.has(node)) return boundsCache.get(node);
  try {
    let bounds;
    // Nested SVG boxes are axis-aligned at every level. Measure transformed
    // vector geometry directly so rotation and shear don't inflate its bounds.
    if (
      (el.paintUnderlay ||
        el.paintRender ||
        node.querySelector("[data-vector95-seam-path]") ||
        el.rotation ||
        el.matrix ||
        hasParentTransform(doc, el.id)) &&
      ["rect", "ellipse", "path"].includes(el.type)
    ) {
      const matrix = multiply(parentMatrix(doc, el.id), elementMatrix(el));
      const key = [
        el.type,
        ...matrix,
        ...["d", "x", "y", "width", "height", "rx", "ry", "cx", "cy"].map(
          (name) => el.attrs[name],
        ),
      ];
      const previous = geometryBoundsCache.get(el);
      if (previous && previous.key.every((value, i) => value === key[i])) {
        boundsCache.set(node, previous.bounds);
        return previous.bounds;
      }
      const measured = {
        ...el,
        tx: 0,
        ty: 0,
        sx: 1,
        sy: 1,
        rotation: 0,
        matrix,
      };
      const geometry = paintEngine.geometry({
        ...measured,
        attrs: { ...el.attrs, fill: "#000000" },
      });
      try {
        const b = geometry.bounds;
        bounds = { x: b.x, y: b.y, w: b.width, h: b.height };
        geometryBoundsCache.set(el, { key, bounds });
      } finally {
        geometry.remove();
      }
    } else {
      const bbox = node.getBBox();
      const pts = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
        { x: bbox.x, y: bbox.y + bbox.height },
      ].map((p) => {
        const matrix = node.ownerSVGElement
          .getScreenCTM()
          .inverse()
          .multiply(node.getScreenCTM());
        return new DOMPoint(p.x, p.y).matrixTransform(matrix);
      });
      const xs = pts.map((p) => p.x),
        ys = pts.map((p) => p.y);
      bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    }
    boundsCache.set(node, bounds);
    return bounds;
  } catch {
    return null;
  }
}
function selectionBounds(doc) {
  const boxes = selected(doc)
    .map((el) => elementBounds(doc, el))
    .filter(Boolean);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}
function resizeSelection(doc, originals, anchor, sx, sy) {
  for (const original of originals) {
    const el = findElement(doc, original.id);
    if (hasParentTransform(doc, el.id)) {
      transformWorld(
        doc,
        el,
        [sx, 0, 0, sy, anchor.x * (1 - sx), anchor.y * (1 - sy)],
        original,
      );
      continue;
    }
    el.sx = original.sx * sx;
    el.sy = original.sy * sy;
    el.tx = anchor.x + (original.tx - anchor.x) * sx;
    el.ty = anchor.y + (original.ty - anchor.y) * sy;
    // A non-uniform world-space resize of a rotated object introduces shear.
    // Keep its rotation and put that shear into the existing base matrix.
    if (original.rotation && sx !== sy) {
      const angle = (original.rotation * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle),
        a = ((sx * c * c + sy * s * s) * original.sx) / el.sx,
        b = ((sy - sx) * c * s * original.sx) / el.sy,
        k = ((sy - sx) * c * s * original.sy) / el.sx,
        d = ((sx * s * s + sy * c * c) * original.sy) / el.sy,
        m = original.matrix || [1, 0, 0, 1, 0, 0];
      el.matrix = [
        a * m[0] + k * m[1],
        b * m[0] + d * m[1],
        a * m[2] + k * m[3],
        b * m[2] + d * m[3],
        a * m[4] + k * m[5],
        b * m[4] + d * m[5],
      ];
      el.wrappers = [
        { transform: `matrix(${a} ${b} ${k} ${d} 0 0)` },
        ...(original.wrappers || []),
      ];
    } else if (original.matrix) el.matrix = clone(original.matrix);
    else delete el.matrix;
    if (!original.rotation || sx === sy) {
      if (original.wrappers) el.wrappers = clone(original.wrappers);
      else delete el.wrappers;
    }
  }
}
function selectionTransformFeedback(doc, bounds = selectionBounds(doc)) {
  const interaction =
    state.interaction?.docId === doc.id ? state.interaction : null;
  const hover = transformHover?.docId === doc.id ? transformHover : null;
  const transforming =
    interaction && ["move", "resize", "rotate"].includes(interaction.type);
  const feedback =
    doc.id === state.activeId && state.tool === "select" && bounds
      ? transformFeedback({
          type: transforming
            ? interaction.type
            : hover?.handle === "rotate"
              ? "rotate"
              : hover
                ? "resize"
                : null,
          bounds,
          originalBounds: transforming ? interaction.bounds : bounds,
          handle: transforming ? interaction.handle : hover?.handle,
          ...((transforming ? interaction : hover)?.feedback || {}),
          zoom: doc.zoom,
          ghost: transforming ? interaction.originalOutline : "",
          dragging: !!(transforming && interaction.before),
          startAngle: interaction?.startAngle,
        })
      : { markup: "", label: "" };
  return {
    feedback,
    handle: transforming ? interaction.handle : hover?.handle,
    position: transforming ? interaction.feedbackClient : hover,
  };
}
function refreshTransformFeedback(doc) {
  const overlay = windows.get(doc.id)?.querySelector(".overlay");
  if (!overlay) return;
  const { feedback, handle, position } = selectionTransformFeedback(doc);
  for (const group of overlay.querySelectorAll(".transform-feedback"))
    group.innerHTML = namespaceMarkup(
      feedback.markup,
      `overlay-${doc.id}-${group.parentElement.dataset.tileX}-${group.parentElement.dataset.tileY}`,
    );
  for (const item of overlay.querySelectorAll("[data-handle]"))
    item.classList.toggle("active-transform", item.dataset.handle === handle);
  renderTransformReadout(doc, feedback.label, position);
}
function renderSelection(doc) {
  const overlay = windows.get(doc.id)?.querySelector(".overlay");
  if (!overlay) return;
  const nodeElements = state.tool === "node" ? selected(doc) : [];
  const dense =
    nodeElements.reduce((count, el) => count + (el.nodes?.length || 0), 0) >
    250;
  // Measure the viewport before replacing any overlay DOM to avoid forced layout.
  const denseStage = dense ? overlay.closest(".stage") : null;
  const denseSize = dense
    ? {
        width: denseStage.clientWidth,
        height: denseStage.clientHeight,
        box: viewBox(doc),
      }
    : null;
  const priorNodes = denseNodeOverlays.get(doc.id);
  if (!dense) denseNodeOverlays.delete(doc.id);
  const bounds = selectionBounds(doc),
    r = 3.5 / doc.zoom;
  const interaction =
    state.interaction?.docId === doc.id ? state.interaction : null;
  const { feedback, handle, position } = selectionTransformFeedback(
    doc,
    bounds,
  );
  let markup = `<g class="transform-feedback" pointer-events="none">${feedback.markup}</g>`;
  for (const text of nodeElements.filter((e) => e.attrs.textPath)) {
    const world = multiply(parentMatrix(doc, text.id), elementMatrix(text));
    markup += `<path d="${esc(text.attrs.d)}" transform="matrix(${world.join(" ")})" fill="none" stroke="#0055aa" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4 3" pointer-events="none"/>`;
  }
  renderTransformReadout(doc, feedback.label, position);
  if (bounds && doc.id === state.activeId) {
    markup += `<rect class="selection-outline" x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}"/>`;
    if (state.tool === "select")
      for (const [key, x, y] of [
        ["nw", bounds.x, bounds.y],
        ["ne", bounds.x + bounds.w, bounds.y],
        ["sw", bounds.x, bounds.y + bounds.h],
        ["se", bounds.x + bounds.w, bounds.y + bounds.h],
      ])
        markup += `<rect class="selection-handle ${key === handle ? "active-transform" : ""}" data-handle="${key}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`;
    if (state.tool === "select") {
      const cx = bounds.x + bounds.w / 2,
        cy = bounds.y - 23 / doc.zoom;
      markup += `<path d="M${cx} ${bounds.y}V${cy}" stroke="#000080" stroke-width="${1 / doc.zoom}" pointer-events="none"/><circle class="selection-handle rotation-handle ${"rotate" === handle ? "active-transform" : ""}" data-handle="rotate" cx="${cx}" cy="${cy}" r="${5 / doc.zoom}"><title>Rotate artwork${inputBindings.get("gesture:rotate-angle") ? `; hold ${esc(inputBindings.get("gesture:rotate-angle"))} for 15° steps` : ""}</title></circle>`;
    }
    if (state.tool === "node" && !dense)
      for (const el of selected(doc))
        if (el.nodes) {
          const world = multiply(parentMatrix(doc, el.id), elementMatrix(el));
          const pointToWorld = (point) => transformPoint(point, world);
          el.nodes.forEach((node, index) => {
            const p = pointToWorld(node);
            if (node.hx || node.hy || node.inx || node.iny) {
              const a = pointToWorld({
                  x: node.x + (node.inx ?? -node.hx),
                  y: node.y + (node.iny ?? -node.hy),
                }),
                b = pointToWorld({ x: node.x + node.hx, y: node.y + node.hy });
              markup += `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" fill="none" stroke="#76916a" stroke-width="${1 / doc.zoom}" pointer-events="none"/><circle class="node-handle" data-node="${index}" data-node-element="${el.id}" data-control="in" cx="${a.x}" cy="${a.y}" r="${r}"/><circle class="node-handle" data-node="${index}" data-node-element="${el.id}" data-control="out" cx="${b.x}" cy="${b.y}" r="${r}"/>`;
            }
            markup += `<rect class="node-handle ${activeNode?.docId === doc.id && activeNode.elementId === el.id && activeNode.index === index ? "active-node" : ""}" data-node="${index}" data-node-element="${el.id}" x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}"><title>${node.kind === "smooth" ? "Smooth" : "Corner"} node ${index + 1}</title></rect>`;
          });
        }
  }
  if (state.pen?.docId === doc.id) {
    const el = findElement(doc, state.pen.elementId);
    if (el)
      for (const node of el.nodes)
        markup += `<circle cx="${node.x}" cy="${node.y}" r="${r}" fill="#eff6dc" stroke="#42634c" stroke-width="${1 / doc.zoom}" pointer-events="none"/>`;
  }
  if (interaction?.docId === doc.id && interaction.type === "marquee") {
    const { start, current } = interaction;
    markup += `<rect class="selection-outline" x="${Math.min(start.x, current.x)}" y="${Math.min(start.y, current.y)}" width="${Math.abs(current.x - start.x)}" height="${Math.abs(current.y - start.y)}"/>`;
  }
  let decorations = overlay.querySelector(".selection-decorations");
  if (!decorations) {
    overlay.innerHTML = '<g class="selection-decorations"></g>';
    decorations = overlay.firstElementChild;
  }
  if (!dense || !bounds || doc.id !== state.activeId)
    overlay.querySelector(".dense-node-overlay")?.remove();
  decorations.innerHTML = tileOffsets(drawingModes(doc))
    .map(
      ({ x, y }) =>
        `<g data-tile-x="${x}" data-tile-y="${y}" transform="translate(${x * doc.width} ${y * doc.height})">${namespaceMarkup(markup, `overlay-${doc.id}-${x}-${y}`)}</g>`,
    )
    .join("");
  if (dense && bounds && doc.id === state.activeId) {
    let model =
      interaction?.type === "node-drag" &&
      priorNodes?.interaction === interaction &&
      priorNodes.radius === r
        ? priorNodes
        : null;
    if (model) {
      const element = findElement(doc, interaction.elementId);
      if (
        !model.updateNode(
          element,
          interaction.nodeIndex,
          multiply(parentMatrix(doc, element.id), elementMatrix(element)),
        )
      )
        model = null;
    }
    model ||= nodeOverlay(
      nodeElements,
      (el) => multiply(parentMatrix(doc, el.id), elementMatrix(el)),
      r,
      activeNode,
    );
    model.interaction = interaction;
    denseNodeOverlays.set(doc.id, model);
    const { box, width, height } = denseSize;
    if (!overlay.querySelector(".dense-node-overlay"))
      overlay.insertAdjacentHTML(
        "afterbegin",
        `<foreignObject class="dense-node-overlay" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" pointer-events="none"><canvas xmlns="http://www.w3.org/1999/xhtml" data-node-static style="position:absolute;inset:0;width:100%;height:100%" hidden></canvas><canvas xmlns="http://www.w3.org/1999/xhtml" data-node-live style="position:absolute;inset:0;width:100%;height:100%"></canvas></foreignObject>`,
      );
    const host = overlay.querySelector(".dense-node-overlay");
    for (const [key, value] of Object.entries({
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
    }))
      host.setAttribute(key, value);
    model.draw(
      host.querySelector("[data-node-live]"),
      box,
      width,
      height,
      tileOffsets(drawingModes(doc)).map(({ x, y }) => ({
        x: x * doc.width,
        y: y * doc.height,
      })),
      interaction?.type === "node-drag" ? interaction : null,
      host.querySelector("[data-node-static]"),
    );
  }
}
function renderTransformReadout(doc, label, position) {
  const readout = windows.get(doc.id)?.querySelector(".transform-readout");
  if (!readout) return;
  readout.hidden = !label || !position;
  if (readout.hidden) return;
  readout.textContent = label;
  const viewport = readout.parentElement,
    box = viewport.getBoundingClientRect();
  const x = position.clientX - box.left,
    y = position.clientY - box.top;
  readout.style.left = `${Math.max(4, Math.min(x + 14, viewport.clientWidth - readout.offsetWidth - 4))}px`;
  readout.style.top = `${Math.max(4, Math.min(y + 18, viewport.clientHeight - readout.offsetHeight - 4))}px`;
}
function updateTransformModifiers(event, doc = active(), render = true) {
  if (!doc) return;
  const i = state.interaction?.docId === doc.id ? state.interaction : null;
  const target =
    i && ["move", "resize", "rotate"].includes(i.type)
      ? i
      : transformHover?.docId === doc.id
        ? transformHover
        : null;
  if (!target) return;
  const previous = target.feedback || {};
  target.feedback = {
    ...target.feedback,
    centered: gesture("resize-center", event),
    aspectLocked: lockAspect || gesture("resize-aspect", event),
    snapped: gesture("rotate-angle", event),
    axisConstrained: gesture("move-axis", event),
    snapBypass: gesture("snap-bypass", event),
  };
  const keys =
    i?.type === "resize"
      ? ["centered", "aspectLocked", "snapBypass"]
      : i?.type === "rotate"
        ? ["snapped", "snapBypass"]
        : ["axisConstrained", "snapBypass"];
  if (
    render &&
    i?.before &&
    i.feedbackClient &&
    keys.some((key) => previous[key] !== target.feedback[key])
  ) {
    pointerMove(
      {
        ...i.feedbackClient,
        pointerId: i.pointerId,
        pointerType: state.cursor?.pointerType || "mouse",
        buttons: 1,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        heldKeys: inputBindings.heldKeys(),
        target: windows.get(doc.id).querySelector(".stage"),
        preventDefault() {},
      },
      doc,
    );
    return;
  }
  if (render) refreshTransformFeedback(doc);
}
function renderRulers(doc, box) {
  const el = windows.get(doc.id),
    step = doc.zoom > 0.6 ? 50 : doc.zoom > 0.25 ? 100 : 500;
  const top = [],
    left = [];
  for (
    let x = Math.floor(box.x / step) * step;
    x < box.x + box.w;
    x += step / 5
  ) {
    const major = Math.abs(x / step - Math.round(x / step)) < 0.001;
    top.push(
      `<span class="${major ? "major" : ""}" style="left:${(x - box.x) * doc.zoom}px">${major ? Math.round(x) : ""}</span>`,
    );
  }
  for (
    let y = Math.floor(box.y / step) * step;
    y < box.y + box.h;
    y += step / 5
  ) {
    const major = Math.abs(y / step - Math.round(y / step)) < 0.001;
    left.push(
      `<span class="${major ? "major" : ""}" style="top:${(y - box.y) * doc.zoom}px">${major ? `<b>${Math.round(y)}</b>` : ""}</span>`,
    );
  }
  el.querySelector(".ruler-top").innerHTML = top.join("");
  el.querySelector(".ruler-left").innerHTML = left.join("");
}
function renderInspector({ preserveLayers = false } = {}) {
  const doc = active();
  renderPalette();
  if (!doc?.selected.length) restoreDrawingStyle();
  $("#document-size").textContent = doc
    ? `${Math.round(doc.width * 100) / 100} × ${Math.round(doc.height * 100) / 100} px`
    : "No document";
  document.querySelectorAll(".commandbar [data-action]").forEach((button) => {
    button.disabled = commandState(button.dataset.action).enabled === false;
  });
  if (!preserveLayers) $("#layers").innerHTML = doc ? layerMarkup(doc) : "";
  else
    for (const row of $("#layers").querySelectorAll("[data-layer-row]")) {
      const current = row.dataset.layerRow === doc?.activeLayer;
      row.classList.toggle("active", current);
      row.setAttribute("aria-selected", String(current));
      const button = row.querySelector("[data-layer-select]");
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  $("#layer-count").textContent = doc
    ? String(allLayers(doc).length).padStart(2, "0")
    : "00";
  const items = doc ? selected(doc) : [],
    box = doc ? selectionBounds(doc) : null;
  $("#selection-properties").innerHTML = items.length
    ? `<div class="selection-summary"><strong>${items.length === 1 ? (items[0].paint && isPaintArtwork(items[0]) ? "Paint region" : items[0].brush ? "Brush stroke" : items[0].type === "import" ? "Imported artwork" : items[0].type[0].toUpperCase() + items[0].type.slice(1)) : `${items.length} objects`}</strong><span>${box ? `${Math.round(box.w)} × ${Math.round(box.h)} px` : ""}</span></div><p class="bounds-note">Bounds exclude outlines.</p><div class="transform-fields">${[
        ["x", "X", "Object X", box?.x],
        ["y", "Y", "Object Y", box?.y],
        ["width", "W", "Object width", box?.w],
        ["height", "H", "Object height", box?.h],
        ["rotation", "°", "Rotation", items[0].rotation],
      ]
        .map(
          ([key, label, name, value]) =>
            `<label>${label}<input data-transform="${key}" type="number" step="any" ${["width", "height"].includes(key) ? 'min="0.01"' : ""} value="${Math.round((value ?? 0) * 100) / 100}" aria-label="${name}" /></label>`,
        )
        .join(
          "",
        )}</div><div class="selection-actions"><button data-action="duplicate">${icon("duplicate")}Duplicate</button><button data-action="delete">${icon("trash")}Delete</button>${items.length === 1 && items[0].type === "text" ? '<button data-action="edit-text">Edit</button>' : ""}</div>`
    : '<p class="empty-selection">Select artwork to edit its position and size.</p>';
  if (items.length)
    $("#selection-properties").insertAdjacentHTML(
      "beforeend",
      compositionControls(doc, items),
    );
  renderToolOptions();
}

function selectionBorderWidth(el) {
  return el.attrs.stroke && el.attrs.stroke !== "none"
    ? Number(el.attrs["stroke-width"] ?? 1)
    : 0;
}
function selectionAppearanceControls(items) {
  if (!items.every(supportsSelectionAppearance)) return "";
  const first = items[0];
  const value = (el, key, fallback) =>
    el.attrs[key === "fill" ? selectionFillKey(el) : key] ?? fallback;
  const same = (key, fallback) =>
    items.every(
      (el) => value(el, key, fallback) === value(first, key, fallback),
    );
  const widths = items.map(selectionBorderWidth);
  const mixedWidth = widths.some((width) => width !== widths[0]);
  const width = widths[0];
  const swatch = (key, label) => {
    const colour = solidColor(value(first, key));
    const mixed = !same(key, "none");
    const background = mixed
      ? "repeating-conic-gradient(#fff 0 25%, #808080 0 50%) 0 / 8px 8px"
      : colour || "linear-gradient(135deg,#fff 45%,#f00 46% 54%,#fff 55%)";
    return `<button type="button" data-selection-colour="${key}" aria-label="${label}" title="${mixed ? "Mixed colours" : label}"><i style="background:${background}" aria-hidden="true"></i></button>`;
  };
  const strokeOnly = items.every((el) => selectionFillKey(el) === "stroke");
  const borderLabel = items.every((el) => el.type === "text")
    ? "Stroke"
    : "Border";
  const fillControl = `<div class="appearance-row"><span>${strokeOnly ? "Stroke" : "Fill"}</span>${swatch("fill", strokeOnly ? "Stroke colour" : "Fill colour")}</div>`;
  if (!items.every(supportsBorder)) return fillControl;
  return `${fillControl}
    <div class="appearance-row"><span>${borderLabel}</span>${swatch("stroke", `${borderLabel} colour`)}</div>
    <label class="appearance-row" for="selection-border-width" title="Set to zero for no ${borderLabel.toLowerCase()}.">${borderLabel} size<input id="selection-border-width" aria-label="${borderLabel} size (px)" type="range" min="0" max="${Math.max(100, ...widths)}" step="0.1" value="${width}" aria-valuetext="${mixedWidth ? "Mixed" : width + " px"}"/><output id="selection-border-value" for="selection-border-width">${mixedWidth ? "Mixed" : width + " px"}</output></label>`;
}

function editSelectionAppearance(doc, ids, appearance, border = false) {
  queueMutation(doc, () => {
    const edits = resolvedIds(doc, ids)
      .map((id) => findElement(doc, id))
      .filter(
        (el) =>
          el && (border ? supportsBorder(el) : supportsSelectionAppearance(el)),
      )
      .map((el) => ({
        el,
        attrs: typeof appearance === "function" ? appearance(el) : appearance,
      }))
      .filter(
        ({ el, attrs }) =>
          (border && el.type !== "text" && !el.cosmeticBorder) ||
          Object.entries(attrs).some(([key, value]) => el.attrs[key] !== value),
      );
    if (!edits.length) return;
    checkpoint(doc);
    for (const { el, attrs } of edits) {
      if (border && el.type !== "text") el.cosmeticBorder = true;
      Object.assign(el.attrs, attrs);
    }
    changed(doc, border ? "Border updated." : "Colour updated.");
  });
}

let selectionBorderPreview = null;
function commitSelectionBorderPreview() {
  const preview = selectionBorderPreview;
  selectionBorderPreview = null;
  if (!preview) return;
  const { doc, ids, width } = preview;
  editSelectionAppearance(
    doc,
    ids,
    (el) => ({
      "stroke-width": width,
      stroke:
        width > 0 && (!el.attrs.stroke || el.attrs.stroke === "none")
          ? preview.stroke
          : el.attrs.stroke || "none",
      "stroke-linejoin": el.attrs["stroke-linejoin"] || "round",
    }),
    true,
  );
}

$("#selection-appearance-options").addEventListener("change", (event) => {
  const doc = active();
  if (!doc) return;
  const ids = [...doc.selected];
  if (event.target.id === "selection-border-width") {
    if (!event.target.value || !event.target.checkValidity()) {
      renderInspector();
      return;
    }
    selectionBorderPreview ||= {
      doc,
      ids,
      width: Number(event.target.value),
      stroke: solidColor(state.stroke) || "#000000",
    };
    commitSelectionBorderPreview();
  }
});
$("#selection-appearance-options").addEventListener("input", (event) => {
  if (event.target.id !== "selection-border-width") return;
  const width = Number(event.target.value),
    doc = active();
  $("#selection-border-value").textContent = width + " px";
  event.target.setAttribute("aria-valuetext", width + " px");
  if (!doc) return;
  selectionBorderPreview = {
    doc,
    ids: [...doc.selected],
    width,
    stroke: solidColor(state.stroke) || "#000000",
  };
  // Preview only the rendered border; commit one undoable edit on release.
  for (const el of selected(doc).filter(supportsBorder)) {
    const view = gpuViewports.get(doc.id);
    if (view?.active) {
      const record = view.records.get(el.id);
      if (record)
        view.update({
          ...record,
          width,
          stroke:
            el.attrs.stroke && el.attrs.stroke !== "none"
              ? el.attrs.stroke
              : solidColor(state.stroke) || "#000000",
        });
      view.view(doc, viewBox(doc));
      continue;
    }
    const node = windows
      .get(doc.id)
      ?.querySelector(`[data-element="${el.id}"] ${el.type}`);
    if (!node) continue;
    node.setAttribute("stroke-width", width);
    node.setAttribute(
      "stroke",
      el.attrs.stroke && el.attrs.stroke !== "none"
        ? el.attrs.stroke
        : solidColor(state.stroke) || "#000000",
    );
  }
});
// Save on release and focus changes even if the slider never sends change.
// Keep the original selection so a later click cannot redirect the edit.
document.addEventListener("pointerup", commitSelectionBorderPreview);
$("#selection-appearance-options").addEventListener(
  "focusout",
  commitSelectionBorderPreview,
);
$("#selection-appearance-options").addEventListener("pointercancel", () => {
  selectionBorderPreview = null;
  const doc = active();
  if (doc) renderStage(doc);
  renderToolOptions();
});
$("#selection-appearance-options").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-selection-colour]");
  const doc = active();
  if (!button || !doc) return;
  const ids = [...doc.selected],
    first = selected(doc)[0];
  const key = button.dataset.selectionColour;
  const border = key === "stroke";
  const colourKey = border ? key : selectionFillKey(first);
  const chosen = await pickColour(
    border
      ? selected(doc).every((el) => el.type === "text")
        ? "Stroke Colour"
        : "Border Colour"
      : colourKey === "stroke"
        ? "Stroke Colour"
        : "Fill Colour",
    first.attrs[colourKey] || "none",
    Number(
      first.attrs[
        border
          ? "stroke-opacity"
          : first.type === "text"
            ? "fill-opacity"
            : "opacity"
      ] ?? 1,
    ),
  );
  if (!chosen) return;
  editSelectionAppearance(
    doc,
    ids,
    (el) => ({
      [border ? key : selectionFillKey(el)]: chosen.color,
      [border
        ? "stroke-opacity"
        : el.type === "text"
          ? "fill-opacity"
          : "opacity"]: chosen.opacity,
      ...(border
        ? {
            "stroke-width":
              chosen.color === "none"
                ? 0
                : selectionBorderWidth(el) || (el.type === "text" ? 1 : 0),
            "stroke-linejoin": el.attrs["stroke-linejoin"] || "round",
          }
        : {}),
    }),
    border,
  );
});

function currentNodeElement(doc) {
  if (
    !doc ||
    state.tool !== "node" ||
    activeNode?.docId !== doc.id ||
    !doc.selected.includes(activeNode.elementId)
  )
    return null;
  const el = findElement(doc, activeNode.elementId);
  return el?.nodes?.[activeNode.index] ? el : null;
}
function compositionControls(doc, items) {
  const el = currentNodeElement(doc),
    disabled = el ? "" : "disabled";
  let markup = `<label class="aspect-option"><input type="checkbox" id="lock-aspect" ${lockAspect ? "checked" : ""}/>Lock aspect ratio</label>`;
  markup += `<fieldset class="composition-controls"><legend>Align ${items.length > 1 ? "Selection" : "to Artboard"}</legend><div class="alignment-actions">${[
    ["left", "Left", "Align left edges"],
    ["center", "Centre", "Centre horizontally"],
    ["right", "Right", "Align right edges"],
    ["top", "Top", "Align top edges"],
    ["middle", "Middle", "Centre vertically"],
    ["bottom", "Bottom", "Align bottom edges"],
  ]
    .map(
      ([key, label, help]) =>
        `<button data-action="align-${key}" title="${help}">${label}</button>`,
    )
    .join("")}</div></fieldset>`;
  if (items.some(canConvertToCurves))
    markup +=
      '<div class="curve-conversion"><button data-action="convert-curves">Convert to Curves</button><p>Creates editable curves. Keeps the fill and outline.</p></div>';
  if (items.some((e) => e.type === "text"))
    markup +=
      '<div class="curve-conversion"><button data-action="outline-text">Convert Text to Paths</button></div>';
  if (canAttachText(items))
    markup +=
      '<div class="curve-conversion"><button data-action="attach-text-path" title="Copies the selected curve; the original stays unchanged.">Attach Text to Path</button></div>';
  if (items.length === 1 && items[0].attrs.textPath)
    markup +=
      '<div class="curve-conversion"><button data-action="edit-text-path">Edit Text Path</button><button data-action="detach-text-path">Detach from Path</button></div>';
  if (state.tool === "node" && items.some((item) => item.nodes)) {
    markup += `<fieldset class="curve-controls"><legend>${el ? `Node ${activeNode.index + 1} of ${el.nodes.length}` : "Curve Nodes"}</legend><div class="node-actions"><button data-action="node-add" ${!el || nextNode(el, activeNode.index) < 0 ? "disabled" : ""} title="Insert an anchor halfway to the next node">Add</button><button data-action="node-delete" ${disabled}>Delete Node</button><button data-action="node-corner" ${disabled} aria-pressed="${el?.nodes[activeNode.index].kind === "corner"}">Corner</button><button data-action="node-smooth" ${disabled} aria-pressed="${el?.nodes[activeNode.index].kind === "smooth"}">Smooth</button></div><p>${el ? "Drag square anchors or round handles. Alt-drag a handle to make a corner." : "Click a square anchor to select it. Add inserts a node on the next segment."}</p></fieldset>`;
  }
  return markup;
}

function startWindowDrag(event, doc, edge = null) {
  if ((doc.maximized && !doc.minimized) || (doc.minimized && edge)) return;
  if (edge) event.preventDefault();
  const rectKey = doc.minimized ? "minimizedRect" : "window";
  const frameElement = windows.get(doc.id);
  const target = edge ? frameElement : frameElement.querySelector(".mdi-title"),
    origin = { ...doc[rectKey] },
    x = event.clientX,
    y = event.clientY;
  const minWidth = Math.min(330, origin.w),
    minHeight = Math.min(250, origin.h);
  let frame = 0;
  target.setPointerCapture(event.pointerId);
  frameElement.classList.add("window-dragging");
  frameElement.style.cursor = edge
    ? edge === "n" || edge === "s"
      ? "ns-resize"
      : edge === "e" || edge === "w"
        ? "ew-resize"
        : edge === "nw" || edge === "se"
          ? "nwse-resize"
          : "nesw-resize"
    : "move";
  const move = (e) => {
    if (e.pointerId !== event.pointerId) return;
    const dx = e.clientX - x,
      dy = e.clientY - y;
    if (edge) {
      let left = origin.x,
        top = origin.y,
        right = origin.x + origin.w,
        bottom = origin.y + origin.h;
      if (edge.includes("w")) left = clamp(origin.x + dx, 0, right - minWidth);
      if (edge.includes("e"))
        right = clamp(
          origin.x + origin.w + dx,
          left + minWidth,
          Math.max(left + minWidth, desktop.clientWidth),
        );
      if (edge.includes("n")) top = clamp(origin.y + dy, 0, bottom - minHeight);
      if (edge.includes("s"))
        bottom = clamp(
          origin.y + origin.h + dy,
          top + minHeight,
          Math.max(top + minHeight, desktop.clientHeight),
        );
      doc.window = { x: left, y: top, w: right - left, h: bottom - top };
    } else {
      doc[rectKey].x = clamp(
        origin.x + dx,
        0,
        Math.max(0, desktop.clientWidth - (doc.minimized ? origin.w : 100)),
      );
      doc[rectKey].y = clamp(
        origin.y + dy,
        0,
        Math.max(0, desktop.clientHeight - (doc.minimized ? origin.h : 40)),
      );
    }
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyWindowRect(doc);
      });
  };
  const end = (e) => {
    if (e.pointerId !== event.pointerId) return;
    cancelAnimationFrame(frame);
    if (e.type === "pointercancel") doc[rectKey] = origin;
    applyWindowRect(doc);
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", end);
    target.removeEventListener("pointercancel", end);
    target.removeEventListener("lostpointercapture", end);
    frameElement.classList.remove("window-dragging");
    frameElement.style.cursor = "";
    if (target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId);
    autosave();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
  target.addEventListener("lostpointercapture", end);
}
function updateInput(event) {
  const pen = event.pointerType === "pen";
  if (pen) state.lastPen = Date.now();
  $("#input-label").textContent = pen
    ? "Pen input"
    : event.pointerType === "touch"
      ? "Touch input"
      : "Mouse input";
  $("#pressure-level").style.width = pen
    ? `${Math.round(event.pressure * 100)}%`
    : "0%";
  $("#pressure-number").textContent = pen
    ? `${Math.round(event.pressure * 100)}%`
    : "—";
  $("#pen-chip").classList.toggle("connected", pen);
  $("#pen-chip span:last-child").textContent = pen
    ? "Pen input"
    : event.pointerType === "touch"
      ? "Touch input"
      : "Mouse input";
}
function beginMutation(doc, interaction) {
  interaction.floatingBefore = clone(floatingSelections.get(doc.id) || null);
  interaction.before = snapshot(doc);
  interaction.previousDirty = doc.dirty;
  interaction.historyLength = doc.history.length;
  // Cancellation and Undo need the same pre-gesture state. Both are patched
  // by pending geometry jobs; avoid cloning the entire document twice.
  checkpoint(doc, interaction.before);
}
function hitElement(event, doc) {
  if (replayingPointers && event.replayedElementId)
    return editable(doc, event.replayedElementId)
      ? event.replayedElementId
      : null;
  const view = gpuViewports.get(doc.id);
  if (view?.active) {
    const id = view.hit(worldPoint(event, doc, false, true), doc);
    return id && editable(doc, id) ? id : null;
  }
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const el = target?.closest("[data-element]");
  if (!el || !windows.get(doc.id).contains(el)) return null;
  const id = scopeHit(doc, el.dataset.element);
  return editable(doc, id) ? id : null;
}
function pointerDown(event, doc) {
  if (
    event.button === 0 &&
    ["brush", "pencil", "eraser", "line"].includes(state.tool) &&
    gesture("brush-size", event) &&
    !state.interaction
  ) {
    event.preventDefault();
    activateDocument(doc.id);
    if (!replayingPointers) springTools?.use();
    state.interaction = {
      type: "brush-size",
      docId: doc.id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      size: state.size,
    };
    const stage = windows.get(doc.id).querySelector(".stage");
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    return;
  }
  const axis = event.target.closest("[data-symmetry-axis]");
  if (axis && event.button === 0 && !state.space && !state.interaction) {
    event.preventDefault();
    activateDocument(doc.id);
    const interaction = {
      type: "symmetry-axis",
      docId: doc.id,
      pointerId: event.pointerId,
      axis: axis.dataset.symmetryAxis,
      tileX: Number(axis.dataset.axisTileX),
      tileY: Number(axis.dataset.axisTileY),
    };
    state.interaction = interaction;
    const stage = windows.get(doc.id).querySelector(".stage");
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    return;
  }
  const pendingCopy = floatingSelections.get(doc.id);
  if (
    !replayingPointers &&
    pendingCopy?.pending &&
    event.button === 0 &&
    !state.space &&
    !["hand", "zoom", "eyedropper"].includes(state.tool) &&
    !(gesture("sample", event) && ["brush", "pencil"].includes(state.tool)) &&
    !event.target.closest("[data-handle], [data-node]") &&
    (!["select", "node"].includes(state.tool) ||
      !pendingCopy.ids.includes(hitElement(event, doc)))
  ) {
    queueMutation(doc, () => placeCopy(doc));
    deferPointer(event, doc);
    return;
  }
  const drawing =
    ["brush", "pencil", "rect", "ellipse", "line", "pen"].includes(
      state.tool,
    ) ||
    state.tool === "eraser" ||
    event.button === 5;
  if (
    !replayingPointers &&
    paintQueues.has(doc.id) &&
    (!drawing || queuedMutations.has(doc.id)) &&
    !["hand", "zoom"].includes(state.tool) &&
    !state.space &&
    event.button !== 1 &&
    !state.interaction &&
    (event.button === 0 || event.button === 5 || event.button === 2)
  ) {
    deferPointer(event, doc);
    return;
  }
  const secondary = event.button === 2;
  const paintColor = secondary ? state.stroke : state.fill;
  const brushErase =
    event.button === 5 ||
    state.tool === "eraser" ||
    (state.tool === "slice" && state.size > 0) ||
    (["brush", "pencil", "line"].includes(state.tool) && paintColor === "none");
  if (![0, 1, 2, 5].includes(event.button) || state.interaction) return;
  if (
    secondary &&
    ![
      "brush",
      "pencil",
      "line",
      "pen",
      "rect",
      "ellipse",
      "bucket",
      "select",
      "node",
      "eyedropper",
      "eraser",
      "slice",
      "smooth",
    ].includes(state.tool)
  )
    return;
  if (event.pointerType === "touch" && Date.now() - (state.lastPen || 0) < 700)
    return;
  if (!replayingPointers) activateDocument(doc.id);
  if (!replayingPointers) springTools?.use();
  updateInput(event);
  if (!["select", "node"].includes(state.tool)) event.preventDefault();
  updateBrushCursor(event, doc);
  const stage = windows.get(doc.id).querySelector(".stage");
  if (!replayingPointers || doc.id === state.activeId)
    stage.focus({ preventScroll: true });
  const tool =
    event.button === 1 || state.space
      ? "hand"
      : event.button === 5 ||
          state.tool === "eraser" ||
          (state.tool === "slice" && state.size > 0) ||
          (brushErase && state.tool === "pencil")
        ? "brush"
        : state.tool;
  const modes = drawingModes(doc),
    raw = worldPoint(event, doc, false, true),
    tile = event.target.closest("[data-tile-x]"),
    offset =
      tool === "pen" && state.pen?.docId === doc.id
        ? state.pen.offset
        : {
            x: modes.tileX
              ? Number(tile?.dataset.tileX ?? Math.floor(raw.x / doc.width)) *
                doc.width
              : 0,
            y: modes.tileY
              ? Number(tile?.dataset.tileY ?? Math.floor(raw.y / doc.height)) *
                doc.height
              : 0,
          };
  let inputMatrix = [1, 0, 0, 1, -offset.x, -offset.y];
  const repeatMatrix = event.target.closest("[data-repeat-matrix]")?.dataset
    .repeatMatrix;
  if (["select", "node"].includes(tool) && repeatMatrix)
    inputMatrix = multiply(
      inverse(repeatMatrix.split(",").map(Number)),
      inputMatrix,
    );
  if (["hand", "zoom"].includes(tool)) inputMatrix = [...identity];
  const start = transformPoint(raw, inputMatrix),
    target = event.target;
  if (
    state.snap &&
    ![
      "select",
      "brush",
      "pencil",
      "bucket",
      "nudge",
      "slice",
      "smooth",
    ].includes(tool) &&
    !gesture("snap-bypass", event)
  ) {
    start.x = snapCoordinate(start.x, state.gridSize, state.snapOffset);
    start.y = snapCoordinate(start.y, state.gridSize, state.snapOffset);
  }
  if (
    tool === "eyedropper" ||
    (gesture("sample", event) &&
      ["brush", "pencil"].includes(state.tool) &&
      event.button !== 5)
  ) {
    const gpu = gpuViewports.get(doc.id);
    const color = gpu?.active
      ? solidColor(
          gpu.sample(
            worldPoint(event, doc, false, true),
            doc,
            gesture("sample-outline", event),
          ),
        )
      : sampleArtworkColor(
          stage,
          {
            ...event,
            clientX: event.clientX,
            clientY: event.clientY,
            shiftKey: gesture("sample-outline", event),
          },
          doc.background,
        );
    if (color) {
      // Sampling sets the next drawing color; it never recolors the selection.
      setDrawingStyle({ [secondary ? "stroke" : "fill"]: color });
      updateColors();
      setStatus(`Picked ${color}. Ready to draw.`);
    } else
      setStatus("No solid colour here. Pick a filled shape or its outline.");
    return;
  }
  if (tool === "zoom") {
    zoomDocument(doc, gesture("zoom-out", event) ? 1 / 1.25 : 1.25, {
      x: event.clientX,
      y: event.clientY,
    });
    return;
  }
  if (tool === "text") {
    if (!writableLayer(doc)) return;
    textDialog(null, start);
    return;
  }
  if (tool === "bucket") {
    if (writableLayer(doc)) bucketFill(doc, start, paintColor);
    return;
  }
  const interaction = {
    docId: doc.id,
    pointerId: event.pointerId,
    type: tool,
    start,
    current: start,
    startClient: { x: event.clientX, y: event.clientY },
    inputMatrix,
  };
  if (tool === "hand") {
    interaction.pan = { ...doc.pan };
    stage.classList.add("panning");
  } else if (tool === "select" || tool === "node") {
    const operation = inputBindings.selection(event);
    const handle = event.button === 0 && target.closest("[data-handle]"),
      node =
        event.button === 0 &&
        (target.closest("[data-node]") ||
          (tool === "node" &&
            denseNodeOverlays.get(doc.id)?.hit(worldPoint(event, doc, false))));
    let id = hitElement(event, doc);
    if (
      !handle &&
      !node &&
      operation === "replace" &&
      !doc.selected.includes(id)
    ) {
      id = hitElement(event, doc);
    }
    if (node && tool === "node") {
      interaction.type = "node-drag";
      interaction.elementId = node.dataset.nodeElement;
      interaction.nodeIndex = Number(node.dataset.node);
      interaction.control = node.dataset.control;
      activeNode = {
        docId: doc.id,
        elementId: interaction.elementId,
        index: interaction.nodeIndex,
      };
    } else if (handle && tool === "select") {
      interaction.type =
        handle.dataset.handle === "rotate" ? "rotate" : "resize";
      interaction.handle = handle.dataset.handle;
      interaction.bounds = selectionBounds(doc);
      interaction.originals = clone(selected(doc));
      if (interaction.type === "rotate") {
        interaction.center = {
          x: interaction.bounds.x + interaction.bounds.w / 2,
          y: interaction.bounds.y + interaction.bounds.h / 2,
        };
        interaction.startAngle = Math.atan2(
          start.y - interaction.center.y,
          start.x - interaction.center.x,
        );
      }
    } else if (id && editable(doc, id)) {
      if (operation !== "replace")
        setSelection(doc, combineSelection(doc.selected, [id], operation));
      else if (!doc.selected.includes(id)) setSelection(doc, [id]);
      if (tool === "node" || operation !== "replace") {
        interaction.type = "node-select";
        if (!findElement(doc, id).nodes)
          setStatus(
            "Choose Convert to Curves to edit this artwork's anchors. The curve remains part of this layer’s paint.",
          );
      } else {
        interaction.type = "move";
        interaction.copy =
          event.button === 0 && gesture("copy-selection", event);
        interaction.originals = clone(selected(doc));
        interaction.originalSelection = [...doc.selected];
        interaction.bounds = selectionBounds(doc);
      }
      syncSelectionAppearance(doc);
    } else {
      interaction.type = "marquee";
      interaction.originalSelection = [...doc.selected];
      interaction.selectionOperation = operation;
      if (operation === "replace") setSelection(doc, []);
    }
    renderSelection(doc);
    renderInspector();
  } else if (tool === "pen") {
    if (!writableLayer(doc)) return;
    if (
      state.pen?.docId !== doc.id ||
      !findElement(doc, state.pen.elementId)?.nodes
    ) {
      beginMutation(doc, interaction);
      const el = makeElement("path", {
        d: "",
        fill: "none",
        stroke: paintColor,
        "stroke-width": state.size,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: state.opacity,
      });
      el.nodes = [];
      attachDrawingRepeat(doc, el);
      insertArtwork(doc, el);
      state.pen = {
        docId: doc.id,
        elementId: el.id,
        historyLength: interaction.historyLength,
        previousDirty: interaction.previousDirty,
        primary: paintColor,
        secondary: secondary ? state.fill : state.stroke,
        offset,
      };
    }
    const el = findElement(doc, state.pen.elementId);
    if (
      el.nodes.length > 2 &&
      Math.hypot(start.x - el.nodes[0].x, start.y - el.nodes[0].y) <
        10 / doc.zoom
    ) {
      el.closed = true;
      el.attrs.fill = state.pen.primary;
      el.attrs.stroke = state.pen.secondary;
      el.attrs.d = bezierPath(el.nodes, true);
      finishPen();
      changed(doc, "Closed Bézier path.");
      return;
    }
    el.nodes.push({ ...start, hx: 0, hy: 0 });
    el.attrs.d = bezierPath(el.nodes);
    interaction.elementId = el.id;
    interaction.nodeIndex = el.nodes.length - 1;
    doc.selected = [el.id];
    changed(
      doc,
      "Click to add a point, drag to curve. Enter finishes the path.",
    );
  } else if (["nudge", "slice", "smooth"].includes(tool)) {
    if (!writableLayer(doc)) return;
    interaction.points = [start];
    interaction.last = start;
    interaction.cleanupRadius = state.size / (2 * doc.zoom);
    interaction.ids = scopedElements(doc)
      .filter((el) => !doc.selected.length || doc.selected.includes(el.id))
      .map((el) => el.id);
    if (tool === "nudge") interaction.strength = state.nudgeStrength / 100;
    if (tool === "smooth" || tool === "nudge") {
      interaction.sharpen = secondary;
      if (tool === "smooth") interaction.strength = state.smoothStrength / 90;
      startSculptSession(doc, interaction);
      if (tool === "smooth") {
        sculptDab(doc, interaction, start, 0.15 * interaction.strength);
        renderSmoothChanges(doc, interaction);
      }
    }
  } else if (tool === "eraser") {
    eraseAt(event, doc, interaction);
  } else {
    if (!writableLayer(doc)) return;
    beginMutation(doc, interaction);
    const color = paintColor;
    const attrs = {
      fill: paintColor,
      stroke: secondary ? state.fill : state.stroke,
      "stroke-width": state.size,
      opacity: state.opacity,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    };
    let el;
    if (tool === "brush" || tool === "pencil") {
      el = makeElement("path", {
        ...attrs,
        fill: tool === "brush" ? color : "none",
        stroke: tool === "brush" ? "none" : color,
        "stroke-width": tool === "pencil" ? state.size : 0,
      });
      const endpoint = strokeEndpoints.get(doc);
      const connects =
        gesture("straight", event) &&
        endpoint?.layerId === doc.activeLayer &&
        endpoint.tool === state.tool;
      interaction.straight = connects;
      el.points = connects
        ? [
            { ...endpoint.point },
            { ...start, p: pressureValue(event, state.pressure) },
          ]
        : [{ ...start, p: pressureValue(event, state.pressure) }];
      if (connects) {
        interaction.start = { ...endpoint.point };
        el.smoothing = 0;
      }
      el.brush = tool === "brush";
      el.pencil = tool === "pencil";
      if (el.brush) {
        el.erase = brushErase;
        if (state.tool === "slice") el.slice = true;
        if (state.tool === "slice" && doc.selected.length)
          el.eraseTargets = scopedElements(doc)
            .filter((item) => doc.selected.includes(item.id))
            .map((item) => item.id);
        if (brushErase)
          Object.assign(el.attrs, { fill: "#000000", opacity: 1 });
      }
      el.size = state.size;
      el.pressure = state.tool === "pencil" ? false : state.pressure;
      el.smoothing = interaction.straight ? 0 : state.smoothing;
      if (el.brush && !brushErase) el.paintInside = state.paintInside;
      el.inputPrecision = (event.pointerType === "pen" ? 0.25 : 0.5) / doc.zoom;
      el.attrs.d = el.brush
        ? strokeOutline(el.points, el.size, el.pressure, {
            smoothing: el.smoothing,
            last: false,
          })
        : pencilPath(el.points);
    } else if (tool === "rect")
      el = makeElement("rect", {
        ...attrs,
        x: start.x,
        y: start.y,
        width: 0,
        height: 0,
      });
    else if (tool === "ellipse")
      el = makeElement("ellipse", {
        ...attrs,
        cx: start.x,
        cy: start.y,
        rx: 0,
        ry: 0,
      });
    else if (tool === "line")
      el = makeElement("line", {
        ...attrs,
        fill: "none",
        stroke: brushErase ? "#000000" : color,
        x1: start.x,
        y1: start.y,
        x2: start.x,
        y2: start.y,
      });
    if (!el) return;
    if (tool === "line" && brushErase) el.eraseLine = true;
    if (["rect", "ellipse"].includes(tool)) el.cosmeticBorder = true;
    attachDrawingRepeat(doc, el);
    insertArtwork(doc, el);
    interaction.elementId = el.id;
    if (state.tool !== "slice") doc.selected = [];
    if (el.brush && !interaction.straight)
      previews.set(
        el.id,
        el.repeat ? new RepeatBrushPreview(doc, el) : new BrushPreview(doc, el),
      );
    renderStage(doc);
  }
  state.interaction = interaction;
  transformHover = null;
  if (["move", "resize", "rotate"].includes(interaction.type)) {
    interaction.feedbackClient = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    interaction.originalOutline = namespaceMarkup(
      interaction.originals
        .filter((el) =>
          ["path", "rect", "ellipse", "line", "text"].includes(el.type),
        )
        .map(
          (el) =>
            `<g transform="matrix(${parentMatrix(doc, el.id).join(" ")})">${elementMarkup(el)}</g>`,
        )
        .join(""),
      `transform-ghost-${doc.id}`,
    );
    updateTransformModifiers(event, doc);
  }
  if (!replayingPointers) stage.setPointerCapture(event.pointerId);
}
function writableLayer(doc) {
  const layer = activeLayer(doc);
  if (!layerEditable(doc, layer.id)) {
    toast("Choose an unlocked, visible layer to draw on.");
    return false;
  }
  return true;
}
function brushTouchesBounds(bounds, point, radius) {
  return (
    point.x + radius >= bounds.x &&
    point.x - radius <= bounds.x + bounds.w &&
    point.y + radius >= bounds.y &&
    point.y - radius <= bounds.y + bounds.h
  );
}
function renderSmoothChanges(doc, interaction) {
  const session = smoothSessions.get(interaction);
  if (!session?.dirty.size) return;
  if (gpuViewports.get(doc.id)?.active) {
    const view = gpuViewports.get(doc.id);
    // Clear seam backings once: a neighbour's backing can contain the old
    // contour of an edited shape. During the gesture only dirty paths change.
    if (!session.seamsCleared) {
      const layers = new Set(
        [...session.dirty].map((id) => view.parents.get(id)?.layerId),
      );
      for (const record of view.records.values())
        if (record.rendered && layers.has(view.parents.get(record.id)?.layerId))
          view.update({ ...record, rendered: "" });
      session.seamsCleared = true;
    }
    if (
      !view.updateElements(
        [...session.dirty].map((id) => findElement(doc, id)).filter(Boolean),
        session.paths,
      )
    )
      renderStage(doc);
    else {
      view.flush();
      renderSelection(doc);
      artworkPreview.schedule();
    }
    session.dirty.clear();
    return;
  }
  const stage = windows.get(doc.id)?.querySelector(".stage");
  if (!stage) return;
  if (!session.seamsCleared) {
    // A lower colour's seam backing can contain an upper neighbour's entire
    // old contour. Restore every backing in the edited sheet before moving
    // its edges, including neighbours outside the brush or selection.
    const layers = new Map();
    for (const id of session.dirty) {
      const entry = findEntry(doc, id);
      if (entry) layers.set(entry.layer.id, entry.layer);
    }
    for (const layer of layers.values()) {
      const elements = new Map(layer.elements.map((el) => [el.id, el]));
      for (const sheet of stage.querySelectorAll(
        `[data-layer="${layer.id}"]`,
      )) {
        for (const path of sheet.querySelectorAll(
          "[data-vector95-seam-path]",
        )) {
          if (path.closest("[data-layer]") !== sheet) continue;
          const node = path.closest("[data-element]");
          const element = elements.get(node?.dataset.element);
          if (!element) continue;
          if (element.type === "path") path.setAttribute("d", element.attrs.d);
          else {
            // Seam rendering converts rectangles and ellipses to paths.
            // Restore the primitive while retaining its wrappers and style.
            const shape = document.createElementNS(
              path.namespaceURI,
              element.type,
            );
            for (const attr of path.attributes)
              if (
                attr.name !== "d" &&
                !attr.name.startsWith("data-vector95-seam-")
              )
                shape.setAttribute(attr.name, attr.value);
            for (const key of [
              "x",
              "y",
              "width",
              "height",
              "rx",
              "ry",
              "cx",
              "cy",
            ])
              if (element.attrs[key] !== undefined)
                shape.setAttribute(key, element.attrs[key]);
            path.replaceWith(shape);
          }
          path.removeAttribute("data-vector95-seam-path");
          path.removeAttribute("data-vector95-seam-source");
          boundsCache.delete(node);
        }
      }
    }
    session.seamsCleared = true;
  }
  let fallback = false;
  for (const id of session.dirty) {
    const element = findElement(doc, id);
    if (!element) continue;
    let nodes = session.nodes.get(id);
    if (!nodes?.length || nodes.some((node) => !node.isConnected)) {
      nodes = [...stage.querySelectorAll(`[data-element="${id}"]`)];
      session.nodes.set(id, nodes);
    }
    if (!nodes.length || element.paintRender || element.paintUnderlay) {
      fallback = true;
      break;
    }
    for (const node of nodes) {
      // Imported transform wrappers and fill/border styling use the same
      // contour. Retain that whole subtree rather than rebuilding the stage.
      let path = node;
      while (path?.tagName.toLowerCase() === "g" && path.children.length === 1)
        path = path.firstElementChild;
      if (path?.tagName.toLowerCase() !== "path") path = null;
      if (path) {
        path.setAttribute("d", element.attrs.d);
        path.removeAttribute("data-vector95-seam-path");
        path.removeAttribute("data-vector95-seam-source");
        boundsCache.delete(node);
      } else {
        let markup = namespaceMarkup(elementMarkup(element, true), doc.id);
        const tile = node.closest(".tile-view");
        if (tile && (Number(tile.dataset.tileX) || Number(tile.dataset.tileY)))
          markup = namespaceMarkup(
            markup,
            `tile-${doc.id}-${tile.dataset.tileX}-${tile.dataset.tileY}`,
          );
        node.outerHTML = markup;
      }
    }
  }
  session.dirty.clear();
  if (fallback) renderStage(doc);
  else {
    renderSelection(doc);
    artworkPreview.schedule();
  }
}
function startSculptSession(doc, interaction) {
  if (sculptClient.error)
    sculptClient = new SculptClient(
      new Worker(new URL("./sculpt-worker.js", import.meta.url)),
    );
  const view = gpuViewports.get(doc.id);
  let release;
  const finished = new Promise((resolve) => {
    release = resolve;
  });
  const session = {
    history: doc.history.slice(),
    future: doc.future.slice(),
    finished,
    release,
    expected: new Map(),
    nodes: new Map(),
    dirty: new Set(),
    pendingDistance: 0,
    bounds: new Map(
      interaction.ids.map((id) => {
        const b = view?.active && view.index.items.get(id)?.bounds;
        return [
          id,
          b
            ? { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top }
            : null,
        ];
      }),
    ),
  };
  smoothSessions.set(interaction, session);
  session.remote = sculptClient.begin({
    update: (updates, paths) => {
      if (!state.documents.includes(doc))
        throw new Error("Sculpt document was closed.");
      // Check the entire reply before applying any part of it. A stale result
      // must not overwrite a newer edit or resurrect a deleted element.
      const entries = updates.map((el) => findEntry(doc, el.id));
      if (
        entries.some(
          (entry, index) =>
            !entry || entry.element !== session.expected.get(updates[index].id),
        )
      ) {
        session.conflicted = true;
        throw new Error(
          "Artwork changed while sculpting; the late result was discarded.",
        );
      }
      if (updates.length && !interaction.before)
        beginMutation(doc, interaction);
      updates.forEach((el, index) => {
        const entry = entries[index];
        entry.elements[entry.elements.indexOf(entry.element)] = el;
        session.expected.set(el.id, el);
        session.dirty.add(el.id);
      });
      session.paths = new Map(paths || []);
      renderSmoothChanges(doc, interaction);
      session.paths = null;
    },
    complete: () => finishRemoteSculpt(doc, interaction, false),
    failed: (error) => {
      if (state.interaction === interaction) {
        pointerEnd(
          {
            ...state.cursor,
            pointerId: interaction.pointerId,
            clientX: state.cursor?.clientX || 0,
            clientY: state.cursor?.clientY || 0,
          },
          doc,
          true,
        );
      } else finishRemoteSculpt(doc, interaction, true);
      toast(`Sculpting cancelled: ${error.message}`);
    },
  });
  // Reserve command order for the entire gesture, including replies arriving
  // after pointer release. Save, Undo and subsequent edits wait for this slot.
  // A replay already owns a queue slot; its caller awaits finished directly.
  if (!replayingPointers) queueMutation(doc, () => finished);
}
function sendSculpt(doc, interaction, operation, touches, growth = 0) {
  const session = smoothSessions.get(interaction);
  if (!session) return;
  const records = [];
  const ids = interaction.ids.filter((id) => {
    const b = session.bounds.get(id);
    if (b && !touches(b)) return false;
    const element = findElement(doc, id);
    if (!element) return false;
    if (!session.expected.has(id)) {
      session.expected.set(id, element);
      records.push({
        element,
        matrix: multiply(parentMatrix(doc, id), elementMatrix(element)),
      });
    }
    if (b && growth) {
      b.x -= growth;
      b.y -= growth;
      b.w += 2 * growth;
      b.h += 2 * growth;
    }
    return true;
  });
  if (ids.length) session.remote.push({ ...operation, ids }, records);
}
function finishRemoteSculpt(doc, interaction, cancelled) {
  const session = smoothSessions.get(interaction);
  if (!session) return;
  if (cancelled) {
    session.remote.cancel();
    if (interaction.before && !session.conflicted) {
      Object.assign(doc, interaction.before);
      doc.history = session.history;
      doc.future = session.future;
      doc.dirty = interaction.previousDirty;
      if (interaction.floatingBefore)
        floatingSelections.set(doc.id, interaction.floatingBefore);
      else floatingSelections.delete(doc.id);
    }
  } else {
    setStatus(
      interaction.before
        ? `${interaction.type === "nudge" ? "Contours nudged" : interaction.sharpen ? "Detail sharpened" : "Contours smoothed"}. Undo restores the whole gesture.`
        : "No editable contour touched.",
    );
  }
  try {
    finishPointerInteraction(doc, interaction, cancelled);
  } finally {
    session.release();
  }
}
function sculptDab(doc, interaction, point, amount) {
  const radius = state.size / (2 * doc.zoom);
  sendSculpt(
    doc,
    interaction,
    {
      kind: "smooth",
      point,
      radius,
      amount: interaction.sharpen ? -amount : amount,
      tolerance: 0.1 / doc.zoom,
    },
    (bounds) => brushTouchesBounds(bounds, point, radius),
    radius * 0.04 + 0.1 / doc.zoom,
  );
}
function sculptMove(doc, interaction, point) {
  const from = interaction.last;
  if (Math.hypot(point.x - from.x, point.y - from.y) < 1e-6) return;
  interaction.last = point;
  if (interaction.type === "slice") {
    interaction.points.push(point);
    const stage = windows.get(doc.id)?.querySelector(".stage");
    if (stage && !stage.querySelector(".drawing-preview"))
      stage.insertAdjacentHTML(
        "beforeend",
        '<g class="drawing-preview" pointer-events="none"></g>',
      );
    const preview = stage?.querySelector(".drawing-preview");
    if (preview)
      preview.innerHTML = `<path d="${pencilPath(interaction.points)}" fill="none" stroke="#000080" stroke-width="${1 / doc.zoom}" stroke-dasharray="${4 / doc.zoom}"/>`;
    return;
  }
  const radius = state.size / (2 * doc.zoom),
    steps = Math.ceil(
      Math.hypot(point.x - from.x, point.y - from.y) /
        Math.max(0.25, radius / 4),
    );
  interaction.cleanupRadius = Math.max(interaction.cleanupRadius, radius);
  const priorCenter = interaction.points.at(-1);
  if (
    Math.hypot(point.x - priorCenter.x, point.y - priorCenter.y) >=
    radius / 4
  )
    interaction.points.push(point);
  for (let step = 0; step < steps; step++) {
    const a = {
        x: from.x + ((point.x - from.x) * step) / steps,
        y: from.y + ((point.y - from.y) * step) / steps,
      },
      b = {
        x: from.x + ((point.x - from.x) * (step + 1)) / steps,
        y: from.y + ((point.y - from.y) * (step + 1)) / steps,
      };
    if (interaction.type === "smooth") {
      const session = smoothSessions.get(interaction);
      if (session) {
        session.pendingDistance += Math.hypot(b.x - a.x, b.y - a.y);
        // Accumulate tiny moves into brush-spaced dabs. Strength remains based
        // on travelled distance, and release applies the remaining distance.
        if (session.pendingDistance < radius / 8) continue;
      }
      const distance = session
        ? session.pendingDistance
        : Math.hypot(b.x - a.x, b.y - a.y);
      if (session) session.pendingDistance = 0;
      sculptDab(
        doc,
        interaction,
        b,
        Math.min(0.2, (distance / radius) * 0.7) * interaction.strength,
      );
      continue;
    }
    sendSculpt(
      doc,
      interaction,
      { kind: "nudge", from: a, to: b, radius, strength: interaction.strength },
      (bounds) => brushTouchesBounds(bounds, a, radius),
      Math.hypot(b.x - a.x, b.y - a.y) * interaction.strength,
    );
  }
  if (smoothSessions.has(interaction)) renderSmoothChanges(doc, interaction);
  else renderStage(doc);
}
function eraseAt(event, doc, interaction) {
  const id = hitElement(event, doc);
  if (!id) return;
  if (!interaction.before) beginMutation(doc, interaction);
  for (const layer of containers(doc))
    layer.elements = layer.elements.filter((el) => el.id !== id);
  doc.selected = doc.selected.filter((i) => i !== id);
  renderStage(doc);
}
function pointerMove(event, doc) {
  const deferred = !replayingPointers && deferredPointers.get(event.pointerId);
  if (deferred) {
    deferred.events.push(pointerSnapshot(event, doc));
    return;
  }
  updateInput(event);
  updateBrushCursor(event, doc);
  // Moving snaps the artwork's bounds, rather than snapping both pointer ends.
  const p = worldPoint(
    event,
    doc,
    state.interaction?.type === "move" ? false : state.snap,
  );
  $("#coordinates").innerHTML =
    `X: ${Math.round(p.x)} &nbsp; Y: ${Math.round(p.y)}`;
  const i = state.interaction;
  if (!i) {
    const handle =
      doc.id === state.activeId &&
      state.tool === "select" &&
      !state.space &&
      event.target.closest("[data-handle]")?.dataset.handle;
    if (handle || transformHover) {
      transformHover = handle
        ? {
            docId: doc.id,
            handle,
            clientX: event.clientX,
            clientY: event.clientY,
          }
        : null;
      updateTransformModifiers(event, doc, false);
      refreshTransformFeedback(doc);
    }
    return;
  }
  if (i.docId !== doc.id || i.pointerId !== event.pointerId) return;
  i.feedbackClient = { clientX: event.clientX, clientY: event.clientY };
  updateTransformModifiers(event, doc, false);
  event.preventDefault();
  if (i.type === "symmetry-axis") {
    const raw = worldPoint(event, doc, false, true),
      modes = drawingModes(doc),
      position = clamp(
        i.axis === "x"
          ? raw.x - i.tileX * doc.width
          : raw.y - i.tileY * doc.height,
        0,
        i.axis === "x" ? doc.width : doc.height,
      );
    if (Math.abs(position - modes[i.axis === "x" ? "axisX" : "axisY"]) < 0.001)
      return;
    if (!i.before) beginMutation(doc, i);
    doc.drawingModes = {
      ...modes,
      [i.axis === "x" ? "axisX" : "axisY"]: position,
    };
    renderStage(doc);
    return;
  }
  if (i.type === "brush-size") {
    setDrawingStyle({
      size:
        Math.round(
          clamp(i.size + (event.clientX - i.startClient.x) / doc.zoom, 1, 100) *
            10,
        ) / 10,
    });
    renderBrushPreview();
    renderBrushCursor(doc);
    return;
  }
  i.current = p;
  if (["nudge", "slice", "smooth"].includes(i.type)) {
    sculptMove(doc, i, worldPoint(event, doc, false));
    return;
  }
  if (i.type === "hand") {
    doc.pan.x = i.pan.x + event.clientX - i.startClient.x;
    doc.pan.y = i.pan.y + event.clientY - i.startClient.y;
    renderStage(doc);
    return;
  }
  if (i.type === "brush" || i.type === "pencil") {
    const el = findElement(doc, i.elementId);
    if (i.straight) {
      let end = worldPoint(event, doc, false);
      if (gesture("straight-angle", event)) {
        const dx = end.x - i.start.x,
          dy = end.y - i.start.y,
          length = Math.hypot(dx, dy),
          angle =
            Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        end = {
          x: i.start.x + length * Math.cos(angle),
          y: i.start.y + length * Math.sin(angle),
        };
      }
      el.points[1] = { ...end, p: el.points[0].p };
      el.attrs.d = el.brush
        ? strokeOutline(el.points, el.size, el.pressure, { smoothing: 0 })
        : pencilPath(el.points);
      renderStage(doc);
      return;
    }
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) {
      const raw = worldPoint(sample, doc, false),
        last = el.points.at(-1);
      const next = {
        x: raw.x,
        y: raw.y,
        p: pressureValue(sample, el.pressure),
      };
      if (Math.hypot(next.x - last.x, next.y - last.y) > 0.35 / doc.zoom)
        el.points.push(next);
    }
    if (el.brush) {
      previews.get(el.id)?.draw();
      artworkPreview.schedule();
      return;
    }
    el.attrs.d = pencilPath(el.points);
  } else if (["rect", "ellipse", "line"].includes(i.type)) {
    const el = findElement(doc, i.elementId);
    if (gesture("move-origin", event)) {
      if (i.originPointer) {
        i.start.x += p.x - i.originPointer.x;
        i.start.y += p.y - i.originPointer.y;
      }
      i.originPointer = { ...p };
      if (i.originExtent)
        ((p.x = i.start.x + i.originExtent.x),
          (p.y = i.start.y + i.originExtent.y));
    } else i.originPointer = null;
    let dx = p.x - i.start.x,
      dy = p.y - i.start.y;
    if (gesture("constrain", event)) {
      if (i.type === "line") {
        const length = Math.hypot(dx, dy),
          angle =
            Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        dx = length * Math.cos(angle);
        dy = length * Math.sin(angle);
      } else {
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * size;
        dy = Math.sign(dy || 1) * size;
      }
    }
    i.originExtent = { x: dx, y: dy };
    const fromCenter = gesture("from-center", event);
    if (i.type === "rect")
      Object.assign(el.attrs, {
        x: fromCenter
          ? i.start.x - Math.abs(dx)
          : Math.min(i.start.x, i.start.x + dx),
        y: fromCenter
          ? i.start.y - Math.abs(dy)
          : Math.min(i.start.y, i.start.y + dy),
        width: Math.abs(dx) * (fromCenter ? 2 : 1),
        height: Math.abs(dy) * (fromCenter ? 2 : 1),
      });
    if (i.type === "ellipse")
      Object.assign(el.attrs, {
        cx: fromCenter ? i.start.x : i.start.x + dx / 2,
        cy: fromCenter ? i.start.y : i.start.y + dy / 2,
        rx: Math.abs(dx) / (fromCenter ? 1 : 2),
        ry: Math.abs(dy) / (fromCenter ? 1 : 2),
      });
    if (i.type === "line")
      Object.assign(el.attrs, {
        x1: i.start.x,
        y1: i.start.y,
        x2: i.start.x + dx,
        y2: i.start.y + dy,
      });
  } else if (i.type === "move") {
    let dx = p.x - i.start.x,
      dy = p.y - i.start.y;
    if (Math.hypot(dx, dy) < 1 / doc.zoom && !i.before) return;
    if (!i.before) {
      beginMutation(doc, i);
      if (i.copy) {
        const copies = copyArtwork(doc, selected(doc), true, 0);
        doc.selected = copies.map((el) => el.id);
        i.originals = clone(copies);
      }
    }
    if (gesture("move-axis", event)) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (state.snap !== gesture("snap-bypass", event) && i.bounds) {
      if (dx)
        dx =
          snapCoordinate(i.bounds.x + dx, state.gridSize, state.snapOffset) -
          i.bounds.x;
      if (dy)
        dy =
          snapCoordinate(i.bounds.y + dy, state.gridSize, state.snapOffset) -
          i.bounds.y;
    }
    i.feedback = {
      ...i.feedback,
      delta: { x: dx, y: dy },
      axis: gesture("move-axis", event) ? (dx === 0 ? "y" : "x") : null,
    };
    i.originals.forEach((original) => {
      const el = findElement(doc, original.id);
      translateWorld(doc, el, dx, dy, original);
    });
    liftSelection(doc);
  } else if (i.type === "resize") {
    if (!i.before) beginMutation(doc, i);
    const b = i.bounds,
      centered = gesture("resize-center", event),
      anchor = resizeOrigin(b, i.handle, centered);
    const dx =
        ((p.x - anchor.x) / ((b.w || 1) * (centered ? 0.5 : 1))) *
        (i.handle.includes("w") ? -1 : 1),
      dy =
        ((p.y - anchor.y) / ((b.h || 1) * (centered ? 0.5 : 1))) *
        (i.handle.includes("n") ? -1 : 1),
      sx = (dx < 0 ? -1 : 1) * clamp(Math.abs(dx), 0.02, 100),
      sy =
        (dy < 0 ? -1 : 1) *
        (gesture("resize-aspect", event) || lockAspect
          ? Math.abs(sx)
          : clamp(Math.abs(dy), 0.02, 100));
    resizeSelection(doc, i.originals, anchor, sx, sy);
    liftSelection(doc);
  } else if (i.type === "rotate") {
    if (!i.before) beginMutation(doc, i);
    let degrees =
      ((Math.atan2(p.y - i.center.y, p.x - i.center.x) - i.startAngle) * 180) /
      Math.PI;
    if (gesture("rotate-angle", event)) degrees = Math.round(degrees / 15) * 15;
    i.feedback = { ...i.feedback, degrees };
    rotateSelection(doc, i.originals, i.center, degrees);
    liftSelection(doc);
  } else if (i.type === "node-drag") {
    if (!i.before) beginMutation(doc, i);
    const el = findElement(doc, i.elementId),
      node = el.nodes[i.nodeIndex],
      point = localPoint(p, el);
    if (i.control)
      moveCurveHandle(node, i.control, point, gesture("break-handle", event));
    else {
      node.x = point.x;
      node.y = point.y;
    }
    i.curvePreview ||= createCurvePreview(el.nodes, el.closed);
    const preview = i.curvePreview.update(i.nodeIndex);
    el.attrs.d = preview.d;
    delete el.points;
    i.nodePath = preview.commands;
    liftSelection(doc);
  } else if (i.type === "pen") {
    const el = findElement(doc, i.elementId),
      node = el?.nodes?.[i.nodeIndex];
    if (!node) {
      endPenInteraction({ docId: doc.id });
      springTools?.flush();
      return;
    }
    node.hx = p.x - node.x;
    node.hy = p.y - node.y;
    el.attrs.d = bezierPath(el.nodes);
  } else if (i.type === "eraser") {
    eraseAt(event, doc, i);
    return;
  } else if (i.type === "marquee") {
    renderSelection(doc);
    return;
  }
  renderStage(doc);
}
function pointerEnd(event, doc, cancelled = false) {
  const deferred = !replayingPointers && deferredPointers.get(event.pointerId);
  if (deferred) {
    deferred.events.push(pointerSnapshot(event, doc));
    deferredPointers.delete(event.pointerId);
    deferred.release();
    const stage = windows.get(doc.id).querySelector(".stage");
    if (stage.hasPointerCapture(event.pointerId))
      stage.releasePointerCapture(event.pointerId);
    springTools?.flush();
    return;
  }
  const i = state.interaction;
  if (!i || i.docId !== doc.id || i.pointerId !== event.pointerId) return;
  updateBrushCursor(event, doc);
  const endPoint = worldPoint(event, doc, false);
  state.interaction = null;
  transformHover = null;
  const stage = windows.get(doc.id).querySelector(".stage");
  stage.classList.remove("panning");
  if (stage.hasPointerCapture(event.pointerId))
    stage.releasePointerCapture(event.pointerId);
  const sculpt = smoothSessions.get(i);
  if (sculpt?.remote) {
    if (cancelled) finishRemoteSculpt(doc, i, true);
    else {
      sculptMove(doc, i, endPoint);
      const radius = state.size / (2 * doc.zoom);
      if (sculpt.pendingDistance > 0)
        sculptDab(
          doc,
          i,
          endPoint,
          Math.min(0.2, (sculpt.pendingDistance / radius) * 0.7) * i.strength,
        );
      i.points.push(endPoint);
      sendSculpt(
        doc,
        i,
        {
          kind: "compact",
          tool: i.type,
          strength: i.strength,
          points: i.points,
          radius: i.cleanupRadius,
          tolerance: 0.15 / doc.zoom,
          earlyTolerance: 0.05 / doc.zoom,
        },
        (bounds) =>
          i.points.some((point) =>
            brushTouchesBounds(bounds, point, i.cleanupRadius),
          ),
      );
      sculpt.remote.finish();
    }
    for (const resolve of interactionWaiters) resolve();
    interactionWaiters.clear();
    springTools?.flush();
    return;
  }
  if (i.type === "brush-size") {
    if (cancelled) {
      setDrawingStyle({ size: i.size });
      renderBrushPreview();
    }
  } else if (cancelled && i.before) {
    if (i.floatingBefore) floatingSelections.set(doc.id, i.floatingBefore);
    else floatingSelections.delete(doc.id);
    previews.get(i.elementId)?.remove();
    previews.delete(i.elementId);
    Object.assign(doc, i.before);
    doc.history.splice(i.historyLength);
    doc.dirty = i.previousDirty;
    if (i.type === "pen") state.pen = null;
    if (i.copy) setSelection(doc, i.originalSelection);
    else if (!["nudge", "slice", "smooth"].includes(i.type)) doc.selected = [];
  } else if (i.type === "slice" && !cancelled) {
    sculptMove(doc, i, endPoint);
    for (const id of i.ids) {
      const entry = findEntry(doc, id);
      if (!entry) continue;
      const pieces = sliceElement(doc, entry.element, i.points);
      if (!pieces) continue;
      if (!i.before) beginMutation(doc, i);
      entry.elements.splice(
        entry.elements.indexOf(entry.element),
        1,
        ...pieces,
      );
      if (doc.selected.includes(id))
        doc.selected.push(
          ...pieces.map((el) => el.id).filter((key) => key !== id),
        );
    }
    setStatus(
      i.before
        ? "Lines split into independent pieces without removing length."
        : "No editable contour touched. Zero-width Slice cuts unfilled lines.",
    );
  } else if (cancelled && ["marquee", "node-select"].includes(i.type)) {
    setSelection(doc, i.originalSelection || doc.selected);
  } else if (i.type === "marquee") {
    const x = Math.min(i.start.x, i.current.x),
      y = Math.min(i.start.y, i.current.y),
      w = Math.abs(i.start.x - i.current.x),
      h = Math.abs(i.start.y - i.current.y);
    const candidates = [];
    for (const el of scopedElements(doc)) {
      const b = elementBounds(doc, el);
      if (
        editable(doc, el.id) &&
        b &&
        b.x >= x &&
        b.y >= y &&
        b.x + b.w <= x + w &&
        b.y + b.h <= y + h
      )
        candidates.push(el.id);
    }
    setSelection(
      doc,
      combineSelection(i.originalSelection, candidates, i.selectionOperation),
    );
    syncSelectionAppearance(doc);
  } else if (["brush", "pencil"].includes(i.type)) {
    const el = findElement(doc, i.elementId);
    const p = i.straight ? el.points.at(-1) : endPoint,
      last = el.points.at(-1);
    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.1)
      el.points.push({ ...p, p: last.p });
    el.attrs.d = el.brush
      ? strokeOutline(el.points, el.size, el.pressure, {
          smoothing: el.smoothing,
        })
      : pencilPath(el.points);
    strokeEndpoints.set(doc, {
      layerId: doc.activeLayer,
      tool: state.tool,
      point: { ...el.points.at(-1) },
    });
    if (el.pencil) {
      el.nodes = curveEditor.fitPencil(el.points, el.smoothing);
      refreshCurve(el);
      finishRepeatedLines(doc, el);
    }
    if (el.brush) {
      previews.get(el.id)?.draw();
      queuePaint(doc, el.id);
    }
  } else if (["rect", "ellipse", "line"].includes(i.type)) {
    const el = findElement(doc, i.elementId);
    if (
      Math.hypot(i.current.x - i.start.x, i.current.y - i.start.y) <
      2 / doc.zoom
    ) {
      Object.assign(doc, i.before);
      doc.history.splice(i.historyLength);
      doc.dirty = i.previousDirty;
    } else if (el.eraseLine) {
      el.type = "path";
      el.attrs = {
        d: strokeOutline(
          [
            { x: el.attrs.x1, y: el.attrs.y1, p: 0.5 },
            { x: el.attrs.x2, y: el.attrs.y2, p: 0.5 },
          ],
          Number(el.attrs["stroke-width"]),
          false,
        ),
        fill: "#000000",
        stroke: "none",
        opacity: 1,
      };
      el.erase = true;
      delete el.eraseLine;
      queuePaint(doc, el.id);
    } else if (i.type !== "line") queuePaint(doc, el.id);
    else finishRepeatedLines(doc, el);
  }
  finishPointerInteraction(doc, i, cancelled);
}
function finishPointerInteraction(doc, i, cancelled) {
  if (
    !cancelled &&
    i.before &&
    ["move", "resize", "rotate", "node-drag"].includes(i.type)
  )
    completeSelection(doc, true);
  if (["move", "node-select", "marquee"].includes(i.type) && !i.before)
    renderSelection(doc);
  else renderStage(doc);
  smoothSessions.delete(i);
  seamRenderer.flush();
  updateDocChrome(doc);
  renderInspector();
  autosave();
  for (const resolve of interactionWaiters) resolve();
  interactionWaiters.clear();
  if (i.type === "brush" && !cancelled)
    setStatus(
      findElement(doc, i.elementId)?.erase
        ? "Erasing paint on this layer…"
        : `Paint applied to ${activeLayer(doc).name}.`,
    );
  springTools?.flush();
}
function wheel(event, doc) {
  event.preventDefault();
  if (gesture("wheel-zoom", event))
    zoomDocument(doc, Math.exp(-event.deltaY * 0.002), {
      x: event.clientX,
      y: event.clientY,
    });
  else {
    doc.pan.x -= event.deltaX;
    doc.pan.y -= event.deltaY;
    renderStage(doc);
  }
}
function syncSelectionAppearance(doc) {
  const el = selected(doc)[0];
  if (!el) return;
  if (doc.selected.length === 1)
    doc.activeLayer = findEntry(doc, el.id).layer.id;
  // Selection shares size and opacity controls, but tool colours stay independent.
  state.drawingStyle ||= {
    size: state.size,
    opacity: state.opacity,
  };
  if (el.brush && el.size !== undefined) state.size = Number(el.size);
  else if (el.attrs.stroke && el.attrs.stroke !== "none")
    state.size = Number(el.attrs["stroke-width"] ?? 1);
  state.opacity = Number(el.attrs.opacity ?? 1);
  updateColors();
}
function endPenInteraction(pen) {
  const interaction = state.interaction;
  if (interaction?.type !== "pen" || interaction.docId !== pen.docId) return;
  state.interaction = null;
  const stage = windows.get(pen.docId)?.querySelector(".stage");
  if (stage?.hasPointerCapture(interaction.pointerId))
    stage.releasePointerCapture(interaction.pointerId);
  for (const resolve of interactionWaiters) resolve();
  interactionWaiters.clear();
}
function removeLastPenNode() {
  const pen = state.pen;
  if (!pen) return;
  endPenInteraction(pen);
  const doc = state.documents.find((d) => d.id === pen.docId),
    el = doc && findElement(doc, pen.elementId);
  if (!el?.nodes?.length) return finishPen(true);
  el.nodes.pop();
  if (!el.nodes.length) return finishPen(true);
  el.attrs.d = bezierPath(el.nodes);
  changed(doc, "Last anchor removed. Click to continue the path.");
  springTools?.flush();
}
function finishPen(cancel = false) {
  const pen = state.pen;
  if (!pen) return;
  endPenInteraction(pen);
  state.pen = null;
  const doc = state.documents.find((d) => d.id === pen.docId);
  if (!doc) return;
  const el = findElement(doc, pen.elementId);
  if (cancel || !el?.nodes || el.nodes.length < 2) {
    for (const layer of containers(doc))
      layer.elements = layer.elements.filter((e) => e.id !== pen.elementId);
    doc.history.splice(pen.historyLength);
    doc.dirty = pen.previousDirty;
    doc.selected = [];
  } else {
    el.attrs.d = bezierPath(el.nodes, el.closed);
    if (el.repeat && isPaintFill(el)) {
      queuePaint(doc, el.id);
      doc.selected = [el.id];
    } else doc.selected = finishRepeatedLines(doc, el);
    setStatus("Bézier path complete. Use Node edit (A) to adjust its anchors.");
  }
  renderStage(doc);
  updateDocChrome(doc);
  renderInspector();
  autosave();
  springTools?.flush();
}

let modalResolve;
function modal(title, html, buttons = [["ok", "OK", "primary"]], form = false) {
  if ($("#dialog").open) $("#dialog").close();
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML =
    `${form ? '<form id="dialog-form">' : ""}${html}<div class="dialog-buttons">${buttons.map(([value, label, className = ""]) => `<button type="${form && className === "primary" ? "submit" : "button"}" data-dialog-value="${value}" class="${className}">${label}</button>`).join("")}</div>${form ? "</form>" : ""}`;
  $("#dialog").showModal();
  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}
$("#dialog").addEventListener("click", (event) => {
  const button = event.target.closest("[data-dialog-value]");
  if (!button) return;
  event.preventDefault();
  const form = $("#dialog-form");
  if (button.classList.contains("primary") && form && !form.reportValidity())
    return;
  const value = button.dataset.dialogValue;
  modalResolve?.(value);
  modalResolve = null;
  $("#dialog").close();
});
$("#dialog").addEventListener("close", () => {
  modalResolve?.("cancel");
  modalResolve = null;
});
$("#dialog").addEventListener("submit", (event) => {
  event.preventDefault();
  $("#dialog .primary")?.click();
});
$("#dialog-close").addEventListener("click", () => $("#dialog").close());
async function pickColour(title, colour, opacity) {
  const result = modal(
    title,
    colorDialogFields(),
    [
      ["cancel", "Cancel"],
      ["none", "None"],
      ["apply", "Apply", "primary"],
    ],
    true,
  );
  const paletteSource = $("#palette-source");
  const readColour = attachColorPicker($("#dialog-body"), colour, opacity, {
    palettes: paletteChoices.map((choice) => ({
      ...choice,
      colors: paletteColors(choice.id),
    })),
    selectedPalette: paletteSource.value,
  });
  const action = await result;
  return action === "none"
    ? { color: "none", opacity: 1 }
    : action === "apply"
      ? readColour()
      : null;
}
async function colorDialog(which) {
  const chosen = await pickColour(
    which === "fill" ? "Primary Colour" : "Secondary Colour",
    state[which],
    state.opacity,
  );
  if (!chosen) return;
  setDrawingStyle({ [which]: chosen.color, opacity: chosen.opacity });
  updateColors();
}
async function newDocumentDialog() {
  const result = await modal(
    "New Drawing",
    `<p>Enter a name and size for the drawing.</p><div class="dialog-fields"><label class="full">Drawing name<input id="new-name" value="Untitled ${state.documents.length + 1}" required maxlength="100" /></label><label>Width (px)<input id="new-width" type="number" value="1000" min="1" max="30000" required /></label><label>Height (px)<input id="new-height" type="number" value="700" min="1" max="30000" required /></label><label class="full">Background<select id="new-background"><option value="#ffffff">White</option><option value="#f6f3e9">Warm paper</option><option value="none">Transparent</option></select></label></div>`,
    [
      ["cancel", "Cancel"],
      ["create", "Create Drawing", "primary"],
    ],
    true,
  );
  if (result !== "create") return;
  const name = $("#new-name").value.trim();
  const doc = makeDocument(
    name.endsWith(".svg") ? name : name + ".svg",
    Number($("#new-width").value),
    Number($("#new-height").value),
  );
  doc.background = $("#new-background").value;
  addDocument(doc);
  toast("New drawing created.");
}
async function gridSettingsDialog() {
  const result = await modal(
    "Grid Settings",
    `<div class="dialog-fields"><label>Grid spacing (px)<input id="grid-spacing" type="number" min="0.125" max="1024" step="any" value="${state.gridSize}" list="grid-presets" required/><datalist id="grid-presets"><option value="1"/><option value="8"/><option value="16"/><option value="32"/></datalist></label><label>Arrow-key step (px)<input id="nudge-spacing" type="number" min="0.125" max="1024" step="any" value="${state.nudgeSize}" required/></label><label class="full">Snap alignment<select id="snap-offset"><option value="0" ${state.snapOffset === 0 ? "selected" : ""}>Pixel edges (0 px)</option><option value="0.5" ${state.snapOffset === 0.5 ? "selected" : ""}>Pixel centres (0.5 px)</option></select></label></div><p>Use pixel centres for crisp odd-width outlines. Hold ${esc(inputBindings.get("gesture:snap-bypass") || "the snapping modifier")} to reverse snapping while moving a selection, or bypass it while drawing. Shift + arrow moves ten steps.</p><p>The grid shows finer divisions as you zoom in. Freehand strokes are never snapped.</p>`,
    [
      ["cancel", "Cancel"],
      ["apply", "Apply", "primary"],
    ],
    true,
  );
  if (result !== "apply") return;
  state.gridSize = Number($("#grid-spacing").value);
  state.nudgeSize = Number($("#nudge-spacing").value);
  state.snapOffset = Number($("#snap-offset").value);
  try {
    localStorage.setItem(
      "vector95-precision-v1",
      JSON.stringify({
        gridSize: state.gridSize,
        nudgeSize: state.nudgeSize,
        snapOffset: state.snapOffset,
      }),
    );
  } catch {}
  state.documents.forEach(renderStage);
  setStatus(
    `Grid spacing: ${state.gridSize} px. Arrow-key step: ${state.nudgeSize} px.`,
  );
}
function setDrawingMode(action) {
  const doc = active();
  if (!doc) return;
  finishPen();
  const modes = drawingModes(doc),
    [kind, value] = action.split(":"),
    isTile = kind === "tile";
  const next = {
    ...modes,
    [isTile ? "tileX" : "mirrorX"]: ["x", "both"].includes(value),
    [isTile ? "tileY" : "mirrorY"]: ["y", "both"].includes(value),
  };
  if (JSON.stringify(next) === JSON.stringify(modes)) return;
  checkpoint(doc);
  doc.drawingModes = drawingModes(doc, next);
  if (isTile) fitDocument(doc);
  changed(
    doc,
    isTile
      ? "Tile mode updated. Draw in any repeated canvas."
      : "Symmetry updated. Drag the square handles to move the axes.",
  );
}
async function setupDocumentDialog() {
  const doc = active();
  if (!doc) return;
  const selection = canvasSelectionBounds(doc);
  const result = modal(
    "Document Setup",
    canvasDialogFields(doc, selection),
    [
      ["cancel", "Cancel"],
      ["apply", "Apply", "primary"],
    ],
    true,
  );
  const preview = attachCanvasPreview($("#dialog-body"), doc, selection);
  $("#setup-width").focus();
  const applied = (await result) === "apply",
    bounds = preview.read();
  preview.dispose();
  if (!applied) return;
  const name = $("#setup-name").value.trim();
  if (
    resizeCanvas(doc, bounds, {
      name: name.endsWith(".svg") ? name : name + ".svg",
      background: $("#setup-background").value,
    })
  ) {
    changed(doc, "Document setup updated. Artwork keeps its size.");
    fitDocument(doc);
  }
}
async function textDialog(element = null, point = { x: 100, y: 100 }) {
  const doc = active();
  if (!doc || (!element && !writableLayer(doc))) return;
  const original =
    element ||
    makeElement("text", {
      ...state.textStyle,
      text: "Text",
      ...point,
      fill: state.fill === "none" ? state.stroke : state.fill,
      opacity: state.opacity,
    });
  const result = modal(
    element ? "Edit Text" : "Add Text",
    textDialogFields(original.attrs),
    [
      ["cancel", "Cancel"],
      ["apply", element ? "Apply" : "Add Text", "primary"],
    ],
    true,
  );
  const form = $("#dialog-form"),
    dialog = $("#dialog");
  const initialFields = readTextFields(form);
  if (!element) original.attrs = { ...initialFields, ...original.attrs };
  let draft = clone(original);
  const previewLayers = (layers) =>
    layers.map((layer) => ({
      ...layer,
      elements: element
        ? layer.elements.map((e) => (e.id === element.id ? draft : e))
        : layer.id === doc.activeLayer
          ? [...layer.elements, draft]
          : layer.elements,
      children: previewLayers(layer.children || []),
    }));
  textPreviewSession = {
    docId: doc.id,
    document: () => ({ ...doc, layers: previewLayers(doc.layers) }),
    show: () => {
      const stage = windows.get(doc.id)?.querySelector(".stage");
      if (!stage) return;
      const node = stage.querySelector(`[data-element="${draft.id}"]`);
      if (node)
        node.outerHTML = namespaceMarkup(elementMarkup(draft, true), doc.id);
      stage.querySelector(".overlay")?.replaceChildren();
    },
  };
  renderStage(doc);
  const stopPreview = attachTextPreview(form, original, {
    defs: doc.defs || "",
    onPreview: (value) => {
      draft = value;
      textPreviewSession?.show();
    },
  });
  attachFontPicker(form);
  const stopMoving = movableTextDialog(dialog);
  $("#text-content").select();
  let answer;
  try {
    answer = await result;
  } finally {
    stopPreview();
    stopMoving();
    textPreviewSession = null;
    renderStage(doc);
  }
  if (answer !== "apply") return;
  const fields = readTextFields(form);
  const attrs = editTextAttrs(
    original.attrs,
    changedTextFields(fields, initialFields),
  );
  if (attrs.textPath)
    attrs.textPath = {
      ...attrs.textPath,
      startOffset: Number(form.querySelector("#text-path-offset").value),
      rise: Number(form.querySelector("#text-path-rise").value),
      reverse: form.querySelector("#text-path-reverse").checked,
    };
  rememberFont(attrs["font-family"]);
  state.textStyle = { ...fields, text: "Text" };
  if (element && JSON.stringify(attrs) === JSON.stringify(element.attrs))
    return;
  checkpoint(doc);
  if (element) {
    element.attrs = attrs;
  } else {
    element = original;
    element.attrs = attrs;
    attachDrawingRepeat(doc, element);
    insertArtwork(doc, element);
    const node = windows.get(doc.id).querySelector(".stage");
    // Measure the actual font, rather than estimating text width at a seam.
    const measurement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    measurement.innerHTML = elementMarkup({ ...element, repeat: undefined });
    node.append(measurement);
    const text = measurement.querySelector("text");
    if (element.repeat && text) {
      const b = text.getBBox();
      element.repeat.bounds = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    measurement.remove();
    doc.selected = finishRepeatedLines(doc, element);
  }
  if (!doc.selected.includes(element.id)) doc.selected = [element.id];
  chooseTool("select");
  changed(doc, "Text updated.");
}
async function prepareImportedDocument(source, name) {
  setStatus(`Opening ${name}…`);
  // Let the opening message paint before DOM parsing; expensive booleans run
  // in the same worker that handles completed drawing gestures.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  let doc = importSvg(source, name, { deferNormalization: true });
  if (doc.importNormalization) {
    const response = await workerPaint(null, {
      normalizeImport: doc,
      onProgress: (message) => setStatus(`${name}: ${message}`),
    });
    doc = response.doc;
  }
  return doc;
}
function importedMessage(doc) {
  const warnings = doc.importWarnings || [];
  delete doc.importWarnings;
  return [`Opened ${doc.name}.`, ...warnings].join(" ");
}
async function openDocument() {
  if (window.vector95Desktop) {
    try {
      const files = await window.vector95Desktop.open();
      if (!files?.length) return;
      const errors = [];
      let opened = 0;
      for (const file of files) {
        try {
          if (file.error) throw new Error(file.error);
          const doc = await prepareImportedDocument(file.content, file.name);
          doc.path = file.path;
          addDocument(doc);
          if (doc.importWarnings?.length) errors.push(...doc.importWarnings);
          delete doc.importWarnings;
          if (window.vector95Desktop.remember)
            recentFiles = await window.vector95Desktop.remember(file.path);
          opened++;
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      const summary =
        files.length === 1 && opened === 1
          ? `Opened ${files[0].name}.`
          : `Opened ${opened} drawings.`;
      toast([summary, ...errors].join(" "));
    } catch (error) {
      toast(error.message);
    }
  } else $("#file-input").click();
}
async function openRecentDocument(index) {
  const file = recentFiles[index];
  if (!file) return;
  try {
    const existing = state.documents.find(
      (doc) => doc.path?.toLowerCase() === file.toLowerCase(),
    );
    if (existing) {
      activateDocument(existing.id);
      recentFiles = await window.vector95Desktop.remember(existing.path);
    } else {
      const entry = await window.vector95Desktop.openRecent(file);
      const doc = await prepareImportedDocument(entry.content, entry.name);
      doc.path = entry.path;
      addDocument(doc);
      toast(importedMessage(doc));
      recentFiles = await window.vector95Desktop.remember(entry.path);
    }
    if (existing) toast(`Opened ${file.split(/[\\/]/).pop()}.`);
  } catch (error) {
    toast(error.message);
    await refreshRecentFiles();
  }
}
$("#file-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file) {
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("This SVG is larger than 20 MB.");
      const doc = await prepareImportedDocument(await file.text(), file.name);
      addDocument(doc);
      toast(importedMessage(doc));
    } catch (error) {
      toast(error.message);
    }
  }
  event.target.value = "";
});
async function saveDocument(doc = active(), saveAs = false) {
  if (!doc) return false;
  await waitForPaint(doc);
  await seamRenderer.idle();
  const content = exportSvg(doc);
  try {
    if (window.vector95Desktop) {
      const result = await window.vector95Desktop.save({
        name: doc.name,
        path: doc.path,
        content,
        saveAs,
      });
      if (!result) return false;
      doc.path = result.path;
      doc.name = result.name;
      await refreshRecentFiles();
    } else {
      const blob = new Blob([content], { type: "image/svg+xml" }),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = doc.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
    doc.dirty = false;
    updateDocChrome(doc);
    autosave();
    toast(`Saved ${doc.name}.`);
    return true;
  } catch (error) {
    toast(`Could not save: ${error.message}`);
    return false;
  }
}
function exportSelectionBounds(doc) {
  const stage = windows.get(doc.id)?.querySelector(".stage");
  const view = gpuViewports.get(doc.id);
  if (view?.active) {
    const holder = document.createElementNS(stage.namespaceURI, "g");
    holder.setAttribute("opacity", "0");
    holder.setAttribute("pointer-events", "none");
    holder.innerHTML = selected(doc)
      .map(
        (el) =>
          `<g transform="matrix(${view.parents.get(el.id)?.matrix.join(" ") || "1 0 0 1 0 0"})">${elementMarkup(el, true)}</g>`,
      )
      .join("");
    stage.append(holder);
    try {
      return artworkBounds(stage, [holder], globalThis.paper);
    } finally {
      holder.remove();
    }
  }
  const groups = selected(doc)
    .map((el) => stage?.querySelector('[data-element="' + el.id + '"]'))
    .filter(Boolean);
  return artworkBounds(
    stage,
    groups,
    globalThis.paper,
    new Map(entries(doc).map(({ element }) => [element.id, element])),
  );
}
function canvasSelectionBounds(doc) {
  if (!doc.selected.length) return null;
  const bounds = wholePixelBounds(exportSelectionBounds(doc));
  return bounds &&
    bounds.w > 0 &&
    bounds.h > 0 &&
    bounds.w <= 30000 &&
    bounds.h <= 30000
    ? bounds
    : null;
}
async function exportDocument(doc = active()) {
  if (!doc) return false;
  await waitForPaint(doc);
  const selectedBounds = exportSelectionBounds(doc);
  const canExportSelection = selectedBounds?.w > 0 && selectedBounds?.h > 0;
  const result = modal(
    "Export SVG",
    `<fieldset><legend>File</legend><div class="dialog-fields"><label class="full">File name<input id="export-name" value="${esc(doc.name.replace(/\.svg$/i, "") + "-export.svg")}" required maxlength="200" /></label></div></fieldset><fieldset><legend>Area</legend><div class="field-row"><input id="export-artboard" type="radio" name="export-area" value="artboard" checked /><label for="export-artboard">Artboard</label></div><div class="field-row"><input id="export-selection" type="radio" name="export-area" value="selection" ${canExportSelection ? "" : "disabled"}/><label for="export-selection">Selection</label></div></fieldset><fieldset><legend>Precision</legend><div class="dialog-fields"><label class="full">Selection bounds<select id="export-bounds"><option value="artwork">Artwork, including outlines</option><option value="geometry">Geometry, excluding outlines</option></select></label></div><div class="field-row"><input id="export-pixels" type="checkbox" checked/><label for="export-pixels">Expand selection bounds to whole pixels</label></div><p id="export-size" aria-live="polite"></p></fieldset><fieldset><legend>Options</legend><div class="field-row"><input id="export-plain" type="checkbox" checked/><label for="export-plain">Plain SVG (without editor data)</label></div><div class="field-row"><input id="export-hidden" type="checkbox"/><label for="export-hidden">Include hidden layers</label></div><div class="field-row"><input id="export-background" type="checkbox" ${doc.background !== "none" ? "checked" : "disabled"}/><label for="export-background">Include document background</label></div><div class="field-row"><input id="export-outline-text" type="checkbox"/><label for="export-outline-text">Convert text to paths in the exported copy</label></div><p id="export-selection-note" hidden>Selection copies use plain SVG.</p></fieldset>`,
    [
      ["cancel", "Cancel"],
      ["export", "Export", "primary"],
    ],
    true,
  );
  const geometryBounds = selectionBounds(doc);
  const chosenBounds = () => {
    if (!$("#export-selection").checked)
      return { x: 0, y: 0, w: doc.width, h: doc.height };
    const bounds =
      $("#export-bounds").value === "geometry"
        ? geometryBounds
        : selectedBounds;
    return $("#export-pixels").checked ? wholePixelBounds(bounds) : bounds;
  };
  const updateExportOptions = () => {
    const selection = $("#export-selection").checked;
    if (selection) $("#export-plain").checked = true;
    $("#export-plain").disabled = selection;
    $("#export-hidden").disabled = selection || !$("#export-plain").checked;
    $("#export-selection-note").hidden = !selection;
    $("#export-bounds").disabled = !selection;
    $("#export-pixels").disabled = !selection;
    const bounds = chosenBounds(),
      valid = bounds?.w > 0 && bounds?.h > 0;
    $("#export-size").textContent = valid
      ? "SVG size: " +
        Number(bounds.w.toFixed(4)) +
        " × " +
        Number(bounds.h.toFixed(4)) +
        " px"
      : "Geometry has no area. Use artwork bounds to include its outline.";
    $("#dialog .primary").disabled = !valid;
  };
  $("#dialog-form").addEventListener("change", updateExportOptions);
  updateExportOptions();
  if ((await result) !== "export") return false;
  const name =
    $("#export-name")
      .value.trim()
      .replace(/\.svg$/i, "") + ".svg";
  const selection = $("#export-selection").checked;
  const outlineExport = $("#export-outline-text").checked;
  const options = {
    plain: $("#export-plain").checked || selection,
    includeHidden: !$("#export-hidden").disabled && $("#export-hidden").checked,
    background: $("#export-background").checked ? "document" : "none",
    ...(selection
      ? { selected: [...doc.selected], bounds: chosenBounds() }
      : {}),
  };
  await waitForPaint(doc);
  await seamRenderer.idle();
  try {
    let output = doc;
    if (outlineExport) {
      output = { ...doc, ...snapshot(doc) };
      for (const entry of entries(output)) {
        if (
          entry.element.type !== "text" ||
          (options.plain && !options.includeHidden && !entry.visible) ||
          (selection && !options.selected.includes(entry.element.id))
        )
          continue;
        const path = await outlineText(entry.element, output.defs);
        entry.elements[entry.elements.indexOf(entry.element)] = path;
      }
    }
    const content = exportSvg(output, options);
    if (window.vector95Desktop) {
      const saved = await window.vector95Desktop.save({
        name,
        content,
        path: null,
        saveAs: true,
        exportCopy: true,
      });
      if (!saved) return false;
    } else {
      const url = URL.createObjectURL(
        new Blob([content], { type: "image/svg+xml" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
    toast(`Exported ${name}.`);
    return true;
  } catch (error) {
    toast(`Could not export: ${error.message}`);
    return false;
  }
}
async function closeDocument(doc) {
  await waitForPaint(doc);
  if (!doc) return;
  finishPen();
  if (doc.dirty) {
    const result = await modal(
      "Save Changes",
      `<p><strong>${esc(doc.name)}</strong> has unsaved changes.</p><p>Save your work before closing the drawing?</p>`,
      [
        ["cancel", "Cancel"],
        ["discard", "Discard"],
        ["save", "Save", "primary"],
      ],
    );
    if (result === "cancel") return;
    if (result === "save" && !(await saveDocument(doc))) return;
  }
  windows.get(doc.id).remove();
  windows.delete(doc.id);
  denseNodeOverlays.delete(doc.id);
  seamRenderer.forget(doc);
  gpuViewports.get(doc.id)?.dispose();
  gpuViewports.delete(doc.id);
  const replicaIds = [...paintReplicas]
    .filter(([, replica]) => replica.docId === doc.id)
    .map(([id]) => id);
  for (const id of replicaIds) paintReplicas.delete(id);
  paintWorker.postMessage({ forget: replicaIds });
  state.documents = state.documents.filter((d) => d.id !== doc.id);
  if (state.documents.length) {
    if (state.activeId === doc.id) {
      const next = nextVisibleDocument(doc.id) || state.documents.at(-1);
      activateDocument(next.id);
    } else renderTabs();
  } else {
    state.activeId = null;
    state.mdiMaximized = false;
    renderTabs();
    renderInspector();
    syncFrame();
  }
  autosave();
}
async function requestAppClose() {
  finishPen();
  const dirty = state.documents.filter((doc) => doc.dirty);
  if (dirty.length) {
    const result = await modal(
      "Save Changes",
      `<p>You have <strong>${dirty.length} unsaved drawing${dirty.length === 1 ? "" : "s"}</strong>.</p><p>Save them before closing Vector 95?</p>`,
      [
        ["cancel", "Cancel"],
        ["discard", "Discard"],
        ["save", "Save All", "primary"],
      ],
    );
    if (result === "cancel") return;
    if (result === "save")
      for (const doc of dirty) if (!(await saveDocument(doc))) return;
  }
  // Persist an intentionally closed session so discarded changes do not reappear.
  localStorage.removeItem("vector95-session-v1");
  clearTimeout(recoveryTimer);
  window.vector95Desktop?.confirmClose();
}
window.vector95Desktop?.onCloseRequested(requestAppClose);
function windowAction(doc, action) {
  if (action === "close") {
    closeDocument(doc);
    return;
  }
  if (action === "minimize") {
    if (!doc.minimized && !doc.minimizedRect) {
      const occupied = state.documents.filter((item) => item.minimized);
      const perRow = Math.max(1, Math.floor(desktop.clientWidth / 200));
      let index = 0,
        rect;
      do {
        rect = {
          x: (index % perRow) * 200,
          y: Math.max(
            0,
            desktop.clientHeight - 24 * (Math.floor(index / perRow) + 1),
          ),
          w: 200,
          h: 24,
        };
        index++;
      } while (
        occupied.some((item) => {
          const other = item.minimizedRect;
          return (
            other &&
            rect.x < other.x + other.w &&
            rect.x + rect.w > other.x &&
            rect.y < other.y + other.h &&
            rect.y + rect.h > other.y
          );
        }) &&
        index <= occupied.length + perRow
      );
      doc.minimizedRect = rect;
    }
    doc.minimized = !doc.minimized;
  }
  if (action === "maximize") {
    setMdiMaximized(doc.minimized || !state.mdiMaximized);
    doc.minimized = false;
  }
  if (action === "fit") fitDocument(doc);
  if (action === "actual-size") {
    doc.zoom = 1;
    renderStage(doc);
    updateDocChrome(doc);
  }
  if (action === "zoom-in") zoomDocument(doc, 1.25);
  if (action === "zoom-out") zoomDocument(doc, 1 / 1.25);
  applyWindowRect(doc);
  if (action === "minimize" && doc.minimized) {
    const next = nextVisibleDocument(doc.id);
    if (next) activateDocument(next.id);
  } else if (action === "minimize" || action === "maximize")
    activateDocument(doc.id);
  syncFrame();
  renderTabs();
  autosave();
}
function arrangeWindows(tile = false) {
  const docs = state.documents.filter((doc) => !doc.minimized),
    w = desktop.clientWidth,
    h =
      desktop.clientHeight -
      (state.documents.some((doc) => doc.minimized) ? 26 : 0);
  setMdiMaximized(false);
  if (tile) {
    const horizontal = tile === "horizontal";
    const bands = Math.min(
      docs.length,
      Math.max(1, Math.floor(horizontal ? h / 250 : w / 330)),
    );
    let index = 0;
    for (let band = 0; band < bands; band++) {
      const count = Math.ceil((docs.length - index) / (bands - band));
      for (let cell = 0; cell < count; cell++) {
        const doc = docs[index++];
        const x = horizontal
          ? Math.round((cell * w) / count)
          : Math.round((band * w) / bands);
        const y = horizontal
          ? Math.round((band * h) / bands)
          : Math.round((cell * h) / count);
        const right = horizontal
          ? Math.round(((cell + 1) * w) / count)
          : Math.round(((band + 1) * w) / bands);
        const bottom = horizontal
          ? Math.round(((band + 1) * h) / bands)
          : Math.round(((cell + 1) * h) / count);
        doc.window = { x, y, w: right - x, h: bottom - y };
        applyWindowRect(doc);
        requestAnimationFrame(() => fitDocument(doc));
      }
    }
  } else
    docs.forEach((doc, index) => {
      doc.minimized = false;
      doc.maximized = false;
      doc.window = {
        x: 16 + ((index * 24) % Math.max(24, w - 350)),
        y: 16 + ((index * 24) % Math.max(24, h - 270)),
        w: Math.max(330, Math.min(930, w - 60)),
        h: Math.max(250, Math.min(720, h - 70)),
      };
      applyWindowRect(doc);
      windows.get(doc.id).style.zIndex = ++state.z;
    });
  if (active()) activateDocument(state.activeId);
  renderTabs();
  autosave();
}
function removeSelection(doc) {
  floatingSelections.delete(doc.id);
  if (!doc.selected.length) return;
  checkpoint(doc);
  for (const layer of containers(doc))
    if (!layer.locked)
      layer.elements = layer.elements.filter(
        (el) => !doc.selected.includes(el.id),
      );
  doc.selected = [];
  changed(doc, "Selection deleted.");
}
function copyArtwork(doc, elements, duplicate, offset) {
  const copies = clone(elements),
    replacements = new Map();
  for (const { element: el } of walkElements(copies)) {
    const old = el.svgId || `object-${el.id}`;
    el.id = uid();
    el.svgId = `${(el.svgId || el.type).slice(0, 150)}-${el.id}`;
    replacements.set(old, el.svgId);
  }
  for (const { element: el } of walkElements(copies)) {
    const replace = (value) =>
      typeof value === "string"
        ? value.replace(
            /(\b(?:href|xlink:href)="#|url\(\s*['"]?#)([\w.:-]+)/g,
            (m, start, id) => start + (replacements.get(id) || id),
          )
        : value;
    for (const key of Object.keys(el.attrs || {}))
      el.attrs[key] = replace(el.attrs[key]);
    for (const wrapper of el.wrappers || [])
      for (const key of Object.keys(wrapper))
        wrapper[key] = replace(wrapper[key]);
  }
  copies.forEach((el, index) => {
    const source = elements[index];
    const originalEntry = duplicate ? findEntry(doc, source.id) : null;
    const sameDocument = state.clipboardDocument === doc.id;
    const sourceLayer =
      !duplicate && sameDocument
        ? findLayer(doc, state.clipboardLayers?.[source.id])
        : null;
    const keepSource = sourceLayer && layerEditable(doc, sourceLayer.id);
    const destinationLayer =
      originalEntry?.layer || (keepSource ? sourceLayer : activeLayer(doc));
    const list = destinationLayer.elements;
    const sourceMatrix = originalEntry
      ? parentMatrix(doc, source.id)
      : state.clipboardParents?.[source.id] || identity;
    const destMatrix = layerWorldMatrix(doc, destinationLayer.id);
    prependMatrix(el, multiply(inverse(destMatrix), sourceMatrix));
    const m = inverse(destMatrix);
    el.tx += offset * m[0] + offset * m[2];
    el.ty += offset * m[1] + offset * m[3];
    list.push(el);
  });
  return copies;
}
function pasteElements(doc, elements = state.clipboard, duplicate = false) {
  if (!elements.length) return;
  if (activeLayer(doc).locked || !activeLayer(doc).visible) {
    toast("Unlock and show the destination layer before pasting.");
    return;
  }
  checkpoint(doc);
  const copies = copyArtwork(doc, elements, duplicate, 20);
  doc.selected = copies.map((el) => el.id);
  chooseTool("select");
  liftSelection(doc);
  const floating = floatingSelections.get(doc.id);
  if (floating) floating.pending = true;
  changed(
    doc,
    floating
      ? "Copy selected. Drag to place it, or press Enter to place it here."
      : "Copy selected. Drag to move it.",
  );
}
async function layerProperties(doc) {
  const layer = activeLayer(doc);
  const opacityPercent = Math.round((layer.opacity ?? 1) * 100);
  const result = modal(
    "Layer Properties",
    `<div class="dialog-fields"><label class="full">Name<input id="layer-name" value="${esc(layer.name)}" required /></label><label class="full">Export ID<input id="layer-export-id" value="${esc(layer.svgId || `layer-${layer.id}`)}" required pattern="[A-Za-z_][A-Za-z0-9_.:\\-]*" /></label><div class="full layer-opacity-field"><label for="layer-opacity">Opacity (%)</label><div class="layer-opacity-controls"><input id="layer-opacity-slider" type="range" min="0" max="100" step="1" value="${opacityPercent}" aria-label="Layer opacity slider" /><input id="layer-opacity" type="number" min="0" max="100" step="1" value="${opacityPercent}" /></div></div></div>`,
    [
      ["cancel", "Cancel"],
      ["apply", "Apply", "primary"],
    ],
    true,
  );
  const opacity = $("#layer-opacity"),
    opacitySlider = $("#layer-opacity-slider");
  opacity.addEventListener("input", () => {
    if (opacity.value !== "" && opacity.validity.valid)
      opacitySlider.value = opacity.value;
  });
  opacitySlider.addEventListener("input", () => {
    opacity.value = opacitySlider.value;
  });
  const input = $("#layer-export-id");
  input.addEventListener("input", () =>
    input.setCustomValidity(
      validateExportId(doc, input.value.trim(), layer.id) || "",
    ),
  );
  if ((await result) !== "apply") return;
  checkpoint(doc);
  layer.name = $("#layer-name").value.trim() || "Layer";
  renameExportId(doc, layer, input.value.trim());
  layer.opacity = clamp(Number($("#layer-opacity").value) / 100, 0, 1);
  changed(doc, "Layer properties updated.");
}
async function doAction(action, queued = false, doc = active()) {
  if (action === "command-search") {
    menus.openSearch();
    return;
  }
  if (!queued) endNudgeSequence();
  if (
    !queued &&
    doc &&
    (action === "convert-curves" ||
      action.startsWith("node-") ||
      action.startsWith("align-"))
  )
    return queueSelectionMutation(doc, [...doc.selected], () =>
      doAction(action, true, doc),
    );
  if (
    !queued &&
    doc &&
    [
      "delete",
      "cut",
      "copy",
      "duplicate",
      "selection-layer",
      "crop-selection",
      "bring-front",
      "send-back",
      "flip-h",
      "flip-v",
    ].includes(action)
  )
    return queueSelectionMutation(doc, [...doc.selected], () => {
      return doAction(action, true, doc);
    });
  if (
    !queued &&
    doc &&
    [
      "undo",
      "redo",
      "paste",
      "deselect",
      "place-copy",
      "select-all",
      "select-layer",
      "reselect",
      "invert-selection",
      "add-layer",
      "flatten-layer",
      "delete-layer",
      "layer-up",
      "layer-down",
    ].includes(action)
  )
    return queueMutation(doc, () => {
      return doAction(action, true, doc);
    });
  if (!queued) await waitForPaint(doc);
  if (action.startsWith("activate-document:")) {
    const next = state.documents.find(
      (item) => item.id === action.split(":")[1],
    );
    if (next) {
      next.minimized = false;
      applyWindowRect(next);
      activateDocument(next.id);
      autosave();
    }
    return;
  }
  if (action === "next-doc" || action === "previous-doc")
    return nextDocument(action === "next-doc" ? 1 : -1);
  if (action === "close-all") {
    for (const item of [...state.documents].reverse()) {
      await closeDocument(item);
      if (state.documents.includes(item)) break;
    }
    return;
  }
  if (action === "arrange-icons") {
    const stubs = state.documents.filter((item) => item.minimized);
    const perRow = Math.max(1, Math.floor(desktop.clientWidth / 200));
    stubs.forEach((item, index) => {
      item.minimizedRect = {
        x: (index % perRow) * 200,
        y: Math.max(
          0,
          desktop.clientHeight - 24 * (Math.floor(index / perRow) + 1),
        ),
        w: 200,
        h: 24,
      };
      applyWindowRect(item);
    });
    autosave();
    return;
  }
  if (action === "new") return newDocumentDialog();
  if (action === "open") return openDocument();
  if (action.startsWith("open-recent:"))
    return openRecentDocument(Number(action.slice("open-recent:".length)));
  if (action === "save" || action === "save-as")
    return saveDocument(doc, action === "save-as");
  if (action === "export-svg") return exportDocument(doc);
  if (action === "document-setup") return setupDocumentDialog();
  if (action === "crop-selection") {
    const bounds = canvasSelectionBounds(doc);
    if (!bounds)
      return toast("Select artwork with visible bounds to crop the canvas.");
    if (resizeCanvas(doc, bounds)) {
      changed(doc, "Canvas cropped to selection. All artwork is retained.");
      fitDocument(doc);
    }
    return;
  }
  if (action === "app-minimize") return window.vector95Desktop?.minimize();
  if (action === "app-maximize") {
    if (window.vector95Desktop) return window.vector95Desktop.maximize();
    action = "fullscreen";
  }
  if (action === "app-close") return window.vector95Desktop?.close();
  if (action === "fullscreen") {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
    return;
  }
  if (
    action === "cascade" ||
    action === "tile" ||
    action === "tile-vertical" ||
    action === "tile-horizontal"
  ) {
    arrangeWindows(
      action === "cascade"
        ? false
        : action === "tile-horizontal"
          ? "horizontal"
          : "vertical",
    );
    return;
  }
  if (action === "examples") {
    const result = await modal(
      "Example Drawings",
      `<p>Open an editable game drawing to explore layers, paint and outlines.</p><div class="field-row"><input id="examples-startup" type="checkbox" ${localStorage.getItem("vector95-examples-startup") === "true" ? "checked" : ""}/><label for="examples-startup">Open both examples at startup</label></div>`,
      [
        ["close", "Close"],
        ["sketchbook", "Forest Prop Kit"],
        ["botanical", "Mosswood Clearing"],
      ],
    );
    localStorage.setItem(
      "vector95-examples-startup",
      String($("#examples-startup").checked),
    );
    if (result === "sketchbook" || result === "botanical")
      addDocument(result === "sketchbook" ? sketchbook() : botanical());
    return;
  }
  if (action === "preferences" || action === "keyboard-settings") {
    const result = modal(
      "Preferences — Shortcuts & Gestures",
      preferencesFields(bindingDefinitions, inputBindings.values),
      [
        ["cancel", "Cancel"],
        ["apply", "Apply", "primary"],
      ],
      true,
    );
    const read = attachPreferences(
      $("#dialog-body"),
      bindingDefinitions,
      inputBindings.values,
      $("#dialog .primary"),
    );
    $("#binding-search").focus();
    if ((await result) !== "apply") return;
    const values = read();
    inputBindings = createBindings(bindingDefinitions, values);
    try {
      localStorage.setItem(
        "vector95-bindings-v2",
        JSON.stringify(bindingOverrides(bindingDefinitions, values)),
      );
    } catch {
      toast("Preferences applied for this session; storage is full.");
    }
    state.space = false;
    updateBindingLabels();
    chooseTool(state.tool);
    return;
  }
  if (action === "preview") {
    artworkPreview.toggle();
    return;
  }
  if (action === "size-increase" || action === "size-decrease") {
    if (state.interaction) return;
    setDrawingStyle({
      size: state.size + (action === "size-increase" ? 1 : -1),
    });
    renderBrushPreview();
    if (doc) renderBrushCursor(doc);
    return;
  }
  if (action === "shortcuts") {
    const result = await modal(
      "Keyboard Shortcuts",
      '<p>Tap a tool key to switch. Hold it to use the tool temporarily, then release to return. Releasing during a stroke returns after the stroke finishes. Space temporarily pans.</p><p>Left paints Primary; right paints Secondary. None erases with painting tools. Selection modifiers apply to whole objects.</p><div class="shortcut-list">' +
        bindingDefinitions
          .filter((d) => inputBindings.get(d.id))
          .map(
            (d) =>
              "<span>" +
              esc(d.label) +
              "<kbd>" +
              esc(inputBindings.get(d.id)) +
              "</kbd></span>",
          )
          .join("") +
        "</div>",
      [
        ["customize", "Customise…"],
        ["ok", "Close", "primary"],
      ],
    );
    if (result === "customize") return doAction("preferences");
    return;
  }
  if (action === "tablet-help") {
    await modal(
      "Tablet & Pen Input",
      `<p><strong>Draw naturally, keep it vector.</strong></p><p>Use the Brush tool (B) with “Pressure” enabled. Pen pressure controls the width of the stroke, and the meter displays the pressure received from your tablet.</p><p>Vector 95 uses Windows Pointer Events. Your tablet driver must expose pen pressure through Windows Ink. Enable Windows Ink in the tablet’s driver settings when pressure is unavailable.</p><p>Right-drag with Brush, use Eraser, or use the pen’s eraser end to erase paint locally with the same size and pressure. Mouse and touch input use a constant width. Use Smoothing to steady your lines.</p><p class="about-details">Pressure support depends on your device and driver. Tilt and animation are not included in this version.</p>`,
    );
    return;
  }
  if (action === "about") {
    await modal(
      "About Vector 95",
      `<div class="about-brand">${icon("logo")}Vector 95</div><p>An offline SVG editor with pressure-sensitive drawing and multiple document windows.</p><p>Inspired by Flash's merge drawing, Concepts' natural ink, and the Windows 95 interface.</p><p class="about-details">Version ${VECTOR95_VERSION}<br/>An independent app. Not affiliated with Adobe, Concepts, or Microsoft.</p>`,
    );
    return;
  }
  if (action === "grid") {
    state.grid = !state.grid;
    $("#grid-button").classList.toggle("active", state.grid);
    $("#grid-button").setAttribute("aria-pressed", state.grid);
    state.documents.forEach(renderStage);
    toast(state.grid ? "Grid visible." : "Grid hidden.");
    return;
  }
  if (action === "snap") {
    state.snap = !state.snap;
    toast(
      state.snap
        ? `Snap to ${state.gridSize} px grid enabled.`
        : "Snap to grid disabled.",
    );
    return;
  }
  if (action === "grid-settings") return gridSettingsDialog();
  if (action.startsWith("tile:") || action.startsWith("symmetry:"))
    return setDrawingMode(action);
  if (action === "symmetry-center" && doc) {
    finishPen();
    checkpoint(doc);
    doc.drawingModes = {
      ...drawingModes(doc),
      axisX: doc.width / 2,
      axisY: doc.height / 2,
    };
    changed(doc, "Symmetry axes centred.");
    return;
  }
  if (action === "swap-colors") {
    setDrawingStyle({ fill: state.stroke, stroke: state.fill });
    updateColors();
    return;
  }
  if (!doc) return;
  if (action === "undo" || action === "redo") {
    const width = doc.width,
      height = doc.height;
    floatingSelections.delete(doc.id);
    finishPen();
    if ((action === "undo" ? undo : redo)(doc)) {
      if (doc.width !== width || doc.height !== height) fitDocument(doc);
      else renderStage(doc);
      updateDocChrome(doc);
      renderInspector();
      autosave();
      setStatus(
        action === "undo" ? "Undid the last change." : "Redid the last change.",
      );
    }
    return;
  }
  if (action === "fit") {
    fitDocument(doc);
    return;
  }
  if (action === "actual-size") {
    doc.zoom = 1;
    doc.pan = { x: 0, y: 0 };
    renderStage(doc);
    updateDocChrome(doc);
    return;
  }
  if (action === "zoom-in" || action === "zoom-out") {
    zoomDocument(doc, action === "zoom-in" ? 1.25 : 1 / 1.25);
    return;
  }
  if (action === "close-doc") return closeDocument(doc);
  if (action === "minimize-doc" || action === "maximize-doc") {
    windowAction(doc, action === "minimize-doc" ? "minimize" : "maximize");
    return;
  }
  if (action === "select-all" || action === "select-layer") {
    setSelection(
      doc,
      scopedElements(doc).map((el) => el.id),
    );
    chooseTool("select");
    renderStage(doc);
    renderInspector();
    return;
  }
  if (action === "reselect" || action === "invert-selection") {
    const ids =
      action === "reselect"
        ? resolvedIds(doc, rememberedSelections.get(doc) || [])
        : scopedElements(doc)
            .filter((el) => !doc.selected.includes(el.id))
            .map((el) => el.id);
    setSelection(doc, ids);
    chooseTool("select");
    syncSelectionAppearance(doc);
    renderStage(doc);
    renderInspector();
    return;
  }
  if (action === "deselect") {
    placeCopy(doc);
    setSelection(doc, []);
    renderStage(doc);
    renderInspector();
    return;
  }
  if (action === "place-copy") {
    placeCopy(doc);
    return;
  }
  if (action === "convert-curves") {
    const conversions = selected(doc)
      .filter(canConvertToCurves)
      .map((el) => ({ el, nodes: curveEditor.convert(el) }))
      .filter((item) => item.nodes?.length > 1);
    if (!conversions.length) return;
    checkpoint(doc);
    for (const { el, nodes } of conversions) {
      el.type = "path";
      el.nodes = nodes;
      el.closed = false;
      delete el.brush;
      refreshCurve(el);
    }
    activeNode = { docId: doc.id, elementId: conversions[0].el.id, index: 0 };
    chooseTool("node");
    changed(
      doc,
      "Converted to editable curves. Select an anchor; drag its round handles to shape the curve.",
    );
    return;
  }
  if (action === "outline-text") {
    const items = selected(doc).filter((el) => el.type === "text");
    if (!items.length) return;
    const before = JSON.stringify(snapshot(doc));
    setStatus("Converting text to paths…");
    const conversions = [];
    for (const el of items) {
      const path = await outlineText(el, doc.defs);
      path.nodes = curveEditor.convert(path);
      conversions.push(path);
    }
    if (JSON.stringify(snapshot(doc)) !== before)
      throw new Error(
        "The drawing changed during conversion. Please try again.",
      );
    checkpoint(doc);
    for (const path of conversions) {
      const entry = findEntry(doc, path.id);
      entry.elements[entry.elements.findIndex((el) => el.id === path.id)] =
        path;
    }
    activeNode = { docId: doc.id, elementId: conversions[0].id, index: 0 };
    chooseTool("node");
    changed(doc, "Text converted to editable paths. Undo restores the text.");
    return;
  }
  if (action === "attach-text-path") {
    const items = selected(doc);
    if (!canAttachText(items)) return;
    const text = items.find((e) => e.type === "text"),
      guide = items.find((e) => e !== text),
      copy = clone(text);
    attachTextPath(doc, copy, guide, curveEditor);
    checkpoint(doc);
    Object.assign(text, copy);
    doc.selected = [text.id];
    chooseTool("select");
    changed(
      doc,
      "Text follows its own copy of the curve. Edit Text adjusts placement; Edit Text Path changes the baseline. The original curve is unchanged.",
    );
    return;
  }
  if (action === "edit-text-path") {
    const text = selected(doc).find((e) => e.attrs.textPath);
    if (!text) return;
    activeNode = { docId: doc.id, elementId: text.id, index: 0 };
    chooseTool("node");
    renderStage(doc);
    renderInspector();
    setStatus(
      "Edit the blue text baseline with its anchors and handles. The original curve is unchanged.",
    );
    return;
  }
  if (action === "detach-text-path") {
    const text = selected(doc).find((e) => e.attrs.textPath);
    if (!text) return;
    const node = windows
      .get(doc.id)
      .querySelector(`[data-element="${text.id}"] text`);
    const point = node?.getNumberOfChars()
      ? node.getStartPositionOfChar(0)
      : { x: Number(text.attrs.x) || 0, y: Number(text.attrs.y) || 0 };
    checkpoint(doc);
    detachTextPath(text, point);
    chooseTool("select");
    changed(
      doc,
      "Text detached from its baseline. Undo restores the curved text.",
    );
    return;
  }
  if (action.startsWith("node-")) {
    const el = currentNodeElement(doc);
    if (!el) return;
    const copy = clone(el),
      index = activeNode.index;
    let nextIndex = index;
    if (action === "node-add") {
      nextIndex = insertCurveNode(copy, index);
      if (nextIndex < 0) return;
    } else if (action === "node-delete") {
      if (!deleteCurveNode(copy, index)) {
        setStatus(
          "Keep at least two anchors on an open curve or three on a closed contour.",
        );
        return;
      }
      nextIndex = Math.min(index, copy.nodes.length - 1);
    } else
      setNodeKind(copy, index, action === "node-smooth" ? "smooth" : "corner");
    checkpoint(doc);
    Object.assign(el, copy);
    activeNode.index = nextIndex;
    liftSelection(doc);
    completeSelection(doc);
    changed(
      doc,
      action === "node-corner"
        ? "Corner node: handles move independently."
        : action === "node-smooth"
          ? "Smooth node: handles stay aligned."
          : "Curve nodes updated.",
    );
    return;
  }
  if (action.startsWith("align-")) {
    const items = selected(doc),
      bounds = selectionBounds(doc);
    if (!bounds || !items.length) return;
    const target =
        items.length > 1 ? bounds : { x: 0, y: 0, w: doc.width, h: doc.height },
      alignment = action.slice(6),
      horizontal = ["left", "center", "right"].includes(alignment),
      fraction = ["center", "middle"].includes(alignment)
        ? 0.5
        : ["right", "bottom"].includes(alignment)
          ? 1
          : 0,
      axis = horizontal ? "x" : "y",
      dimension = horizontal ? "w" : "h";
    const edits = items
      .map((el) => ({ el, box: elementBounds(doc, el) }))
      .filter((item) => item.box);
    checkpoint(doc);
    for (const { el, box } of edits) {
      const delta =
        target[axis] +
        target[dimension] * fraction -
        box[axis] -
        box[dimension] * fraction;
      translateWorld(doc, el, horizontal ? delta : 0, horizontal ? 0 : delta);
    }
    liftSelection(doc);
    completeSelection(doc);
    changed(
      doc,
      items.length > 1
        ? "Artwork aligned to the selection bounds."
        : "Artwork aligned to the artboard.",
    );
    return;
  }
  if (action === "delete") {
    removeSelection(doc);
    return;
  }
  if (action === "copy" || action === "cut") {
    state.clipboard = clone(selected(doc));
    state.clipboardDocument = doc.id;
    state.clipboardParents = Object.fromEntries(
      selected(doc).map((el) => [el.id, parentMatrix(doc, el.id)]),
    );
    state.clipboardLayers = Object.fromEntries(
      selected(doc).map((el) => [el.id, findEntry(doc, el.id)?.layer.id]),
    );
    if (action === "cut") removeSelection(doc);
    toast(
      `Copied ${state.clipboard.length} object${state.clipboard.length === 1 ? "" : "s"}.`,
    );
    return;
  }
  if (action === "paste") {
    pasteElements(doc);
    return;
  }
  if (action === "duplicate") {
    pasteElements(doc, selected(doc), true);
    return;
  }
  if (action === "edit-text") {
    const el = selected(doc).find((e) => e.type === "text");
    if (el) textDialog(el);
    else toast("Select a text object to edit its words.");
    return;
  }
  if (action === "add-layer") {
    checkpoint(doc);
    const layer = newLayer(`Layer ${allLayers(doc).length + 1}`);
    const owner = layerEntries(doc).find((e) => e.layer.id === doc.activeLayer);
    const siblings = owner?.siblings || doc.layers;
    siblings.splice(
      owner ? siblings.indexOf(owner.layer) + 1 : siblings.length,
      0,
      layer,
    );
    doc.activeLayer = layer.id;
    doc.selected = [];
    changed(
      doc,
      "New layer added. Paint here stays separate from other layers.",
    );
    return;
  }
  if (action === "selection-layer") {
    if (!doc.selected.length) return;
    checkpoint(doc);
    selectionToLayer(doc);
    changed(doc, "Selection moved to a separate layer.");
    return;
  }
  if (action === "flatten-layer") {
    if (!writableLayer(doc)) return;
    const draft = clone(doc);
    flattenLayer(draft, doc.activeLayer, paintEngine);
    checkpoint(doc);
    doc.layers = draft.layers;
    doc.selected = [];
    changed(
      doc,
      "Visible layer contents flattened to paint. Hidden layers were retained. Undo restores the layers.",
    );
    return;
  }
  if (action === "layer-properties") {
    await layerProperties(doc);
    return;
  }
  if (action === "delete-layer") {
    if (allLayers(doc).length === 1) {
      toast("Keep at least one layer in your drawing.");
      return;
    }
    const entry = layerEntries(doc).find((e) => e.layer.id === doc.activeLayer);
    if (entry.layer.children?.length) {
      const count = allLayers({ layers: entry.layer.children }).length;
      const result = await modal(
        "Delete Layer",
        `<p>Delete “${esc(entry.layer.name)}” and its ${count} nested ${count === 1 ? "layer" : "layers"}, including their artwork?</p><p>You can restore them with Undo.</p>`,
        [
          ["cancel", "Cancel"],
          ["delete", "Delete", "primary"],
        ],
      );
      if (result !== "delete") return;
    }
    checkpoint(doc);
    entry.siblings.splice(entry.siblings.indexOf(entry.layer), 1);
    if (!doc.layers.length) doc.layers.push(newLayer("Layer 1"));
    doc.activeLayer = entry.parent?.id || doc.layers.at(-1).id;
    doc.selected = [];
    changed(doc, "Layer deleted.");
    return;
  }
  if (action === "layer-up" || action === "layer-down") {
    const entry = layerEntries(doc).find((e) => e.layer.id === doc.activeLayer);
    const siblings = entry.siblings,
      index = siblings.indexOf(entry.layer),
      next = index + (action === "layer-up" ? 1 : -1);
    if (next < 0 || next >= siblings.length) return;
    checkpoint(doc);
    [siblings[index], siblings[next]] = [siblings[next], siblings[index]];
    changed(doc, "Layer order updated.");
    return;
  }
  if (action === "bring-front" || action === "send-back") {
    if (!doc.selected.length) return;
    checkpoint(doc);
    for (const layer of containers(doc)) {
      const chosen = layer.elements.filter((e) => doc.selected.includes(e.id)),
        rest = layer.elements.filter((e) => !doc.selected.includes(e.id));
      layer.elements =
        action === "bring-front" ? [...rest, ...chosen] : [...chosen, ...rest];
    }
    changed(doc, "Object order updated.");
    return;
  }
  if (action === "flip-h" || action === "flip-v") {
    const b = selectionBounds(doc);
    if (!b) return;
    checkpoint(doc);
    selected(doc).forEach((el) => {
      if (hasParentTransform(doc, el.id)) {
        transformWorld(
          doc,
          el,
          action === "flip-h"
            ? [-1, 0, 0, 1, 2 * (b.x + b.w / 2), 0]
            : [1, 0, 0, -1, 0, 2 * (b.y + b.h / 2)],
        );
        return;
      }
      if (action === "flip-h") {
        el.sx *= -1;
        el.tx = 2 * (b.x + b.w / 2) - el.tx;
      } else {
        el.sy *= -1;
        el.ty = 2 * (b.y + b.h / 2) - el.ty;
      }
      el.rotation *= -1;
    });
    liftSelection(doc);
    completeSelection(doc);
    changed(doc, "Selection flipped.");
  }
}

document.addEventListener("click", async (event) => {
  closeMenus();
  const tool = event.target.closest("button[data-tool]");
  if (tool) {
    chooseTool(tool.dataset.tool);
    return;
  }
  const tab = event.target.closest("[data-document-tab]");
  if (tab) {
    const doc = state.documents.find((d) => d.id === tab.dataset.documentTab);
    doc.minimized = false;
    applyWindowRect(doc);
    activateDocument(doc.id);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    Promise.resolve(doAction(action.dataset.action)).catch((error) =>
      toast(error.message),
    );
    return;
  }
  const winAction = event.target.closest("[data-window-action]");
  if (winAction) {
    const doc = state.documents.find(
      (d) => d.id === winAction.closest("[data-document]").dataset.document,
    );
    windowAction(doc, winAction.dataset.windowAction);
    return;
  }
  const swatch = event.target.closest("[data-color]");
  if (swatch) {
    setDrawingStyle({ fill: swatch.dataset.color });
    updateColors();
    return;
  }
  const layerButton = event.target.closest(
    "[data-layer-select],[data-layer-visible],[data-layer-lock],[data-layer-expand]",
  );
  if (layerButton) {
    const doc = active();
    if (layerButton.dataset.layerExpand) {
      toggleLayerExpanded(doc, layerButton.dataset.layerExpand);
      renderInspector();
      return;
    }
    const id =
      layerButton.dataset.layerSelect ||
      layerButton.dataset.layerVisible ||
      layerButton.dataset.layerLock;
    const selectLayer = !!layerButton.dataset.layerSelect,
      visible = !!layerButton.dataset.layerVisible,
      operation = inputBindings.selection(event),
      selectContents =
        gesture("layer-contents", event) || operation !== "replace";
    queueMutation(doc, () => {
      const layer = findLayer(doc, id);
      if (!layer) return;
      if (selectLayer) {
        if (selectContents) {
          const ids = layer.elements
            .filter((el) => editable(doc, el.id))
            .map((el) => el.id);
          setSelection(doc, combineSelection(doc.selected, ids, operation));
          doc.activeLayer = id;
          chooseTool("select");
          syncSelectionAppearance(doc);
        } else {
          doc.activeLayer = id;
          setSelection(doc, []);
          restoreDrawingStyle();
        }
        renderStage(doc);
        renderInspector({ preserveLayers: true });
      } else {
        checkpoint(doc);
        if (visible) layer.visible = !layer.visible;
        else layer.locked = !layer.locked;
        doc.selected = doc.selected.filter((elId) => editable(doc, elId));
        changed(doc, "Layer updated.");
      }
    });
  }
});
document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.button !== 0) return;
    if (
      event.target.closest(
        ".commandbar button,.tool-button,.mdi-title-controls button,.mdi-child-controls button,.layer-actions button,.small-tool,.swatch,.doc-tab",
      )
    )
      event.preventDefault();
  },
  true,
);
$("#layers").addEventListener("dblclick", async (event) => {
  const button = event.target.closest("[data-layer-select]");
  if (!button) return;
  const doc = active(),
    layer = findLayer(doc, button.dataset.layerSelect);
  doc.activeLayer = layer.id;
  await layerProperties(doc);
});
let draggedLayer = null;
const clearLayerDrop = () => {
  for (const row of $("#layers").querySelectorAll("[data-layer-row]"))
    delete row.dataset.drop;
};
const dropPosition = (event, row) => {
  const box = row.getBoundingClientRect(),
    ratio = (event.clientY - box.y) / box.height;
  return ratio < 0.25 ? "above" : ratio > 0.75 ? "below" : "inside";
};
$("#layers").addEventListener("dragstart", (event) => {
  const button = event.target.closest("[data-layer-select]");
  if (!button) return;
  draggedLayer = { docId: active().id, id: button.dataset.layerSelect };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedLayer.id);
});
$("#layers").addEventListener("dragover", (event) => {
  if (draggedLayer?.docId !== active()?.id) return;
  const row = event.target.closest("[data-layer-row]");
  if (!row || row.dataset.layerRow === draggedLayer.id) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearLayerDrop();
  row.dataset.drop = dropPosition(event, row);
});
$("#layers").addEventListener("drop", (event) => {
  if (draggedLayer?.docId !== active()?.id) return;
  event.preventDefault();
  const row = event.target.closest("[data-layer-row]"),
    doc = active(),
    id = draggedLayer.id;
  if (row) {
    const targetId = row.dataset.layerRow,
      position = dropPosition(event, row);
    queueMutation(doc, () => {
      const draft = clone(doc);
      if (!moveLayer(draft, id, targetId, position)) return;
      checkpoint(doc);
      doc.layers = draft.layers;
      if (position === "inside") setLayerExpanded(doc, targetId, true);
      changed(doc, "Layer moved. Paint remains within its own layer.");
    });
  }
  clearLayerDrop();
  draggedLayer = null;
});
$("#layers").addEventListener("dragend", () => {
  clearLayerDrop();
  draggedLayer = null;
});
$("#palette-source").addEventListener("change", updateColors);
$("#paint-inside").addEventListener("change", (event) => {
  state.paintInside = event.target.checked;
});
$("#bucket-boundaries").addEventListener("change", (event) => {
  state.bucketVisible = event.target.value === "visible";
});
$("#swatches").addEventListener("contextmenu", (event) => {
  const swatch = event.target.closest("[data-color]");
  if (!swatch) return;
  event.preventDefault();
  setDrawingStyle({ stroke: swatch.dataset.color });
  updateColors();
});
for (const which of ["fill", "stroke"]) {
  $(`#${which}-chip`).addEventListener("click", () => colorDialog(which));
}
$("#brush-size").addEventListener("input", (event) => {
  setDrawingStyle({ size: Number(event.target.value) });
  renderBrushPreview();
  const doc = active();
  if (doc) renderBrushCursor(doc);
});
$("#brush-size").addEventListener("change", () => {
  if (["nudge", "slice", "smooth"].includes(state.tool)) return;
  const doc = active(),
    nextSize = state.size,
    items = doc
      ? selected(doc).filter((el) =>
          !el.paint && el.brush && el.points?.length
            ? el.size !== state.size
            : !el.brush &&
              el.type !== "import" &&
              el.attrs.stroke &&
              el.attrs.stroke !== "none" &&
              Number(el.attrs["stroke-width"] ?? 1) !== state.size,
        )
      : [];
  if (items.length)
    queueMutation(doc, () => {
      const current = resolvedIds(
        doc,
        items.map((el) => el.id),
      )
        .map((id) => findElement(doc, id))
        .filter((el) => el && !el.paint);
      if (!current.length) return;
      checkpoint(doc);
      current.forEach((el) => {
        if (el.brush) {
          el.size = nextSize;
          el.attrs.d = strokeOutline(el.points, el.size, el.pressure, {
            smoothing: el.smoothing,
          });
          queuePaint(doc, el.id);
        } else {
          el.attrs["stroke-width"] = nextSize;
          if (el.points || el.pencil) el.size = nextSize;
        }
      });
      changed(doc, "Size updated.");
    });
});
$("#smoothing").addEventListener("input", (event) => {
  if (state.tool === "smooth")
    state.smoothStrength = Number(event.target.value);
  else if (state.tool === "nudge")
    state.nudgeStrength = Number(event.target.value);
  else state.smoothing = Number(event.target.value);
  renderBrushPreview();
});
// Numeric entries share the sliders' preview and single-commit undo behaviour.
for (const [entryId, sliderId] of [
  ["size-display", "brush-size"],
  ["smoothing-display", "smoothing"],
]) {
  const entry = $("#" + entryId),
    slider = $("#" + sliderId);
  entry.addEventListener("input", () => {
    if (!entry.value || !entry.validity.valid) return;
    slider.value = entry.value;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  entry.addEventListener("change", () => {
    if (!entry.value || !entry.validity.valid) entry.value = slider.value;
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  entry.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      entry.blur();
    }
  });
}
$("#pressure").addEventListener("change", (event) => {
  state.pressure = event.target.checked;
  renderBrushPreview();
});
$("#selection-properties").addEventListener("input", (event) =>
  event.target.setCustomValidity?.(""),
);
$("#selection-properties").addEventListener("change", (event) => {
  if (event.target.id === "lock-aspect") {
    lockAspect = event.target.checked;
    setStatus(
      lockAspect
        ? "Aspect ratio locked for dragging and numeric resizing."
        : "Width and height can change independently.",
    );
    return;
  }
  const key = event.target.dataset.transform;
  if (!key) return;
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) return;
  const doc = active();
  queueSelectionMutation(doc, [...doc.selected], () => {
    const bounds = selectionBounds(doc),
      items = selected(doc);
    if (!bounds || !items.length) return;
    if (["width", "height"].includes(key) && value <= 0) {
      renderInspector();
      return;
    }
    checkpoint(doc);
    if (key === "x" || key === "y") {
      const delta = value - bounds[key];
      items.forEach((el) => {
        translateWorld(
          doc,
          el,
          key === "x" ? delta : 0,
          key === "y" ? delta : 0,
        );
      });
    } else if (key === "rotation") {
      rotateSelection(
        doc,
        clone(items),
        {
          x: bounds.x + bounds.w / 2,
          y: bounds.y + bounds.h / 2,
        },
        value - items[0].rotation,
      );
    } else if (key === "width" || key === "height") {
      resizeSelection(
        doc,
        clone(items),
        {
          x: bounds.x,
          y: bounds.y,
        },
        key === "width"
          ? value / (bounds.w || 1)
          : lockAspect
            ? value / (bounds.h || 1)
            : 1,
        key === "height"
          ? value / (bounds.h || 1)
          : lockAspect
            ? value / (bounds.w || 1)
            : 1,
      );
    }
    liftSelection(doc);
    completeSelection(doc);
    changed(doc, "Object transform updated.");
  });
});
window.addEventListener(
  "keydown",
  (event) => {
    inputBindings.track(event, true);
    updateTransformModifiers(event);
  },
  true,
);
window.addEventListener(
  "keyup",
  (event) => {
    inputBindings.track(event, false);
    updateTransformModifiers(event);
  },
  true,
);
springTools = createSpringTools({
  getTool: () => state.tool,
  selectTool: (id, options) => chooseTool(id, { ...options, spring: true }),
  isBusy: () =>
    !!state.interaction || deferredPointers.size > 0 || replayingPointers,
});
const temporaryTool = (event) => {
  const next = gesture("pan", event);
  if (state.space !== next) {
    state.space = next;
    for (const doc of state.documents) {
      windows.get(doc.id).querySelector(".stage").dataset.tool = next
        ? "hand"
        : state.tool;
      renderBrushCursor(doc);
    }
  }
};
document.addEventListener("keydown", (event) => {
  if ($("#dialog").open) return;
  const ctrl = event.ctrlKey || event.metaKey,
    key = event.key.toLowerCase(),
    control = event.target.closest("input,textarea,select"),
    directControl = control?.matches(
      'input[type="range"],input[type="checkbox"],input[type="radio"]',
    ),
    editing =
      event.target.isContentEditable ||
      (control && control.type !== "file" && !directControl),
    adjustingControl =
      directControl &&
      !ctrl &&
      [
        "arrowleft",
        "arrowright",
        "arrowup",
        "arrowdown",
        "home",
        "end",
        "pageup",
        "pagedown",
      ].includes(key);
  const lookupEvent = gesture("nudge-fast", event)
    ? inputBindings.without("gesture:nudge-fast", event)
    : event;
  const nudgeAction = inputBindings.action(lookupEvent);
  let action = inputBindings.action(event);
  if (key === "escape" && !action)
    action = inputBindings.action({ key: event.key });
  if (
    (editing || adjustingControl) &&
    !["next-doc", "previous-doc", "close-doc"].includes(action)
  )
    return;
  if (action === "command-search") {
    event.preventDefault();
    doAction(action).catch((error) => toast(error.message));
    return;
  }
  if (
    !nudgeAction?.startsWith("nudge-") &&
    !inputBindings
      .get("gesture:nudge-fast")
      .toLowerCase()
      .split("+")
      .includes(key === "control" ? "ctrl" : key)
  )
    endNudgeSequence();
  temporaryTool(event);
  if (
    ["rect", "ellipse", "line"].includes(state.interaction?.type) &&
    gesture("move-origin", event) &&
    !state.interaction.originPointer
  )
    state.interaction.originPointer = { ...state.interaction.current };
  if (gesture("pan", event) && !state.interaction) {
    event.preventDefault();
    return;
  }
  // Modifier/hold gestures take precedence over tool shortcuts in their context.
  if (
    !ctrl &&
    !event.altKey &&
    gestureDefinitions.some(
      (d) =>
        d.binding &&
        inputBindings.get(d.id).split("+").at(-1) === event.key.toUpperCase(),
    ) &&
    !["finish", "deselect", "backstep"].includes(action)
  )
    return;
  if (action === "finish") {
    event.preventDefault();
    if (state.pen) finishPen();
    else if (floatingSelections.get(active()?.id)?.pending)
      doAction("place-copy");
    return;
  }
  if (action === "deselect") {
    closeMenus();
    const i = state.interaction,
      doc = active();
    if (state.pen) finishPen(true);
    else if (i && doc)
      pointerEnd(
        {
          ...state.cursor,
          pointerId: i.pointerId,
          clientX: state.cursor?.clientX || 0,
          clientY: state.cursor?.clientY || 0,
        },
        doc,
        true,
      );
    else if (doc) doAction("deselect");
    event.preventDefault();
    return;
  }
  if (action === "backstep" && state.pen) {
    event.preventDefault();
    removeLastPenNode();
    return;
  }
  if (action === "delete" || action === "backstep")
    action = currentNodeElement(active()) ? "node-delete" : "delete";
  if (action?.startsWith("tool:")) {
    springTools.press(action.slice(5), event);
    event.preventDefault();
    return;
  }
  if (
    nudgeAction?.startsWith("nudge-") &&
    active()?.selected.length &&
    (!action || action === nudgeAction)
  ) {
    event.preventDefault();
    const doc = active(),
      direction = nudgeAction.slice(6),
      amount = state.nudgeSize * (gesture("nudge-fast", event) ? 10 : 1),
      sequence = nudgeGesture(doc, key, event);
    queueSelectionMutation(doc, [...doc.selected], () => {
      if (doc.history.at(-1) !== sequence.historyEntry) {
        checkpoint(doc);
        sequence.historyEntry = doc.history.at(-1);
      }
      selected(doc).forEach((el) =>
        translateWorld(
          doc,
          el,
          direction === "left" ? -amount : direction === "right" ? amount : 0,
          direction === "up" ? -amount : direction === "down" ? amount : 0,
        ),
      );
      liftSelection(doc);
      completeSelection(doc);
      changed(doc);
    });
    return;
  }
  if (action && action !== "menu" && !action.startsWith("nudge-")) {
    event.preventDefault();
    doAction(action).catch((error) => toast(error.message));
  }
});
document.addEventListener("keyup", (event) => {
  heldNudgeKeys.delete(event.key.toLowerCase());
  springTools.release(event);
  temporaryTool(event);
});
window.addEventListener("blur", () => {
  inputBindings.clear();
  state.space = false;
  springTools.cancel();
  const interaction = state.interaction;
  if (springTools.active) {
    for (const [pointerId, record] of deferredPointers)
      pointerEnd(
        {
          ...state.cursor,
          type: "pointercancel",
          pointerId,
          clientX: state.cursor?.clientX || 0,
          clientY: state.cursor?.clientY || 0,
        },
        record.doc,
        true,
      );
  }
  if (
    (springTools.active || ["smooth", "nudge"].includes(interaction?.type)) &&
    interaction
  ) {
    const doc = state.documents.find((doc) => doc.id === interaction.docId);
    if (doc)
      pointerEnd(
        {
          ...state.cursor,
          pointerId: interaction.pointerId,
          clientX: state.cursor?.clientX || 0,
          clientY: state.cursor?.clientY || 0,
        },
        doc,
        true,
      );
  }
  state.documents.forEach(renderStage);
});
document.addEventListener("focusin", (event) => {
  if (
    event.target.isContentEditable ||
    event.target.matches(
      'textarea,select,input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
    )
  )
    springTools.cancel();
});
window.addEventListener("beforeunload", (event) => {
  if (!window.vector95Desktop && state.documents.some((doc) => doc.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
desktop.addEventListener("dragover", (event) => event.preventDefault());
desktop.addEventListener("pointerdown", (event) => {
  if (event.target !== desktop || event.button !== 0) return;
  const doc = active();
  if (doc) {
    doAction("deselect");
  }
});
function resizablePanel(
  selector,
  dividerSelector,
  property,
  key,
  min,
  max,
  direction,
) {
  const panel = $(selector),
    divider = $(dividerSelector);
  const currentWidth = () => panel.getBoundingClientRect().width;
  function setWidth(width, save = false) {
    const limit = Math.max(min, Math.min(max, innerWidth - 500));
    width = Math.round(clamp(width, min, limit));
    document.documentElement.style.setProperty(property, width + "px");
    divider.setAttribute("aria-valuenow", width);
    divider.setAttribute("aria-valuemax", limit);
    if (save) {
      try {
        localStorage.setItem(key, String(width));
      } catch {}
    }
  }
  try {
    const saved = Number(localStorage.getItem(key));
    if (saved) setWidth(saved);
  } catch {}
  let drag;
  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    divider.focus();
    drag = { x: event.clientX, width: currentWidth() };
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener("pointermove", (event) => {
    if (drag) setWidth(drag.width + direction * (event.clientX - drag.x));
  });
  divider.addEventListener("pointerup", (event) => {
    if (!drag) return;
    setWidth(drag.width + direction * (event.clientX - drag.x), true);
    drag = null;
    divider.releasePointerCapture(event.pointerId);
  });
  divider.addEventListener("pointercancel", () => {
    if (drag) setWidth(drag.width);
    drag = null;
  });
  divider.addEventListener("lostpointercapture", () => {
    drag = null;
  });
  divider.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setWidth(
      event.key === "Home"
        ? min
        : event.key === "End"
          ? max
          : currentWidth() +
            direction * (event.key === "ArrowRight" ? 10 : -10),
      true,
    );
  });
  return () => setWidth(currentWidth());
}
startupCheckpoint("panel-preferences-start");
const resizeSidebar = resizablePanel(
  ".inspector",
  "#inspector-resizer",
  "--sidebar-width",
  "vector95-sidebar-width",
  240,
  520,
  -1,
);
const resizeToolbox = resizablePanel(
  ".toolbox",
  "#toolbox-resizer",
  "--toolbox-width",
  "vector95-toolbox-width",
  83,
  320,
  1,
);
startupCheckpoint("panel-preferences-end");

desktop.addEventListener("drop", async (event) => {
  event.preventDefault();
  for (const file of Array.from(event.dataTransfer.files)) {
    if (!/\.svg$/i.test(file.name)) continue;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("This SVG is larger than 20 MB.");
      const entry = window.vector95Desktop
        ? await window.vector95Desktop.openDropped(file)
        : null;
      const doc = await prepareImportedDocument(
        entry ? entry.content : await file.text(),
        entry ? entry.name : file.name,
      );
      if (entry) doc.path = entry.path;
      addDocument(doc);
      toast(importedMessage(doc));
      if (entry)
        recentFiles = await window.vector95Desktop.remember(entry.path);
    } catch (error) {
      toast(error.message);
    }
  }
});
window.addEventListener("resize", () => {
  resizeSidebar();
  resizeToolbox();
  for (const doc of state.documents) {
    if (doc.minimizedRect) {
      doc.minimizedRect.x = clamp(
        doc.minimizedRect.x,
        0,
        Math.max(0, desktop.clientWidth - doc.minimizedRect.w),
      );
      doc.minimizedRect.y = clamp(
        doc.minimizedRect.y,
        0,
        Math.max(0, desktop.clientHeight - doc.minimizedRect.h),
      );
    }
    doc.window.x = Math.min(
      doc.window.x,
      Math.max(0, desktop.clientWidth - 100),
    );
    doc.window.y = Math.min(
      doc.window.y,
      Math.max(0, desktop.clientHeight - 40),
    );
    applyWindowRect(doc);
  }
});
window.addEventListener("blur", () => {
  endNudgeSequence();
  state.space = false;
  state.cursor = null;
  for (const doc of state.documents) {
    windows.get(doc.id).querySelector(".stage").dataset.tool = state.tool;
    renderBrushCursor(doc);
  }
});

try {
  const prefs = JSON.parse(
    localStorage.getItem("vector95-precision-v1") || "null",
  );
  if (prefs) {
    if (
      Number.isFinite(prefs.gridSize) &&
      prefs.gridSize >= 0.125 &&
      prefs.gridSize <= 1024
    )
      state.gridSize = prefs.gridSize;
    if (
      Number.isFinite(prefs.nudgeSize) &&
      prefs.nudgeSize >= 0.125 &&
      prefs.nudgeSize <= 1024
    )
      state.nudgeSize = prefs.nudgeSize;
    if ([0, 0.5].includes(prefs.snapOffset))
      state.snapOffset = prefs.snapOffset;
  }
} catch {}
let restored = false;
startupCheckpoint("session-recovery-start");
try {
  const saved = JSON.parse(
    localStorage.getItem("vector95-session-v1") || "null",
  );
  if (Array.isArray(saved) && saved.length) {
    for (const item of saved) {
      const doc = importSvg(item.svg, item.name);
      doc.dirty = !!item.dirty;
      if (
        item.minimizedRect &&
        ["x", "y", "w", "h"].every((key) =>
          Number.isFinite(item.minimizedRect[key]),
        )
      )
        doc.minimizedRect = { ...item.minimizedRect, w: 200, h: 24 };
      doc.minimized = !!item.minimized && !!doc.minimizedRect;
      doc.maximized = !!item.maximized;
      addDocument(doc, { rect: item.window });
    }
    setMdiMaximized(state.documents.some((doc) => doc.maximized));
    const visible = nextVisibleDocument(null);
    if (active()?.minimized && visible) activateDocument(visible.id);
    restored = true;
    setStatus("Workspace recovered.");
  }
} catch {
  localStorage.removeItem("vector95-session-v1");
}
if (!restored) {
  if (localStorage.getItem("vector95-examples-startup") === "true") {
    addDocument(sketchbook(), { focus: false, rect: documentWindowRect(1) });
    addDocument(botanical(), { rect: documentWindowRect(0) });
  } else {
    addDocument(makeDocument(), { rect: documentWindowRect(0) });
  }
  setStatus("Ready.");
}
if (window.vector95Desktop) {
  startupCheckpoint("native-recent-start");
  await refreshRecentFiles();
  startupCheckpoint("native-recent-end");
  window.vector95Desktop.onMaximizedChanged((maximized) =>
    updateMaximizeButton(
      $('[data-action="app-maximize"]'),
      maximized,
      "Maximise application",
      "Restore application",
    ),
  );
} else {
  $('[data-action="app-minimize"]').disabled = true;
  $('[data-action="app-close"]').disabled = true;
  const updateFullscreenButton = () =>
    updateMaximizeButton(
      $('[data-action="app-maximize"]'),
      !!document.fullscreenElement,
      "Enter fullscreen",
      "Exit fullscreen",
    );
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  updateFullscreenButton();
}
updateBindingLabels();
updateColors();
chooseTool("brush");
renderInspector();
document.addEventListener("pointerdown", endNudgeSequence, true);
document.addEventListener("focusin", endNudgeSequence);
// A narrow read-only bridge makes exports and state inspectable in automated checks.
Object.defineProperty(window, "vector95", {
  value: {
    getState: () => clone(state),
    exportActive: () => (active() ? exportSvg(active()) : null),
    getPaintMetrics: () => clone(paintMetrics),
    getRendererMetrics: () => {
      const view = gpuViewports.get(active()?.id);
      return view?.active
        ? { ...view.metrics, bounds: undefined }
        : { backend: "svg" };
    },
    getRenderedObjects: () => {
      const view = gpuViewports.get(active()?.id);
      return view?.active
        ? clone(view.order.map((id) => view.records.get(id)))
        : null;
    },
    getPendingPaintCount: () => paintQueues.size,
  },
  writable: false,
});
// Hidden windows can throttle animation frames. Initialization is complete;
// signal readiness directly so showing the window never depends on a frame.
window.vector95Desktop?.ready?.({
  timeOrigin: performance.timeOrigin,
  modulesReadyMs,
  editorReadyMs: performance.now(),
  documentCount: state.documents.length,
  checkpoints: startupCheckpoints,
});
