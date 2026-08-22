import {afterEach, describe, expect, test} from "bun:test";

import {
  createMemoryRomRecordStore,
  deleteSavedRom,
  getSavedRomUrl,
  listSavedRoms,
  saveRomBlob,
  setRomRecordStoreForTesting,
} from "~/arcade/romLibrary";

describe("rom library", () => {
  afterEach(() => setRomRecordStoreForTesting(undefined));

  const saveSample = async (id = "folder:nes:Demo.nes") =>
    saveRomBlob({
      id,
      systemId: "nes",
      name: "Demo.nes",
      sizeBytes: 4,
      blob: new Blob([new Uint8Array([1, 2, 3, 4])]),
    });

  test("saves, lists, and deletes rom records", async () => {
    setRomRecordStoreForTesting(createMemoryRomRecordStore());
    const summary = await saveSample();
    expect(summary.name).toBe("Demo.nes");
    expect(summary.sizeBytes).toBe(4);
    expect(typeof summary.addedAt).toBe("number");

    const listings = await listSavedRoms();
    expect(listings).toHaveLength(1);
    expect(listings[0]).toEqual(summary);

    expect(await deleteSavedRom(summary.id)).toBe(true);
    expect(await listSavedRoms()).toEqual([]);
    expect(await deleteSavedRom(summary.id)).toBe(false);
  });

  test("rehydrates a playable object url with the original extension", async () => {
    setRomRecordStoreForTesting(createMemoryRomRecordStore());
    const summary = await saveSample();
    const url = await getSavedRomUrl(summary.id);
    expect(url).toStartWith("blob:");
    URL.revokeObjectURL(url!);
    expect(await getSavedRomUrl("missing")).toBeUndefined();
  });

  test("overwrites a re-downloaded rom in place", async () => {
    setRomRecordStoreForTesting(createMemoryRomRecordStore());
    await saveSample();
    await saveRomBlob({
      id: "folder:nes:Demo.nes",
      systemId: "nes",
      name: "Demo.nes",
      sizeBytes: 9,
      blob: new Blob([new Uint8Array(9)]),
    });
    const listings = await listSavedRoms();
    expect(listings).toHaveLength(1);
    expect(listings[0]?.sizeBytes).toBe(9);
  });
});
