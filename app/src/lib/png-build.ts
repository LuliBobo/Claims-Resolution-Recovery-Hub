import { crc32, deflateSync } from "node:zlib";

// Tiny PNG writer for the synthetic demo photos. Flat shapes only: these are clearly placeholder
// images, not pretending to be real evidence.

export type Rgb = [number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** width x height RGB image; `pixel(x, y)` returns each pixel's colour. */
export function buildPng(width: number, height: number, pixel: (x: number, y: number) => Rgb): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const W = 320;
const H = 200;

/** A cream background with a dark jagged crack: stands in for a broken vase. */
export const demoBrokenItemPng = () =>
  buildPng(W, H, (x, y) => {
    const crack = Math.abs(x - (W / 2 + Math.sin(y / 9) * 28 + (y % 17) - 8)) < 2.5;
    const vase = Math.abs(x - W / 2) < 46 - Math.abs(y - H * 0.55) / 4 && y > 25 && y < 185;
    return crack && vase ? [40, 30, 30] : vase ? [196, 217, 232] : [244, 236, 220];
  });

/** White label with a barcode-like run of bars. */
export const demoShippingLabelPng = () =>
  buildPng(W, H, (x, y) => {
    const bars = y > 70 && y < 150 && x > 30 && x < W - 30 && Math.floor(x / 3 + (x % 7)) % 3 !== 0;
    const header = y < 30 && x > 20 && x < W - 20;
    return bars || header ? [20, 20, 20] : [250, 250, 250];
  });

/** Brown carton with a lighter tape stripe. */
export const demoCartonPng = () =>
  buildPng(W, H, (x, y) => {
    const tape = Math.abs(x - W / 2) < 18;
    const dent = (x - 230) ** 2 + (y - 120) ** 2 < 24 ** 2;
    return dent ? [120, 85, 50] : tape ? [226, 200, 150] : [176, 132, 84];
  });
