/**
 * Bounded worker pool for basis-encoding shelf atlas PNGs into KTX2. The
 * encoder is synchronous WASM, so without threads a full library re-encode
 * runs strictly serially; fanning out across cores turns ~30 minutes into
 * roughly one atlas encode time per worker.
 */
import {availableParallelism} from "node:os";
import {Worker} from "node:worker_threads";

import type {ShelfAtlasEncodeRequest, ShelfAtlasEncodeResponse} from "~/content/shelfAtlasKtx2Worker";

const MAX_WORKERS = Math.max(1, Math.min(8, availableParallelism() - 1));

type Pending = {
  resolve: (ktx2: Uint8Array) => void;
  reject: (error: Error) => void;
};

type PoolWorker = {worker: Worker; idle: boolean};

const workers: PoolWorker[] = [];
const queue: {request: ShelfAtlasEncodeRequest; pending: Pending}[] = [];
const pendingById = new Map<number, Pending>();
let nextRequestId = 1;

const runNext = () => {
  const task = queue.shift();
  if (!task) return;
  const poolWorker = workers.find((candidate) => candidate.idle);
  if (!poolWorker) {
    // Every worker is busy; completion handlers will re-run this.
    queue.unshift(task);
    return;
  }
  poolWorker.idle = false;
  pendingById.set(task.request.id, task.pending);
  poolWorker.worker.postMessage(task.request, [task.request.png.buffer as ArrayBuffer]);
};

const spawnWorker = (): PoolWorker => {
  const worker = new Worker(new URL("./shelfAtlasKtx2Worker.ts", import.meta.url));
  const poolWorker: PoolWorker = {worker, idle: true};
  worker.on("message", (response: ShelfAtlasEncodeResponse) => {
    poolWorker.idle = true;
    const pending = pendingById.get(response.id);
    pendingById.delete(response.id);
    if (pending) {
      if ("error" in response) pending.reject(new Error(response.error));
      else pending.resolve(response.ktx2);
    }
    runNext();
  });
  worker.on("error", (error) => {
    // Fail every in-flight request: the pool state after a dead worker is
    // unknowable, and callers re-seed cheaply.
    for (const pending of pendingById.values()) pending.reject(error);
    pendingById.clear();
    workers.splice(workers.indexOf(poolWorker), 1);
    runNext();
  });
  workers.push(poolWorker);
  return poolWorker;
};

export const encodeShelfAtlasPng = (png: Uint8Array, isUASTC: boolean): Promise<Uint8Array> =>
  new Promise<Uint8Array>((resolve, reject) => {
    let poolWorker = workers.find((candidate) => candidate.idle);
    if (!poolWorker && workers.length < MAX_WORKERS) poolWorker = spawnWorker();
    const id = nextRequestId++;
    if (poolWorker && !queue.length) {
      poolWorker.idle = false;
      pendingById.set(id, {resolve, reject});
      poolWorker.worker.postMessage({id, isUASTC, png} satisfies ShelfAtlasEncodeRequest, [png.buffer as ArrayBuffer]);
      return;
    }
    queue.push({request: {id, isUASTC, png}, pending: {resolve, reject}});
  });
