// The comparison engine of the example audit: real Windows 95 on one side (the measurements and recordings made by
// tools/win95-reference), a GUI95 widget example in Chromium on the other. Nothing here decides whether a difference
// matters; it reports what was compared and what differed. The judgement is in decisions.json.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crop, decodePng, encodePng } from '../win95-reference/lib/png.mjs';
import { differingPixels, edgeProfile } from '../win95-reference/compare.mjs';
import { loadGrid } from '../win95-reference/lib/grid.mjs';
import { measuredRect, parseReport } from '../win95-reference/lib/report.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const reference = path.join(root, 'tools', 'win95-reference');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

/* ---- the real side ------------------------------------------------------------------------------------------- */

/** Everything recorded on the real system: measurements, recordings, and (when the ignored out/ folder is there) the screen dumps. */
export async function loadReal() {
  const measurements = await json(path.join(reference, 'measurements', 'scenes.json'));
  const images = new Map(), recordings = new Map();
  const image = async file => { if (!images.has(file)) { try { images.set(file, decodePng(await readFile(file))); } catch { images.set(file, null); } } return images.get(file); };
  const grid = await loadGrid();
  let report = {}; const gridFolder = path.join(reference, 'out', 'capture-24bit');
  try { report = parseReport(await readFile(path.join(gridFolder, 'win95-4.00.1111c-24bit-report.txt'), 'latin1')); } catch { /* the refgrid capture is not on this machine */ }
  return {
    measurements,
    capture: name => measurements.captures[name] ?? null,
    captureImage: name => image(path.join(reference, 'out', 'scenes-24bit', `${name}.png`)),
    gridCell(id) { const cell = grid.cells.find(c => c.id === id); return cell ? { sheet: cell.sheet, rect: measuredRect(report, cell) ?? { x: cell.x, y: cell.y, w: cell.w, h: cell.h } } : null; },
    gridImage: sheet => image(path.join(gridFolder, `win95-4.00.1111c-24bit-sheet${sheet}.png`)),
    async recording(name) { if (!recordings.has(name)) recordings.set(name, await json(path.join(reference, 'recordings', `${name}.json`))); return recordings.get(name); }
  };
}

const strip = text => (text ?? '').replace(/&/g, '');

/**
 * The rectangle a real locator names, and the image it is in. A locator is
 *   { capture, id } | { capture, text } | { capture, cell } (a child control)     with optional part and class
 *   { capture, window: 'rect' | 'client' } (the first window that is not the scene window, or the one whose text is `title`)
 *   { capture, menu, item } | { capture, menu, window: true }
 *   { grid: 'cell_id' } (a cell of the earlier refgrid capture)
 * and optional inset: [left, top, right, bottom] pixels taken off each side.
 */
export async function realRect(real, locator) {
  let rect = null, image = null, drawnBy = null;
  if (locator.grid) { const cell = real.gridCell(locator.grid); if (!cell) return null; rect = cell.rect; image = await real.gridImage(cell.sheet); drawnBy = 'refgrid capture'; }
  else {
    const capture = real.capture(locator.capture); if (!capture) return null;
    drawnBy = capture.drawnBy; image = await real.captureImage(locator.capture);
    if (locator.menu) { const menu = capture.menus?.[locator.menu]; rect = locator.window ? menu?.window : menu?.items[locator.item]?.rect; }
    else {
      const windows = capture.windows, top = locator.title ? windows.find(w => w.text === locator.title) : locator.class && locator.window ? windows.find(w => w.class === locator.class) : windows.find(w => w.class !== 'refscene.host' && w.class !== '#32768' && w.class !== 'ComboLBox' && w.class !== 'tooltips_class32') ?? windows[0];
      if (locator.window) rect = top?.[locator.window];
      else {
        const all = windows.flatMap(w => w.children);
        const child = all.find(c => (locator.id === undefined || c.id === locator.id) && (locator.text === undefined || strip(c.text) === locator.text) && (locator.cell === undefined || c.cell === locator.cell) && (locator.class === undefined || c.class === locator.class));
        rect = locator.part ? child?.parts?.[locator.part] : child?.rect;
      }
    }
  }
  if (!rect) return null;
  const [l, t, r, b] = locator.inset ?? [0, 0, 0, 0];
  return { rect: { x: rect.x + l, y: rect.y + t, w: rect.w - l - r, h: rect.h - t - b }, image, drawnBy };
}

/** A recording as a list of full states: the control map is rebuilt from the per-step changes. */
export function expand(recording) {
  const out = []; let controls = {};
  for (const [index, entry] of recording.steps.entries()) {
    if (entry.blind) { out.push({ ...structuredClone(out.at(-1)), index, step: entry.step, blind: true, events: [] }); continue; }
    if (entry.controls) controls = structuredClone(entry.controls);
    else for (const [key, diff] of Object.entries(entry.changed ?? {})) {
      if (diff['(gone)']) { delete controls[key]; continue; }
      if (diff['(shown)']) { const { '(shown)': _, ...rest } = diff; controls[key] = rest; continue; }
      controls[key] ??= {};
      for (const [field, [, after]] of Object.entries(diff)) { if (after === null) delete controls[key][field]; else controls[key][field] = after; }
    }
    out.push({ index, step: entry.step, focus: entry.state.focus, active: entry.state.active, defaultId: entry.state.defaultId ?? null, menu: entry.state.menu, tops: entry.state.tops, events: entry.events ?? [], controls: structuredClone(controls) });
  }
  return out;
}

/** The key a recording uses for the control that has the focus. */
export const focusKey = state => state.focus ? (state.focus.cell ?? `${state.focus.class}#${state.focus.id}`) : null;

/* ---- the browser side ------------------------------------------------------------------------------------------ */

const KEYS = { ret: 'Enter', esc: 'Escape', spc: 'Space', tab: 'Tab', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', pgup: 'PageUp', pgdn: 'PageDown', home: 'Home', end: 'End', backspace: 'Backspace', delete: 'Delete', insert: 'Insert',
  alt: 'Alt', ctrl: 'Control', shift: 'Shift', menu: 'ContextMenu', compose: 'ContextMenu', minus: 'Minus', equal: 'Equal', slash: 'Slash', backslash: 'Backslash', kp_add: 'NumpadAdd', kp_subtract: 'NumpadSubtract', kp_multiply: 'NumpadMultiply' };
/** A QEMU key name as a Playwright key (a physical key code, so Shift and layout behave as they do on the real keyboard). */
export const playwrightKey = (name, { ctrl = 'Control' } = {}) => name === 'ctrl' ? ctrl : KEYS[name] ?? (/^f\d+$/.test(name) ? name.toUpperCase() : /^[a-z]$/.test(name) ? `Key${name.toUpperCase()}` : /^\d$/.test(name) ? `Digit${name}` : name);

export async function pressChord(page, keys, options) {
  const list = [].concat(keys).map(key => playwrightKey(key, options));
  for (const key of list) await page.keyboard.down(key);
  for (const key of list.reverse()) await page.keyboard.up(key);
}

/** Open an example with the period density, the sizes measured on Windows 95. */
export async function openExample(page, id, { density = 'period' } = {}) {
  await page.goto(new URL(`demo/dist/widgets/${id}.html`, `file://${root}`).href);
  if (density) await page.evaluate(value => document.body.setAttribute('data-gui95-density', value), density);
  await page.evaluate(() => document.fonts.ready);
}

/** A selector is CSS, optionally followed by "@n" for the n-th match (0-based): ".child@1". */
export const splitSelector = selector => { const m = /^(.*)@(\d+)$/.exec(selector); return m ? { css: m[1], nth: +m[2] } : { css: selector, nth: 0 }; };
export const locate = (page, selector) => { const { css, nth } = splitSelector(selector); return page.locator(css).nth(nth); };

/** The element's box in whole CSS pixels, or null when it is not rendered. */
export async function exampleRect(page, selector, inset = [0, 0, 0, 0]) {
  if (typeof selector === 'function') { const r = await selector(page); return r ? { x: Math.round(r.x) + inset[0], y: Math.round(r.y) + inset[1], w: Math.round(r.w) - inset[0] - inset[2], h: Math.round(r.h) - inset[1] - inset[3] } : null; }
  const locator = typeof selector === 'string' ? locate(page, selector) : selector;
  if (!await locator.count()) return null;
  const box = await locator.boundingBox(); if (!box) return null;
  const x = Math.round(box.x), y = Math.round(box.y), [l, t, r, b] = inset;
  return { x: x + l, y: y + t, w: Math.round(box.x + box.width) - x - l - r, h: Math.round(box.y + box.height) - y - t - b, exact: { w: +box.width.toFixed(2), h: +box.height.toFixed(2) } };
}

/* ---- comparing a real rectangle with an example rectangle ------------------------------------------------------- */

const sameProfile = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Compare one pair. Sizes always; pixels when both images are there:
 *   identical            every pixel equal
 *   frame-identical      same size, the outer `ring` pixels equal; the inside differs (text, glyphs)
 *   frame-differs        same size, the outer ring differs
 *   same-edges           different size, but the lines met walking in from each side are the same colours
 *   edges-differ         different size and different edge lines
 * `sides` restricts the edge comparison (for a part that has no edge of its own on some side).
 */
export function comparePair(realImage, realR, exampleImage, exampleR, { ring = 4, depth = 3, sides = ['top', 'left', 'bottom', 'right'] } = {}) {
  const result = { real: { w: realR.w, h: realR.h }, example: { w: exampleR.w, h: exampleR.h, ...(exampleR.exact && (exampleR.exact.w !== exampleR.w || exampleR.exact.h !== exampleR.h) ? { exact: exampleR.exact } : {}) }, sameSize: realR.w === exampleR.w && realR.h === exampleR.h };
  if (!realImage || !exampleImage) return { ...result, pixels: 'not compared: the screen dump is not on this machine' };
  const a = edgeProfile(realImage, realR, depth), b = edgeProfile(exampleImage, exampleR, depth);
  const differingSides = sides.filter(side => !sameProfile(a[side], b[side]));
  result.edges = differingSides.length ? Object.fromEntries(differingSides.map(side => [side, { real: a[side], example: b[side] }])) : 'same';
  if (result.sameSize) {
    const all = differingPixels(realImage, realR, exampleImage, exampleR), frame = differingPixels(realImage, realR, exampleImage, exampleR, ring);
    result.differingPixels = all.different; result.framePixels = frame.different; result.compared = all.compared;
    result.pixels = !all.different ? 'identical' : !frame.different ? 'frame-identical' : 'frame-differs';
    if (all.box) result.box = all.box;
  } else result.pixels = differingSides.length ? 'edges-differ' : 'same-edges';
  return result;
}

/** Where the dark pixels (text, a glyph) are inside a rectangle: distances from its left and top, and the size of their bounding box. */
export function inkBox(image, r, dark = 110) {
  let left = null, top = null, right = null, bottom = null;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const i = ((r.y + y) * image.width + r.x + x) * 4; if (r.x + x >= image.width || r.y + y >= image.height) continue;
    if ((image.data[i] * 299 + image.data[i + 1] * 587 + image.data[i + 2] * 114) / 1000 >= dark) continue;
    left = left === null ? x : Math.min(left, x); right = right === null ? x : Math.max(right, x); top = top === null ? y : Math.min(top, y); bottom = bottom === null ? y : Math.max(bottom, y);
  }
  return left === null ? null : { left, top, w: right - left + 1, h: bottom - top + 1 };
}

/** Runs of one colour along the middle row of a rectangle: [{ start, length }], for measuring blocks and gaps. */
export function colourRuns(image, r, colour) {
  const y = r.y + Math.floor(r.h / 2), runs = []; let start = null;
  for (let x = 0; x <= r.w; x++) {
    const i = (y * image.width + r.x + x) * 4, hit = x < r.w && `#${[0, 1, 2].map(k => image.data[i + k].toString(16).padStart(2, '0')).join('')}` === colour;
    if (hit && start === null) start = x; else if (!hit && start !== null) { runs.push({ start, length: x - start }); start = null; }
  }
  return runs;
}

/** Two crops side by side on magenta, real on the left, for looking at. */
export function sideBySide(realImage, realR, exampleImage, exampleR, pad = 3) {
  const grow = (image, r) => { const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad); return crop(image, x, y, Math.min(image.width - x, r.w + 2 * pad), Math.min(image.height - y, r.h + 2 * pad)); };
  const left = grow(realImage, realR), right = grow(exampleImage, exampleR), gap = 6, width = left.width + gap + right.width, height = Math.max(left.height, right.height), data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
  for (const [image, dx] of [[left, 0], [right, left.width + gap]]) for (let y = 0; y < image.height; y++) image.data.copy(data, (y * width + dx) * 4, y * image.width * 4, (y + 1) * image.width * 4);
  return encodePng({ width, height, data }, { Source: 'Example audit: real Windows 95 control (left) and the GUI95 example at the period density (right). Research material; not for distribution.' });
}

/** A layout number from two rectangles: ['gap-x', a, b] is the space between a's right side and b's left side, and so on. */
export function metric(kind, a, b) {
  switch (kind) {
    case 'gap-x': return b.x - (a.x + a.w);
    case 'gap-y': return b.y - (a.y + a.h);
    case 'left': return a.x - b.x;                         // a's left side from container b's left side
    case 'top': return a.y - b.y;
    case 'right': return b.x + b.w - (a.x + a.w);
    case 'bottom': return b.y + b.h - (a.y + a.h);
    case 'dy': return b.y - a.y;                           // how far b's top is below a's top
    case 'dx': return b.x - a.x;
    case 'width': return a.w;
    case 'height': return a.h;
  }
  throw new Error(`Unknown metric ${kind}.`);
}

/* ---- reading an example's state -------------------------------------------------------------------------------- */

/**
 * The comparable facts of mapped controls, read in the page. `controls` maps the recording's control key to
 * { sel, type }; types say which facts exist on both sides:
 *   check   check 0 | 1 | 2 (mixed)          radio   check 0 | 1
 *   edit    text, sel "start,end"            list    sel (index)          multilist  sel "i,j" | "none"
 *   select  sel (index), text                range   pos
 * Returns { facts: { key: {...} }, focus: key of the mapped control holding the focus, or a description of what does }.
 */
export async function readControls(page, controls) {
  return page.evaluate(map => {
    const facts = {}; let focus = null; const active = document.activeElement;
    for (const [key, { sel, type }] of Object.entries(map)) {
      const split = /^(.*)@(\d+)$/.exec(sel), el = split ? document.querySelectorAll(split[1])[+split[2]] : document.querySelector(sel);
      if (!el) { facts[key] = { missing: true }; continue; }
      if (active && (el === active || (type !== 'group' && el.contains(active)))) focus = key;
      const f = {};
      if (type === 'check') f.check = el.indeterminate ? 2 : el.checked ? 1 : 0;
      else if (type === 'radio') f.check = el.checked ? 1 : 0;
      else if (type === 'edit') { f.text = el.value; try { f.sel = `${el.selectionStart},${el.selectionEnd}`; } catch { /* a number field has no selection API */ } }
      else if (type === 'value') f.text = el.value;
      else if (type === 'list') f.sel = el.selectedIndex;
      else if (type === 'multilist') f.sel = [...el.options].map((o, i) => o.selected ? i : -1).filter(i => i >= 0).join(',') || 'none';
      else if (type === 'select') { f.sel = el.selectedIndex; f.text = el.options[el.selectedIndex]?.text ?? ''; }
      else if (type === 'range') f.pos = Number(el.value);
      else if (type === 'toggle') f.check = el.getAttribute('aria-pressed') === 'true' ? 1 : 0;
      facts[key] = f;
    }
    if (!focus && active && active !== document.body) focus = `other:${active.tagName.toLowerCase()}${active.id ? '#' + active.id : ''}${active.getAttribute('role') ? '[' + active.getAttribute('role') + ']' : ''}`;
    return { facts, focus };
  }, controls);
}

/** The same facts from a recorded state, for the controls a map names. */
export function realControls(state, controls) {
  const facts = {};
  for (const [key, { type }] of Object.entries(controls)) {
    const c = state.controls[key]; if (!c) { facts[key] = { missing: true }; continue; }
    const f = {};
    if (type === 'check' || type === 'radio' || type === 'toggle') f.check = c.check;
    else if (type === 'value') f.text = c.text ?? '';
    else if (type === 'edit') { f.text = c.text ?? ''; f.sel = c.sel; }
    else if (type === 'list') f.sel = c.sel;
    else if (type === 'multilist') f.sel = String(c.sel);
    else if (type === 'select') { f.sel = c.sel; f.text = c.text ?? ''; }
    else if (type === 'range') f.pos = c.pos;
    facts[key] = f;
  }
  return { facts, focus: focusKey(state) };
}

/**
 * Put the example's mapped controls into the state the real ones were in (values, selection, focus), without firing
 * events. With this done before every step, each step is compared as one transition from the same starting point,
 * so an earlier difference does not echo through the steps after it.
 */
export async function writeControls(page, controls, real) {
  await page.evaluate(({ map, real }) => {
    const find = sel => { const split = /^(.*)@(\d+)$/.exec(sel); return split ? document.querySelectorAll(split[1])[+split[2]] : document.querySelector(sel); };
    for (const [key, { sel, type }] of Object.entries(map)) {
      const el = find(sel), f = real.facts[key]; if (!el || !f || f.missing) continue;
      if (type === 'check') { el.checked = f.check === 1; el.indeterminate = f.check === 2; }
      else if (type === 'radio') el.checked = f.check === 1;
      else if (type === 'toggle') el.setAttribute('aria-pressed', f.check === 1 ? 'true' : 'false');
      else if (type === 'value') el.value = f.text;
      else if (type === 'edit') { el.value = f.text; const [a, b] = String(f.sel ?? '0,0').split(',').map(Number); try { el.setSelectionRange(a, b); } catch { /* no selection API */ } }
      else if (type === 'list' || type === 'select') el.selectedIndex = f.sel;
      else if (type === 'multilist') { const on = new Set(String(f.sel).split(',').filter(x => x !== 'none').map(Number)); [...el.options].forEach((o, i) => { o.selected = on.has(i); }); }
      else if (type === 'range') el.value = f.pos;
    }
    const owner = real.focus && map[real.focus] ? find(map[real.focus].sel) : null;
    if (owner && document.activeElement !== owner) owner.focus();
  }, { map: controls, real });
}

/** Field-by-field differences between two fact objects of the same shape: [{ where, real, example }]. */
export function diffFacts(real, example, prefix = '') {
  const out = [];
  for (const key of new Set([...Object.keys(real ?? {}), ...Object.keys(example ?? {})])) {
    const a = real?.[key], b = example?.[key], where = prefix ? `${prefix}.${key}` : key;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) out.push(...diffFacts(a, b, where));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ where, real: a ?? null, example: b ?? null });
  }
  return out;
}

/**
 * Replay recorded steps against an example. `spec`:
 *   script     the recording's name            steps   [index, ...] or { from, to } (default: every step after the first scene step)
 *   controls   { recordingKey: { sel, type } } for the generic facts above
 *   target     (step, state, before) => selector | { sel, fx, fy } | null   where a recorded mouse step lands in the example (null: skip the step)
 *   real       (state, all) => facts           example  async (page) => facts      extra facts beyond the control map
 *   skip       { index: 'why' }                 steps left out, with the reason
 *   before     async (page, index, state) => {}   run before a step (to line the example up with the recording)
 *   guard      true: skip a step, saying so, when the example's facts before it differ from the real ones (after an
 *              earlier difference or a skipped step); resync(page, state) may then put the example right for the next
 *   prepare    async (page, before, all) => {}: before each step, bring the example to the real state `before` through
 *              its own interface, as far as that can be done; guardKeys names the facts the guard then checks
 *   sync       true: before each step write the real previous state into the mapped controls (see writeControls)
 *   ctrl       'ControlOrMeta' where the host's own shortcut modifier should stand in for Ctrl
 * Returns { script, compared, agreed, steps: [{ index, step, agree, differences, real, example }], skipped: [{ index, why }] }.
 */
export async function replay(page, real, spec) {
  const recording = await real.recording(spec.script), states = expand(recording);
  const first = states.findIndex(s => s.step.scene !== undefined);
  let indexes = Array.isArray(spec.steps) ? spec.steps : states.map(s => s.index).filter(i => i > first && (!spec.steps || (i >= spec.steps.from && i <= spec.steps.to)));
  const steps = [], skipped = [];
  const point = async target => { const t = typeof target === 'string' ? { sel: target } : target; const box = await locate(page, t.sel).boundingBox(); if (!box) throw new Error(`No box for ${t.sel}`); return { x: box.x + (box.width - 1) * (t.fx ?? 0.5) + (t.dx ?? 0), y: box.y + (box.height - 1) * (t.fy ?? 0.5) + (t.dy ?? 0) }; };
  for (const index of indexes) {
    const state = states[index], step = state.step;
    if (spec.skip?.[index]) { skipped.push({ index, step, why: spec.skip[index] }); continue; }
    if (step.scene !== undefined || step.focus !== undefined || step.command !== undefined) { skipped.push({ index, step, why: 'setup of the real scene, not input' }); continue; }
    if (spec.prepare && index > 0) await spec.prepare(page, states[index - 1], states);
    if (spec.guard && index > 0) {   // only compare a step when the example is where the real system was before it
      const only = facts => spec.guardKeys ? Object.fromEntries(spec.guardKeys.map(key => [key, facts[key]])) : facts;
      const before = diffFacts(only(spec.real(states[index - 1], states)), only(await spec.example(page)));
      if (before.length) { skipped.push({ index, step, why: 'not comparable: before this step the example was not in the state the real system was in', detail: before }); if (spec.resync) await spec.resync(page, states[index], states); continue; }
    }
    if (spec.sync && spec.controls && index > 0) await writeControls(page, spec.controls, realControls(states[index - 1], spec.controls));
    if (spec.before) await spec.before(page, index, state);
    try {
      if (step.key !== undefined) await pressChord(page, step.key, { ctrl: spec.ctrl });
      else if (step.down !== undefined) await page.keyboard.down(playwrightKey(step.down, { ctrl: spec.ctrl }));
      else if (step.up !== undefined) await page.keyboard.up(playwrightKey(step.up, { ctrl: spec.ctrl }));
      else if (step.text !== undefined) await page.keyboard.type(step.text, { delay: 30 });
      else if (step.wait !== undefined) await page.waitForTimeout(step.wait);
      else if (step.press !== undefined) await page.mouse.down({ button: step.press });
      else if (step.release !== undefined) await page.mouse.up({ button: step.release });
      else {
        const action = ['move', 'click', 'rightclick', 'dblclick'].find(name => step[name] !== undefined), where = step[action];
        if (where !== true) { const target = spec.target?.(step, state, states[index - 1]); if (!target) { skipped.push({ index, step, why: 'the example has nothing at the place this step points to' }); continue; } const p = await point(target); await page.mouse.move(p.x, p.y, { steps: 4 }); }
        if (action === 'click') { await page.mouse.down(); await page.mouse.up(); }
        else if (action === 'rightclick') { await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); }
        else if (action === 'dblclick') { await page.mouse.down(); await page.mouse.up(); await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 }); }
      }
    } catch (error) { steps.push({ index, step, agree: false, differences: [{ where: 'replay', real: 'done', example: `failed: ${error.message.split('\n')[0]}` }] }); continue; }
    await page.waitForTimeout(step.settle === 0 ? 20 : 120);
    const realSide = { ...(spec.controls ? realControls(state, spec.controls) : {}), ...(spec.real ? spec.real(state, states) : {}) };
    const exampleSide = { ...(spec.controls ? await readControls(page, spec.controls) : {}), ...(spec.example ? await spec.example(page) : {}) };
    if (spec.controls && spec.focus === false) { delete realSide.focus; delete exampleSide.focus; }
    const differences = diffFacts(realSide, exampleSide);
    steps.push({ index, step, agree: !differences.length, ...(differences.length ? { differences } : {}), real: realSide, example: exampleSide });
  }
  return { script: spec.script, title: recording.title, drawnBy: recording.drawnBy, compared: steps.length, agreed: steps.filter(s => s.agree).length, steps, skipped };
}
