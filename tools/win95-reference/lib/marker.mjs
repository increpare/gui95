// The ready marker refgrid paints at the top left of its window once a sheet has finished drawing:
// five 8 by 8 squares: red (yellow if refgrid reports a failure), three squares giving the sheet number in binary
// (white 1, black 0), blue. The colours are pure, so they survive 16-colour, 256-colour and 5:6:5 displays.
import { pixel } from './png.mjs';

const near = (value, target) => Math.abs(value - target) <= 56;
const is = ([r, g, b], [tr, tg, tb]) => near(r, tr) && near(g, tg) && near(b, tb);

/** Returns null when no marker is shown, otherwise { sheet, failed }. */
export function readMarker(image) {
  if (image.width < 40 || image.height < 8) return null;
  // Every pixel of a square must agree, so a desktop that happens to be red at one point is not mistaken for it.
  const square = index => {
    const first = pixel(image, index * 8, 0);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = pixel(image, index * 8 + x, y); if (p[0] !== first[0] || p[1] !== first[1] || p[2] !== first[2]) return null; }
    return first;
  };
  const squares = [0, 1, 2, 3, 4].map(square);
  if (squares.includes(null)) return null;
  const failed = is(squares[0], [255, 255, 0]);
  if (!failed && !is(squares[0], [255, 0, 0])) return null;
  if (!is(squares[4], [0, 0, 255])) return null;
  let sheet = 0;
  for (const s of squares.slice(1, 4)) { if (is(s, [255, 255, 255])) sheet = sheet * 2 + 1; else if (is(s, [0, 0, 0])) sheet *= 2; else return null; }
  return sheet ? { sheet, failed } : null;
}
