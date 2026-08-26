/**
 * Benchmarks shelf-atlas KTX2 encoding on a single representative atlas so
 * encoder tuning iterates in seconds instead of full-library scans.
 *
 * Usage: bun run scripts/bench-atlas-encode.ts [concurrentTasks]
 */
import sharp from "sharp";
import {encodeToKTX2} from "ktx2-encoder";

import {encodeShelfAtlasPng} from "~/content/shelfAtlasKtx2Pool";

const WIDTH = 3072;
const HEIGHT = 3456;
const CELLS = 48;

const buildSyntheticAtlas = async (): Promise<Buffer> => {
  const cells = Array.from({length: CELLS}, (_, index) => {
    const hue = (index * 47) % 360;
    return {
      input: Buffer.from(
        `<svg width="384" height="576">` +
          `<rect width="384" height="576" fill="hsl(${hue},55%,${35 + (index % 4) * 10}%)"/>` +
          `<rect x="12" y="24" width="360" height="120" fill="hsl(${hue},70%,70%)"/>` +
          `<text x="28" y="90" font-size="44" fill="#fff" font-family="sans-serif">Cover ${index}</text>` +
          `<text x="28" y="150" font-size="26" fill="#eee" font-family="sans-serif">${hue} hue sample</text>` +
          `</svg>`,
      ),
      left: (index % 8) * 384,
      top: Math.floor(index / 8) * 576,
    };
  });
  return sharp({
    create: {width: WIDTH, height: HEIGHT, channels: 3, background: "#181512"},
  })
    .composite(cells)
    .png()
    .toBuffer();
};

const imageDecoder = async (buffer: Uint8Array) => {
  const {data, info} = await sharp(Buffer.from(buffer)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {data: new Uint8Array(data), width: info.width, height: info.height};
};

const png = await buildSyntheticAtlas();
console.log(`atlas: ${WIDTH}x${HEIGHT} png=${(png.byteLength / 1048576).toFixed(1)} MiB`);

let t0 = Date.now();
await encodeToKTX2(new Uint8Array(png), {
  isUASTC: false,
  generateMipmap: false,
  imageDecoder,
});
const serialMs = Date.now() - t0;
console.log(`serial ETC1S: ${(serialMs / 1000).toFixed(1)}s`);

t0 = Date.now();
const concurrent = Number(process.argv[2] ?? 8);
await Promise.all(Array.from({length: concurrent}, () => encodeShelfAtlasPng(new Uint8Array(png), false)));
const pooledMs = Date.now() - t0;
console.log(
  `pool x${concurrent}: ${(pooledMs / 1000).toFixed(1)}s total, ${(pooledMs / concurrent / 1000).toFixed(1)}s per atlas, speedup ${(serialMs / (pooledMs / concurrent)).toFixed(1)}x`,
);
process.exit(0);
