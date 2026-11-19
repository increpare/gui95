// Runs QEMU headless and drives it through QMP: screen dumps of the guest framebuffer, key presses, shutdown.
// Used inside the container (see run.sh); nothing here knows about Windows.
import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { decodePpm, sameImage } from './png.mjs';

const run = promisify(execFile);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The emulated PC for Windows 95.
 *   machine  "pc" is a 1996 PCI board (Intel 440FX); "isapc" is an ISA-only PC.
 *   vga      "cirrus" is a Cirrus Logic GD5446 on PCI (GD5430-class on isapc); "std" is plain VGA with VESA BIOS extensions.
 *   icount   "off" (default) runs the guest CPU as fast as the emulator goes. A number N fixes it at one instruction per
 *            2^N nanoseconds (4 = 62.5 million a second, about a fast 486), which is the licence-free answer if Windows 95
 *            fails on a too-fast CPU. BUT in the FreeDOS self-test, keys sent through QMP did not reach the guest with
 *            -icount on QEMU 10.0, and the capture depends on keys: treat it as a last resort and test it.
 */
export function pcArguments({ machine = 'pc', cpu = 'pentium', memory = 32, vga = 'cirrus', icount = 'off', disks = [], floppy, cdrom, extraDisk, boot = 'c' }) {
  const args = ['-M', machine, '-accel', 'tcg,thread=single', '-cpu', cpu, '-m', String(memory), '-vga', vga, '-rtc', 'base=localtime', '-nic', 'none', '-boot', boot];
  if (icount !== 'off') args.push('-icount', icount.includes('=') ? icount : `shift=${icount}`);
  disks.forEach((disk, index) => args.push('-drive', `if=ide,index=${index},media=disk,file=${disk.file},format=${disk.format}${disk.readonly ? ',readonly=on' : ''}`));
  if (cdrom) args.push('-drive', `if=ide,index=2,media=cdrom,file=${cdrom},format=raw,readonly=on`);
  if (extraDisk) args.push('-drive', `if=ide,index=3,media=disk,file=${extraDisk.file},format=${extraDisk.format}`);
  if (floppy) args.push('-drive', `if=floppy,index=0,file=${floppy},format=raw`);
  return args;
}

/** Start QEMU with a QMP socket in `workDir`. Extra display arguments (for example VNC) go in `display`. */
export async function startQemu({ binary = 'qemu-system-i386', args, workDir, display = ['-display', 'none'], controlSocket, log = () => {} }) {
  await mkdir(workDir, { recursive: true });
  const socketPath = path.join(workDir, 'qmp.sock');
  await rm(socketPath, { force: true });
  const full = [...args, ...display, '-qmp', `unix:${socketPath},server=on,wait=off`, ...(controlSocket ? ['-qmp', `unix:${controlSocket},server=on,wait=off`] : [])];
  log(`${binary} ${full.join(' ')}`);
  const child = spawn(binary, full, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', exited = false, exitCode = null;
  child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
  const exit = new Promise(resolve => child.on('exit', code => { exited = true; exitCode = code; resolve(code); }));
  child.on('error', error => { output += error.message; exited = true; });

  let control;
  try { control = await connectQmp(socketPath, workDir, () => exited ? `QEMU exited at once (code ${exitCode}): ${output.trim()}` : null); } catch (error) { child.kill(); throw error; }
  const { qmp } = control;
  const quit = async () => { if (!exited) { try { await qmp('quit'); } catch { child.kill(); } } await exit; control.close(); };
  const waitExit = ms => Promise.race([exit.then(() => true), sleep(ms).then(() => false)]);
  return { ...control, quit, waitExit, get exited() { return exited; }, get output() { return output; } };
}

/**
 * Connect to a QMP socket of a running QEMU and return the controls: qmp, screendump, stableScreendump, sendKey,
 * typeText, close. QMP serves one client at a time on a socket; session.mjs opens a second socket for this.
 */
export async function connectQmp(socketPath, workDir, dead = () => null) {
  await mkdir(workDir, { recursive: true });
  let exited = false;
  let socket;
  for (let attempt = 0; attempt < 100 && !socket; attempt++) {
    if (dead()) throw new Error(dead());
    socket = await new Promise(resolve => { const s = net.createConnection(socketPath); s.once('connect', () => resolve(s)); s.once('error', () => resolve(null)); });
    if (!socket) await sleep(100);
  }
  if (!socket) throw new Error(`No QMP socket at ${socketPath}.`);

  const waiting = []; const events = []; let buffer = '';
  socket.on('data', data => {
    buffer += data;
    for (let end; (end = buffer.indexOf('\n')) >= 0;) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.event) events.push(message);
      else if ('return' in message || message.error) waiting.shift()?.(message);
    }
  });
  socket.on('error', () => {});
  socket.on('close', () => { exited = true; for (const resolve of waiting.splice(0)) resolve({ error: { desc: 'QEMU closed the QMP connection' } }); });
  const qmp = (execute, argumentsObject) => new Promise((resolve, reject) => {
    if (exited) return reject(new Error('QEMU has exited.'));
    waiting.push(message => message.error ? reject(new Error(`QMP ${execute}: ${message.error.desc}`)) : resolve(message.return));
    socket.write(JSON.stringify(argumentsObject ? { execute, arguments: argumentsObject } : { execute }) + '\n');
  });
  await qmp('qmp_capabilities');

  let dumps = 0;
  /** The guest framebuffer as { width, height, data }: exactly the pixels the emulated adapter is showing. */
  const screendump = async () => {
    const file = path.join(workDir, `dump-${process.pid}-${dumps++}.ppm`);
    await qmp('screendump', { filename: file });
    const image = decodePpm(await readFile(file));
    await rm(file, { force: true });
    return image;
  };
  /** Take dumps `interval` ms apart until two in a row are identical, and return that image. */
  const stableScreendump = async ({ interval = 1000, timeout = 60000 } = {}) => {
    let previous = await screendump();
    for (const start = Date.now(); Date.now() - start < timeout;) {
      await sleep(interval);
      const next = await screendump();
      if (sameImage(previous, next)) return next;
      previous = next;
    }
    throw new Error(`The screen was still changing after ${timeout} ms.`);
  };
  /** Press one key, or a chord such as ['shift', 'a']. Names are QEMU key codes ("esc", "ret", "f12", "a", "1"). */
  const sendKey = async (keys, holdTime = +(process.env.REFGRID_KEY_HOLD_MS ?? 100)) => { await qmp('send-key', { keys: [].concat(keys).map(data => ({ type: 'qcode', data })), 'hold-time': holdTime }); await sleep(holdTime + 150); };
  const typeText = async text => { for (const ch of text) await sendKey(keyFor(ch)); };
  return { qmp, screendump, stableScreendump, sendKey, typeText, events, close: () => socket.destroy() };
}

const SHIFTED = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': 'minus', '+': 'equal', ':': 'semicolon', '>': 'dot', '<': 'comma', '?': 'slash', '|': 'backslash', '"': 'apostrophe' };
const PLAIN = { ' ': 'spc', '\n': 'ret', '-': 'minus', '=': 'equal', ';': 'semicolon', '.': 'dot', ',': 'comma', '/': 'slash', '\\': 'backslash', "'": 'apostrophe' };
/** The QEMU key chord that types a character on a US keyboard. */
export function keyFor(ch) {
  if (/[a-z0-9]/.test(ch)) return [ch];
  if (/[A-Z]/.test(ch)) return ['shift', ch.toLowerCase()];
  if (PLAIN[ch]) return [PLAIN[ch]];
  if (SHIFTED[ch]) return ['shift', SHIFTED[ch]];
  throw new Error(`No key for character ${JSON.stringify(ch)}.`);
}

/* ---- the FAT data disk ---------------------------------------------------------------------------------- */

// 16 heads and 63 sectors with at most 1023 cylinders (504 MB): one primary FAT16 partition that DOS and Windows 95
// read with no translation questions. The default is 32 cylinders, 15.75 MB.
const HEADS = 16, SECTORS = 63, CYLINDER_BYTES = HEADS * SECTORS * 512;

async function mtools(image, args, workDir) {
  const rc = path.join(workDir, 'mtoolsrc');
  await writeFile(rc, `drive x: file="${image}" partition=1\nmtools_skip_check=1\n`);
  const [command, ...rest] = args;
  return run(command, rest, { env: { ...process.env, MTOOLSRC: rc }, maxBuffer: 16 << 20 });
}

/**
 * Build a partitioned FAT16 hard disk image. `files` maps a name in the root directory to bytes or a host file path;
 * `folders` lists host folders copied whole (with their own name) into the root. `megabytes` is a minimum size.
 */
export async function buildDataDisk(image, files, workDir, { megabytes = 15, folders = [] } = {}) {
  await mkdir(workDir, { recursive: true });
  await mkdir(path.dirname(image), { recursive: true });
  const cylinders = Math.max(32, Math.ceil(megabytes * 1048576 / CYLINDER_BYTES));
  if (cylinders > 1023) throw new Error(`A ${megabytes} MB FAT disk needs more than 1023 cylinders; keep it under 504 MB.`);
  const geometry = ['-t', String(cylinders), '-h', String(HEADS), '-s', String(SECTORS)];
  await rm(image, { force: true });
  await run('truncate', ['-s', String(cylinders * CYLINDER_BYTES), image]);
  await mtools(image, ['mpartition', '-I', ...geometry, 'x:'], workDir);
  await mtools(image, ['mpartition', '-c', '-a', ...geometry, 'x:'], workDir);
  await mtools(image, ['mformat', '-v', 'REFGRID', 'x:'], workDir);
  for (const [name, source] of Object.entries(files)) {
    let from = source;
    if (Buffer.isBuffer(source) || typeof source !== 'string') { from = path.join(workDir, `put-${name}`); await writeFile(from, source); }
    await mtools(image, ['mcopy', '-o', from, `x:/${name}`], workDir);
  }
  for (const folder of folders) await mtools(image, ['mcopy', '-s', '-o', folder, 'x:/'], workDir);
}

/** Read one file from the root of the data disk; null if it is not there. */
export async function readFromDataDisk(image, name, workDir) {
  const to = path.join(workDir, `got-${name}`);
  await rm(to, { force: true });
  try { await mtools(image, ['mcopy', '-n', `x:/${name}`, to], workDir); } catch { return null; }
  return readFile(to);
}

export async function listDataDisk(image, workDir) { return (await mtools(image, ['mdir', '-b', '-/', 'x:'], workDir)).stdout.split(/\r?\n/).filter(Boolean); }

/** A throwaway copy-on-write layer over `base`, so nothing a run does reaches the prepared disk image. */
export async function createOverlay(base, overlay) {
  const info = JSON.parse((await run('qemu-img', ['info', '--output=json', base])).stdout);
  await rm(overlay, { force: true });
  await run('qemu-img', ['create', '-q', '-f', 'qcow2', '-F', info.format, '-b', path.resolve(base), overlay]);
  return info.format;
}

export const qemuVersion = async (binary = 'qemu-system-i386') => (await run(binary, ['--version'])).stdout.split('\n')[0];
