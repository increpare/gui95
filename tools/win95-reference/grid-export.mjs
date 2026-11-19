#!/usr/bin/env node
// Writes the refgrid cell table as JSON for the comparison step.
// Usage: node grid-export.mjs [OUTPUT.json]      (default: out/grid.json; "-" writes to standard output)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGrid, overlaps } from './lib/grid.mjs';

const grid = await loadGrid();
const clash = overlaps(grid.cells);
if (clash.length) { process.stderr.write(`Overlapping cells: ${clash.map(pair => pair.join(' and ')).join('; ')}\n`); process.exit(1); }
const target = process.argv[2] ?? fileURLToPath(new URL('./out/grid.json', import.meta.url));
const json = JSON.stringify(grid, null, 1) + '\n';
if (target === '-') process.stdout.write(json);
else { await mkdir(path.dirname(path.resolve(target)), { recursive: true }); await writeFile(target, json); process.stdout.write(`${grid.cells.length} cells on ${grid.sheets.length} sheets written to ${target}\n`); }
