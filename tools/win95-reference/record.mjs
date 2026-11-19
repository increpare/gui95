#!/usr/bin/env node
// Phase 2 of the example audit: records what real Windows 95 does, step by step, for each script in scripts/.
// After every step (a key, a mouse move or button, a wait) it reads refscene's state and takes a screen dump.
// Run it through ./run.sh record.
//
//   --disk FILE     the prepared disk image (required; never written)      --attach   use the guest scene-start runs
//   --only a,b      record only these scripts                               --out DIR  screen dumps (default out/recordings)
// The recorded steps and states are facts about behaviour and are written to recordings/NAME.json, which is
// committed. The screen dumps show Microsoft's artwork and stay in the ignored out/ folder; each step names its dump.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachGuest, guestControls, startGuest } from './lib/guest.mjs';
import { encodePng, pixel } from './lib/png.mjs';
import { describeGuest } from './lib/report.mjs';
import { runScript } from './lib/script.mjs';
import { qemuVersion, sleep } from './lib/qemu.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));
const o = { out: path.join(here, 'out', 'recordings'), icount: '4' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--attach') o.attach = true; else { o[argv[i].replace(/^--/, '')] = argv[i + 1]; i++; } }
const log = message => process.stdout.write(message + '\n');
const names = (await readdir(path.join(here, 'scripts'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const wanted = o.only ? o.only.split(',') : names;
for (const name of wanted) if (!names.includes(name)) { process.stderr.write(`No script named ${name}.\n`); process.exit(2); }

let guest, vm;
if (o.attach) guest = await attachGuest();
else { if (!o.disk) { process.stderr.write('--disk FILE is required (or --attach).\n'); process.exit(2); } const started = await startGuest({ disk: o.disk, exe: path.join(here, 'out', 'REFSCENE.EXE'), icount: o.icount, log }); vm = started.vm; guest = guestControls(started.vm, started.serial); }

/** Where the pointer's arrow is in a screen dump of the plain scene window: the top-left black pixel of its outline. */
function arrowTip(image, near) {
  for (let y = Math.max(0, near.y - 20); y < Math.min(image.height, near.y + 20); y++) for (let x = Math.max(0, near.x - 20); x < Math.min(image.width, near.x + 20); x++) { const [r, g, b] = pixel(image, x, y); if (!r && !g && !b) return { x, y }; }
  return null;
}

let failures = 0;
try {
  const info = await guest.info(), system = describeGuest({ system: Object.fromEntries(Object.entries(info.system).map(([k, v]) => [k, /\.(dll|exe)$/.test(k) ? `${v} (system)` : v])) });
  const emulator = await qemuVersion();
  log(`Guest: ${system.name}; comctl32 ${info.system['comctl32.dll']}, comdlg32 ${info.system['comdlg32.dll']}, user32 ${info.system['user32.dll']}.`);
  // Calibration 1: the guest's clock against the host's, over a stretch with no commands in between. Event times in
  // the recordings are the guest's own clock; this says how that clock ran against real time during the run.
  await guest.scene(6); await guest.command('V 1');
  const a = await guest.state(), hostStart = Date.now(); await sleep(15000); const b = await guest.state(), hostMs = Date.now() - hostStart;
  const clock = { guestMs: b.time - a.time, hostMs, ratio: +((b.time - a.time) / hostMs).toFixed(4) };
  // Calibration 2: the pointer. Ask for a point on the empty part of the scene window, then find the arrow in the screen dump.
  const asked = { x: 500, y: 400 }, moved = await guest.moveTo(asked.x, asked.y); await sleep(300);
  const reported = await guest.pointer(), tip = arrowTip(await guest.screendump(), asked);
  const pointer = { asked, reportedByWindows: reported, arrowTipInScreenDump: tip, moves: moved.moves, agrees: !!tip && tip.x === asked.x && tip.y === asked.y && reported.x === asked.x && reported.y === asked.y };
  log(`Clock: guest ${clock.guestMs} ms in host ${clock.hostMs} ms (ratio ${clock.ratio}). Pointer: asked ${asked.x},${asked.y}; Windows reports ${reported.x},${reported.y}; arrow tip in the dump at ${tip ? `${tip.x},${tip.y}` : 'not found'}.`);
  const run = { guest: { name: system.name, files: system.files, comdlg32: info.system['comdlg32.dll'], input: info.input }, emulator, clock, pointer };
  await mkdir(path.join(here, 'recordings'), { recursive: true });
  for (const name of wanted) {
    const script = JSON.parse(await readFile(path.join(here, 'scripts', `${name}.json`), 'utf8'));
    const folder = path.join(o.out, name); await mkdir(folder, { recursive: true });
    log(`${name}: ${script.title}`);
    const steps = []; let error = null;
    try { await runScript(guest, script, { out: steps, log, onStep: async (index, step, image) => { const file = `${String(index).padStart(3, '0')}.png`; await writeFile(path.join(folder, file), encodePng(image, { Source: `${system.name}; refscene recording "${name}" step ${index}; guest framebuffer dumped by ${emulator}` })); return `${name}/${file}`; } }); }
    catch (failure) { error = failure.message; failures++; log(`  FAILED at step ${steps.length}: ${error}`); try { await guest.button('left', false); await guest.keyEvent('shift', false); await guest.keyEvent('ctrl', false); await guest.keyEvent('alt', false); } catch { /* ignore */ } }
    const { steps: scriptSteps, ...head } = script;
    const body = steps.map(step => '  ' + JSON.stringify(step)).join(',\n');
    await writeFile(path.join(here, 'recordings', `${name}.json`), JSON.stringify({ ...head, source: `Recorded on ${system.name} by tools/win95-reference/record.mjs from scripts/${name}.json. Screen dumps: out/recordings/ (not in git).`, run, ...(error ? { error, completedSteps: steps.length, scriptSteps: scriptSteps.length } : {}) }, null, 1).slice(0, -2) + ',\n "steps": [\n' + body + '\n ]\n}\n');
  }
} finally {
  if (vm) { try { await guest.command('Z', 5000); } catch { /* shutting down */ } await vm.waitExit(60000); await vm.quit(); }
  else guest.close?.();
}
process.exitCode = failures ? 1 : 0;
