/**
 * Local storage for ROMs downloaded through the arcade cabinet. ROMs never
 * ship with the game; once a player downloads one it is cached here as a Blob
 * so replaying does not re-download and offline play keeps working.
 */
export type ArcadeRomRecord = {
  id: string;
  systemId: string;
  name: string;
  sizeBytes: number;
  blob: Blob;
  addedAt: number;
};

/** Minimal async key-value surface so tests can inject an in-memory store. */
export type RomRecordStore = {
  get(id: string): Promise<ArcadeRomRecord | undefined>;
  put(record: ArcadeRomRecord): Promise<void>;
  delete(id: string): Promise<void>;
  getAll(): Promise<ArcadeRomRecord[]>;
};

const ROM_STORE_NAME = "roms";

export const createMemoryRomRecordStore = (): RomRecordStore => {
  const records = new Map<string, ArcadeRomRecord>();
  return {
    async get(id) {
      return structuredClone(records.get(id));
    },
    async put(record) {
      records.set(record.id, record);
    },
    async delete(id) {
      records.delete(id);
    },
    async getAll() {
      return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
};

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed"));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB aborted"));
  });

export const createIndexedDbRomRecordStore = (
  databaseName = "afterleaf-arcade",
): RomRecordStore | undefined => {
  const indexedDb = globalThis.indexedDB;
  if (!indexedDb) return;
  let opening: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (!opening)
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDb.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(ROM_STORE_NAME))
            database.createObjectStore(ROM_STORE_NAME, {keyPath: "id"});
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB open failed"));
      });
    return opening;
  };

  return {
    async get(id) {
      const database = await open();
      return requestToPromise(
        database
          .transaction(ROM_STORE_NAME, "readonly")
          .objectStore(ROM_STORE_NAME)
          .get(id),
      );
    },
    async put(record) {
      const database = await open();
      const transaction = database.transaction(ROM_STORE_NAME, "readwrite");
      transaction.objectStore(ROM_STORE_NAME).put(record);
      await transactionDone(transaction);
    },
    async delete(id) {
      const database = await open();
      const transaction = database.transaction(ROM_STORE_NAME, "readwrite");
      transaction.objectStore(ROM_STORE_NAME).delete(id);
      await transactionDone(transaction);
    },
    async getAll() {
      const database = await open();
      const records = await requestToPromise<ArcadeRomRecord[]>(
        database
          .transaction(ROM_STORE_NAME, "readonly")
          .objectStore(ROM_STORE_NAME)
          .getAll(),
      );
      return records.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
};

let sharedStore: RomRecordStore | undefined;

/** Process-wide store; prefers IndexedDB and degrades to memory. */
export const getRomRecordStore = (): RomRecordStore => {
  if (!sharedStore)
    sharedStore =
      createIndexedDbRomRecordStore() ?? createMemoryRomRecordStore();
  return sharedStore;
};

/** Testing hook to reset the process-wide store between cases. */
export const setRomRecordStoreForTesting = (store?: RomRecordStore) => {
  sharedStore = store;
};

export type ArcadeRomSummary = Omit<ArcadeRomRecord, "blob">;

export const listSavedRoms = async (): Promise<ArcadeRomSummary[]> => {
  const records = await getRomRecordStore().getAll();
  return records.map(({blob: _blob, ...summary}) => summary);
};

export const saveRomBlob = async (
  record: Omit<ArcadeRomRecord, "addedAt">,
): Promise<ArcadeRomSummary> => {
  const stored: ArcadeRomRecord = {...record, addedAt: Date.now()};
  await getRomRecordStore().put(stored);
  const {blob: _blob, ...summary} = stored;
  return summary;
};

export const getSavedRomUrl = async (
  id: string,
): Promise<string | undefined> => {
  const record = await getRomRecordStore().get(id);
  if (!record) return;
  // Name the file after the original ROM so EmulatorJS can read its
  // extension when deciding how to decompress or patch it.
  const extensionIndex = record.name.lastIndexOf(".");
  const fileName =
    extensionIndex > 0
      ? `${record.name.slice(0, extensionIndex).slice(-40)}${record.name.slice(extensionIndex)}`
      : "game.rom";
  return URL.createObjectURL(new File([record.blob], fileName));
};

export const deleteSavedRom = async (id: string): Promise<boolean> => {
  const store = getRomRecordStore();
  const existing = await store.get(id);
  if (!existing) return false;
  await store.delete(id);
  return true;
};
