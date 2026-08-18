import {expect, test} from "bun:test";
import sharp from "sharp";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {
  createConcurrentAcquisitionPipeline,
  createRepresentativePagePlan,
  finalizeProviderPublicationDocument,
} from "~/content/providers/sdk";
import type {LocalPublicationDocument} from "~/content/schema";

test("selects preview, dimension sample, and back pages", () => {
  expect(createRepresentativePagePlan(20)).toEqual({
    acquisitionPageIndexes: [0, 1, 2, 9, 10, 19],
    aspectRatioPageIndexes: [1, 2, 9, 10],
    backPageIndex: 19,
    initialPageIndexes: [0, 1, 2],
    representativePageIndexes: [0, 1, 2, 19],
  });
});

test("deduplicates representative pages for short publications", () => {
  expect(createRepresentativePagePlan(2)).toEqual({
    acquisitionPageIndexes: [0, 1],
    aspectRatioPageIndexes: [0, 1],
    backPageIndex: 1,
    initialPageIndexes: [0, 1],
    representativePageIndexes: [0, 1],
  });
});

test("finalizes provider metadata from downloaded interior pages", async () => {
  const portrait = await sharp({
    create: {background: "white", channels: 3, height: 300, width: 180},
  })
    .png()
    .toBuffer();
  const document: LocalPublicationDocument = {
    assets: {pages: ["1.png", "2.png", "3.png"]},
    id: "book",
    language: "english",
    pageCount: 20,
    schemaVersion: 1,
    tags: ["manga"],
    title: "Book",
  };

  const finalized = await finalizeProviderPublicationDocument(document, [
    {bytes: portrait, pageIndex: 1},
    {bytes: portrait, pageIndex: 2},
    {bytes: portrait, pageIndex: 9},
    {bytes: portrait, pageIndex: 10},
  ]);

  expect(finalized.aspectRatioInferenceVersion).toBe(
    BOOK_ASPECT_RATIO_INFERENCE_VERSION,
  );
  expect(finalized.physical?.aspectRatio).toBeCloseTo(0.6);
});

test("rejects invalid page counts", () => {
  expect(() => createRepresentativePagePlan(0)).toThrow(
    "pageCount must be a positive integer",
  );
});

test("streams serial preparation into bounded acquisition and preserves order", async () => {
  let activeAcquisitions = 0;
  let maximumActiveAcquisitions = 0;
  const releases = new Map<number, () => void>();
  const pipeline = createConcurrentAcquisitionPipeline({
    concurrency: 2,
    prepare: async (value: number) => value * 10,
    acquire: async (value: number, {markStarted}) => {
      activeAcquisitions += 1;
      maximumActiveAcquisitions = Math.max(
        maximumActiveAcquisitions,
        activeAcquisitions,
      );
      markStarted();
      await new Promise<void>((resolvePromise) => {
        releases.set(value, resolvePromise);
      });
      activeAcquisitions -= 1;
      return String(value);
    },
  });

  const first = pipeline.enqueue(1);
  pipeline.enqueue(2);
  pipeline.enqueue(3);
  await first.started;
  while (releases.size < 2) await Promise.resolve();
  expect(maximumActiveAcquisitions).toBe(2);
  releases.get(20)?.();
  while (!releases.has(30)) await Promise.resolve();
  releases.get(30)?.();
  releases.get(10)?.();

  expect(await pipeline.drain()).toEqual([
    {index: 0, input: 1, prepared: 10, result: "10"},
    {index: 1, input: 2, prepared: 20, result: "20"},
    {index: 2, input: 3, prepared: 30, result: "30"},
  ]);
});

test("skips empty preparations and drains started work before failing", async () => {
  let releaseFirst = () => {};
  let firstSettled = false;
  const failure = new Error("acquisition failed");
  const pipeline = createConcurrentAcquisitionPipeline({
    concurrency: 2,
    prepare: async (value: number) => (value === 0 ? undefined : value),
    acquire: async (value: number, {markStarted}) => {
      markStarted();
      if (value === 2) throw failure;
      await new Promise<void>((resolvePromise) => {
        releaseFirst = resolvePromise;
      });
      firstSettled = true;
      return value;
    },
  });

  const skipped = pipeline.enqueue(0);
  pipeline.enqueue(1);
  pipeline.enqueue(2);
  const discarded = pipeline.enqueue(3);
  await skipped.started;
  await discarded.started;
  expect(pipeline.getFailure()).toBe(failure);
  releaseFirst();
  await expect(pipeline.drain()).rejects.toBe(failure);
  expect(firstSettled).toBe(true);
});
