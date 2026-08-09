import {expect, test} from "bun:test";
import {availableParallelism} from "node:os";
import sharp from "~/media/sharpRuntime";

test("shares one bounded Sharp concurrency policy across hosts", () => {
  expect(sharp.concurrency()).toBe(
    Math.max(1, Math.ceil(availableParallelism() / 4)),
  );
  expect(sharp.cache().files.max).toBe(0);
});
