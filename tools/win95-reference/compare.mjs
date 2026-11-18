#!/usr/bin/env node
// Compares a reference capture (refgrid sheets) with the GUI95 kit's state atlas, cell by cell.
// The two do not hold the same cells, so mapping.json says which pairs with which; everything else is listed as
// unmapped on its own side. This is a report, not a test: it exits 0 whatever it finds, and 2 only for bad input.
//
// Usage: node compare.mjs --capture DIR/NAME-capture.json [options]
//   --capture FILE      the JSON capture.mjs wrote; it names the sheet images and refgrid's report
//   --atlas FILE        the atlas rendering (default kit/test/baseline/state-atlas.png)
//   --atlas-cells FILE  (default atlas-cells.json)     --mapping FILE (default mapping.json)
//   --grid FILE         grid JSON (default: read refgrid/cells.def directly)
//   --json FILE         also write the full result as JSON
//   --images DIR        also write one image per pair: reference crop on the left, atlas crop on the right
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crop, decodePng, encodePng, hex, pixel } from './lib/png.mjs';
import { loadGrid } from './lib/grid.mjs';
import { describeGuest, measuredRect, parseRect, parseReport } from './lib/report.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));

/** Reduce an image to what a 5:6:5 display can show, the way QEMU expands 16-bit pixels (high bits repeated). */
export function to565(image) {
  const data = Buffer.from(image.data);
  for (let i = 0; i < data.length; i += 4) { const r = data[i] >> 3, g = data[i + 1] >> 2, b = data[i + 2] >> 3; data[i] = (r << 3) | (r >> 2); data[i + 1] = (g << 2) | (g >> 4); data[i + 2] = (b << 3) | (b >> 2); }
  return { ...image, data };
}

const inside = (image, x, y) => x >= 0 && y >= 0 && x < image.width && y < image.height;
const at = (image, x, y) => inside(image, x, y) ? hex(pixel(image, x, y)) : null;

/** Colours met walking inward from the middle of each side, and diagonally from the top-left and bottom-right corners. */
export function edgeProfile(image, { x, y, w, h }, depth) {
  const n = Math.max(0, Math.min(depth, Math.floor(Math.min(w, h) / 2))), run = f => Array.from({ length: n }, (_, i) => f(i));
  const mx = x + Math.floor(w / 2), my = y + Math.floor(h / 2);
  return { top: run(i => at(image, mx, y + i)), left: run(i => at(image, x + i, my)), bottom: run(i => at(image, mx, y + h - 1 - i)), right: run(i => at(image, x + w - 1 - i, my)), topLeft: run(i => at(image, x + i, y + i)), bottomRight: run(i => at(image, x + w - 1 - i, y + h - 1 - i)) };
}

/** The colours in a rectangle, most frequent first. */
export function palette(image, { x, y, w, h }, limit = 8) {
  const counts = new Map();
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) { const c = at(image, col, row); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([colour, pixels]) => ({ colour, pixels }));
}

/** Count differing pixels between two same-sized rectangles; with `ring`, only within that many pixels of the border. */
export function differingPixels(a, ra, b, rb, ring = null) {
  let different = 0, compared = 0, box = null;
  for (let row = 0; row < ra.h; row++) for (let col = 0; col < ra.w; col++) {
    if (ring !== null && col >= ring && row >= ring && col < ra.w - ring && row < ra.h - ring) continue;
    compared++;
    if (at(a, ra.x + col, ra.y + row) === at(b, rb.x + col, rb.y + row)) continue;
    different++;
    box = box ? { left: Math.min(box.left, col), top: Math.min(box.top, row), right: Math.max(box.right, col), bottom: Math.max(box.bottom, row) } : { left: col, top: row, right: col, bottom: row };
  }
  return { different, compared, box };
}

function sideBySide(left, right) {
  const gap = 4, width = left.width + gap + right.width, height = Math.max(left.height, right.height), data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }   // magenta where there is no image
  for (const [image, dx] of [[left, 0], [right, left.width + gap]]) for (let y = 0; y < image.height; y++) image.data.copy(data, (y * width + dx) * 4, y * image.width * 4, (y + 1) * image.width * 4);
  return { width, height, data };
}

/**
 * Compare. `sheets` maps sheet number to a decoded image; `report` is the parsed REFGRID.TXT (may be {}).
 * Returns { pairs, unmappedReference, unmappedAtlas, problems }.
 */
export function compare({ grid, report, sheets, atlas, atlasCells, mapping, bits = 24 }) {
  const defaults = { ring: 4, depth: 3, ...mapping.defaults };
  const cellById = new Map(grid.cells.map(cell => [cell.id, cell]));
  const prepare = image => bits === 16 ? to565(image) : image;
  const atlasImage = prepare(atlas), sheetImages = Object.fromEntries(Object.entries(sheets).map(([n, image]) => [n, prepare(image)]));
  /** A reference key is a cell id (measured rectangle preferred) or a measured part in the report. */
  const findReference = key => {
    const cell = cellById.get(key);
    if (cell) { const measured = measuredRect(report, cell); return { sheet: cell.sheet, rect: measured ?? { x: cell.x, y: cell.y, w: cell.w, h: cell.h }, source: measured ? 'measured by refgrid' : 'cell table', cell }; }
    for (const [section, values] of Object.entries(report)) { const sheet = /^sheet(\d+)$/.exec(section); const rect = sheet && parseRect(values[key]); if (rect) return { sheet: +sheet[1], rect, source: 'measured by refgrid' }; }
    return null;
  };
  const pairs = [], problems = [], usedReference = new Set(), usedAtlas = new Set();
  for (const entry of mapping.pairs) {
    const reference = findReference(entry.reference), target = atlasCells.cells[entry.atlas];
    if (!target) { problems.push(`mapping: atlas key "${entry.atlas}" is not in the atlas cell list`); continue; }
    usedAtlas.add(entry.atlas);
    if (cellById.has(entry.reference)) usedReference.add(entry.reference);
    else if (cellById.has(entry.reference.split('.')[0])) usedReference.add(entry.reference.split('.')[0]);
    if (!reference) { problems.push(`mapping: reference "${entry.reference}" is neither a cell nor a measured part in the report`); continue; }
    const image = sheetImages[reference.sheet];
    const result = { reference: entry.reference, atlas: entry.atlas, compare: entry.compare, note: entry.note, referenceRect: reference.rect, referenceRectSource: reference.source, sheet: reference.sheet, atlasRect: { x: target.x, y: target.y, w: target.w, h: target.h } };
    pairs.push(result);
    if (!image) { result.status = 'no image'; result.detail = `sheet ${reference.sheet} was not captured`; continue; }
    const depth = entry.depth ?? defaults.depth, ring = entry.ring ?? defaults.ring, a = reference.rect, b = result.atlasRect;
    result.sameSize = a.w === b.w && a.h === b.h;
    result.sizeDifference = { w: b.w - a.w, h: b.h - a.h };
    result.referenceProfile = edgeProfile(image, a, depth); result.atlasProfile = edgeProfile(atlasImage, b, depth);
    result.profileDifferences = Object.keys(result.referenceProfile).filter(side => result.referenceProfile[side].join() !== result.atlasProfile[side].join());
    result.referencePalette = palette(image, a); result.atlasPalette = palette(atlasImage, b);
    if (entry.compare !== 'profile' && result.sameSize) result.pixels = differingPixels(image, a, atlasImage, b, entry.compare === 'ring' ? ring : null);
    if (entry.compare !== 'profile' && !result.sameSize) result.detail = `sizes differ, so pixels were not compared (${entry.compare} needs equal sizes)`;
    const pixelsMatch = result.pixels ? result.pixels.different === 0 : entry.compare === 'profile';
    result.status = result.sameSize && pixelsMatch && !result.profileDifferences.length ? 'match' : !result.sameSize && entry.compare !== 'profile' ? 'size differs' : !result.sameSize && !result.profileDifferences.length ? 'edges match, size differs' : 'differs';
    result.crops = { reference: crop(image, a.x, a.y, a.w, a.h), atlas: crop(atlasImage, b.x, b.y, b.w, b.h) };
  }
  const unmappedReference = grid.cells.filter(cell => !usedReference.has(cell.id)).map(cell => ({ id: cell.id, sheet: cell.sheet, kind: cell.kind, profile: sheetImages[cell.sheet] && !['menu', 'text', 'swatch'].includes(cell.kind) ? edgeProfile(sheetImages[cell.sheet], measuredRect(report, cell) ?? cell, defaults.depth) : undefined, colour: cell.kind === 'swatch' && sheetImages[cell.sheet] ? at(sheetImages[cell.sheet], cell.x + 1, cell.y + 1) : undefined }));
  const unmappedAtlas = Object.entries(atlasCells.cells).filter(([key, value]) => !usedAtlas.has(key) && value.w > 0 && value.h > 0).map(([key, value]) => ({ key, what: value.what }));
  return { pairs, unmappedReference, unmappedAtlas, problems };
}

export function formatReport(result, heading = []) {
  const lines = [...heading, ''], size = r => `${r.w}x${r.h}`, show = profile => Object.entries(profile).map(([side, colours]) => `${side} ${colours.join(' ')}`).join(' | ');
  const tally = {}; for (const pair of result.pairs) tally[pair.status] = (tally[pair.status] ?? 0) + 1;
  lines.push(`Mapped pairs: ${result.pairs.length} (${Object.entries(tally).map(([status, n]) => `${n} ${status}`).join(', ') || 'none'})`, '');
  for (const pair of result.pairs) {
    lines.push(`${pair.status.toUpperCase().padEnd(26)} ${pair.reference}  <->  ${pair.atlas}   [${pair.compare}]`);
    if (pair.status === 'no image') { lines.push(`    ${pair.detail}`); continue; }
    lines.push(`    size: reference ${size(pair.referenceRect)} (${pair.referenceRectSource}), kit ${size(pair.atlasRect)}${pair.sameSize ? '' : `  -> kit is ${pair.sizeDifference.w >= 0 ? '+' : ''}${pair.sizeDifference.w} wide, ${pair.sizeDifference.h >= 0 ? '+' : ''}${pair.sizeDifference.h} high`}`);
    if (pair.pixels) lines.push(`    pixels: ${pair.pixels.different} of ${pair.pixels.compared} differ${pair.pixels.box ? ` within x ${pair.pixels.box.left}-${pair.pixels.box.right}, y ${pair.pixels.box.top}-${pair.pixels.box.bottom} of the control` : ''}`);
    if (pair.detail) lines.push(`    ${pair.detail}`);
    if (pair.profileDifferences.length) { lines.push(`    edges differ on: ${pair.profileDifferences.join(', ')}`); for (const side of pair.profileDifferences) lines.push(`      ${side.padEnd(11)} reference ${pair.referenceProfile[side].join(' ')}   kit ${pair.atlasProfile[side].join(' ')}`); }
    if (pair.note) lines.push(`    note: ${pair.note}`);
  }
  lines.push('', `Reference cells with no counterpart in the atlas: ${result.unmappedReference.length}`);
  for (const cell of result.unmappedReference) lines.push(`    sheet ${cell.sheet} ${cell.id}${cell.colour ? `  ${cell.colour}` : ''}${cell.profile ? `  ${show(cell.profile)}` : ''}`);
  lines.push('', `Atlas rectangles with no counterpart in the reference: ${result.unmappedAtlas.length}`);
  for (const item of result.unmappedAtlas) lines.push(`    ${item.key}  (${item.what})`);
  if (result.problems.length) { lines.push('', 'Problems with the mapping table:'); for (const problem of result.problems) lines.push(`    ${problem}`); }
  return lines.join('\n') + '\n';
}

async function main(argv) {
  const value = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const captureFile = value('--capture');
  if (!captureFile) { process.stderr.write('Usage: node compare.mjs --capture DIR/NAME-capture.json [--atlas FILE] [--atlas-cells FILE] [--mapping FILE] [--grid FILE] [--json FILE] [--images DIR]\n'); return 2; }
  const capture = JSON.parse(await readFile(captureFile, 'utf8')), dir = path.dirname(captureFile);
  const atlasFile = value('--atlas') ?? path.join(here, '..', '..', 'kit', 'test', 'baseline', 'state-atlas.png');
  const atlas = decodePng(await readFile(atlasFile));
  const atlasCells = JSON.parse(await readFile(value('--atlas-cells') ?? path.join(here, 'atlas-cells.json'), 'utf8'));
  if (atlas.width !== atlasCells.viewport.width || atlas.height !== atlasCells.viewport.height) throw new Error(`The atlas image is ${atlas.width} x ${atlas.height} but atlas-cells.json describes ${atlasCells.viewport.width} x ${atlasCells.viewport.height}. Run node atlas-cells.mjs again.`);
  const mapping = JSON.parse(await readFile(value('--mapping') ?? path.join(here, 'mapping.json'), 'utf8'));
  const grid = value('--grid') ? JSON.parse(await readFile(value('--grid'), 'utf8')) : await loadGrid();
  const reportText = capture.report ? await readFile(path.join(dir, capture.report), 'latin1') : '', report = parseReport(reportText), guest = describeGuest(report);
  const sheets = {};
  for (const sheet of capture.sheets) sheets[sheet.sheet] = decodePng(await readFile(path.join(dir, sheet.file)));
  const bits = guest.bits || capture.guest?.bits || 24;
  const result = compare({ grid, report, sheets, atlas, atlasCells, mapping, bits });
  const heading = [`Reference: ${guest.name}, ${bits} bits per pixel (${captureFile})`, `Kit atlas: ${atlasFile}`];
  if (!guest.isWindows95) heading.push('*** The reference is NOT Windows 95. Nothing below says anything about Windows 95. ***');
  if (bits === 16) heading.push('Both images were reduced to 5:6:5 colour before comparing, because the reference display could show no more.');
  if (bits <= 8) heading.push('The reference display had a palette: colours it could not show exactly (for example a light grey other than #c0c0c0) appear as the nearest palette colour. Trust sizes and edge order here, and the [syscolors] section of the report for colours.');
  process.stdout.write(formatReport(result, heading));
  if (value('--images')) {
    await mkdir(value('--images'), { recursive: true });
    for (const pair of result.pairs) if (pair.crops) await writeFile(path.join(value('--images'), `${pair.reference}--${pair.atlas}.png`), encodePng(sideBySide(pair.crops.reference, pair.crops.atlas), { Source: `Left: ${guest.name}, ${pair.reference}. Right: GUI95 kit atlas, ${pair.atlas}.` }));
  }
  if (value('--json')) await writeFile(value('--json'), JSON.stringify({ reference: guest, bits, ...result, pairs: result.pairs.map(({ crops, ...pair }) => pair) }, null, 1) + '\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = await main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 2; }
}
