#!/usr/bin/env node
// Proves the capture mechanics with a freely licensed guest (FreeDOS 1.3), with no Windows involved:
//   QEMU starts headless in the container; the FAT data disk built from a host folder is readable by DOS;
//   the QMP screen dump returns the guest framebuffer; keys sent through QMP reach the guest;
//   a file the guest writes to the data disk comes back to the host after shutdown.
// The images it writes are named mechanics-freedos-*.png. They show FreeDOS. They are NOT a reference for anything.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildDataDisk, listDataDisk, pcArguments, qemuVersion, readFromDataDisk, sleep, startQemu } from './lib/qemu.mjs';
import { encodePng, sameImage } from './lib/png.mjs';

const run = promisify(execFile);
const here = fileURLToPath(new URL('./', import.meta.url));
const out = path.join(here, 'out', 'selftest'), work = '/tmp/refgrid-selftest';
const FREEDOS = { url: 'https://www.ibiblio.org/pub/micro/pc-stuff/freedos/files/distributions/1.3/official/FD13-FloppyEdition.zip', sha256: '75a4e11a7fce6f124e20927b3022b4b715a2a3f7324c5f5bfea42d90d80eb072', member: '144m/x86BOOT.img' };
const log = message => process.stdout.write(message + '\n');

async function freedosFloppy() {
  const cache = path.join(here, 'out', 'cache'), zip = path.join(cache, 'FD13-FloppyEdition.zip'), image = path.join(cache, 'freedos13-boot.img');
  await mkdir(cache, { recursive: true });
  try { await access(image); return image; } catch { /* fetch it */ }
  log(`Fetching ${FREEDOS.url}`);
  await run('curl', ['-fsSL', '-o', zip, FREEDOS.url]);
  const digest = createHash('sha256').update(await readFile(zip)).digest('hex');
  if (digest !== FREEDOS.sha256) throw new Error(`FreeDOS archive has SHA-256 ${digest}, expected ${FREEDOS.sha256}.`);
  await writeFile(image, (await run('unzip', ['-p', zip, FREEDOS.member], { encoding: 'buffer', maxBuffer: 8 << 20 })).stdout);
  return image;
}

const save = async (name, image, note) => { const file = path.join(out, name); await writeFile(file, encodePng(image, { Source: `FreeDOS 1.3 in QEMU, capture mechanics self-test. ${note} Not Windows; not a reference.` })); log(`  wrote ${file} (${image.width} x ${image.height})`); };

await mkdir(out, { recursive: true });
const floppy = path.join(work, 'boot.img');
await mkdir(work, { recursive: true });
await writeFile(floppy, await readFile(await freedosFloppy()));   // a working copy: DOS may write to its boot floppy
const disk = path.join(work, 'data.img'), token = `refgrid self-test ${Date.now()}`;
await buildDataDisk(disk, { 'HELLO.TXT': Buffer.from(token + '\r\n') }, work);
log(`Data disk holds: ${(await listDataDisk(disk, work)).join(' ')}`);
log(await qemuVersion());

// Decline the installer (N, Enter) to reach a DOS prompt, then have DOS copy the host's file on the data disk (C:).
const steps = (process.env.SELFTEST_STEPS ?? 'n;key:ret;wait:6000;copy c:\\hello.txt c:\\back.txt\\n;wait:4000;dir c:\\n;wait:3000').split(';').filter(Boolean);
const vm = await startQemu({ args: pcArguments({ disks: [{ file: disk, format: 'raw' }], floppy, boot: 'a', memory: 16, icount: process.env.SELFTEST_ICOUNT ?? 'off' }), workDir: work, log });
try {
  await sleep(+(process.env.SELFTEST_BOOT_MS ?? 30000));   // the boot menu counts down by itself, then the installer greets
  const bootScreen = await vm.screendump();
  await save('mechanics-freedos-1-boot.png', bootScreen, 'After boot.');
  let n = 2;
  for (const step of steps) {
    if (step.startsWith('wait:')) await sleep(+step.slice(5)); else if (step.startsWith('key:')) await vm.sendKey(step.slice(4).split('+')); else await vm.typeText(step.replace(/\\n/g, '\n'));
    await sleep(1500);
    await save(`mechanics-freedos-${n++}-step.png`, await vm.screendump(), `After "${step}".`);
  }
  log(`Screen changed after the keys: ${sameImage(bootScreen, await vm.screendump()) ? 'no' : 'yes'}`);
} finally { await vm.quit(); }
const back = await readFromDataDisk(disk, 'BACK.TXT', work);
log(back ? `BACK.TXT from the guest: ${JSON.stringify(back.toString('latin1'))}` : 'No BACK.TXT on the data disk.');
if ((!back || !back.toString('latin1').includes(token))) { log('FAILED: the guest did not write the token back.'); process.exit(1); }
log('Self-test passed: QEMU ran headless, the screen dump returned the guest framebuffer, keys reached the guest, and a file written by the guest came back from the FAT data disk.');
