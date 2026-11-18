#!/usr/bin/env node
// Checks that an executable is a 32-bit i386 Windows GUI program Windows 95 can load, and lists what it imports.
// Usage: node check-pe.mjs FILE.EXE [--reference PATH/TO/win32.txt]
import { readFile } from 'node:fs/promises';
import { checkAgainstReference, checkForWindows95, readPe } from './lib/pe.mjs';

const args = process.argv.slice(2), refIndex = args.indexOf('--reference');
const reference = refIndex < 0 ? null : args.splice(refIndex, 2)[1];
if (args.length !== 1) { process.stderr.write('Usage: node check-pe.mjs FILE.EXE [--reference PATH/TO/win32.txt]\n'); process.exit(2); }
const info = readPe(await readFile(args[0]));
process.stdout.write(`${args[0]}: machine 0x${info.machine.toString(16)}, PE magic 0x${info.magic.toString(16)}, subsystem ${info.subsystem} version ${info.subsystemVersion}, OS version ${info.osVersion}\n`);
for (const { dll, functions } of info.imports) process.stdout.write(`  ${dll} (${functions.length}): ${functions.join(' ')}\n`);
if (reference) {
  const { documented, mentioned, missing } = checkAgainstReference(info, await readFile(reference, 'latin1'));
  process.stdout.write(`Win32 reference: ${documented.length} imports have a topic of their own; ${mentioned.length} are named only in other topics${mentioned.length ? ' (' + mentioned.join(' ') + ')' : ''}; ${missing.length} appear nowhere${missing.length ? ' (' + missing.join(' ') + ')' : ''}\n`);
}
const problems = checkForWindows95(info);
if (problems.length) { process.stderr.write(problems.map(p => `PROBLEM: ${p}\n`).join('')); process.exit(1); }
process.stdout.write('No loading problem for Windows 95 found (i386, PE32, GUI subsystem 4.0 or lower, Windows 95 DLLs only).\n');
