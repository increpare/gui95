#!/usr/bin/env node
// Boots refscene on the prepared image and keeps it running, so scripts can attach (scene-exec) one after another.
//   node scene-session.mjs --disk /images/win95-osr2.qcow2 [--bits 24] [--icount 4]
// Stop it with ./run.sh scene-stop. The guest runs on a throwaway overlay; the prepared image is never written.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGuest } from './lib/guest.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));
const o = { bits: '24', icount: '4' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
if (!o.disk) { process.stderr.write('--disk FILE is required.\n'); process.exit(2); }
const { vm, serial } = await startGuest({ disk: o.disk, exe: path.join(here, 'out', 'REFSCENE.EXE'), bits: +o.bits, icount: o.icount, log: m => process.stdout.write(m + '\n') });
serial.close();   // the socket accepts the next client; scripts attach through lib/guest.mjs attachGuest()
process.stdout.write('READY\n');
const stop = async () => { await vm.quit(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
while (!await vm.waitExit(1000)) { /* until QEMU exits */ }
