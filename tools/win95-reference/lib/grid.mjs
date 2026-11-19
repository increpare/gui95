// Reads refgrid/cells.def, the one table that says which cell is drawn where, and turns it into data.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const CELLS_DEF = fileURLToPath(new URL('../refgrid/cells.def', import.meta.url));
export const GRID_SIZE = Object.freeze({ width: 640, height: 480 });
export const MARKER_AREA = Object.freeze({ x: 0, y: 0, w: 40, h: 8 });

/** Split the arguments of one CELL(...) line at top-level commas, honouring the quoted text argument. */
function splitArguments(body) {
  const parts = []; let current = '', quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' && body[i - 1] !== '\\') quoted = !quoted;
    if (ch === ',' && !quoted) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/** Parse the text of cells.def. Throws on a malformed line, a duplicate id, or a cell outside the grid or on the marker. */
export function parseCells(source) {
  const cells = [], seen = new Set();
  source.split(/\r?\n/).forEach((line, index) => {
    const match = /^CELL\((.*)\)\s*$/.exec(line);
    if (!match) { if (/^\s*CELL\b/.test(line)) throw new Error(`cells.def line ${index + 1}: malformed CELL line.`); return; }
    const parts = splitArguments(match[1]);
    if (parts.length !== 11) throw new Error(`cells.def line ${index + 1}: expected 11 arguments, found ${parts.length}.`);
    const [sheet, id, kind, x, y, w, h, a, b, state, text] = parts;
    for (const [name, value] of Object.entries({ sheet, x, y, w, h })) if (!/^\d+$/.test(value)) throw new Error(`cells.def line ${index + 1}: ${name} must be a plain integer, found "${value}".`);
    if (!/^"(?:[^"\\]|\\.)*"$/.test(text)) throw new Error(`cells.def line ${index + 1}: text must be a quoted string.`);
    const cell = { id, sheet: +sheet, kind: kind.replace(/^K_/, '').toLowerCase(), x: +x, y: +y, w: +w, h: +h, a, b, state: state === '0' ? [] : state.split('|').map(s => s.trim().replace(/^ST_/, '').toLowerCase()), text: JSON.parse(text.replace(/\\t/g, '\\t')) };
    if (seen.has(id)) throw new Error(`cells.def line ${index + 1}: duplicate id ${id}.`);
    seen.add(id);
    if (cell.x + cell.w > GRID_SIZE.width || cell.y + cell.h > GRID_SIZE.height) throw new Error(`cells.def line ${index + 1}: ${id} extends outside the ${GRID_SIZE.width} by ${GRID_SIZE.height} grid.`);
    if (cell.x < MARKER_AREA.w && cell.y < MARKER_AREA.h) throw new Error(`cells.def line ${index + 1}: ${id} overlaps the ready marker.`);
    cells.push(cell);
  });
  return cells;
}

/** Pairs of cells on the same sheet whose rectangles intersect. The menu cell only reserves space, so it is skipped. */
export function overlaps(cells) {
  const found = [];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j];
    if (a.sheet === b.sheet && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) found.push([a.id, b.id]);
  }
  return found;
}

export async function loadGrid(file = CELLS_DEF) {
  const cells = parseCells(await readFile(file, 'utf8'));
  return { description: 'refgrid cell table, generated from refgrid/cells.def by grid-export.mjs. Coordinates are screen pixels; each sheet is one screen dump.', size: GRID_SIZE, marker: MARKER_AREA, sheets: [...new Set(cells.map(c => c.sheet))].sort((a, b) => a - b), cells };
}
