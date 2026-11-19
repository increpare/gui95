// Minimal image helpers for the reference pipeline: PNG (8-bit RGB or RGBA, non-interlaced) and binary PPM.
// Images are { width, height, data } with data an RGBA Buffer.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const chunk = (name, body) => { const head = Buffer.alloc(8), tail = Buffer.alloc(4); head.writeUInt32BE(body.length, 0); head.write(name, 4, 'latin1'); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0); return Buffer.concat([head, body, tail]); };

/** Decode a PNG. Returns the pixels and any tEXt entries as `text`. */
export function decodePng(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file.');
  let offset = 8, width, height, depth, type, interlace; const idat = [], text = {};
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), name = bytes.toString('latin1', offset + 4, offset + 8), body = bytes.subarray(offset + 8, offset + 8 + length);
    if (name === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'tEXt') { const split = body.indexOf(0); text[body.toString('latin1', 0, split)] = body.toString('latin1', split + 1); }
    else if (name === 'IEND') break;
    offset += 12 + length;
  }
  const channels = { 2: 3, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`Unsupported PNG format (bit depth ${depth}, colour type ${type}, interlace ${interlace}).`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, rows = Buffer.alloc(stride * height), data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = rows.subarray(y * stride, (y + 1) * stride), up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, b = up ? up[x] : 0, c = up && x >= channels ? up[x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predictor === undefined) throw new Error('Invalid PNG filter.');
      row[x] = (line[x] + predictor) & 255;
    }
  }
  for (let i = 0; i < width * height; i++) for (let k = 0; k < 4; k++) data[i * 4 + k] = k < channels ? rows[i * channels + k] : 255;
  return { width, height, data, text };
}

/** Encode RGBA pixels as an RGB PNG (alpha is dropped). `text` entries become tEXt chunks, which say where the image came from. */
export function encodePng({ width, height, data }, text = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0, o = 0; y < height; y++) { o++; for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; raw[o++] = data[i]; raw[o++] = data[i + 1]; raw[o++] = data[i + 2]; } }
  const notes = Object.entries(text).map(([key, value]) => chunk('tEXt', Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(String(value), 'latin1')])));
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...notes, chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Decode a binary PPM (P6, maximum value 255), the format of QEMU's screen dump. */
export function decodePpm(bytes) {
  let offset = 0; const fields = [];
  while (fields.length < 4) {
    while (offset < bytes.length && /\s/.test(String.fromCharCode(bytes[offset]))) offset++;
    if (bytes[offset] === 0x23) { while (offset < bytes.length && bytes[offset] !== 0x0a) offset++; continue; }
    let end = offset; while (end < bytes.length && !/\s/.test(String.fromCharCode(bytes[end]))) end++;
    if (end === offset) throw new Error('Truncated PPM header.');
    fields.push(bytes.toString('latin1', offset, end)); offset = end;
  }
  offset++;   // exactly one whitespace byte separates the header from the pixels
  const [magic, width, height, max] = [fields[0], +fields[1], +fields[2], +fields[3]];
  if (magic !== 'P6' || max !== 255) throw new Error(`Unsupported PPM (${magic}, maximum ${max}).`);
  if (bytes.length - offset < width * height * 3) throw new Error('Truncated PPM pixel data.');
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) { data[i * 4] = bytes[offset + i * 3]; data[i * 4 + 1] = bytes[offset + i * 3 + 1]; data[i * 4 + 2] = bytes[offset + i * 3 + 2]; }
  return { width, height, data };
}

export const pixel = (image, x, y) => { const i = (y * image.width + x) * 4; return [image.data[i], image.data[i + 1], image.data[i + 2]]; };
export const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

/** Copy a rectangle out of an image; parts outside the image are transparent black. */
export function crop(image, x, y, width, height) {
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const sx = x + col, sy = y + row;
    if (sx >= 0 && sy >= 0 && sx < image.width && sy < image.height) image.data.copy(data, (row * width + col) * 4, (sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4);
  }
  return { width, height, data };
}

export const sameImage = (a, b) => a.width === b.width && a.height === b.height && a.data.equals(b.data);
