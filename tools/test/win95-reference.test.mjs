import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadGrid, overlaps, parseCells } from '../win95-reference/lib/grid.mjs';
import { crop, decodePng, decodePpm, encodePng, hex, pixel } from '../win95-reference/lib/png.mjs';
import { readMarker } from '../win95-reference/lib/marker.mjs';
import { describeGuest, measuredRect, parseReport } from '../win95-reference/lib/report.mjs';
import { checkForWindows95, readPe } from '../win95-reference/lib/pe.mjs';
import { keyFor, pcArguments } from '../win95-reference/lib/qemu.mjs';
import { compare, differingPixels, edgeProfile, formatReport, to565 } from '../win95-reference/compare.mjs';

const run = promisify(execFile);
const tool = fileURLToPath(new URL('../win95-reference/', import.meta.url));
const json = async name => JSON.parse(await readFile(path.join(tool, name), 'utf8'));

const blank = (width, height, [r, g, b] = [192, 192, 192]) => { const data = Buffer.alloc(width * height * 4); for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4); return { width, height, data }; };
const fill = (image, x, y, w, h, [r, g, b]) => { for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) image.data.set([r, g, b, 255], (row * image.width + col) * 4); };
/** A raised rectangle: white top and left, black bottom and right, like the outer line of a button. */
const raised = (image, { x, y, w, h }, light = [255, 255, 255]) => { fill(image, x, y, w, h, [192, 192, 192]); fill(image, x, y, w, 1, light); fill(image, x, y, 1, h, light); fill(image, x, y + h - 1, w, 1, [0, 0, 0]); fill(image, x + w - 1, y, 1, h, [0, 0, 0]); };
const marker = (image, sheet, first = [255, 0, 0]) => { fill(image, 0, 0, 8, 8, first); [4, 2, 1].forEach((bit, i) => fill(image, 8 + i * 8, 0, 8, 8, sheet & bit ? [255, 255, 255] : [0, 0, 0])); fill(image, 32, 0, 8, 8, [0, 0, 255]); };

test('the cell table parses, stays inside the grid, and no two cells on a sheet overlap', async () => {
  const grid = await loadGrid();
  assert.deepEqual(grid.sheets, [1, 2, 3]);
  assert.deepEqual(overlaps(grid.cells), []);
  assert.ok(grid.cells.every(cell => cell.w > 0 && cell.h > 0));
});

test('the cell table holds every state the reference is meant to record', async () => {
  const ids = new Set((await loadGrid()).cells.map(cell => cell.id));
  const wanted = [];
  for (const edge of ['raised', 'sunken', 'etched', 'bump', 'raisedouter', 'sunkenouter', 'raisedinner', 'sunkeninner']) for (const flag of ['none', 'soft', 'flat', 'mono']) wanted.push(`edge_${edge}_${flag}`);
  for (const state of ['normal', 'pushed', 'checked', 'inactive', 'flat']) wanted.push(`dfc_push_${state}`);
  for (const state of ['unchecked', 'checked', 'pushed', 'inactive', 'mixed']) wanted.push(`dfc_check_${state}`);
  for (const state of ['unchecked', 'checked', 'pushed', 'inactive']) wanted.push(`dfc_radio_${state}`);
  for (const direction of ['up', 'down', 'left', 'right']) for (const state of ['normal', 'pushed', 'inactive']) wanted.push(`dfc_scroll_${direction}_${state}`);
  for (const button of ['close', 'min', 'max', 'restore', 'help']) for (const state of ['normal', 'pushed', 'inactive']) wanted.push(`dfc_caption_${button}_${state}`);
  wanted.push('dfc_combo_normal', 'dfc_sizegrip', 'button_normal', 'button_default', 'button_pushed', 'button_default_pushed', 'button_focus', 'button_disabled',
    'check_unchecked', 'check_checked', 'check_pushed', 'check_disabled', 'check_mixed', 'radio_unchecked', 'radio_checked', 'radio_pushed', 'radio_disabled',
    'edit_normal', 'edit_readonly', 'edit_disabled', 'list_select_focus', 'combo_droplist', 'combo_droplist_focus', 'groupbox', 'static_etchedhorz', 'static_etchedvert',
    'hscroll_plain', 'hscroll_disabled', 'vscroll_plain', 'vscroll_disabled', 'vscroll_minthumb', 'status', 'progress_45', 'trackbar', 'updown_buddy', 'tab', 'header',
    'window_active', 'window_inactive', 'menu');
  for (let i = 0; i <= 24; i++) wanted.push(`syscolor_${String(i).padStart(2, '0')}`);
  assert.deepEqual(wanted.filter(id => !ids.has(id)), []);
});

test('the cell table parser rejects what refgrid.c and the JSON export could disagree about', () => {
  const line = (x, id = 'a') => `CELL(1, ${id}, K_EDGE, ${x}, 16, 48, 24, EDGE_RAISED, BF_SOFT|BF_FLAT, ST_FOCUS|ST_SELECT, "a, b\\tc")`;
  const [cell] = parseCells(line(8));
  assert.deepEqual({ ...cell }, { id: 'a', sheet: 1, kind: 'edge', x: 8, y: 16, w: 48, h: 24, a: 'EDGE_RAISED', b: 'BF_SOFT|BF_FLAT', state: ['focus', 'select'], text: 'a, b\tc' });
  assert.throws(() => parseCells(line('8+4')), /plain integer/);
  assert.throws(() => parseCells(line(8) + '\n' + line(100)), /duplicate id/);
  assert.throws(() => parseCells(line(620)), /outside/);
  assert.throws(() => parseCells('CELL(1, m, K_EDGE, 0, 0, 8, 8, 0, 0, 0, "")'), /ready marker/);
  assert.throws(() => parseCells('CELL(1, m, K_EDGE, 8)'), /11 arguments/);
});

test('a PPM screen dump becomes a PNG with the same pixels and a note of its source', () => {
  const ppm = Buffer.concat([Buffer.from('P6\n# made by a test\n3 2\n255\n'), Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 1, 2, 3, 4, 5, 6, 192, 192, 192])]);
  const image = decodePpm(ppm), back = decodePng(encodePng(image, { Source: 'test guest' }));
  assert.deepEqual([back.width, back.height], [3, 2]);
  assert.deepEqual([0, 1, 2].map(x => hex(pixel(back, x, 0))), ['#ff0000', '#00ff00', '#0000ff']);
  assert.equal(hex(pixel(back, 2, 1)), '#c0c0c0');
  assert.equal(back.text.Source, 'test guest');
  assert.throws(() => decodePpm(Buffer.from('P5\n1 1\n255\n\0')), /Unsupported PPM/);
  assert.equal(hex(pixel(crop(back, 2, 1, 2, 1), 0, 0)), '#c0c0c0');
});

test('the ready marker is read for each sheet, at reduced colour depth, and not from a plain desktop', () => {
  for (const sheet of [1, 2, 3]) { const image = blank(64, 16); marker(image, sheet); assert.deepEqual(readMarker(image), { sheet, failed: false }); }
  const failed = blank(64, 16); marker(failed, 2, [255, 255, 0]); assert.deepEqual(readMarker(failed), { sheet: 2, failed: true });
  const highColour = blank(64, 16); marker(highColour, 3); assert.deepEqual(readMarker(to565(highColour)), { sheet: 3, failed: false });
  assert.equal(readMarker(blank(64, 16, [0, 128, 128])), null, 'the teal desktop');
  const partly = blank(64, 16); marker(partly, 1); fill(partly, 3, 3, 1, 1, [0, 0, 0]); assert.equal(readMarker(partly), null, 'a square that is not uniform');
  const none = blank(64, 16); marker(none, 0); assert.equal(readMarker(none), null, 'sheet 0 does not exist');
});

const REPORT = (version, extra = 'wine=no') => `; refgrid report\r\n[system]\r\nversion=${version}\r\n${extra}\r\ncomctl32.DllGetVersion=absent (the original 4.00 library)\r\nscreen=800 x 600\r\nbitspixel=16\r\nplanes=1\r\n\r\n[sheet2]\r\nbutton_normal=8,16,75,23\r\ncombo_droplist=8,160,84,21\r\n[sheet3]\r\nmenu=8,292,150,160\r\nmenu.item1=11,312,144,17\r\n`;

test('the report identifies the system that drew the grid, and never calls Wine or a later Windows "Windows 95"', () => {
  const win95 = describeGuest(parseReport(REPORT('4.0 build 950 platform 1 csd ""')));
  assert.deepEqual([win95.label, win95.isWindows95, win95.bits, win95.originalControls], ['win95-4.00.950', true, 16, true]);
  const wine = describeGuest(parseReport(REPORT('4.0 build 950 platform 1 csd ""', 'wine=10.0')));
  assert.deepEqual([wine.label, wine.isWindows95], ['wine', false]);
  assert.match(wine.name, /not Windows/);
  const later = describeGuest(parseReport(REPORT('4.10 build 2222 platform 1 csd " A "')));
  assert.deepEqual([later.label, later.isWindows95], ['windows-4.10.2222', false]);
  assert.equal(describeGuest({}).label, 'unknown-system');
  assert.deepEqual(measuredRect(parseReport(REPORT('4.0 build 950 platform 1')), { sheet: 2, id: 'combo_droplist' }), { x: 8, y: 160, w: 84, h: 21 });
});

test('keys and the emulated PC are described the way QEMU expects', () => {
  assert.deepEqual([keyFor('a'), keyFor('Q'), keyFor('\\'), keyFor(':'), keyFor('\n'), keyFor('.')], [['a'], ['shift', 'q'], ['backslash'], ['shift', 'semicolon'], ['ret'], ['dot']]);
  assert.throws(() => keyFor('é'));
  const args = pcArguments({ disks: [{ file: 'o.qcow2', format: 'qcow2' }, { file: 'd.img', format: 'raw' }] }).join(' ');
  assert.match(args, /-cpu pentium .*-vga cirrus .*-nic none/);
  assert.match(args, /if=ide,index=0,media=disk,file=o\.qcow2,format=qcow2 .*if=ide,index=1,media=disk,file=d\.img,format=raw/);
  assert.doesNotMatch(args, /icount/);
  assert.match(pcArguments({ icount: '4' }).join(' '), /-icount shift=4/);
});

test('refgrid.exe, when it has been built, is an i386 GUI program importing only from Windows 95 libraries', async t => {
  const exe = path.join(tool, 'out', 'REFGRID.EXE');
  try { await access(exe); } catch { t.skip('out/REFGRID.EXE is not built (./run.sh build)'); return; }
  const info = readPe(await readFile(exe));
  assert.deepEqual(checkForWindows95(info), []);
  assert.deepEqual([info.machine, info.subsystem, info.subsystemVersion], [0x14c, 2, '4.0']);
  const user = info.imports.find(entry => entry.dll === 'user32.dll').functions;
  for (const name of ['DrawEdge', 'DrawFrameControl', 'GetSysColor', 'TrackPopupMenu']) assert.ok(user.includes(name), name);
  for (const later of ['SetMenuItemInfoA', 'GetMenuItemInfoA', 'EndMenu', 'GetScrollBarInfo', 'GetComboBoxInfo']) assert.ok(!user.includes(later), `${later} is avoided`);
});

test('every pair in the mapping table names a real reference cell or measured part and a real atlas rectangle', async () => {
  const [mapping, atlasCells, grid] = [await json('mapping.json'), await json('atlas-cells.json'), await loadGrid()];
  const ids = new Set(grid.cells.map(cell => cell.id)), parts = /^(menu|menubar|tab|status)\.(item|part)\d+$/;
  assert.deepEqual(mapping.pairs.filter(pair => !ids.has(pair.reference) && !parts.test(pair.reference)).map(pair => pair.reference), []);
  assert.deepEqual(mapping.pairs.filter(pair => !atlasCells.cells[pair.atlas]).map(pair => pair.atlas), []);
  assert.deepEqual(mapping.pairs.filter(pair => !['exact', 'ring', 'profile'].includes(pair.compare)), []);
  assert.equal(new Set(mapping.pairs.map(pair => pair.atlas)).size, mapping.pairs.length, 'no atlas rectangle is paired twice');
});

test('the atlas rectangle list describes the stored atlas baseline', async () => {
  const atlasCells = await json('atlas-cells.json'), png = await readFile(path.join(tool, '..', '..', 'kit', 'test', 'baseline', 'state-atlas.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [atlasCells.viewport.width, atlasCells.viewport.height]);
  for (const [key, r] of Object.entries(atlasCells.cells)) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= atlasCells.viewport.width && r.y + r.h <= atlasCells.viewport.height, key);
});

test('edge profiles, 5:6:5 reduction and pixel counts measure what they say', () => {
  const image = blank(40, 30); raised(image, { x: 5, y: 5, w: 20, h: 10 });
  const profile = edgeProfile(image, { x: 5, y: 5, w: 20, h: 10 }, 2);
  assert.deepEqual(profile, { top: ['#ffffff', '#c0c0c0'], left: ['#ffffff', '#c0c0c0'], bottom: ['#000000', '#c0c0c0'], right: ['#000000', '#c0c0c0'], topLeft: ['#ffffff', '#c0c0c0'], bottomRight: ['#000000', '#c0c0c0'] });
  assert.equal(hex(pixel(to565(blank(1, 1, [192, 192, 192])), 0, 0)), '#c6c3c6', 'QEMU shows 5:6:5 grey 24,48,24 as c6c3c6');
  assert.equal(hex(pixel(to565(blank(1, 1, [198, 195, 198])), 0, 0)), '#c6c3c6', 'reduction is stable');
  const other = blank(40, 30); raised(other, { x: 5, y: 5, w: 20, h: 10 }); fill(other, 14, 9, 2, 2, [0, 0, 0]);
  const rect = { x: 5, y: 5, w: 20, h: 10 };
  assert.equal(differingPixels(image, rect, other, rect).different, 4);
  assert.equal(differingPixels(image, rect, other, rect, 3).different, 0, 'the ring ignores the interior');
});

/** A synthetic "capture": sheets drawn from the cell table, and an atlas drawn from the atlas rectangle list. */
async function synthetic({ light = [255, 255, 255] } = {}) {
  const [mapping, atlasCells, grid] = [await json('mapping.json'), await json('atlas-cells.json'), await loadGrid()];
  const sheets = Object.fromEntries(grid.sheets.map(n => [n, blank(800, 600)]));
  for (const cell of grid.cells) if (cell.kind !== 'menu') raised(sheets[cell.sheet], cell, light);
  const atlas = blank(atlasCells.viewport.width, atlasCells.viewport.height);
  for (const r of Object.values(atlasCells.cells)) if (!r.partOf && Number.isInteger(r.x)) raised(atlas, r);
  return { mapping, atlasCells, grid, sheets, atlas, report: parseReport(REPORT('4.0 build 950 platform 1')) };
}

test('the comparison reports matches, differences, size differences and unmapped cells on both sides', async () => {
  const input = await synthetic();
  const result = compare({ ...input, bits: 24 });
  const pair = name => result.pairs.find(p => p.reference === name);
  assert.equal(pair('button_normal').status, 'match', 'same size, same edges: 75 by 23 in both');
  assert.equal(pair('button_normal').referenceRectSource, 'measured by refgrid');
  assert.equal(pair('combo_droplist').status, 'size differs');
  assert.deepEqual(pair('combo_droplist').sizeDifference, { w: 0, h: 2 }, 'the kit draws 23 high, the report measured 21');
  assert.equal(pair('menu.item1').sheet, 3, 'a measured part is found in the report');
  assert.deepEqual(pair('menu.item1').sizeDifference, { w: 26, h: 5 });
  assert.ok(result.unmappedReference.some(cell => cell.id === 'edge_raised_soft'), 'DrawEdge cells have no atlas counterpart');
  assert.ok(result.unmappedAtlas.some(item => item.key === 'tree'), 'the tree has no reference counterpart');
  assert.ok(!result.unmappedAtlas.some(item => item.key === 'button-rest'));
  assert.ok(result.problems.every(problem => /measured part/.test(problem)), 'only parts the synthetic report lacks are reported as problems');

  const changed = compare({ ...await synthetic({ light: [223, 223, 223] }), bits: 24 });
  const button = changed.pairs.find(p => p.reference === 'button_normal');
  assert.equal(button.status, 'differs');
  assert.deepEqual(button.profileDifferences, ['top', 'left', 'topLeft']);
  assert.equal(button.referenceProfile.top[0], '#dfdfdf');
  assert.ok(button.pixels.different > 0);
  const text = formatReport(changed, ['Reference: test']);
  assert.match(text, /DIFFERS\s+button_normal\s+<->\s+button-rest/);
  assert.match(text, /top\s+reference #dfdfdf #c0c0c0 #c0c0c0\s+kit #ffffff #c0c0c0 #c0c0c0/);
  assert.match(text, /Reference cells with no counterpart in the atlas: \d+/);
  assert.match(text, /Atlas rectangles with no counterpart in the reference: \d+/);
});

test('the comparison command runs on a capture folder, labels a non-Windows reference, and leaves the kit alone', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gui95-w95ref-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const { sheets } = await synthetic();
  const files = [];
  for (const [n, image] of Object.entries(sheets)) { await writeFile(path.join(temp, `s${n}.png`), encodePng(image)); files.push({ sheet: +n, file: `s${n}.png` }); }
  await writeFile(path.join(temp, 'report.txt'), REPORT('4.0 build 950 platform 1', 'wine=10.0'));
  await writeFile(path.join(temp, 'c.json'), JSON.stringify({ report: 'report.txt', sheets: files }));
  const baseline = path.join(tool, '..', '..', 'kit', 'test', 'baseline', 'state-atlas.png'), before = await readFile(baseline);
  const { stdout } = await run(process.execPath, [path.join(tool, 'compare.mjs'), '--capture', path.join(temp, 'c.json'), '--json', path.join(temp, 'result.json'), '--images', path.join(temp, 'pairs')]);
  assert.match(stdout, /Reference: Wine 10\.0 \(not Windows\)/);
  assert.match(stdout, /The reference is NOT Windows 95/);
  assert.match(stdout, /Mapped pairs: \d+/);
  const result = JSON.parse(await readFile(path.join(temp, 'result.json'), 'utf8'));
  assert.equal(result.reference.isWindows95, false);
  assert.ok(result.pairs.length > 30);
  const side = decodePng(await readFile(path.join(temp, 'pairs', 'button_normal--button-rest.png')));
  assert.deepEqual([side.width, side.height], [75 + 4 + 75, 23]);
  assert.ok((await readFile(baseline)).equals(before), 'the atlas baseline is untouched');
  await assert.rejects(run(process.execPath, [path.join(tool, 'compare.mjs')]), error => error.code === 2);
});
