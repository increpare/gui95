// Runs an interaction script against the guest: a list of steps (keys, mouse, waits), and after every step the
// state refscene reports and a screen dump. The same step list is replayed against the kit's examples in a browser,
// so steps name things abstractly: a key by its QEMU key name, a place by cell, control or menu item.
//
// A step is an object with one action and optional "note" and "settle" (milliseconds to wait before reading state):
//   { "scene": 7 }                      show a scene and wait until it is ready
//   { "key": "down" }                   press and release one key          { "key": ["alt", "f"] }   a chord
//   { "down": "shift" } { "up": "shift" }   hold and release a key across other steps
//   { "text": "le" }                    type characters one key at a time
//   { "move": TARGET }                  move the mouse until Windows reports the pointer on TARGET
//   { "press": "left" } { "release": "left" }   mouse button down and up
//   { "click": TARGET } { "dblclick": TARGET } { "rightclick": TARGET }   move, then press and release
//   { "wait": 500 }                     do nothing for that long (host milliseconds)
//   { "focus": "cell_id" }              ask refscene to give that control the focus (setup, not input)
//   { "command": "V 0" }                any refscene command (setup, not input)
// Add "blind": true to a step taken while Windows answers nothing (it is moving or sizing a window by keyboard): the
// step is done and its screen dump kept, but no state is asked for until a later step.
// TARGET is { "x": .., "y": .. } in screen pixels, or names a rectangle read from refscene's dump:
//   { "cell": "id" }  { "control": 101 } (a control id in the active window)  { "text": "OK" } (a control by its label)
//   { "menu": "file", "item": 2 }  { "window": "caption" | "close" | "client" } (the active window)
// (add "class" to a cell to pick the up-down control beside its buddy, which share a cell), with optional "part" (a named rectangle inside the control: "thumb", "item1", "button3", ...), "fx" and "fy"
// (where in the rectangle, 0 to 1, default the middle), "dx", "dy" (pixels added) and "first": "y" or "x" (finish that
// direction before moving in the other: the path matters when the pointer would otherwise cross another menu title).
import { keyFor, sleep } from './qemu.mjs';

const strip = text => (text ?? '').replace(/&/g, '');

/** The point a TARGET names, from a parsed dump (see lib/protocol.mjs). Throws if the dump has no such rectangle. */
export function resolveTarget(target, dump, activeHwnd) {
  if (target.x !== undefined && !target.cell && target.control === undefined && !target.text && !target.menu && !target.window) return { x: target.x, y: target.y };
  const windows = dump.windows, active = windows.find(w => w.hwnd === activeHwnd) ?? windows.find(w => w.cell !== 'host') ?? windows[0];
  const all = windows.flatMap(w => [w, ...w.children]);
  let rect = null, owner = null;
  if (target.cell) owner = all.find(w => w.cell === target.cell && (!target.class || w.class === target.class));
  else if (target.control !== undefined) owner = active?.children.find(c => c.id === target.control && c.visible) ?? all.find(c => c.id === target.control && c.visible);
  else if (target.text) owner = (active?.children ?? []).find(c => strip(c.text) === target.text && c.visible) ?? all.find(c => strip(c.text) === target.text && c.visible);
  else if (target.menu) { rect = dump.menus[target.menu]?.items[target.item]?.rect; if (!rect) throw new Error(`No rectangle for item ${target.item} of menu "${target.menu}" in the dump.`); }
  else if (target.window) {
    if (!active) throw new Error('No active window in the dump.');
    const r = active.rect, c = active.client;
    rect = target.window === 'client' ? c : target.window === 'close' ? { x: r.x + r.w - (c.x - r.x) - 2 - 16, y: r.y + (c.x - r.x) + 2, w: 16, h: 14 } : { x: c.x, y: r.y + (c.x - r.x), w: c.w - 60, h: 18 };
  }
  if (!rect) {
    if (!owner) throw new Error(`Nothing in the dump matches ${JSON.stringify(target)}.`);
    rect = target.part ? owner.parts[target.part] : owner.rect;
    if (!rect) throw new Error(`${JSON.stringify(target)}: the control has no part "${target.part}" (it has ${Object.keys(owner.parts).join(', ') || 'none'}).`);
  }
  return { x: Math.round(rect.x + (rect.w - 1) * (target.fx ?? 0.5)) + (target.dx ?? 0), y: Math.round(rect.y + (rect.h - 1) * (target.fy ?? 0.5)) + (target.dy ?? 0) };
}

/** What a step's state boils down to: the facts a comparison uses, with window handles removed. */
export function summarize(state) {
  const controls = {}, seen = new Map();
  for (const c of state.controls) {
    if (!c.visible) continue;
    const base = c.cell ?? `${c.class}#${c.id}`, count = seen.get(base) ?? 0; seen.set(base, count + 1);
    const { caret, modified, ...rest } = c.state;   // the caret position in pixels and the edit's modified flag say nothing a browser can be compared with
    controls[count ? `${base}~${count}` : base] = { ...(c.text !== '' ? { text: c.text } : {}), ...(c.enabled ? {} : { enabled: false }), ...rest };
  }
  const windowOf = w => w ? { class: w.class, text: w.text } : null;
  return {
    active: windowOf(state.active),
    focus: state.focus ? { class: state.focus.class, id: state.focus.id, ...(state.focus.cell ? { cell: state.focus.cell } : {}), text: state.focus.text } : null,
    ...(state.defaultId !== undefined ? { defaultId: state.defaultId } : {}),
    menu: { loop: state.menu?.loop ?? false, levels: state.menu?.levels ?? 0, bar: state.menu?.barText || null, open: state.menus.map(m => ({ name: m.name, highlight: m.highlight, text: m.text })) },
    tops: state.tops.map(windowOf),
    cursor: state.cursor,
    controls
  };
}

/** The control fields that differ between two summaries: { key: { field: [before, after] } }; a control that appeared or went is { "(shown)": true } or { "(gone)": true }. */
export function changes(before, after) {
  const out = {};
  for (const key of new Set([...Object.keys(before.controls), ...Object.keys(after.controls)])) {
    const a = before.controls[key], b = after.controls[key];
    if (!a) { out[key] = { '(shown)': true, ...b }; continue; }
    if (!b) { out[key] = { '(gone)': true }; continue; }
    const diff = {};
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) diff[field] = [a[field] ?? null, b[field] ?? null];
    if (Object.keys(diff).length) out[key] = diff;
  }
  return out;
}

/**
 * Run `script.steps` on the guest. `onStep(index, step, image)` receives each screen dump (to save it); the result
 * holds, per step, what was done, the state summary, the events the guest logged with its own clock, and for mouse
 * steps where Windows reported the pointer. Pass `out` to keep the steps recorded before a step that throws.
 */
export async function runScript(guest, script, { onStep = async () => null, log = () => {}, out = [] } = {}) {
  let previous = null, firstTime = null;
  const press = async keys => guest.chord(keys);
  const moveTo = async target => { const now = await guest.peek(), dump = await guest.dump(), point = resolveTarget(target, dump, now.active?.hwnd); const moved = await guest.moveTo(point.x, point.y, { first: target.first ?? null }); return { ...point, moves: moved.moves }; };
  for (const [index, step] of script.steps.entries()) {
    let pointer;
    if (step.scene !== undefined) { await guest.scene(step.scene); await guest.command(`V ${script.pointer ? 1 : 0}`); await sleep(500); }
    else if (step.key !== undefined) await press(step.key);
    else if (step.down !== undefined) await guest.keyEvent(step.down, true);
    else if (step.up !== undefined) await guest.keyEvent(step.up, false);
    else if (step.text !== undefined) for (const ch of step.text) await press(keyFor(ch));
    else if (step.move !== undefined) pointer = await moveTo(step.move);
    else if (step.press !== undefined) await guest.button(step.press, true);
    else if (step.release !== undefined) await guest.button(step.release, false);
    else if (step.click !== undefined) { if (step.click !== true) pointer = await moveTo(step.click); await guest.click('left'); }
    else if (step.rightclick !== undefined) { if (step.rightclick !== true) pointer = await moveTo(step.rightclick); await guest.click('right'); }
    else if (step.dblclick !== undefined) { if (step.dblclick !== true) pointer = await moveTo(step.dblclick); await guest.click('left', 40); await sleep(60); await guest.click('left', 40); }
    else if (step.wait !== undefined) await sleep(step.wait);
    else if (step.focus !== undefined) { const answer = await guest.command(`F ${step.focus}`); if (!answer[0]?.startsWith('ok')) throw new Error(`Step ${index}: ${answer[0]}`); }
    else if (step.command !== undefined) await guest.command(step.command);
    else throw new Error(`Step ${index} has no action: ${JSON.stringify(step)}`);
    await sleep(step.settle ?? 300);
    if (step.blind) {   // Windows is in a loop that answers nothing (moving or sizing a window by keyboard): keep the screen dump only
      const image = await guest.screendump(), file = await onStep(index, step, image);
      out.push({ step, blind: true, ...(file ? { image: file } : {}) }); log(`  ${String(index).padStart(2)} ${JSON.stringify(step)}  (no state: the guest does not answer in this mode)`);
      continue;
    }
    const state = await guest.state(), summary = summarize(state), image = await guest.screendump();
    firstTime ??= state.time;
    const file = await onStep(index, step, image);
    const record = { step, ...(pointer ? { pointer } : {}), guestTime: state.time - firstTime, state: { ...summary, controls: undefined }, events: state.events.map(({ t, ...rest }) => ({ t: t - firstTime, ...rest })) };
    delete record.state.controls;
    if (!previous || step.scene !== undefined) record.controls = summary.controls; else record.changed = changes(previous, summary);
    if (file) record.image = file;
    out.push(record); previous = summary;
    log(`  ${String(index).padStart(2)} ${JSON.stringify(step)}  focus=${summary.focus ? `${summary.focus.cell ?? summary.focus.class + '#' + summary.focus.id}` : 'none'}${summary.menu.levels ? ` menus=${summary.menu.open.map(m => `${m.name}:${m.text}`).join('>')}` : ''}${record.changed && Object.keys(record.changed).length ? ` changed=${JSON.stringify(record.changed)}` : ''}`);
  }
  return out;
}
