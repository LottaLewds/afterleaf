/**
 * Worker entry that basis-encodes one composited atlas PNG into KTX2. Runs
 * inside the pool owned by ~/content/shelfAtlasKtx2Pool; the encoder is
 * synchronous WASM, so isolating it per thread is what makes parallel atlas
 * generation possible.
 */
import {parentPort} from "node:worker_threads";
import sharp from "sharp";
import {encodeToKTX2} from "ktx2-encoder";

export type ShelfAtlasEncodeRequest = {
  id: number;
  isUASTC: boolean;
  png: Uint8Array;
};

export type ShelfAtlasEncodeResponse = {id: number; ktx2: Uint8Array} | {id: number; error: string};

const port = parentPort;
if (!port) throw new Error("Shelf atlas encoder must run inside a worker");

/**
 * The basis WASM encoder printf's progress ("Total slices: 1", ...) straight
 * to process stdout. Workers share the process' streams, so those writes
 * would corrupt the JSON envelopes library commands print for their callers
 * (vite parses them). Sink all stream writes while encoding.
 */
const withSilencedStreams = async <T>(work: () => Promise<T>): Promise<T> => {
  const sinks = [process.stdout, process.stderr];
  const originals = sinks.map((stream) => stream.write);
  const sink = () => true;
  for (const stream of sinks) stream.write = sink as typeof stream.write;
  try {
    return await work();
  } finally {
    for (const [index, stream] of sinks.entries()) stream.write = originals[index]!;
  }
};

port.on("message", async (request: ShelfAtlasEncodeRequest) => {
  try {
    const imageDecoder = async (buffer: Uint8Array) => {
      const {data, info} = await sharp(Buffer.from(buffer)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
      return {
        data: new Uint8Array(data),
        width: info.width,
        height: info.height,
      };
    };
    const ktx2 = await withSilencedStreams(() =>
      encodeToKTX2(request.png, {
        isUASTC: request.isUASTC,
        generateMipmap: false,
        enableDebug: false,
        imageDecoder,
      }),
    );
    const response: ShelfAtlasEncodeResponse = {
      id: request.id,
      ktx2: new Uint8Array(ktx2),
    };
    port.postMessage(response, [response.ktx2.buffer as ArrayBuffer]);
  } catch (error) {
    const response: ShelfAtlasEncodeResponse = {
      error: error instanceof Error ? error.message : String(error),
      id: request.id,
    };
    port.postMessage(response);
  }
});
