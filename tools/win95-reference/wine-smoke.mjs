#!/usr/bin/env node
// Smoke test of refgrid's program logic under Wine. Runs inside the Dockerfile.wine container:
//   docker run --rm --platform linux/386 -v "$PWD":/work gui95-win95-reference-wine:1 node wine-smoke.mjs
// It checks that the program starts, shows each sheet with its ready marker, obeys the keys, and writes its report.
// WINE IS NOT WINDOWS 95. The images are named wine-smoke-* and carry that in their metadata; never use them as a
// reference for how anything looks.
import { spawn, execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { waitForSheet } from './capture.mjs';
import { decodePpm, encodePng } from './lib/png.mjs';
import { describeGuest, parseReport } from './lib/report.mjs';

const run = promisify(execFile), sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const here = fileURLToPath(new URL('./', import.meta.url)), out = path.join(here, 'out', 'wine-smoke'), work = '/tmp/refgrid-wine';
const log = message => process.stdout.write(message + '\n');
await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true }); await mkdir(out, { recursive: true });
await copyFile(path.join(here, 'out', 'REFGRID.EXE'), path.join(work, 'REFGRID.EXE'));
await writeFile(path.join(work, 'REFGRID.INI'), '[refgrid]\r\nbits=0\r\nsheet=1\r\n');

const xvfb = spawn('Xvfb', [':9', '-screen', '0', '800x600x24'], { stdio: 'ignore' });
await sleep(2000);
// A Wine virtual desktop: Wine draws every window into one X window itself, so the screen grab sees owned windows and
// menus, which as separate X windows of another visual come out black.
const wine = spawn('wine', ['explorer', '/desktop=refgrid,800x600', 'REFGRID.EXE'], { cwd: work, stdio: 'ignore' });
let wineExited = false; wine.on('exit', () => { wineExited = true; });
const screen = { get exited() { return false; }, output: '', screendump: async () => decodePpm((await run('sh', ['-c', 'xwd -root -silent -display :9 | xwdtopnm 2>/dev/null | pnmdepth 255 2>/dev/null'], { encoding: 'buffer', maxBuffer: 16 << 20 })).stdout) };
// There is no window manager under Xvfb, so nothing gives the X input focus to Wine: point it at the Wine desktop window first.
const key = name => run('sh', ['-c', `xdotool search --onlyvisible --name 'Wine desktop' | head -1 | xargs -I{} xdotool windowfocus {} ; xdotool key ${name}`]);
const captured = [];
let status = 0;
try {
  let timeout = 600000;   // the first start of Wine creates its prefix, slowly under emulation
  for (const sheet of [1, 2, 3]) {
    if (captured.length) { await key('Escape'); await sleep(500); await key(String(sheet)); }
    log(`Waiting for sheet ${sheet}...`);
    captured.push({ sheet, ...await waitForSheet(screen, sheet, timeout) });
    timeout = 120000;
  }
  await key('Escape'); await sleep(500); await key('x');
  for (let i = 0; i < 40 && !wineExited; i++) await sleep(500);
  log(wineExited ? 'refgrid exited on X.' : 'refgrid did not exit on X.');
  if (!wineExited) status = 1;
} catch (error) {
  log(`FAILED: ${error.message}`); status = 1;
  if (error.lastScreen) await writeFile(path.join(out, 'wine-smoke-last-screen.png'), encodePng(error.lastScreen, { Source: 'Wine smoke test, screen at timeout. Not Windows.' }));
} finally { wine.kill(); xvfb.kill(); }

let reportText = ''; try { reportText = await readFile(path.join(work, 'REFGRID.TXT'), 'latin1'); } catch { log('No REFGRID.TXT was written.'); status = 1; }
const guest = describeGuest(parseReport(reportText));
if (reportText && !guest.wine) { log('The report does not identify Wine; refusing to label the output.'); status = 1; }
const prefix = 'wine-smoke', files = [];
for (const { sheet, image, failed } of captured) {
  const file = `${prefix}-sheet${sheet}.png`;
  await writeFile(path.join(out, file), encodePng(image, { Source: `WINE ${guest.wine ?? ''} smoke test of refgrid, sheet ${sheet}. Not Windows 95; not a reference.` }));
  files.push({ sheet, file, width: image.width, height: image.height, refgridReportedFailure: failed });
  if (failed) { log(`Sheet ${sheet}: refgrid drew the failure marker.`); }
}
if (reportText) await writeFile(path.join(out, `${prefix}-report.txt`), reportText, 'latin1');
await writeFile(path.join(out, `${prefix}-capture.json`), JSON.stringify({ guest, emulator: 'none: Wine under Xvfb, screen read with xwd', report: `${prefix}-report.txt`, sheets: files, warnings: ['This is Wine, not Windows 95.'] }, null, 1) + '\n');
log(`Guest: ${guest.name}. ${files.length} sheets written to ${out}.`);
process.exit(status);
