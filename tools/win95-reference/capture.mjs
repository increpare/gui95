#!/usr/bin/env node
// Boots the prepared Windows 95 disk image headless, waits for refgrid to draw each sheet, takes QEMU's own screen
// dump of the guest framebuffer, shuts the guest down and collects refgrid's report. Run it through ./run.sh capture.
//
//   --disk FILE        the prepared disk image (required). It is never written: the guest runs on a throwaway overlay.
//   --bits N           colour depth refgrid asks Windows for: 8, 16 or 24; 4 is the 16-colour VGA driver. 0 leaves it alone. Default 16.
//   --width W --height H   screen size to ask for with it (default 800 by 600; the grid itself is 640 by 480).
//   --sheets 1,2,3     which sheets to capture (default all).
//   --out DIR          output folder (default out/capture-<bits>bit).
//   --keys on|off      off sends no keys: one boot per sheet, power off after each dump (default on: one boot, sheets changed by key).
//   --boot-timeout S   seconds to wait for the first sheet, including a restart to change the mode (default 900).
//   --machine pc|isapc  --vga cirrus|std  --cpu pentium|486  --memory MB  --icount N|off     the emulated PC.
//
// Video adapter: QEMU's Cirrus Logic GD5446 (-vga cirrus). See docs/win95-reference.md for what Windows 95 ships for it.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDisk, createOverlay, pcArguments, qemuVersion, readFromDataDisk, sleep, startQemu } from './lib/qemu.mjs';
import { encodePng, sameImage } from './lib/png.mjs';
import { readMarker } from './lib/marker.mjs';
import { describeGuest, parseReport } from './lib/report.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));
const log = message => process.stdout.write(message + '\n');

function options(argv) {
  const o = { bits: '16', width: '800', height: '600', sheets: '1,2,3', 'boot-timeout': '900', machine: 'pc', vga: 'cirrus', cpu: 'pentium', memory: '32', icount: 'off', keys: 'on' };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`Bad option ${argv[i]}. See the comment at the top of capture.mjs.`);
    o[name] = argv[i + 1];
  }
  if (!o.disk) throw new Error('--disk FILE is required: the Windows 95 disk image you prepared (see docs/win95-reference.md).');
  return o;
}

/** Poll the screen until refgrid's marker shows `sheet` and the picture has stopped changing. */
export async function waitForSheet(vm, sheet, timeoutMs, { interval = 3000, settle = 1000 } = {}) {
  let last = null;
  for (const start = Date.now(); Date.now() - start < timeoutMs;) {
    if (vm.exited) throw new Error(`QEMU exited while waiting for sheet ${sheet}: ${vm.output.trim()}`);
    const first = await vm.screendump(), marker = readMarker(first);
    last = first;
    if (marker?.sheet === sheet) {
      await sleep(settle);
      const second = await vm.screendump();
      if (sameImage(first, second)) return { image: second, failed: marker.failed };
      continue;
    }
    await sleep(interval);
  }
  const error = new Error(`Sheet ${sheet} did not appear within ${Math.round(timeoutMs / 1000)} s.`); error.lastScreen = last; throw error;
}

async function main() {
  const o = options(process.argv.slice(2));
  const exe = path.join(here, 'out', 'REFGRID.EXE');
  try { await access(exe); } catch { throw new Error('out/REFGRID.EXE is missing. Run ./run.sh build first.'); }
  await access(o.disk);
  const bits = +o.bits, sheets = o.sheets.split(',').map(Number), outDir = path.resolve(o.out ?? path.join(here, 'out', `capture-${bits || 'asis'}bit`)), work = '/tmp/refgrid-capture';
  await mkdir(outDir, { recursive: true });

  const data = path.join(work, 'data.img'), overlay = path.join(work, 'overlay.qcow2');
  const args = pcArguments({ machine: o.machine, cpu: o.cpu, memory: +o.memory, vga: o.vga, icount: o.icount, disks: [{ file: overlay, format: 'qcow2' }, { file: data, format: 'raw' }] });
  const version = await qemuVersion();
  log(version);
  const captured = [], reports = [];
  /** One boot of the guest on a fresh overlay and data disk, capturing `list` in order. */
  const boot = async (list, useKeys) => {
    const ini = `[refgrid]\r\nbits=${bits}\r\nwidth=${bits ? o.width : 0}\r\nheight=${bits ? o.height : 0}\r\nsheet=${list[0]}\r\n`;
    await buildDataDisk(data, { 'REFGRID.EXE': exe, 'REFGRID.INI': Buffer.from(ini) }, work);
    await createOverlay(o.disk, overlay);
    const vm = await startQemu({ args, workDir: work, log });
    try {
      let timeout = +o['boot-timeout'] * 1000;
      for (const sheet of list) {
        if (sheet !== list[0]) { await vm.sendKey('esc'); await vm.sendKey(String(sheet)); }
        log(`Waiting for sheet ${sheet}...`);
        const { image, failed } = await waitForSheet(vm, sheet, timeout);
        captured.push({ sheet, image, failed });
        log(`  sheet ${sheet}: ${image.width} x ${image.height}${failed ? ' (refgrid reports a failure; see the report)' : ''}`);
        timeout = 120000;
      }
      if (useKeys) {
        // Esc closes the pop-up menu if it is open, then Q asks Windows to shut down, which flushes the report to disk.
        await vm.sendKey('esc'); await vm.sendKey('q');
        if (!await vm.waitExit(60000)) { try { await vm.stableScreendump({ interval: 3000, timeout: 120000 }); } catch { /* quit regardless */ } }
      } else await sleep(8000);   // refgrid flushed its report before it drew the marker; give the disk cache a moment, then power off
    } catch (error) {
      if (error.lastScreen) { const file = path.join(outDir, 'last-screen-before-timeout.png'); await writeFile(file, encodePng(error.lastScreen, { Source: 'Guest screen when the capture timed out. Diagnostic only.' })); error.message += ` The last screen is in ${file}.`; }
      throw error;
    } finally { await vm.quit(); }
    const bytes = await readFromDataDisk(data, 'REFGRID.TXT', work);
    if (bytes) reports.push(bytes.toString('latin1'));
  };
  // With --keys off no key is ever sent: the guest is booted once per sheet (REFGRID.INI names the sheet) and powered
  // off after the dump. Slower, but it does not depend on the emulated keyboard reaching refgrid.
  if (o.keys === 'off') for (const sheet of sheets) await boot([sheet], false); else await boot(sheets, true);

  if (!reports.length) throw new Error('refgrid wrote no REFGRID.TXT to the data disk; the screen dumps were not saved because their source cannot be identified.');
  // Several boots give several reports: keep the first whole and add the per-sheet sections of the others.
  const reportText = reports[0] + reports.slice(1).map(text => text.slice(Math.max(0, text.indexOf('\r\n[sheet')))).join(''), reportBytes = Buffer.from(reportText, 'latin1');
  const guest = describeGuest(parseReport(reportText));
  const prefix = `${guest.label}-${guest.bits}bit`, files = [];
  for (const { sheet, image, failed } of captured) {
    const file = `${prefix}-sheet${sheet}.png`;
    await writeFile(path.join(outDir, file), encodePng(image, { Source: `${guest.name}, comctl32 ${guest.commonControls.version ?? 'unknown'}, ${guest.bits} bits per pixel, refgrid sheet ${sheet}; guest framebuffer dumped by ${version}` }));
    files.push({ sheet, file, width: image.width, height: image.height, refgridReportedFailure: failed });
  }
  await writeFile(path.join(outDir, `${prefix}-report.txt`), reportBytes);
  const warnings = [];
  if (!guest.isWindows95) warnings.push(`The guest identifies itself as ${guest.name}. This capture is not a Windows 95 reference.`);
  if (guest.commonControls.ie4) warnings.push(`comctl32.dll is version ${guest.commonControls.version}: Internet Explorer 4 or later has replaced the common controls. This is not a baseline capture.`);
  if (bits && guest.bits !== bits) warnings.push(`Asked for ${bits} bits per pixel but the guest ran at ${guest.bits}: ${guest.displayMode}`);
  if (files.some(f => f.refgridReportedFailure)) warnings.push('refgrid drew its marker in the failure colour on at least one sheet; read the report.');
  await writeFile(path.join(outDir, `${prefix}-capture.json`), JSON.stringify({ guest, requested: { bits, width: +o.width, height: +o.height }, emulator: version, adapter: `${o.vga} on machine ${o.machine}`, arguments: args, captured: new Date().toISOString(), report: `${prefix}-report.txt`, sheets: files, warnings }, null, 1) + '\n');
  log(`Guest: ${guest.name}; common controls ${guest.commonControls.version ?? 'version unknown'} (${guest.commonControls.era}); ${guest.screen}, ${guest.bits} bits per pixel. Files in ${outDir}: ${files.map(f => f.file).join(', ')}, ${prefix}-report.txt, ${prefix}-capture.json`);
  for (const warning of warnings) log(`WARNING: ${warning}`);
  return warnings.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = await main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 2; }
}
