import { test, after } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import * as g from "../gui95-icons.mjs";
import { readManifest } from "../gui95-app.mjs";

const square = (body, viewBox = "0 0 16 16") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const pixel = (svg, size = 16) => g.rasterize(svg, size, { style: "pixel" });
const smooth = (svg, size = 16) => g.rasterize(svg, size, { style: "smooth" });
const near = (actual, expected, tolerance = 2) => actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);

function fixture(name) {
  return path.join(import.meta.dirname, "fixtures", name);
}

// Copies a fixture folder into a throwaway folder, because generateIcons writes into the repository.
const scratch = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gui95-icons-test-"));
  scratch.push(dir);
  return dir;
}
async function iconRepo(t, name = "icons") {
  const repo = tempDir();
  fs.cpSync(fixture(name), repo, { recursive: true });
  return repo;
}
// A repository holding the given manifest and files.
function repoWith(manifest, files = {}) {
  const repo = tempDir();
  fs.writeFileSync(path.join(repo, "gui95-app.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  }
  return repo;
}
after(() => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

// ---- Readers for what the encoders write --------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// Reads a PNG made of unfiltered 8-bit RGBA rows, checking the signature and every chunk's CRC.
function decodePng(png) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let offset = 8;
  let header;
  const idat = [];
  const types = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    assert.equal(png.readUInt32BE(offset + 8 + length), crc32(png.subarray(offset + 4, offset + 8 + length)), `CRC of ${type}`);
    types.push(type);
    if (type === "IHDR") header = body;
    if (type === "IDAT") idat.push(body);
    offset += 12 + length;
  }
  assert.equal(offset, png.length);
  assert.deepEqual([types[0], types.at(-1)], ["IHDR", "IEND"]);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  assert.deepEqual([...header.subarray(8)], [8, 6, 0, 0, 0]);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, height * (width * 4 + 1));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width * 4 + 1)], 0, "row filter");
    data.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  }
  return { width, height, data };
}

// icns "ARGB": the four channels, alpha first, each compressed with the icns run-length scheme.
function decodeArgb(body, size) {
  assert.equal(body.toString("latin1", 0, 4), "ARGB");
  const data = new Uint8Array(size * size * 4);
  let at = 4;
  for (const channel of [3, 0, 1, 2]) {
    let i = 0;
    while (i < size * size) {
      const control = body[at++];
      if (control < 128) {
        for (let k = 0; k <= control; k++) data[(i++) * 4 + channel] = body[at++];
      } else {
        const value = body[at++];
        for (let k = 0; k < control - 125; k++) data[(i++) * 4 + channel] = value;
      }
    }
    assert.equal(i, size * size);
  }
  assert.equal(at, body.length);
  return { width: size, height: size, data };
}

// The PNG images of an ICO file, decoded, with the size each directory entry states.
function icoImages(ico) {
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1]);
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const entry = 6 + i * 16;
    const offset = ico.readUInt32LE(entry + 12);
    const image = decodePng(ico.subarray(offset, offset + ico.readUInt32LE(entry + 8)));
    assert.equal(ico[entry] || 256, image.width);
    return image;
  });
}

function icnsEntries(icns) {
  assert.equal(icns.toString("latin1", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  const entries = [];
  for (let offset = 8; offset < icns.length; ) {
    const length = icns.readUInt32BE(offset + 4);
    entries.push({ type: icns.toString("latin1", offset, offset + 4), body: icns.subarray(offset + 8, offset + length) });
    offset += length;
  }
  return entries;
}

// A picture whose colour changes along each row and column, with long runs on one side.
function gradient(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set([(x * 255) / size, (y * 255) / size, x < size / 2 ? 7 : (x * y) % 256, x + y < size ? 255 : 90], (y * size + x) * 4);
  return { width: size, height: size, data };
}

// ---- Interface ------------------------------------------------------------------

test("constants", () => {
  assert.equal(g.ICON_DIR, "gui95-icons");
});

test("pixel style draws hard pixels", () => {
  const img = g.rasterize(square('<rect x="0" y="0" width="8" height="16" fill="#000"/>'), 16, { style: "pixel" });
  assert.deepEqual(px(img, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(px(img, 15, 0), [0, 0, 0, 0]);
});
test("smooth style antialiases a half-covered column", () => {
  const img = g.rasterize(square('<rect x="0" y="0" width="8.5" height="16" fill="#000"/>'), 16, { style: "smooth" });
  assert.ok(Math.abs(px(img, 8, 8)[3] - 128) <= 16);
});
test("cubic curves, transforms and evenodd", () => {
  const ring = '<path fill-rule="evenodd" d="M0 0H16V16H0Z M4 4H12V12H4Z" fill="#fff"/>';
  assert.equal(px(g.rasterize(square(ring), 16, { style: "pixel" }), 8, 8)[3], 0);
  const moved = g.rasterize(square('<g transform="translate(8 0)"><rect width="8" height="16" fill="#000"/></g>'), 16, { style: "pixel" });
  assert.equal(px(moved, 0, 0)[3], 0); assert.equal(px(moved, 15, 0)[3], 255);
  const blob = g.rasterize(square('<path d="M8 1C12 1 15 4 15 8S12 15 8 15 1 12 1 8 4 1 8 1Z" fill="#f00"/>'), 16, { style: "smooth" });
  assert.equal(px(blob, 8, 8)[3], 255); assert.equal(px(blob, 0, 0)[3], 0);
});
test("unsupported SVG is refused by name", () => {
  assert.throws(() => g.rasterize(square("<text>hi</text>"), 16, { style: "pixel" }), /text/);
  assert.throws(() => g.rasterize(square('<path d="M0 0A4 4 0 0 1 8 8Z"/>'), 16, { style: "pixel" }), /\bA\b/);
});
test("encoders", () => {
  const imageAt = (size) => g.rasterize(square('<rect width="16" height="16" fill="#5ec8ff"/>'), size, { style: "pixel" });
  const png = g.encodePng(imageAt(64));
  assert.equal(png.toString("latin1", 1, 4), "PNG"); assert.equal(png.readUInt32BE(16), 64);
  const ico = g.encodeIco(imageAt);
  assert.equal(ico.readUInt16LE(4), 7); assert.equal(ico[6 + 6 * 16], 0);     // 7 entries; the 256 px entry stores 0
  const icns = g.encodeIcns(imageAt);
  assert.equal(icns.toString("latin1", 0, 4), "icns"); assert.equal(icns.readUInt32BE(4), icns.length);
});
test("generateIcons writes png, ico and icns per icon", async (t) => {
  const repo = await iconRepo(t);
  const written = await g.generateIcons(repo, { log() {} });
  assert.equal(written.length, 6);
  const png = await readFile(path.join(repo, "gui95-icons", "app.png"));
  assert.equal(png.readUInt32BE(16), 1024);
});
test("readIconList validates", async () => {
  await assert.rejects(g.readIconList(fixture("icons-bad-style")), /gui95-app.json: icons\[0\]\.style/);
});

// ---- The rasterizer: pixel style ------------------------------------------------

test("pixel style gives each pixel the colour that covers most of it", () => {
  const edge = (width) => px(pixel(square(`<rect width="${width}" height="16"/>`)), 8, 4)[3];
  assert.equal(edge(8.4), 0);
  assert.equal(edge(8.6), 255);
  const nothingAtTheEdge = px(pixel(square('<rect width="8.4" height="16"/>')), 7, 4);
  assert.deepEqual(nothingAtTheEdge, [0, 0, 0, 255]);
});
test("pixel style: a tie goes to the paint drawn later", () => {
  const halves = square('<rect width="8.5" height="16" fill="#f00"/><rect x="8.5" width="7.5" height="16" fill="#00f"/>');
  assert.deepEqual(px(pixel(halves), 8, 3), [0, 0, 255, 255]);
  // A shape beats an equal share of nothing.
  assert.deepEqual(px(pixel(square('<rect width="8.5" height="16" fill="#0f0"/>')), 8, 3), [0, 255, 0, 255]);
});
test("pixel style counts paints of one colour together", () => {
  const svg = square('<rect x="8" width=".25" height="16" fill="#f00"/><rect x="8.25" width=".25" height="16" fill="#f00"/><rect x="8.5" width=".44" height="16" fill="#00f"/>');
  assert.deepEqual(px(pixel(svg), 8, 3), [255, 0, 0, 255]);   // red 8 of 16 samples, blue 7
});
test("pixel style keeps translucent colours hard", () => {
  const img = pixel(square('<rect width="16" height="16" fill="#000" fill-opacity=".5"/>'));
  assert.deepEqual(px(img, 3, 3), [0, 0, 0, 128]);
});
test("pixel style blends a translucent paint with what is below it", () => {
  // A 50% black square over a white one is grey and opaque, not a see-through hole.
  const svg = square('<rect width="16" height="16" fill="#fff"/><rect width="16" height="16" fill="#000" fill-opacity=".5"/>');
  assert.ok(near(px(pixel(svg), 3, 3), [127, 127, 127, 255], 1), String(px(pixel(svg), 3, 3)));
  assert.deepEqual(px(pixel(svg), 3, 3), px(smooth(svg), 3, 3));
  // A half-opaque blue group over red is purple: the red stays.
  const group = square('<rect width="16" height="16" fill="#f00"/><g opacity=".5"><rect width="16" height="16" fill="#00f"/></g>');
  assert.ok(near(px(pixel(group), 3, 3), [128, 0, 128, 255], 1), String(px(pixel(group), 3, 3)));
  assert.deepEqual(px(pixel(group), 3, 3), px(smooth(group), 3, 3));
  // Over part of what is below, only that part changes.
  const half = pixel(square('<rect width="8" height="16" fill="#f00"/><rect width="16" height="16" fill="#00f" fill-opacity=".5"/>'));
  assert.ok(near(px(half, 3, 3), [128, 0, 128, 255], 1));
  assert.deepEqual(px(half, 12, 3), [0, 0, 255, 128]);
  // The colour that covers most of a pixel wins, blended colours included.
  const edge = pixel(square('<rect width="16" height="16" fill="#fff"/><rect width="8.6" height="16" fill="#000" fill-opacity=".5"/>'));
  assert.ok(near(px(edge, 8, 3), [128, 128, 128, 255], 1), String(px(edge, 8, 3)));
  assert.deepEqual(px(edge, 9, 3), [255, 255, 255, 255]);
  // Groups nest, and the later of two equal shares wins.
  const nested = pixel(square('<rect width="16" height="16" fill="#fff"/><g opacity=".5"><g opacity=".5"><rect width="16" height="16"/></g></g>'));
  assert.ok(near(px(nested, 8, 8), [191, 191, 191, 255], 1), String(px(nested, 8, 8)));
  const tie = pixel(square('<rect width="8.5" height="16" fill="#f00" fill-opacity=".5"/><rect x="8.5" width="7.5" height="16" fill="#00f" fill-opacity=".5"/>'));
  assert.deepEqual(px(tie, 8, 3), [0, 0, 255, 128]);
  // Also inside a group, whose layer is composited onto the picture.
  const groupTie = pixel(square('<g opacity=".5"><rect width="8.5" height="16" fill="#f00"/><rect x="8.5" width="7.5" height="16" fill="#00f"/></g>'));
  assert.deepEqual(px(groupTie, 8, 3), [0, 0, 255, 128]);
});

// ---- The rasterizer: smooth style -----------------------------------------------

test("smooth style averages colours with alpha", () => {
  const edge = smooth(square('<rect width="8.5" height="16" fill="#000"/><rect x="8.5" width="7.5" height="16" fill="#fff"/>'));
  assert.ok(near(px(edge, 8, 5), [128, 128, 128, 255], 3), String(px(edge, 8, 5)));
  const red = smooth(square('<rect width="8.5" height="16" fill="#f00"/>'));
  const [r, gr, b, a] = px(red, 8, 5);
  assert.ok(r >= 254 && gr === 0 && b === 0 && Math.abs(a - 128) <= 3, String([r, gr, b, a]));   // not darkened by the empty half
});
test("smooth style leaves no seam between abutting shapes", () => {
  const img = smooth(square('<rect width="8.3" height="16" fill="#123456"/><rect x="8.3" width="7.7" height="16" fill="#123456"/>'));
  assert.deepEqual(px(img, 8, 5), [0x12, 0x34, 0x56, 255]);
});
test("smooth style uses at least 4 x 4 samples", () => {
  const levels = new Set();
  for (let k = 0; k < 16; k++) levels.add(px(smooth(square(`<rect width="${8 + k / 16}" height="16"/>`)), 8, 5)[3]);
  assert.ok(levels.size >= 8, `${levels.size} different coverage levels`);
  const diagonal = smooth(square('<path d="M0 0L16 16H0Z"/>'), 64);
  const alphas = new Set();
  for (let i = 0; i < 64; i++) alphas.add(px(diagonal, i, i)[3]);
  assert.ok(alphas.size === 1 && [...alphas][0] > 100 && [...alphas][0] < 160, [...alphas].join());
});
test("smooth style covers a curve by its true area", () => {
  const coverage = (svg, size) => {
    const img = smooth(svg, size);
    let sum = 0;
    for (let i = 3; i < img.data.length; i += 4) sum += img.data[i];
    return sum / 255 / (size * size / 256);   // in square viewBox units
  };
  assert.ok(Math.abs(coverage(square('<circle cx="8" cy="8" r="6"/>'), 64) - Math.PI * 36) < 0.8);
  assert.ok(Math.abs(coverage(square('<ellipse cx="8" cy="8" rx="7" ry="3"/>'), 64) - Math.PI * 21) < 0.6);
  assert.ok(Math.abs(coverage(square('<path d="M2 8C2 2 14 2 14 8S2 14 2 8Z"/>'), 64) - coverage(square('<path d="M2 8c0-6 12-6 12 0s-12 6-12 0z"/>'), 64)) < 0.01);
});

// ---- The rasterizer: SVG features -------------------------------------------------

test("the default paint is black fill, no stroke", () => {
  assert.deepEqual(px(pixel(square('<rect width="4" height="4"/>')), 1, 1), [0, 0, 0, 255]);
});
test("colours: #rgb, #rrggbb, none, black and white", () => {
  const colour = (value) => px(pixel(square(`<rect width="16" height="16" fill="${value}"/>`)), 3, 3);
  assert.deepEqual(colour("#abc"), [0xaa, 0xbb, 0xcc, 255]);
  assert.deepEqual(colour("#A0b1C2"), [0xa0, 0xb1, 0xc2, 255]);
  assert.deepEqual(colour("white"), [255, 255, 255, 255]);
  assert.deepEqual(colour("black"), [0, 0, 0, 255]);
  assert.equal(colour("none")[3], 0);
});
test("presentation attributes are inherited and can be overridden", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#f00"><g fill="#0f0"><rect width="4" height="4"/><rect x="4" width="4" height="4" fill="#00f"/></g><rect x="8" width="4" height="4"/></svg>';
  const img = pixel(svg);
  assert.deepEqual(px(img, 1, 1), [0, 255, 0, 255]);
  assert.deepEqual(px(img, 5, 1), [0, 0, 255, 255]);
  assert.deepEqual(px(img, 9, 1), [255, 0, 0, 255]);
});
test("fill-opacity and opacity make the colour translucent", () => {
  const alpha = (attributes) => px(smooth(square(`<rect width="16" height="16" ${attributes}/>`)), 4, 4)[3];
  assert.equal(alpha('fill-opacity=".5"'), 128);
  assert.equal(alpha('opacity=".25"'), 64);
  assert.equal(alpha('fill-opacity=".5" opacity=".5"'), 64);
  assert.equal(px(smooth(square('<g opacity=".5"><rect width="16" height="16" fill-opacity=".5"/></g>')), 4, 4)[3], 64);
  assert.equal(alpha('opacity="0"'), 0);
});
test("opacity applies to an element and its content as a whole", () => {
  const group = smooth(square('<g opacity=".5"><rect width="16" height="16" fill="#000"/><rect width="8" height="16" fill="#f00"/></g>'));
  assert.deepEqual(px(group, 3, 4), [255, 0, 0, 128]);      // the red covers the black inside the group, then both fade
  assert.deepEqual(px(group, 12, 4), [0, 0, 0, 128]);
  const framed = smooth(square('<rect x="4" y="4" width="8" height="8" fill="#fff" stroke="#000" stroke-width="4" opacity=".5"/>'));
  assert.deepEqual(px(framed, 5, 8), [0, 0, 0, 128]);       // the stroke over the fill is not doubled
  assert.deepEqual(px(framed, 8, 8), [255, 255, 255, 128]);
  assert.deepEqual(px(framed, 3, 8), [0, 0, 0, 128]);
  const nested = smooth(square('<g opacity=".5"><g opacity=".5"><rect width="16" height="16"/></g></g>'));
  assert.equal(px(nested, 8, 8)[3], 64);
  const over = smooth(square('<rect width="16" height="16" fill="#fff"/><g opacity=".5"><rect width="16" height="16" fill="#000"/><circle cx="8" cy="8" r="20" fill="#000"/></g>'));
  assert.ok(near(px(over, 8, 8), [127, 127, 127, 255], 1), String(px(over, 8, 8)));
  const withFillOpacity = smooth(square('<g opacity=".5"><rect width="16" height="16" fill-opacity=".5"/></g>'));
  assert.equal(px(withFillOpacity, 8, 8)[3], 64);
  assert.equal(smooth(square('<g opacity="0"><rect width="16" height="16"/></g>')).data.every((v) => v === 0), true);
  // The pixel style composites groups the same way, then keeps each pixel's colour hard.
  const pixelGroup = pixel(square('<g opacity=".5"><rect width="16" height="16" fill="#000"/><rect width="8" height="16" fill="#f00"/></g>'));
  assert.deepEqual(px(pixelGroup, 3, 4), [255, 0, 0, 128]);
  assert.deepEqual(px(pixelGroup, 12, 4), [0, 0, 0, 128]);
});
test("a translucent shape blends with what is below it", () => {
  const img = smooth(square('<rect width="16" height="16" fill="#fff"/><rect width="16" height="16" fill="#000" fill-opacity=".5"/>'));
  assert.ok(near(px(img, 4, 4), [127, 127, 127, 255], 1));
  const over = smooth(square('<rect width="8" height="16" fill="#ff0000"/><rect width="16" height="16" fill="#0000ff" fill-opacity=".5"/>'));
  assert.ok(near(px(over, 2, 4), [128, 0, 128, 255], 1), String(px(over, 2, 4)));
  assert.ok(near(px(over, 12, 4), [0, 0, 255, 128], 1), String(px(over, 12, 4)));
});
test("fill-rule: nonzero is the default, evenodd leaves holes", () => {
  const path = (rule) => square(`<path ${rule} d="M0 0H16V16H0Z M4 4H12V12H4Z"/>`);
  assert.equal(px(pixel(path("")), 8, 8)[3], 255);
  assert.equal(px(pixel(path('fill-rule="nonzero"')), 8, 8)[3], 255);
  assert.equal(px(pixel(path('fill-rule="evenodd"')), 8, 8)[3], 0);
  assert.equal(px(pixel(path('fill-rule="evenodd"')), 1, 1)[3], 255);
  const opposite = square('<path d="M0 0H16V16H0Z M4 4V12H12V4Z"/>');   // the inner square runs the other way round
  assert.equal(px(pixel(opposite), 8, 8)[3], 0);
});
test("fill-rule is inherited", () => {
  const svg = square('<g fill-rule="evenodd"><path d="M0 0H16V16H0Z M4 4H12V12H4Z"/></g>');
  assert.equal(px(pixel(svg), 8, 8)[3], 0);
});
test("path commands, absolute and relative", () => {
  const same = (a, b) => assert.deepEqual(smooth(square(`<path d="${a}"/>`), 32).data, smooth(square(`<path d="${b}"/>`), 32).data);
  same("M2 2H10V10H2Z", "m2 2h8v8h-8z");
  same("M2 2L10 2L10 10L2 10Z", "M2 2 10 2 10 10 2 10z");          // pairs after M are lines
  same("M2 2L10 2L10 10L2 10Z", "m2 2 8 0 0 8-8 0z");
  same("M2 2V10H10V2Z", "M2 2v8h8v-8Z");
  same("M2 2H10V10H2Z M12 12H14V14H12Z", "M2 2H10V10H2ZM12 12H14V14H12Z");
  same("M2 2H10V10H2Z", "M2,2 H10 V10 H2 Z");
  same("M2 2H10V10H2Z", "M2 2H1e1V10H2Z");
  same("M2.5.5L10 2L10 10Z", "M2.5 .5 L10 2 L10 10 Z");
  same("M2 2C6 2 10 4 10 8L2 10Z", "M2 2c4 0 8 2 8 6L2 10Z");
  same("M2 2H10V10H2Z M5 5H7V7H5Z", "M2 2H10V10H2Z m3 3H7V7H5Z");   // a relative move after Z starts at the subpath start
});
test("path commands: a command after Z starts from the start of the closed subpath", () => {
  const img = pixel(square('<path d="M2 2H6V6H2ZL10 10H2Z"/>'));
  assert.equal(px(img, 3, 3)[3], 255);
  assert.equal(px(img, 5, 9)[3], 255);   // the second triangle 2,2 - 10,10 - 2,10
});
test("quadratic curves equal the cubic with the same shape", () => {
  const q = smooth(square('<path d="M2 12Q8 0 14 12Z"/>'), 32);
  const c = smooth(square(`<path d="M2 12C${2 + (2 / 3) * 6} ${12 - (2 / 3) * 12} ${14 - (2 / 3) * 6} ${12 - (2 / 3) * 12} 14 12Z"/>`), 32);
  assert.deepEqual(q.data, c.data);
});
test("S continues the previous cubic, T the previous quadratic", () => {
  const s = smooth(square('<path d="M2 8C2 3 6 3 8 8S14 13 14 8Z"/>'), 32);
  const sExplicit = smooth(square('<path d="M2 8C2 3 6 3 8 8C10 13 14 13 14 8Z"/>'), 32);
  assert.deepEqual(s.data, sExplicit.data);
  const sAlone = smooth(square('<path d="M2 8S6 3 8 8Z"/>'), 32);   // no previous cubic: the first control point is the current point
  assert.deepEqual(sAlone.data, smooth(square('<path d="M2 8C2 8 6 3 8 8Z"/>'), 32).data);
  const t = smooth(square('<path d="M2 8Q5 2 8 8T14 8Z"/>'), 32);
  const tExplicit = smooth(square('<path d="M2 8Q5 2 8 8Q11 14 14 8Z"/>'), 32);
  assert.deepEqual(t.data, tExplicit.data);
  const rel = smooth(square('<path d="m2 8c0-5 4-5 6 0s6 5 6 0z"/>'), 32);
  assert.deepEqual(rel.data, sExplicit.data);
  const relT = smooth(square('<path d="m2 8q3-6 6 0t6 0z"/>'), 32);
  assert.deepEqual(relT.data, tExplicit.data);
});
test("rect, circle, ellipse and polygon", () => {
  const rect = pixel(square('<rect x="2" y="3" width="5" height="6"/>'));
  assert.deepEqual([px(rect, 2, 3)[3], px(rect, 6, 8)[3], px(rect, 7, 8)[3], px(rect, 2, 9)[3]], [255, 255, 0, 0]);
  const circle = pixel(square('<circle cx="8" cy="8" r="5"/>'));
  assert.deepEqual([px(circle, 8, 8)[3], px(circle, 8, 3)[3], px(circle, 8, 1)[3], px(circle, 3, 3)[3]], [255, 255, 0, 0]);
  const ellipse = pixel(square('<ellipse cx="8" cy="8" rx="7" ry="3"/>'));
  assert.deepEqual([px(ellipse, 2, 8)[3], px(ellipse, 8, 5)[3], px(ellipse, 8, 3)[3], px(ellipse, 2, 4)[3]], [255, 255, 0, 0]);
  const polygon = pixel(square('<polygon points="2,2 14,2 8,14"/>'));
  assert.deepEqual([px(polygon, 8, 3)[3], px(polygon, 8, 12)[3], px(polygon, 2, 12)[3], px(polygon, 12, 3)[3], px(polygon, 13, 3)[3]], [255, 255, 0, 255, 0]);
  assert.equal(px(pixel(square('<polygon points="2 2 14 2 8 14"/>')), 8, 3)[3], 255);
});
test("transforms: translate, scale and matrix, applied in order", () => {
  const rect = (transform) => pixel(square(`<g transform="${transform}"><rect width="8" height="8"/></g>`));
  assert.equal(px(rect("translate(8 8)"), 12, 12)[3], 255);
  assert.equal(px(rect("translate(8 8)"), 4, 4)[3], 0);
  assert.equal(px(rect("translate(8)"), 12, 4)[3], 255);
  assert.equal(px(rect("scale(2)"), 12, 12)[3], 255);
  assert.equal(px(rect("scale(2 1)"), 12, 4)[3], 255);
  assert.equal(px(rect("scale(2 1)"), 4, 12)[3], 0);
  assert.equal(px(rect("matrix(1 0 0 1 8 0)"), 12, 4)[3], 255);
  assert.equal(px(rect("matrix(-1 0 0 -1 16 16)"), 12, 12)[3], 255);   // a half turn
  assert.equal(px(rect("matrix(-1 0 0 -1 16 16)"), 4, 4)[3], 0);
  assert.equal(px(rect("matrix(0 1 -1 0 16 0)"), 12, 4)[3], 255);      // a quarter turn
  // translate then scale: the rect lands at 8..12.
  const both = rect("translate(8 8) scale(.5)");
  assert.equal(px(both, 9, 9)[3], 255);
  assert.equal(px(both, 13, 13)[3], 0);
  // Nested transforms multiply, the outer one first.
  const nested = pixel(square('<g transform="translate(8 8)"><g transform="scale(.5)"><rect width="8" height="8"/></g></g>'));
  assert.equal(px(nested, 9, 9)[3], 255);
  assert.equal(px(nested, 13, 13)[3], 0);
  const commas = pixel(square('<rect width="8" height="8" transform="translate(8,8),scale(.5,.5)"/>'));
  assert.equal(px(commas, 9, 9)[3], 255);
});
test("strokes scale with the transform and have a width", () => {
  const stroked = pixel(square('<rect x="6" y="6" width="4" height="4" fill="none" stroke="#000" stroke-width="6" stroke-linejoin="round"/>'));
  assert.equal(px(stroked, 5, 5)[3], 255);
  assert.equal(px(stroked, 3, 3)[3], 0);          // the corner is rounded
  assert.equal(px(stroked, 8, 4)[3], 255);
  assert.equal(px(stroked, 8, 1)[3], 0);
  const hollow = pixel(square('<rect x="4" y="4" width="8" height="8" fill="none" stroke="#000" stroke-width="2"/>'));
  assert.equal(px(hollow, 8, 8)[3], 0);           // no fill
  assert.equal(px(hollow, 4, 8)[3], 255);
  const scaled = pixel(square('<g transform="scale(2)"><path d="M1 4H7" stroke="#000" stroke-width="1"/></g>'));
  assert.equal(px(scaled, 7, 8)[3], 255);          // 2 pixels wide, centred on y = 8
  assert.equal(px(scaled, 7, 7)[3], 255);
  assert.equal(px(scaled, 7, 6)[3], 0);
  assert.equal(px(scaled, 7, 9)[3], 0);
});
test("strokes follow curves and paint over the fill", () => {
  const ring = pixel(square('<circle cx="8" cy="8" r="6" fill="#fff" stroke="#000" stroke-width="2"/>'), 32);
  assert.deepEqual(px(ring, 16, 16), [255, 255, 255, 255]);
  assert.deepEqual(px(ring, 4, 16), [0, 0, 0, 255]);        // x = 2, on the circle
  assert.deepEqual(px(ring, 16, 2), [0, 0, 0, 255]);
  assert.equal(px(ring, 0, 0)[3], 0);
  assert.equal(px(ring, 31, 31)[3], 0);
  const onlyStroke = pixel(square('<path d="M2 2L14 2L14 14" stroke="#f00" stroke-width="2" fill="none"/>'));
  assert.deepEqual(px(onlyStroke, 8, 2), [255, 0, 0, 255]);
  assert.equal(px(onlyStroke, 2, 12)[3], 0);
  assert.deepEqual(px(onlyStroke, 14, 8), [255, 0, 0, 255]);
  assert.equal(px(onlyStroke, 8, 8)[3], 0);                  // an open path's fill would be the triangle, but the fill is none
});
test("an open path is filled as if closed, but not stroked closed", () => {
  const img = pixel(square('<path d="M2 2H14V14" fill="#0f0" stroke="#000" stroke-width="1"/>'));
  assert.deepEqual(px(img, 11, 7), [0, 255, 0, 255]);        // inside the triangle 2,2 - 14,2 - 14,14
  assert.equal(px(img, 5, 10)[3], 0);                        // the closing edge is not stroked
  assert.deepEqual(px(img, 8, 2), [0, 0, 0, 255]);
});
test("a stroke of width 0 or none draws nothing", () => {
  assert.equal(px(pixel(square('<path d="M2 8H14" stroke="#000" stroke-width="0"/>')), 8, 8)[3], 0);
  assert.equal(px(pixel(square('<path d="M2 8H14" stroke="none" stroke-width="3"/>')), 8, 8)[3], 0);
});
// A thick open line with a sharp corner at (8, 4): a miter reaches up to y = 0.67, a round join to y = 2
// and a bevel to y = 2.8.
const corner = (attributes = "", wrap = (body) => body) =>
  pixel(square(wrap(`<path d="M2 12L8 4L14 12" fill="none" stroke="#000" stroke-width="4" ${attributes}/>`)));
test("stroke joins are miters unless stated", () => {
  assert.equal(px(corner(), 8, 1)[3], 255);                    // the miter tip
  assert.equal(px(corner('stroke-linejoin="miter"'), 8, 1)[3], 255);
  assert.equal(px(corner(), 8, 2)[3], 255);
  assert.equal(px(corner('stroke-linejoin="round"'), 8, 1)[3], 0);   // no tip
  assert.equal(px(corner('stroke-linejoin="round"'), 8, 2)[3], 255); // but the rounded top
  assert.equal(px(corner('stroke-linejoin="bevel"'), 8, 1)[3], 0);
  assert.equal(px(corner('stroke-linejoin="bevel"'), 8, 2)[3], 0);    // the corner is cut off flat
  assert.equal(px(corner('stroke-linejoin="bevel"'), 8, 3)[3], 255);
  const box = (join) => pixel(square(`<rect x="6" y="6" width="4" height="4" fill="none" stroke="#000" stroke-width="6" ${join}/>`));
  assert.equal(px(box(""), 3, 3)[3], 255);                     // a mitred corner is square
  assert.equal(px(box('stroke-linejoin="round"'), 3, 3)[3], 0);
  assert.equal(px(box('stroke-linejoin="bevel"'), 3, 3)[3], 0);
  assert.equal(px(box('stroke-linejoin="bevel"'), 5, 5)[3], 255);
  assert.equal(px(box(""), 2, 8)[3], 0);
});
test("a very sharp corner falls back to a bevel beyond the miter limit", () => {
  // The corner at (8, 2) is 9.5 degrees wide: its miter is 12.04 stroke widths long.
  const spike = (attributes) => pixel(square(`<path d="M7 14L8 2L9 14" fill="none" stroke="#000" stroke-width="2" ${attributes}/>`));
  assert.equal(px(spike(""), 8, 1)[3], 0);                     // the default limit is 4
  assert.equal(px(spike('stroke-miterlimit="4"'), 8, 1)[3], 0);
  assert.equal(px(spike('stroke-miterlimit="12"'), 8, 1)[3], 0);
  assert.equal(px(spike('stroke-miterlimit="12.1"'), 8, 1)[3], 255);
  assert.equal(px(spike('stroke-miterlimit="40"'), 8, 1)[3], 255);
  assert.equal(px(spike('stroke-miterlimit="40" stroke-linejoin="bevel"'), 8, 1)[3], 0);
  assert.equal(px(spike('stroke-miterlimit="40" stroke-linejoin="round"'), 8, 0)[3], 0);   // a round join ends one half width above the bend
  assert.equal(px(spike('stroke-miterlimit="40"'), 8, 0)[3], 255);
  assert.equal(px(spike(""), 8, 3)[3], 255);                   // the bevelled corner itself is drawn
  // Either side of the default limit of 4: a miter 3.49 stroke widths long is kept, one of 5.10 is cut.
  const lean = (dx, attributes = "") => pixel(square(`<path d="M${8 - dx} 14L8 4L${8 + dx} 14" fill="none" stroke="#000" stroke-width="2" ${attributes}/>`));
  assert.equal(px(lean(3), 8, 2)[3], 255);
  assert.equal(px(lean(2), 8, 2)[3], 0);
  assert.equal(px(lean(2, 'stroke-miterlimit="6"'), 8, 2)[3], 255);
  assert.equal(px(lean(3, 'stroke-miterlimit="3"'), 8, 2)[3], 0);
});
test("stroke-linejoin and stroke-miterlimit are inherited", () => {
  assert.equal(px(corner("", (body) => `<g stroke-linejoin="round">${body}</g>`), 8, 1)[3], 0);
  assert.equal(px(corner('stroke-linejoin="miter"', (body) => `<g stroke-linejoin="round">${body}</g>`), 8, 1)[3], 255);
  assert.equal(px(corner("", (body) => `<g stroke-linejoin="bevel"><g>${body}</g></g>`), 8, 2)[3], 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" stroke-linejoin="round"><path d="M2 12L8 4L14 12" fill="none" stroke="#000" stroke-width="4"/></svg>`;
  assert.equal(px(pixel(svg), 8, 1)[3], 0);
  const spike = (outer, inner = "") => pixel(square(`<g ${outer}><path d="M7 14L8 2L9 14" fill="none" stroke="#000" stroke-width="2" ${inner}/></g>`));
  assert.equal(px(spike('stroke-miterlimit="40"'), 8, 1)[3], 255);
  assert.equal(px(spike('stroke-miterlimit="40"', 'stroke-miterlimit="2"'), 8, 1)[3], 0);
});
test("joins use the stroke's width after the transform", () => {
  const scaled = pixel(square('<g transform="scale(2)"><path d="M1 6L4 2L7 6" fill="none" stroke="#000" stroke-width="2"/></g>'));
  assert.equal(px(scaled, 8, 1)[3], 255);                      // the same corner as above, so the same miter tip
});
test("an open line turning back on itself ends flat, or round with a round join", () => {
  const back = (join) => pixel(square(`<path d="M2 8H12H2" fill="none" stroke="#000" stroke-width="4" ${join}/>`));
  assert.equal(px(back(""), 13, 8)[3], 0);
  assert.equal(px(back('stroke-linejoin="bevel"'), 13, 8)[3], 0);
  assert.equal(px(back('stroke-linejoin="round"'), 13, 8)[3], 255);
});
test("zero-sized shapes draw nothing", () => {
  assert.equal(px(pixel(square('<rect width="0" height="8"/><rect width="8" height="0"/><circle r="0" cx="4" cy="4"/>')), 3, 3)[3], 0);
});
test("a viewBox that is not square is centred", () => {
  const img = pixel(square('<rect x="0" y="0" width="20" height="10"/>', "0 0 20 10"), 20);
  assert.equal(px(img, 5, 4)[3], 0);
  assert.equal(px(img, 5, 5)[3], 255);
  assert.equal(px(img, 5, 14)[3], 255);
  assert.equal(px(img, 5, 15)[3], 0);
  const offset = pixel(square('<rect x="10" y="10" width="8" height="8"/>', "10 10 16 16"));
  assert.equal(px(offset, 0, 0)[3], 255);
  assert.equal(px(offset, 8, 8)[3], 0);
});
test("anything outside the viewBox is clipped", () => {
  const img = pixel(square('<rect x="-10" y="-10" width="100" height="100"/>'));
  assert.equal(px(img, 0, 0)[3], 255);
  assert.equal(px(img, 15, 15)[3], 255);
  assert.equal(pixel(square('<rect x="-100" y="40" width="5" height="5"/>')).data.every((v) => v === 0), true);
});
test("the output is straight RGBA of the requested size", () => {
  for (const style of ["pixel", "smooth"]) {
    const img = g.rasterize(square('<rect width="8" height="8" fill="#336699"/>'), 24, { style });
    assert.equal(img.width, 24);
    assert.equal(img.height, 24);
    assert.ok(img.data instanceof Uint8Array);
    assert.equal(img.data.length, 24 * 24 * 4);
    assert.deepEqual(px(img, 1, 1), [0x33, 0x66, 0x99, 255]);
    assert.deepEqual(px(img, 20, 20), [0, 0, 0, 0]);
  }
});
test("big sizes work in both styles", () => {
  for (const style of ["pixel", "smooth"]) {
    const img = g.rasterize(square('<circle cx="8" cy="8" r="7" fill="#808080"/>'), 512, { style });
    assert.deepEqual(px(img, 256, 256), [128, 128, 128, 255]);
    assert.equal(px(img, 2, 2)[3], 0);
  }
});

// ---- The SVG reader --------------------------------------------------------------

test("<metadata>, <title> and <desc> are ignored, whatever is in them", () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- a comment with <text> and a > in it -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-note="a > b" width="16" height="16" viewBox="0 0 16 16">
  <title>An icon <b>with</b> markup</title>
  <desc>Described &amp; explained</desc>
  <metadata id="m">{"layers":[{"d":"M0 0A1 1 0 0 1 2 2"}], "text": "a > b"} <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description about="x"/></rdf:RDF></metadata>
  <metadata/>
  <rect width="8" height="16"/>
</svg>`;
  assert.equal(px(pixel(svg), 2, 2)[3], 255);
  assert.equal(px(pixel(svg), 12, 2)[3], 0);
});
test("attribute values may contain > and use either quote", () => {
  const svg = square(`<rect width='8' height="16" data-x="a>b" id='x"y'/>`);
  assert.equal(px(pixel(svg), 2, 2)[3], 255);
});
test("an element with display=none is not drawn", () => {
  const svg = square('<g display="none"><rect width="16" height="16"/></g><rect display="none" width="16" height="16"/><g display="inline"><rect width="4" height="4"/></g>');
  assert.equal(px(pixel(svg), 2, 2)[3], 255);
  assert.equal(px(pixel(svg), 10, 10)[3], 0);
});
test("harmless attributes are ignored", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="64" height="64" viewBox="0 0 16 16" shape-rendering="crispEdges" data-x="1"><g id="a" data-name="Layer"><rect id="b" width="8" height="8" class="c" aria-label="x"/></g></svg>';
  assert.equal(px(pixel(svg), 2, 2)[3], 255);
});
test("unsupported elements are named", () => {
  for (const element of ["text", "use", "image", "line", "polyline", "defs", "style", "clipPath", "linearGradient", "mask", "symbol", "foreignObject", "switch", "a"])
    assert.throws(() => pixel(square(`<${element}/>`)), new RegExp(`<${element}>`), element);
  assert.throws(() => pixel(square("<g><g><text>hi</text></g></g>")), /<text>/);
  assert.throws(() => pixel(square('<svg viewBox="0 0 1 1"/>')), /<svg>/);
});
test("unsupported attributes are named", () => {
  const refused = (attributes, name) => assert.throws(() => pixel(square(`<rect width="4" height="4" ${attributes}/>`)), new RegExp(name), name);
  refused('style="fill:red"', "style");
  refused('clip-path="url(#c)"', "clip-path");
  refused('mask="url(#m)"', "mask");
  refused('filter="url(#f)"', "filter");
  refused('stroke-dasharray="2 1"', "stroke-dasharray");
  refused('stroke-linecap="round"', "stroke-linecap");
  refused('stroke-opacity=".5"', "stroke-opacity");
  refused('rx="2"', "rx");
  refused('visibility="hidden"', "visibility");
  refused('inkscape:label="x"', "inkscape:label");
  refused('display="block"', "display");
  refused('fill-rule="inherit"', "fill-rule");
});
test("unsupported attribute values are named", () => {
  assert.throws(() => pixel(square('<rect width="4" height="4" fill="red"/>')), /red/);
  assert.throws(() => pixel(square('<rect width="4" height="4" fill="url(#g)"/>')), /url\(#g\)/);
  assert.throws(() => pixel(square('<rect width="4" height="4" fill="#12345"/>')), /#12345/);
  assert.throws(() => pixel(square('<rect width="4" height="4" fill="currentColor"/>')), /currentColor/);
  assert.throws(() => pixel(square('<rect width="4" height="4" transform="rotate(45)"/>')), /rotate/);
  assert.throws(() => pixel(square('<rect width="4" height="4" transform="skewX(3)"/>')), /skewX/);
  assert.throws(() => pixel(square('<rect width="4" height="4" transform="translate(1"/>')), /transform/);
  assert.throws(() => pixel(square('<rect width="4" height="4" stroke="#000" stroke-linejoin="arcs"/>')), /stroke-linejoin.*arcs/);
  assert.throws(() => pixel(square('<rect width="4" height="4" stroke="#000" stroke-linejoin="miter-clip"/>')), /stroke-linejoin.*miter-clip/);
  assert.throws(() => pixel(square('<rect width="4" height="4" stroke="#000" stroke-linejoin="inherit"/>')), /stroke-linejoin/);
  assert.throws(() => pixel(square('<rect width="4" height="4" stroke="#000" stroke-miterlimit="0.5"/>')), /stroke-miterlimit/);
  assert.throws(() => pixel(square('<rect width="4" height="4" stroke="#000" stroke-miterlimit="4px"/>')), /stroke-miterlimit/);
  assert.throws(() => pixel(square('<rect width="4" height="4" width="4px"/>')), /width/);
  assert.throws(() => pixel(square('<rect width="50%" height="4"/>')), /50%/);
  assert.throws(() => pixel(square('<rect width="4" height="4" opacity="2"/>')), /opacity/);
  assert.throws(() => pixel(square('<rect width="4" height="4" stroke="#000" stroke-width="-1"/>')), /stroke-width/);
  assert.throws(() => pixel(square('<polygon points="1,2 3"/>')), /points/);
});
test("unsupported path data is named", () => {
  for (const command of ["A", "a"])
    assert.throws(() => pixel(square(`<path d="M0 0${command}4 4 0 0 1 8 8"/>`)), new RegExp(`\\b${command}\\b`), command);
  assert.throws(() => pixel(square('<path d="M0 0B4 4"/>')), /\bB\b/);
  assert.throws(() => pixel(square('<path d="L0 0 4 4"/>')), /start with M/);
  assert.throws(() => pixel(square('<path d="M0 0 L4"/>')), /\bL\b/);
  assert.throws(() => pixel(square('<path d="M0 0 C1 1 2 2 3"/>')), /\bC\b/);
  assert.throws(() => pixel(square('<path d="M0 0 H"/>')), /\bH\b/);
  assert.throws(() => pixel(square('<path d="M0 0 Z 4"/>')), /number/);
  assert.throws(() => pixel(square('<path d="M0 0 L4 4 #"/>')), /#/);
  assert.throws(() => pixel(square('<path d="M0 0 L1e999 4"/>')), /number/);
  assert.equal(pixel(square('<path d=""/>')).data.every((v) => v === 0), true);
});
test("a document the reader cannot make sense of is refused", () => {
  assert.throws(() => pixel('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'), /viewBox/);
  assert.throws(() => pixel('<svg viewBox="0 0 0 16"></svg>'), /viewBox/);
  assert.throws(() => pixel('<svg viewBox="0 0 16"></svg>'), /viewBox/);
  assert.throws(() => pixel("<html></html>"), /<svg>/);
  assert.throws(() => pixel(""), /<svg>/);
  assert.throws(() => pixel(square("<g></rect>")), /rect/);
  assert.throws(() => pixel('<svg viewBox="0 0 16 16"><g>'), /g/);
  assert.throws(() => pixel('<svg viewBox="0 0 16 16"><rect width="4" height="4"'), /rect|SVG/);
  assert.throws(() => pixel('<svg viewBox="0 0 16 16"><rect width=4 height="4"/></svg>'), /width/);
});
test("rasterize checks its arguments", () => {
  const svg = square("");
  assert.throws(() => g.rasterize(svg, 16, { style: "fancy" }), /style/);
  assert.throws(() => g.rasterize(svg, 16, {}), /style/);
  assert.throws(() => g.rasterize(svg, 16), /style/);
  assert.throws(() => g.rasterize(svg, 0, { style: "pixel" }), /size/);
  assert.throws(() => g.rasterize(svg, 2.5, { style: "pixel" }), /size/);
  assert.throws(() => g.rasterize(svg, -4, { style: "pixel" }), /size/);
});

// ---- documentSvg ------------------------------------------------------------------

test("documentSvg is a page with the icon at half size on it", () => {
  const document = g.documentSvg(square('<rect width="16" height="16" fill="#f00"/>'));
  assert.match(document, /^<svg /);
  const img = pixel(document);
  assert.deepEqual(px(img, 8, 9), [255, 0, 0, 255]);        // the icon: x 4..12, y 5.5..13.5
  assert.deepEqual(px(img, 8, 2), [255, 255, 255, 255]);    // the white page above it
  assert.deepEqual(px(img, 11, 2), [192, 192, 192, 255]);   // the folded corner
  assert.deepEqual(px(img, 3, 8), [0, 0, 0, 255]);          // the page's black outline
  assert.equal(px(img, 0, 8)[3], 0);
  assert.equal(px(img, 15, 8)[3], 0);
  assert.equal(px(img, 8, 15)[3], 255);                      // the page reaches the bottom
  assert.equal(px(img, 12, 1)[3], 0);                        // the cut-off corner
});
test("documentSvg fits any icon into the same place", () => {
  const big = g.documentSvg(square('<rect width="64" height="64" fill="#f00"/>', "0 0 64 64"));
  assert.deepEqual(pixel(big).data, pixel(g.documentSvg(square('<rect width="16" height="16" fill="#f00"/>'))).data);
  const offset = g.documentSvg(square('<rect x="100" y="50" width="16" height="16" fill="#f00"/>', "100 50 16 16"));
  assert.deepEqual(pixel(offset).data, pixel(big).data);
  const wide = pixel(g.documentSvg(square('<rect width="32" height="16" fill="#f00"/>', "0 0 32 16")), 32);
  assert.deepEqual(px(wide, 16, 18), [255, 0, 0, 255]);      // centred in its 8 x 8 box: y 7.5..11.5 -> 15..23 px
  assert.deepEqual(px(wide, 16, 13), [255, 255, 255, 255]);  // above it the page shows
  assert.deepEqual(px(wide, 16, 24), [255, 255, 255, 255]);  // and below it
});
test("documentSvg keeps what the icon sets on its <svg> and drops what only sizes it", () => {
  const icon = `<?xml version="1.0"?>
<!-- generated -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 16 16" fill="#00f" stroke="#000" stroke-width="2" data-x="1"><metadata>x</metadata><rect width="16" height="16"/></svg>
`;
  const document = g.documentSvg(icon);
  assert.doesNotMatch(document, /generated|<\?xml|width="512"/);
  const img = smooth(document, 64);
  assert.deepEqual(px(img, 32, 36), [0, 0, 255, 255]);
  // The 2-unit outline of the icon is a 1-unit one on the page: x 4..12 is the icon, its outline reaches 0.5 outside.
  assert.deepEqual(px(img, 16, 36), [0, 0, 0, 255]);         // x = 4 -> 16 px, on the outline
});
test("documentSvg starts the page from SVG's defaults", () => {
  // The page itself sets fill="none" and so on; the icon must not inherit them.
  const img = pixel(g.documentSvg(square('<rect width="16" height="16"/>')));
  assert.deepEqual(px(img, 8, 9), [0, 0, 0, 255]);
  // The page has round joins, but the picture on it joins like the picture alone: with miters.
  const line = (root) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" ${root}><path d="M2 12L8 4L14 12" fill="none" stroke="#000" stroke-width="4"/></svg>`;
  const onPage = (root) => smooth(g.documentSvg(line(root)), 128).data;
  assert.deepEqual(onPage(""), onPage('stroke-linejoin="miter"'));
  assert.notDeepEqual(onPage(""), onPage('stroke-linejoin="round"'));
  assert.deepEqual(onPage('stroke-miterlimit="2"'), onPage('stroke-miterlimit="2" stroke-linejoin="miter"'));
  assert.notDeepEqual(onPage(""), onPage('stroke-miterlimit="1"'));
});
test("documentSvg refuses something that is not an SVG", () => {
  assert.throws(() => g.documentSvg("<html/>"), /<svg>/);
  assert.throws(() => g.documentSvg(""), /<svg>/);
  assert.throws(() => g.documentSvg('<svg viewBox="0 0 16 16"><g>'), /svg/);
  assert.throws(() => g.documentSvg('<svg width="16"></svg>'), /viewBox/);
});
test("documentSvg passes on what the reader cannot draw", () => {
  const document = g.documentSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="fill:red"><rect width="4" height="4"/></svg>');
  assert.throws(() => pixel(document), /style/);
  assert.throws(() => pixel(g.documentSvg(square("<text/>"))), /<text>/);
});

// ---- Encoders -----------------------------------------------------------------------

test("encodePng writes a valid RGBA PNG", () => {
  const image = gradient(24);
  const decoded = decodePng(g.encodePng(image));
  assert.equal(decoded.width, 24);
  assert.equal(decoded.height, 24);
  assert.deepEqual(decoded.data, image.data);
  const wide = { width: 3, height: 2, data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) };
  assert.deepEqual(decodePng(g.encodePng(wide)), wide);
  assert.throws(() => g.encodePng({ width: 3, height: 2, data: new Uint8Array(5) }), /data/);
});
test("encodePng handles a 1024 px picture", () => {
  const decoded = decodePng(g.encodePng(pixel(square('<rect width="9" height="16" fill="#2468ac"/>'), 1024)));
  assert.equal(decoded.width, 1024);
  assert.deepEqual(px(decoded, 100, 100), [0x24, 0x68, 0xac, 255]);
});
test("encodeIco holds PNG images of 16 to 256 px", () => {
  const asked = [];
  const ico = g.encodeIco((size) => (asked.push(size), gradient(size)));
  assert.deepEqual([...new Set(asked)].sort((a, b) => a - b), [16, 24, 32, 48, 64, 128, 256]);
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 7]);
  let end = 6 + 7 * 16;
  [16, 24, 32, 48, 64, 128, 256].forEach((size, i) => {
    const entry = 6 + i * 16;
    assert.equal(ico[entry], size === 256 ? 0 : size);
    assert.equal(ico[entry + 1], size === 256 ? 0 : size);
    assert.equal(ico.readUInt16LE(entry + 4), 1);
    assert.equal(ico.readUInt16LE(entry + 6), 32);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.equal(offset, end);
    end += length;
    const decoded = decodePng(ico.subarray(offset, offset + length));
    assert.equal(decoded.width, size);
    assert.deepEqual(decoded.data, gradient(size).data);
  });
  assert.equal(end, ico.length);
});
test("encodeIcns holds the sizes macOS expects", () => {
  const entries = icnsEntries(g.encodeIcns(gradient));
  assert.deepEqual(entries.map((entry) => entry.type), ["ic04", "ic05", "ic11", "ic12", "ic07", "ic13", "ic08", "ic14", "ic09", "ic10"]);
  const sizes = { ic04: 16, ic05: 32, ic11: 32, ic12: 64, ic07: 128, ic13: 256, ic08: 256, ic14: 512, ic09: 512, ic10: 1024 };
  for (const { type, body } of entries) {
    const size = sizes[type];
    const decoded = type === "ic04" || type === "ic05" ? decodeArgb(body, size) : decodePng(body);
    assert.equal(decoded.width, size, type);
    assert.deepEqual(decoded.data, gradient(size).data, type);
  }
});
test("encodeIcns compresses long runs and keeps short ones", () => {
  const flat = (size) => ({ width: size, height: size, data: new Uint8Array(size * size * 4).fill(7) });
  const entries = icnsEntries(g.encodeIcns(flat));
  assert.deepEqual(decodeArgb(entries[0].body, 16).data, flat(16).data);
  assert.ok(entries[1].body.length < 100);
  const noisy = (size) => ({ width: size, height: size, data: Uint8Array.from({ length: size * size * 4 }, (_, i) => (i * 37 + (i >> 3)) & 0xff) });
  assert.deepEqual(decodeArgb(icnsEntries(g.encodeIcns(noisy))[1].body, 32).data, noisy(32).data);
});

// ---- readIconList ---------------------------------------------------------------------

test("readIconList reads the icons of a manifest", async () => {
  assert.deepEqual(await g.readIconList(fixture("icons")), [
    { name: "app", svg: "app.svg", style: "pixel" },
    { name: "doc", svg: "app.svg", style: "pixel", document: true },
  ]);
  const full = { name: "a-1", svg: "art/icon.svg", style: "pixel", document: false, master: 64 };
  assert.deepEqual(await g.readIconList(repoWith({ icons: [full, { name: "b", svg: "b.svg", style: "smooth" }] })), [full, { name: "b", svg: "b.svg", style: "smooth" }]);
});
test("readIconList: no icons key means no icons, and the manifest stays valid for gui95-app", async () => {
  assert.deepEqual(await g.readIconList(fixture("valid")), []);
  assert.deepEqual(await g.readIconList(repoWith({ icons: [] })), []);
  assert.equal((await readManifest(fixture("icons"))).apps.length, 1);
});
test("readIconList reports what is wrong, starting with the field", async () => {
  const bad = (icons, pattern) => assert.rejects(g.readIconList(repoWith({ icons })), pattern);
  await bad("app", /^Error: gui95-app\.json: icons must be an array/);
  await bad({}, /^Error: gui95-app\.json: icons must be an array/);
  await bad(["app"], /^Error: gui95-app\.json: icons\[0\] must be an object/);
  await bad([null], /^Error: gui95-app\.json: icons\[0\] must be an object/);
  await bad([{ svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: "", svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: "App", svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: "-a", svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: "a b", svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: "../a", svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: 4, svg: "a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.name/);
  await bad([{ name: "a", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: "  ", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: 5, style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: "/etc/a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: "C:\\a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: "../a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: "x/../../a.svg", style: "pixel" }], /^Error: gui95-app\.json: icons\[0\]\.svg/);
  await bad([{ name: "a", svg: "a.svg" }], /^Error: gui95-app\.json: icons\[0\]\.style/);
  await bad([{ name: "a", svg: "a.svg", style: "Pixel" }], /^Error: gui95-app\.json: icons\[0\]\.style/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel", document: "yes" }], /^Error: gui95-app\.json: icons\[0\]\.document/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel", master: 24 }], /^Error: gui95-app\.json: icons\[0\]\.master/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel", master: 32.5 }], /^Error: gui95-app\.json: icons\[0\]\.master/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel", master: "32" }], /^Error: gui95-app\.json: icons\[0\]\.master/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel", master: 2048 }], /^Error: gui95-app\.json: icons\[0\]\.master/);
  await bad([{ name: "a", svg: "a.svg", style: "smooth", master: 32 }], /^Error: gui95-app\.json: icons\[0\]\.master/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel" }, { name: "b", svg: "b.svg", style: "fancy" }], /icons\[1\]\.style/);
  await bad([{ name: "a", svg: "a.svg", style: "pixel" }, { name: "a", svg: "b.svg", style: "pixel" }], /icons\[1\]\.name.*icons\[0\]/);
});
test("readIconList reports a manifest it cannot read", async () => {
  await assert.rejects(g.readIconList(tempDir()), /^Error: gui95-app\.json: cannot read it/);
  await assert.rejects(g.readIconList(repoWith("{ not json")), /^Error: gui95-app\.json: cannot read it/);
  await assert.rejects(g.readIconList(repoWith("[]")), /^Error: gui95-app\.json: .*object/);
  assert.deepEqual(await g.readIconList(repoWith("\ufeff" + JSON.stringify({ icons: [] }))), []);
});

// ---- generateIcons ----------------------------------------------------------------------

test("generateIcons writes the pictures for each icon and returns their paths", async (t) => {
  const repo = await iconRepo(t);
  const lines = [];
  const written = await g.generateIcons(repo, { log: (line) => lines.push(line) });
  const names = ["app.png", "app.ico", "app.icns", "doc.png", "doc.ico", "doc.icns"];
  assert.deepEqual(written, names.map((name) => path.join(repo, "gui95-icons", name)));
  assert.deepEqual(fs.readdirSync(path.join(repo, "gui95-icons")).sort(), [...names].sort());
  assert.equal(lines.length, 2);
  assert.match(lines[0], /app/);
  assert.match(lines[1], /doc/);
  for (const line of lines) assert.ok(!line.includes(repo), line);
  const png = decodePng(await readFile(written[0]));
  assert.equal(png.width, 1024);
  assert.equal(png.height, 1024);
  const ico = await readFile(written[1]);
  assert.equal(ico.readUInt16LE(4), 7);
  const icns = icnsEntries(await readFile(written[2]));
  assert.equal(icns.length, 10);
  assert.equal(decodePng(icns.at(-1).body).width, 1024);
});
test("generateIcons: pixel style draws the small sizes and enlarges the master", async (t) => {
  const repo = await iconRepo(t);
  await g.generateIcons(repo, { log() {} });
  const svg = fs.readFileSync(path.join(repo, "app.svg"), "utf8");
  const drawn = (size) => g.rasterize(svg, size, { style: "pixel" });
  const ico = await readFile(path.join(repo, "gui95-icons", "app.ico"));
  const images = icoImages(ico);
  const at = (i) => images[i];
  for (const [i, size] of [16, 24, 32, 48].entries()) assert.deepEqual(at(i).data, drawn(size).data, `${size} px is drawn directly`);
  const enlarged = (factor) => {
    const small = drawn(32);
    const large = { width: 32 * factor, height: 32 * factor, data: new Uint8Array(32 * factor * 32 * factor * 4) };
    for (let y = 0; y < large.height; y++)
      for (let x = 0; x < large.width; x++) large.data.set(small.data.subarray(((y / factor | 0) * 32 + (x / factor | 0)) * 4, ((y / factor | 0) * 32 + (x / factor | 0)) * 4 + 4), (y * large.width + x) * 4);
    return large;
  };
  assert.deepEqual(at(4).data, enlarged(2).data, "64 px enlarges the 32 px drawing");
  assert.deepEqual(at(5).data, enlarged(4).data);
  assert.deepEqual(at(6).data, enlarged(8).data);
  const png = decodePng(await readFile(path.join(repo, "gui95-icons", "app.png")));
  assert.deepEqual(png.data, enlarged(32).data);
});
test("generateIcons: the document icon has the icon on a page", async (t) => {
  const repo = await iconRepo(t);
  await g.generateIcons(repo, { log() {} });
  const app = decodePng(await readFile(path.join(repo, "gui95-icons", "app.png")));
  const doc = decodePng(await readFile(path.join(repo, "gui95-icons", "doc.png")));
  assert.notDeepEqual(app.data, doc.data);
  assert.deepEqual(px(doc, 512, 100), [255, 255, 255, 255]);  // the page's white, near its top
  assert.equal(px(doc, 5, 512)[3], 0);                         // beside the page
});
test("generateIcons: smooth antialiases every size, pixel stays hard at every size", async (t) => {
  const repo = repoWith(
    { icons: [{ name: "round", svg: "art/round.svg", style: "smooth" }, { name: "big", svg: "art/round.svg", style: "pixel", master: 64 }] },
    { "art/round.svg": square('<circle cx="8" cy="8" r="7.3" fill="#c03020"/>') },
  );
  const written = await g.generateIcons(repo, { log() {} });
  assert.equal(written.length, 6);
  const png = decodePng(await readFile(path.join(repo, "gui95-icons", "round.png")));
  assert.deepEqual(png.data, smooth(square('<circle cx="8" cy="8" r="7.3" fill="#c03020"/>'), 1024).data);
  const partial = new Set();
  for (let x = 0; x < 1024; x++) partial.add(px(png, x, 512)[3]);
  assert.ok(partial.size >= 2 && partial.has(255) && partial.has(0) && [...partial].some((a) => a > 0 && a < 255));
  const ico = await readFile(path.join(repo, "gui95-icons", "round.ico"));
  assert.ok(icoImages(ico).every((image) => image.data.some((v, j) => j % 4 === 3 && v > 0 && v < 255)), "every size is antialiased");
  const hard = decodePng(await readFile(path.join(repo, "gui95-icons", "big.png")));
  assert.ok(hard.data.every((v, j) => j % 4 !== 3 || v === 0 || v === 255));
});
test("generateIcons: pixel style with a small master draws 24, 32 and 48 directly", async (t) => {
  const svg = square('<rect x="1.5" y="1.5" width="13" height="13" fill="#5ec8ff" stroke="#000"/>');
  const repo = repoWith({ icons: [{ name: "a", svg: "a.svg", style: "pixel", master: 16 }] }, { "a.svg": svg });
  await g.generateIcons(repo, { log() {} });
  const ico = await readFile(path.join(repo, "gui95-icons", "a.ico"));
  const images = icoImages(ico);
  const at = (i) => images[i];
  for (const [i, size] of [16, 24, 32, 48].entries()) assert.deepEqual(at(i).data, pixel(svg, size).data, `${size}`);
  const sixteen = pixel(svg, 16);
  const sixtyFour = at(4);
  assert.deepEqual(px(sixtyFour, 20, 20), px(sixteen, 5, 5));
  assert.deepEqual(px(sixtyFour, 23, 23), px(sixteen, 5, 5));
  assert.deepEqual(px(sixtyFour, 24, 24), px(sixteen, 6, 6));
});
test("generateIcons with no icons writes nothing", async (t) => {
  const repo = repoWith({ apps: [] });
  const lines = [];
  assert.deepEqual(await g.generateIcons(repo, { log: (line) => lines.push(line) }), []);
  assert.equal(fs.existsSync(path.join(repo, "gui95-icons")), false);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /icons/);
});
test("generateIcons says which icon it could not draw", async () => {
  const unreadable = repoWith({ icons: [{ name: "a", svg: "missing.svg", style: "pixel" }] });
  await assert.rejects(g.generateIcons(unreadable, { log() {} }), /icons\[0\]\.svg.*missing\.svg/);
  const unsupported = repoWith({ icons: [{ name: "a", svg: "a.svg", style: "pixel" }, { name: "b", svg: "b.svg", style: "pixel" }] }, { "a.svg": square(""), "b.svg": square("<text>x</text>") });
  await assert.rejects(g.generateIcons(unsupported, { log() {} }), /icons\[1\].*b\.svg.*<text>/);
  assert.equal(fs.existsSync(path.join(unsupported, "gui95-icons", "b.png")), false);
  await assert.rejects(g.generateIcons(fixture("icons-bad-style"), { log() {} }), /icons\[0\]\.style/);
});
test("generateIcons overwrites earlier output and leaves other files alone", async (t) => {
  const repo = await iconRepo(t);
  fs.mkdirSync(path.join(repo, "gui95-icons"));
  fs.writeFileSync(path.join(repo, "gui95-icons", "app.png"), "old");
  fs.writeFileSync(path.join(repo, "gui95-icons", "keep.txt"), "kept");
  await g.generateIcons(repo, { log() {} });
  assert.equal(decodePng(await readFile(path.join(repo, "gui95-icons", "app.png"))).width, 1024);
  assert.equal(fs.readFileSync(path.join(repo, "gui95-icons", "keep.txt"), "utf8"), "kept");
});
test("generateIcons logs to the console unless told otherwise", async (t) => {
  const repo = await iconRepo(t);
  const original = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try { await g.generateIcons(repo); } finally { console.log = original; }
  assert.equal(lines.length, 2);
});

// ---- Command line ------------------------------------------------------------------------

const script = path.join(import.meta.dirname, "..", "gui95-icons.mjs");
function run(cwd, ...args) {
  return childProcess.spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

test("command line: generates the icons of the repository it is run in", async (t) => {
  const repo = await iconRepo(t);
  const result = run(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(fs.readdirSync(path.join(repo, "gui95-icons")).length, 6);
  assert.match(result.stdout, /app/);
});
test("command line: a failure exits 1 with the message on stderr", async () => {
  const repo = repoWith({ icons: [{ name: "a", svg: "a.svg", style: "pixel" }] }, { "a.svg": square("<text/>") });
  const result = run(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /<text>/);
  assert.equal(result.stdout, "");
  const none = run(tempDir());
  assert.equal(none.status, 1);
  assert.match(none.stderr, /^gui95-app\.json: cannot read it/);
});
test("importing the module runs nothing", () => {
  const result = childProcess.spawnSync(process.execPath, ["--input-type=module", "-e", `import ${JSON.stringify(pathToFileURL(script).href)}; console.log("loaded")`], { cwd: tempDir(), encoding: "utf8" });
  assert.equal(result.stdout.trim(), "loaded");
  assert.equal(result.status, 0, result.stderr);
});
