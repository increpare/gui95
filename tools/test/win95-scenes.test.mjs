import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadGrid } from '../win95-reference/lib/grid.mjs';
import { parseDump, parseInfo, parseLine, parseState } from '../win95-reference/lib/protocol.mjs';
import { changes, resolveTarget, summarize } from '../win95-reference/lib/script.mjs';

const tool = fileURLToPath(new URL('../win95-reference/', import.meta.url));
const json = async name => JSON.parse(await readFile(path.join(tool, name), 'utf8'));

test('a protocol line splits into a tag, bare words and fields, with quoted values kept whole', () => {
  assert.deepEqual(parseLine('c hwnd=00000a10 id=101 class="Edit" text="Two words = here" sel=0,6'), { tag: 'c', hwnd: '00000a10', id: '101', class: 'Edit', text: 'Two words = here', sel: '0,6' });
  assert.deepEqual(parseLine('active none'), { tag: 'active', word: 'none' });
  assert.deepEqual(parseLine('e t=120 modal end cell=msgbox_info result=1'), { tag: 'e', t: '120', word: 'modal end', cell: 'msgbox_info', result: '1' });
});

const stateLines = [
  'q scene=7 ready=1 modal=0 t=5000 tick=4990 cursor=320,240 shown=0 capture=00000000 foreground=1',
  'active hwnd=00000a00 id=0 class="#32770" text="Export Options" cell=form rect=20,20,347,309',
  'focus hwnd=00000a10 id=101 class="Edit" text="Letter" cell=- rect=83,51,150,23',
  'def id=1 has=1',
  'top hwnd=00000a00 id=0 class="#32770" text="Export Options" cell=form rect=20,20,347,309',
  'menu loop=0 levels=0',
  'c hwnd=00000a10 parent=00000a00 id=101 class="Edit" cell=- enabled=1 visible=1 text="Letter" sel=0,6 lines=1 first=0 length=6 caret=30,1 modified=0',
  'c hwnd=00000a11 parent=00000a00 id=121 class="Button" cell=- enabled=1 visible=1 text="A&ll channels" type=check3 check=2 pushed=0 bmfocus=0',
  'c hwnd=00000a12 parent=00000a00 id=124 class="Button" cell=- enabled=0 visible=1 text="Re&quired metadata" type=check check=1 pushed=0 bmfocus=0',
  'e t=4800 command dialog=form id=121 code=0'
];

test('the state answer becomes focus, default button, controls and events', () => {
  const state = parseState(stateLines);
  assert.equal(state.scene, 7); assert.equal(state.ready, true); assert.deepEqual(state.cursor, { x: 320, y: 240 });
  assert.equal(state.focus.id, 101); assert.equal(state.active.cell, 'form'); assert.equal(state.defaultId, 1);
  assert.deepEqual(state.controls[1].state, { type: 'check3', check: 2, pushed: 0, bmfocus: 0 });
  assert.equal(state.controls[2].enabled, false);
  assert.deepEqual(state.events, [{ t: 4800, what: 'command', dialog: 'form', id: 121, code: 0 }]);
  assert.equal(parseState(['q scene=0 ready=0 modal=0 t=1 tick=1 cursor=0,0 shown=1 capture=00000000 foreground=1', 'focus none']).focus, null);
});

test('a summary keeps the comparable facts and a difference names exactly the fields that changed', () => {
  const before = summarize(parseState(stateLines));
  assert.deepEqual(before.focus, { class: 'Edit', id: 101, text: 'Letter' });
  assert.deepEqual(before.controls['Button#121'], { text: 'A&ll channels', type: 'check3', check: 2, pushed: 0, bmfocus: 0 });
  assert.equal(before.controls['Edit#101'].caret, undefined, 'the caret position in pixels is not a comparable fact');
  const after = summarize(parseState(stateLines.map(line => line.replace('check=2', 'check=0'))));
  assert.deepEqual(changes(before, after), { 'Button#121': { check: [2, 0] } });
  assert.deepEqual(changes(before, before), {});
});

const dumpLines = [
  'd scene=8',
  'w hwnd=00000b00 owner=00000154 class="refscene.frame" cell=frame rect=8,8,420,300 client=12,50,412,254 style=14cf0000 ex=00000100 text="Letter.txt - Example"',
  'w hwnd=00000a00 owner=00000154 class="#32770" cell=form rect=20,20,347,309 client=23,42,341,284 style=94c800c4 ex=00010101 text="Export Options"',
  'r 00000a00.baseunits=6,13,0,0',
  'c hwnd=00000a20 parent=00000a00 id=1 class="Button" cell=- rect=116,312,75,23 client=116,312,75,23 style=50030001 ex=00000004 enabled=1 visible=1 text="OK"',
  'c hwnd=00000a21 parent=00000a00 id=131 class="ListBox" cell=- rect=33,219,150,69 client=35,221,130,65 style=50a10001 ex=00000204 enabled=1 visible=1 text=""',
  'r 00000a21.item0=35,221,130,13',
  'm name=file moved=-12,-50',
  'm name=file item=0 id=1001 flags=0000 text="&New\tCtrl+N"',
  'r menu.file.item0=15,53,150,17',
  'r menu.file.window=12,50,156,128',
  't dialog=form hwnd=00000a00 units=227,187',
  'u dialog=form id=1 hwnd=00000a20 units=62,166,50,14'
];

test('the dump answer becomes windows, children, parts, menus and template units', () => {
  const dump = parseDump(dumpLines);
  assert.equal(dump.windows.length, 2);
  const dialog = dump.windows[1];
  assert.deepEqual(dialog.parts.baseunits, { x: 6, y: 13, w: 0, h: 0 });
  assert.deepEqual(dialog.children.map(c => c.id), [1, 131]);
  assert.deepEqual(dialog.children[1].parts.item0, { x: 35, y: 221, w: 130, h: 13 });
  assert.deepEqual(dump.menus.file.items[0].rect, { x: 15, y: 53, w: 150, h: 17 });
  assert.deepEqual(dump.menus.file.window, { x: 12, y: 50, w: 156, h: 128 });
  assert.deepEqual(dump.templates.form.controls[0], { id: 1, hwnd: '00000a20', units: { x: 62, y: 166, w: 50, h: 14 }, pixels: { x: 116, y: 312, w: 75, h: 23 } });
  // 50 by 14 dialog units at base units 6 by 13 are 75 by 23 pixels: the template and the measurement agree.
  assert.equal(Math.round(50 * 6 / 4), 75); assert.equal(Math.round(14 * 13 / 8), 23);
});

test('a mouse target resolves to a point inside the rectangle it names', () => {
  const dump = parseDump(dumpLines);
  assert.deepEqual(resolveTarget({ x: 5, y: 6 }, dump), { x: 5, y: 6 });
  assert.deepEqual(resolveTarget({ control: 1 }, dump, '00000a00'), { x: 153, y: 323 });
  assert.deepEqual(resolveTarget({ text: 'OK' }, dump, '00000a00'), { x: 153, y: 323 });
  assert.deepEqual(resolveTarget({ control: 131, part: 'item0', fx: 0, dx: 4 }, dump, '00000a00'), { x: 39, y: 227 });
  assert.deepEqual(resolveTarget({ menu: 'file', item: 0 }, dump), { x: 90, y: 61 });
  assert.deepEqual(resolveTarget({ cell: 'frame', fx: 0, fy: 0 }, dump), { x: 8, y: 8 });
  assert.throws(() => resolveTarget({ control: 999 }, dump, '00000a00'), /Nothing in the dump/);
  assert.throws(() => resolveTarget({ control: 131, part: 'thumb' }, dump, '00000a00'), /no part "thumb"/);
  assert.throws(() => resolveTarget({ menu: 'view', item: 0 }, dump), /No rectangle/);
});

test('a control field never hides the line\'s own fields: a tree reports its rows as "items", and stays visible', () => {
  const state = parseState(['q scene=5 ready=1 modal=0 t=1 tick=1 cursor=0,0 shown=0 capture=00000000 foreground=1', 'c hwnd=00000b10 parent=00000154 id=341 class="SysTreeView32" cell=tree enabled=1 visible=1 text="" items=*[-]Documents|[+]Projects|Readme.txt|[+]Pictures']);
  assert.equal(state.controls[0].visible, true);
  assert.equal(summarize(state).controls.tree.items, '*[-]Documents|[+]Projects|Readme.txt|[+]Pictures');
});

test('the information answer keeps its sections', () => {
  assert.deepEqual(parseInfo(['[system]', 'version=4.0 build 1111 platform 1 csd " C"', '[input]', 'GetDoubleClickTime=500']), { system: { version: '4.0 build 1111 platform 1 csd " C"' }, input: { GetDoubleClickTime: '500' } });
});

test('every capture in scenes.json names a scene that exists and says which library draws it', async () => {
  const grid = await loadGrid(), sheets = new Set(grid.cells.filter(cell => cell.sheet >= 4).map(cell => cell.sheet)), table = await json('scenes.json');
  const names = new Set();
  for (const capture of table.captures) {
    assert.ok(sheets.has(capture.scene), `${capture.name}: scene ${capture.scene} has no cells`);
    assert.ok(!names.has(capture.name), `${capture.name} appears twice`); names.add(capture.name);
    assert.match(capture.drawnBy, /user32|comctl32|comdlg32/, `${capture.name}: drawnBy must name the library, which fixes the era of the evidence`);
    assert.ok(capture.families.length > 0);
  }
  for (const sheet of sheets) assert.ok(table.captures.some(capture => capture.scene === sheet), `scene ${sheet} is never captured`);
});

test('every behaviour script has a complete recording from Windows 95, with the pointer calibration agreeing', async () => {
  const scripts = (await readdir(path.join(tool, 'scripts'))).filter(name => name.endsWith('.json')).sort();
  assert.ok(scripts.length >= 37);
  for (const name of scripts) {
    const script = await json(`scripts/${name}`), recording = await json(`recordings/${name}`);
    assert.equal(recording.error, undefined, `${name}: the recording stopped early`);
    assert.equal(recording.steps.length, script.steps.length, `${name}: the recording has a different number of steps from the script; record it again`);
    assert.deepEqual(recording.steps.map(step => step.step), script.steps, `${name}: the recorded steps are not the script's steps`);
    assert.match(recording.run.guest.name, /^Windows 95 4\.00\./, `${name}: not recorded on Windows 95`);
    assert.match(recording.drawnBy, /user32|comctl32|comdlg32/);
    assert.equal(recording.run.pointer.agrees, true, `${name}: the pointer was not where Windows was asked to put it`);
    for (const step of recording.steps) if (!step.blind) assert.ok(step.state && Array.isArray(step.events), `${name}: a step has no state`);
  }
});

test('the committed measurements cover every capture and name the system that was measured', async () => {
  const table = await json('scenes.json'), measurements = await json('measurements/scenes.json');
  assert.match(measurements.guest.name, /^Windows 95 4\.00\./);
  for (const capture of table.captures) {
    const measured = measurements.captures[capture.name];
    assert.ok(measured, `${capture.name} has no measurements; run ./run.sh scenes`);
    assert.ok(measured.windows.length > 0, `${capture.name} measured no window`);
    for (const window of measured.windows) for (const child of window.children) assert.ok(child.rect.w >= 0 && child.rect.h >= 0);
  }
  // The template dialog: 50 by 14 units is 75 by 23 pixels at this system's 6 by 13 base units, measured, not assumed.
  const ok = measurements.captures.form.windows[0].children.find(child => child.id === 1);
  assert.deepEqual([ok.units.w, ok.units.h, ok.unitsFrom, ok.rect.w, ok.rect.h], [50, 14, 'template', 75, 23]);
  // A system dialog's units are worked back from pixels and say so.
  assert.equal(measurements.captures['msgbox-info'].windows[0].children.find(child => child.class === 'Button').unitsFrom, 'derived from pixels');
});
