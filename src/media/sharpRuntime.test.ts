import {expect, test} from "bun:test";
import sharp from "~/media/sharpRuntime";

test("shares one bounded Sharp concurrency policy across hosts", () => {
  expect(sharp.concurrency()).toBe(1);
  expect(sharp.cache().files.max).toBe(0);
});
