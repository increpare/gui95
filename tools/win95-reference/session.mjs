#!/usr/bin/env node
// Runs the guest with a display so Windows can be installed and adjusted by hand. Unlike capture.mjs it writes to
// the disk image directly. The data disk with out/REFGRID.EXE is attached as the second hard disk (D: in Windows),
// exactly as during a capture, so drive letters are the same in both.
//
//   --disk FILE          the hard disk image to install to or adjust (required)
//   --floppy FILE        your Windows 95 boot floppy image       --cdrom FILE   your Windows 95 CD image
//   --source DIR         a host folder (for example the WIN95 folder copied from your own CD) put on a third hard disk (E:),
//                        so Setup can run without a CD-ROM driver. It must be inside this folder's images/ directory.
//   --boot a|c|d         boot from floppy, hard disk or CD (default c)
//   --display vnc|cocoa|gtk|sdl   vnc (default, for the container: connect to localhost:5900) or a native QEMU window
//   --machine --vga --cpu --memory --icount   the emulated PC; use the same values for the capture
//
// In the container:  ./run.sh session --disk /images/win95.qcow2 --cdrom "/media/Win95 OSR2.ISO" --boot d
// While it runs, vmctl.mjs (./run.sh vmctl ...) can take screen dumps and send keys through a second QMP socket.
// Natively (needs QEMU and mtools on the PATH):  node session.mjs --display cocoa --disk images/win95.qcow2 ...
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDisk, pcArguments, qemuVersion, startQemu } from './lib/qemu.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));
const o = { boot: 'c', display: 'vnc', machine: 'pc', vga: 'cirrus', cpu: 'pentium', memory: '32', icount: 'off' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) { if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { process.stderr.write(`Bad option ${argv[i]}.\n`); process.exit(2); } o[argv[i].slice(2)] = argv[i + 1]; }
if (!o.disk) { process.stderr.write('--disk FILE is required.\n'); process.exit(2); }
for (const file of [o.disk, o.floppy, o.cdrom]) if (file) await access(file);

const work = '/tmp/refgrid-session', data = path.join(here, 'out', 'session-data.img');
const exe = path.join(here, 'out', 'REFGRID.EXE'), files = {};
files['STARTUP.REG'] = path.join(here, 'refgrid', 'startup.reg');   // regedit /s d:\\startup.reg makes Windows start D:\\REFGRID.EXE
try { await access(exe); files['REFGRID.EXE'] = exe; } catch { process.stdout.write('out/REFGRID.EXE is not built yet; the data disk will be empty.\n'); }
await buildDataDisk(data, files, work);
let extraDisk;
if (o.source) {
  await access(o.source);
  const kib = +execFileSync('du', ['-sk', o.source]).toString().split(/\s/)[0];
  extraDisk = { file: path.join(here, 'out', 'session-source.img'), format: 'raw' };
  process.stdout.write(`Copying ${o.source} to a FAT disk (${Math.ceil(kib / 1024)} MB)...\n`);
  await buildDataDisk(extraDisk.file, {}, work, { megabytes: Math.ceil(kib / 1024 * 1.15) + 8, folders: [o.source] });
}
const info = execFileSync('qemu-img', ['info', '--output=json', o.disk]);
const args = pcArguments({ machine: o.machine, cpu: o.cpu, memory: +o.memory, vga: o.vga, icount: o.icount, boot: o.boot, floppy: o.floppy, cdrom: o.cdrom, extraDisk, disks: [{ file: o.disk, format: JSON.parse(info).format }, { file: data, format: 'raw' }] });
const vnc = o.display === 'vnc';
process.stdout.write((await qemuVersion()) + '\n');
const vm = await startQemu({ args, workDir: work, controlSocket: path.join(work, 'ctl.sock'), display: vnc ? ['-display', 'none', '-vnc', '0.0.0.0:0,password=on'] : ['-display', o.display], log: m => process.stdout.write(m + '\n') });
if (vnc) {
  const password = randomBytes(4).toString('hex');   // VNC passwords are at most 8 characters
  await vm.qmp('set_password', { protocol: 'vnc', password });
  process.stdout.write(`\nDisplay: vnc://localhost:5900   password: ${password}\n(macOS: Finder, Go, Connect to Server. The port is published on this machine only.)\n`);
}
process.stdout.write('The guest is running. Shut Windows down from its Start menu, then press Ctrl+C here to stop the emulator.\n');
const stop = async () => { await vm.quit(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
while (!await vm.waitExit(1000)) { /* until QEMU exits */ }
