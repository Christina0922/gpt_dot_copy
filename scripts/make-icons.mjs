import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "extension", "icons");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function roundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || y < top || x > right || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function png(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 128;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / scale;
      const ny = y / scale;
      const center = (nx - 64) ** 2 + (ny - 64) ** 2 <= 58 ** 2;
      let color = [0, 0, 0, 0];
      if (center) color = [15, 118, 110, 255];
      const back = roundedRect(nx, ny, 34, 30, 96, 92, 10);
      const front = roundedRect(nx, ny, 28, 40, 90, 102, 10);
      if (back) color = [204, 251, 241, 255];
      if (front) color = [255, 255, 255, 255];
      if (front && ny > 58 && ny < 62 && nx > 40 && nx < 76) color = [15, 118, 110, 255];
      if (front && ny > 70 && ny < 74 && nx > 40 && nx < 70) color = [15, 118, 110, 255];
      if (front && ny > 82 && ny < 86 && nx > 40 && nx < 64) color = [15, 118, 110, 255];
      const offset = (y * size + x) * 4;
      pixels.set(color, offset);
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

mkdirSync(root, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(root, `icon${size}.png`), png(size));
}
