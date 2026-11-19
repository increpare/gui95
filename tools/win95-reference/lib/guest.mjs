// Runs refscene on the prepared Windows 95 image and talks to it: commands and answers over the emulated serial
// port, keys and mouse through QMP, screen dumps of the guest framebuffer. Used inside the container (see run.sh).
import { access, mkdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { buildDataDisk, connectQmp, createOverlay, pcArguments, sleep, startQemu } from './qemu.mjs';
import { parseDump, parseInfo, parseState } from './protocol.mjs';

export const WORK = '/tmp/refscene';
const sockets = work => ({ qmp: path.join(work, 'qmp.sock'), control: path.join(work, 'ctl.sock'), serial: path.join(work, 'serial.sock') });

/** A line-based client for refscene's serial protocol. `command` resolves with the answer's lines (without the closing "."). */
export async function connectSerial(socketPath) {
  let socket;
  for (let attempt = 0; attempt < 100 && !socket; attempt++) { socket = await new Promise(resolve => { const s = net.createConnection(socketPath); s.once('connect', () => resolve(s)); s.once('error', () => resolve(null)); }); if (!socket) await sleep(100); }
  if (!socket) throw new Error(`No serial socket at ${socketPath}.`);
  let buffer = '', lines = [], waiting = null; const transcript = [];
  socket.on('data', data => {
    buffer += data.toString('latin1');
    for (let end; (end = buffer.indexOf('\n')) >= 0;) {
      const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
      if (line === '.') { const done = lines; lines = []; const resolve = waiting; waiting = null; resolve?.(done); } else lines.push(line);
    }
  });
  socket.on('error', () => {});
  const command = (text, timeout = 20000) => new Promise((resolve, reject) => {
    if (waiting) return reject(new Error('A command is already waiting for its answer.'));
    lines = []; buffer = '';
    const timer = setTimeout(() => { waiting = null; reject(new Error(`No answer to "${text}" within ${timeout} ms.`)); }, timeout);
    waiting = answer => { clearTimeout(timer); transcript.push({ command: text, answer }); resolve(answer); };
    socket.write(text + '\n');
  });
  return { command, transcript, close: () => socket.destroy() };
}

/** Boot the guest on a throwaway overlay with refscene on the data disk (as REFGRID.EXE, the name Windows starts). */
export async function startGuest({ disk, exe, bits = 24, width = 640, height = 480, icount = '4', work = WORK, log = () => {}, bootTimeout = 900 }) {
  await access(disk); await access(exe);
  await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true });
  const data = path.join(work, 'data.img'), overlay = path.join(work, 'overlay.qcow2'), s = sockets(work);
  await buildDataDisk(data, { 'REFGRID.EXE': exe, 'REFGRID.INI': Buffer.from(`[refgrid]\r\nbits=${bits}\r\nwidth=${width}\r\nheight=${height}\r\n${process.env.REFSCENE_INI ?? ''}`) }, work);
  await createOverlay(disk, overlay);
  const args = [...pcArguments({ icount, disks: [{ file: overlay, format: 'qcow2' }, { file: data, format: 'raw' }] }), '-chardev', `socket,id=ser0,path=${s.serial},server=on,wait=off`, '-serial', 'chardev:ser0'];
  const vm = await startQemu({ args, workDir: work, controlSocket: s.control, log });
  const serial = await connectSerial(s.serial);
  const start = Date.now();
  // Send nothing until refscene's window covers the screen: bytes arriving on a serial port nobody has opened yet
  // can leave Windows 95 holding the port, and refscene is then refused it.
  const face = image => [[10, 10], [600, 20], [20, 440], [620, 400]].every(([x, y]) => { const i = (y * image.width + x) * 4; return image.width === width && image.data[i] === 0xc0 && image.data[i + 1] === 0xc0 && image.data[i + 2] === 0xc0; });
  for (;;) {
    if (vm.exited) throw new Error(`QEMU exited during the boot: ${vm.output.trim()}`);
    if (Date.now() - start > bootTimeout * 1000) { await vm.quit(); throw new Error(`refscene's window did not appear within ${bootTimeout} s.`); }
    if (face(await vm.screendump())) break;
    await sleep(2000);
  }
  await sleep(2000);
  for (;;) {
    if (vm.exited) throw new Error(`QEMU exited during the boot: ${vm.output.trim()}`);
    if (Date.now() - start > bootTimeout * 1000) { await vm.quit(); throw new Error(`refscene did not answer within ${bootTimeout} s.`); }
    try { const answer = await serial.command('P', 4000); if (answer.some(line => line.startsWith('pong'))) break; } catch { /* Windows is still starting, or restarting to change the display mode */ }
  }
  log(`refscene answered after ${Math.round((Date.now() - start) / 1000)} s.`);
  return { vm, serial, args, work };
}

/** The controls a script uses, over an open QMP connection and serial client. */
export function guestControls(vm, serial) {
  // refscene forgets its event log once it has sent it, and the pointer loop below reads the state many times within
  // one step. `peek` keeps the events it drains; `state` returns them all, in order, with the state it reads.
  let backlog = [];
  const peek = async () => { const now = parseState(await serial.command('Q')); backlog.push(...now.events); return now; };
  const state = async () => { const now = await peek(); now.events = backlog; backlog = []; return now; };
  const dump = async () => parseDump(await serial.command('D', 60000));
  const info = async () => parseInfo(await serial.command('I'));
  const scene = async (number, { timeout = 60000 } = {}) => {
    await serial.command(`S ${number}`);
    for (const start = Date.now(); Date.now() - start < timeout;) { await sleep(300); const now = await peek(); if (now.scene === number && now.ready) return now; }
    throw new Error(`Scene ${number} did not become ready within ${timeout} ms.`);
  };
  const input = events => vm.qmp('input-send-event', { events });
  const keyEvent = (key, down) => input([{ type: 'key', data: { down, key: { type: 'qcode', data: key } } }]);
  /** Press and release keys as one chord, in order: ['alt', 'f'] holds Alt, taps F, releases Alt. */
  const chord = async (keys, hold = 80) => { const list = [].concat(keys); for (const key of list) { await keyEvent(key, true); await sleep(40); } await sleep(hold); for (const key of list.reverse()) { await keyEvent(key, false); await sleep(40); } };
  const pointer = async () => (await peek()).cursor;
  /**
   * Move the emulated mouse until Windows reports the pointer at x, y. The mouse is a relative device and Windows 95
   * doubles any movement of more than 2 counts on an axis (its default acceleration: SPI_GETMOUSE 2,0,1 on this
   * system), so each move is chosen with that in mind, one axis at a time, and the loop closes on the pointer
   * position the guest itself reports. The result says how many moves it took.
   */
  const moveTo = async (x, y, { tries = 60, first = null } = {}) => {   // first: 'y' finishes the vertical move before any horizontal one (or 'x')
    const step = v => Math.abs(v) <= 2 ? v : Math.abs(v) < 6 ? 2 * Math.sign(v) : Math.sign(v) * Math.min(Math.trunc(Math.abs(v) / 2), 40);
    for (let attempt = 0; attempt < tries; attempt++) {
      const at = await pointer(), dx = x - at.x, dy = y - at.y;
      if (!dx && !dy) return { x, y, moves: attempt };
      if (dx && !(first === 'y' && dy)) { await input([{ type: 'rel', data: { axis: 'x', value: step(dx) } }]); await sleep(40); }
      if (dy && !(first === 'x' && dx)) { await input([{ type: 'rel', data: { axis: 'y', value: step(dy) } }]); await sleep(40); }
      await sleep(40);
    }
    const at = await pointer();
    throw new Error(`The pointer did not reach ${x},${y}; Windows reports it at ${at.x},${at.y}.`);
  };
  const button = (name, down) => input([{ type: 'btn', data: { down, button: name } }]);
  const click = async (name = 'left', hold = 80) => { await button(name, true); await sleep(hold); await button(name, false); await sleep(60); };
  return { vm, serial, command: serial.command, state, peek, dump, info, scene, keyEvent, chord, moveTo, button, click, pointer, screendump: vm.screendump, stableScreendump: vm.stableScreendump };
}

/** Attach to a guest another process started with startGuest (its control socket and serial socket). */
export async function attachGuest(work = WORK) {
  const s = sockets(work), vm = await connectQmp(s.control, work), serial = await connectSerial(s.serial);
  return { ...guestControls(vm, serial), close: () => { vm.close(); serial.close(); } };
}
