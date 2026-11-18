#!/usr/bin/env node
// Drives the guest that session.mjs is running, from a second process: screen dumps and keys.
//   node vmctl.mjs dump FILE.png          save the guest screen (a diagnostic image; its Source note says so)
//   node vmctl.mjs key esc ret alt+f4     press keys or chords in order (QEMU key names)
//   node vmctl.mjs type "dir c:\n"        type text on a US keyboard
//   node vmctl.mjs wait SECONDS FILE.png  wait until the screen has stopped changing (or the time is up), then dump
//   node vmctl.mjs qmp COMMAND [JSON]     any QMP command, for example: qmp system_reset
// Run it in the session's container: ./run.sh vmctl dump out/install/01.png
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectQmp, sleep } from './lib/qemu.mjs';
import { encodePng } from './lib/png.mjs';

const [command, ...rest] = process.argv.slice(2);
const vm = await connectQmp('/tmp/refgrid-session/ctl.sock', '/tmp/refgrid-session');
const save = async (file, image) => { await mkdir(path.dirname(path.resolve(file)), { recursive: true }); await writeFile(file, encodePng(image, { Source: 'Guest screen during a manual session. Diagnostic only; not a reference capture.' })); process.stdout.write(`${file}: ${image.width} x ${image.height}\n`); };
try {
  if (command === 'dump') await save(rest[0], await vm.screendump());
  else if (command === 'key') for (const chord of rest) await vm.sendKey(chord.split('+'));
  else if (command === 'type') await vm.typeText(rest.join(' ').replace(/\\n/g, '\n'));
  else if (command === 'wait') { let image; try { image = await vm.stableScreendump({ interval: 2000, timeout: +rest[0] * 1000 }); } catch { image = await vm.screendump(); process.stdout.write('still changing\n'); } await save(rest[1], image); }
  else if (command === 'qmp') process.stdout.write(JSON.stringify(await vm.qmp(rest[0], rest[1] ? JSON.parse(rest[1]) : undefined)) + '\n');
  else { process.stderr.write('Commands: dump FILE | key KEYS... | type TEXT | wait SECONDS FILE | qmp COMMAND [JSON]\n'); process.exitCode = 2; }
  await sleep(50);
} finally { vm.close(); }
