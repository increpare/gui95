// Renders components/atlas.html in headless Chromium and compares it, pixel for pixel, with the stored baseline.
// A headless-Chromium rendering regression check of what gui95.css paints; it is not Windows 95 fidelity proof.
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const kitRoot = fileURLToPath(new URL('../', import.meta.url));
export const ATLAS_PAGE = path.join(kitRoot, 'components', 'atlas.html');
export const BASELINE = path.join(kitRoot, 'test', 'baseline', 'state-atlas.png');
/** The atlas grid is exactly this size; the page is captured at device scale factor 1. */
export const VIEWPORT = Object.freeze({ width: 809, height: 442 });
export const UPDATE_HINT = 'After reviewing the difference image, run `node kit/verify/atlas.mjs --update` to accept an intended change.';

/** Serve only the atlas page and the stylesheet. `stylesheet` replaces gui95.css (used to prove that changes are detected). */
async function serve(stylesheet) {
  const css = stylesheet ?? await readFile(path.join(kitRoot, 'components', 'gui95.css'), 'utf8');
  const html = await readFile(ATLAS_PAGE, 'utf8');
  const server = createServer((req, res) => {
    const route = req.url.split('?')[0];
    if (route === '/atlas.html') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); }
    else if (route === '/gui95.css') { res.setHeader('content-type', 'text/css; charset=utf-8'); res.end(css); }
    else res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/atlas.html`, close: () => new Promise(resolve => server.close(resolve)) };
}

/** Open the atlas in a fresh page at device scale factor 1. Call close() when done. */
export async function openAtlas({ stylesheet, browser } = {}) {
  const own = !browser;
  // A fixed sRGB output keeps the screenshot independent of the machine's display colour profile.
  browser ??= await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  const site = await serve(stylesheet);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const close = async () => { await context.close(); await site.close(); if (own) await browser.close(); };
  try {
    await page.goto(site.url);
    // The highlighted menu item is drawn by :focus; wait for its autofocus to land before capturing.
    await page.waitForFunction(() => document.activeElement?.hasAttribute('autofocus'));
    return { page, close };
  } catch (error) { await close(); throw error; }
}

/** Render the atlas and return its PNG bytes. */
export async function renderAtlas(options = {}) {
  const { page, close } = await openAtlas(options);
  try { return await page.screenshot({ animations: 'disabled', caret: 'hide' }); } finally { await close(); }
}

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG to RGBA pixels. */
export function decodePng(bytes) {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file.');
  let offset = 8, width, height, depth, type, interlace;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), name = bytes.toString('latin1', offset + 4, offset + 8), body = bytes.subarray(offset + 8, offset + 8 + length);
    if (name === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    offset += 12 + length;
  }
  const channels = { 2: 3, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`Unsupported PNG format (bit depth ${depth}, colour type ${type}, interlace ${interlace}).`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, rows = Buffer.alloc(stride * height), data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = rows.subarray(y * stride, (y + 1) * stride), up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0, b = up ? up[x] : 0, c = up && x >= channels ? up[x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predictor === undefined) throw new Error('Invalid PNG filter.');
      out[x] = (line[x] + predictor) & 255;
    }
  }
  for (let i = 0; i < width * height; i++) for (let k = 0; k < 4; k++) data[i * 4 + k] = k < channels ? rows[i * channels + k] : 255;
  return { width, height, data };
}

const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const chunk = (name, body) => { const head = Buffer.alloc(8), tail = Buffer.alloc(4); head.writeUInt32BE(body.length, 0); head.write(name, 4, 'latin1'); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0); return Buffer.concat([head, body, tail]); };

/** Encode RGBA pixels as a PNG. */
export function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Compare two PNGs exactly. Returns the number of differing pixels, their bounding box and a difference image:
 * unchanged pixels are a faded copy of the expected image, changed pixels are solid magenta.
 */
export function compareImages(expectedBytes, actualBytes) {
  const expected = decodePng(expectedBytes), actual = decodePng(actualBytes);
  const width = Math.max(expected.width, actual.width), height = Math.max(expected.height, actual.height);
  const diff = Buffer.alloc(width * height * 4);
  let different = 0, box = null;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inE = x < expected.width && y < expected.height, inA = x < actual.width && y < actual.height;
    const e = inE ? (y * expected.width + x) * 4 : -1, a = inA ? (y * actual.width + x) * 4 : -1, o = (y * width + x) * 4;
    const same = inE && inA && expected.data.readUInt32BE(e) === actual.data.readUInt32BE(a);
    if (same) { for (let k = 0; k < 3; k++) diff[o + k] = 255 - ((255 - expected.data[e + k]) >> 2); diff[o + 3] = 255; continue; }
    different++; diff[o] = 255; diff[o + 1] = 0; diff[o + 2] = 255; diff[o + 3] = 255;
    box = box ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) } : { left: x, top: y, right: x, bottom: y };
  }
  return { different, box, sameSize: expected.width === actual.width && expected.height === actual.height, expectedSize: [expected.width, expected.height], actualSize: [actual.width, actual.height], diff: encodePng({ width, height, data: diff }) };
}

/**
 * Render the atlas and compare it with the baseline. On a difference, the actual and difference images are written
 * to `output` (default: a new folder in the system temporary directory) and their paths are returned.
 */
export async function checkAtlas({ baseline = BASELINE, output, ...options } = {}) {
  const actual = await renderAtlas(options);
  let stored;
  try { stored = await readFile(baseline); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = stored ? compareImages(stored, actual) : { different: VIEWPORT.width * VIEWPORT.height, box: null, sameSize: false, missing: true };
  if (!result.different) return { status: 'passed', baseline, different: 0 };
  const folder = output ? path.resolve(output) : await mkdtemp(path.join(os.tmpdir(), 'gui95-atlas-'));
  await mkdir(folder, { recursive: true });
  const files = { actual: path.join(folder, 'state-atlas.actual.png') };
  await writeFile(files.actual, actual);
  if (result.diff) { files.diff = path.join(folder, 'state-atlas.diff.png'); await writeFile(files.diff, result.diff); }
  return { status: 'failed', baseline, missing: !!result.missing, different: result.different, box: result.box, sameSize: result.sameSize, output: folder, files };
}

export function describeFailure(report) {
  if (report.status === 'passed') return `The state atlas matches ${report.baseline}.`;
  if (report.missing) return `No baseline at ${report.baseline}. The rendered atlas was written to ${report.files.actual}. Look at it, then run \`node kit/verify/atlas.mjs --update\` to store it as the baseline.`;
  const where = report.box ? ` within x ${report.box.left}–${report.box.right}, y ${report.box.top}–${report.box.bottom}` : '';
  return `The state atlas differs from the baseline in ${report.different} pixel${report.different === 1 ? '' : 's'}${where}${report.sameSize ? '' : ' (the image size changed)'}. Actual: ${report.files.actual}. Difference (changed pixels in magenta): ${report.files.diff}. ${UPDATE_HINT}`;
}

/** Rewrite the baseline from the current rendering. */
export async function updateAtlas({ baseline = BASELINE, ...options } = {}) {
  const png = await renderAtlas(options);
  await mkdir(path.dirname(baseline), { recursive: true });
  await writeFile(baseline, png);
  return { status: 'updated', baseline, bytes: png.length };
}

export async function main(args) {
  const outIndex = args.indexOf('--out'), output = outIndex < 0 ? undefined : args[outIndex + 1];
  if (outIndex >= 0 && (!output || output.startsWith('--'))) { process.stderr.write('Usage: node kit/verify/atlas.mjs [--update] [--out DIRECTORY]\n'); return 2; }
  if (args.includes('--update')) { const report = await updateAtlas(); process.stdout.write(`Baseline written: ${report.baseline}\n`); return 0; }
  const report = await checkAtlas({ output });
  if (report.status === 'passed') { process.stdout.write(`State atlas matches ${report.baseline}\n`); return 0; }
  process.stdout.write(describeFailure(report) + '\nOutput folder: ' + report.output + '\n');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 2; }
}
