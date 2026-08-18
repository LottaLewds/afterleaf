import {afterEach, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {alternateTitleKey} from "~/content/publicationAlternates";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

test("local catalog source excludes blacklisted publication IDs", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-blacklist-"));
  temporaryDirectories.push(root);
  const publication = (id: string, language: "english" | "japanese") => ({
    assets: {pages: ["001.webp"]},
    id,
    language,
    schemaVersion: 1,
    tags: ["magazine"],
    title: id,
  });
  await Promise.all(
    [
      ["local-blacklisted-01", "english"],
      ["local-blacklisted-02", "japanese"],
      ["local-comedy-01", "english"],
    ].map(async ([id, language]) => {
      const directory = resolve(root, id);
      await mkdir(directory);
      await writeFile(
        resolve(directory, "publication.json"),
        JSON.stringify(publication(id, language as "english" | "japanese")),
      );
    }),
  );
  const source = new LocalCatalogSource(root, {
    excludedPublicationIds: new Set([
      "local-blacklisted-01",
      "local-blacklisted-02",
    ]),
  });
  const references = await source.search({
    excludedTags: [],
    languages: ["english", "japanese"],
    limit: Number.MAX_SAFE_INTEGER,
    match: "all",
    seed: "blacklist-test",
    tags: [],
  });
  const publications = await Promise.all(
    references.map((reference) => source.getMetadata(reference)),
  );
  const publicationIds = publications.map(({document}) => document.id);

  expect(publicationIds).not.toContain("local-blacklisted-01");
  expect(publicationIds).not.toContain("local-blacklisted-02");
  expect(publicationIds).toContain("local-comedy-01");
});

test("local catalog source rejects legacy nHentai manifests whose language was inferred from unsupported tags", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-language-audit-"));
  temporaryDirectories.push(root);
  const englishDirectory = resolve(root, "nhentai-english");
  const chineseDirectory = resolve(root, "nhentai-chinese");
  await Promise.all([mkdir(englishDirectory), mkdir(chineseDirectory)]);
  const publication = (id: string, languageTag: string) => ({
    assets: {pages: ["001.jpg"]},
    id,
    language: "english",
    schemaVersion: 1,
    source: {
      metadataHash: `hash-${id}`,
      provider: "nhentai",
      remoteId: id,
      retrievedAt: "2026-07-29T10:00:00.000Z",
      sourceUrl: `https://nhentai.net/g/${id}/`,
    },
    tags: ["big-breasts", languageTag],
    title: id,
  });
  await Promise.all([
    writeFile(
      resolve(englishDirectory, "publication.json"),
      JSON.stringify(publication("nhentai-english", "english")),
    ),
    writeFile(
      resolve(chineseDirectory, "publication.json"),
      JSON.stringify(publication("nhentai-chinese", "chinese")),
    ),
  ]);
  const source = new LocalCatalogSource(root, {
    requiresLanguageTag: () => true,
  });
  const references = await source.search({
    excludedTags: [],
    languages: ["english", "japanese"],
    limit: 20,
    match: "all",
    seed: "language-audit",
    tags: [],
  });

  expect(references.map(({sourceId}) => sourceId)).toEqual(["nhentai-english"]);
  expect(source.diagnostics).toEqual([
    expect.objectContaining({
      code: "unsupported-language",
      sourceId: "nhentai-chinese",
    }),
  ]);
});

test("local catalog source ignores interrupted hidden staging directories", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-hidden-staging-"));
  temporaryDirectories.push(root);
  const stagingDirectory = resolve(root, ".catalog.archive-staging-test");
  await mkdir(stagingDirectory);
  await writeFile(
    resolve(stagingDirectory, "publication.json"),
    "not a publication manifest",
  );
  const source = new LocalCatalogSource(root);

  const references = await source.search({
    excludedTags: [],
    languages: ["english", "japanese"],
    limit: Number.MAX_SAFE_INTEGER,
    match: "all",
    seed: "hidden-staging-test",
    tags: [],
  });

  expect(references).toEqual([]);
  expect(source.diagnostics).toEqual([]);
});

test("local catalog source prefers nested manifests and deduplicates overlapping roots", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-nested-manifest-"));
  temporaryDirectories.push(root);
  const container = resolve(root, "manga");
  const publicationDirectory = resolve(container, "author/book");
  await mkdir(publicationDirectory, {recursive: true});
  const publication = (id: string, page: string) => ({
    assets: {pages: [page]},
    id,
    language: "english",
    schemaVersion: 1,
    tags: ["unclassified"],
    title: id,
  });
  await Promise.all([
    writeFile(
      resolve(container, "publication.json"),
      JSON.stringify(
        publication("accidental-container", "author/book/001.jpg"),
      ),
    ),
    writeFile(
      resolve(publicationDirectory, "publication.json"),
      JSON.stringify(publication("real-book", "001.jpg")),
    ),
    writeFile(resolve(publicationDirectory, "001.jpg"), "page"),
  ]);
  const source = new LocalCatalogSource([root, container]);

  const references = await source.search({
    excludedTags: [],
    languages: ["english"],
    limit: 20,
    match: "all",
    seed: "nested-manifest",
    tags: [],
  });

  expect(references.map(({sourceId}) => sourceId)).toEqual([
    "manga/author/book",
  ]);
  expect(source.diagnostics).toEqual([
    expect.objectContaining({
      code: "shadowed-manifest",
      sourceId: "manga/publication.json",
    }),
  ]);
  const material = await source.materialize(references[0] ?? {sourceId: ""});
  expect(material.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
});

test("associates near-name duplicates, prefers uncensored editions, and keeps source tags reversible", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-alternates-"));
  temporaryDirectories.push(root);
  const writePublication = async (
    id: string,
    title: string,
    tags: string[],
  ) => {
    const directory = resolve(root, id);
    await mkdir(directory);
    await writeFile(
      resolve(directory, "publication.json"),
      JSON.stringify({
        assets: {pages: ["pages/001.webp"]},
        id,
        language: "english",
        schemaVersion: 1,
        tags,
        title,
      }),
    );
  };
  await Promise.all([
    writePublication(
      "nhentai-666192",
      "[Horori] Z.Z.Z Gravure #6: EVELYN & ASTRA (Zenless Zone Zero) [English] [Digital]",
      ["big-breasts", "group"],
    ),
    writePublication(
      "nhentai-666822",
      "[Horori] Z.Z.Z Gravure #06: Evelyn & Astra (Zenless Zone Zero) [ENG] [Uncensored]",
      ["big-breasts", "uncensored", "mind-control"],
    ),
  ]);
  const query = {
    excludedTags: [],
    languages: ["english"] as const,
    limit: 20,
    match: "all" as const,
    seed: "alternate-test",
    tags: [],
  };
  const source = new LocalCatalogSource(root);
  const references = await source.search({
    ...query,
    languages: [...query.languages],
  });
  const canonical = references[0]
    ? await source.getMetadata(references[0])
    : undefined;

  expect(references).toHaveLength(1);
  expect(canonical).toMatchObject({
    document: {
      id: "nhentai-666822",
      tags: ["big-breasts", "uncensored", "mind-control"],
    },
    normalizedTags: ["big-breasts", "uncensored", "mind-control", "group"],
    alternates: [
      {
        id: "nhentai-666192",
        originalTags: ["big-breasts", "group"],
      },
    ],
  });
  expect(source.diagnostics).toEqual([
    expect.objectContaining({code: "suspected-duplicate"}),
  ]);

  const censoredManifest = resolve(root, "nhentai-666192/publication.json");
  const declassified = JSON.parse(await Bun.file(censoredManifest).text()) as {
    title: string;
  };
  declassified.title = "Different Evelyn & Astra Book";
  await writeFile(censoredManifest, JSON.stringify(declassified));
  const declassifiedReferences = await source.search({
    ...query,
    languages: [...query.languages],
  });
  const declassifiedCandidates = await Promise.all(
    declassifiedReferences.map((reference) => source.getMetadata(reference)),
  );
  const restored = declassifiedCandidates.find(
    ({document}) => document.id === "nhentai-666192",
  );

  expect(declassifiedReferences).toHaveLength(2);
  expect(restored?.normalizedTags).toEqual(["big-breasts", "group"]);
  expect(restored?.normalizedTags).not.toContain("uncensored");
});

test("ignores trailing edition markers without discarding a leading bracketed author", () => {
  expect(
    alternateTitleKey(
      "[Horori] Z.Z.Z Gravure #06 [Digital] [English] [Uncensored]",
    ),
  ).toBe(alternateTitleKey("[Horori] Z.Z.Z Gravure #6"));
  expect(alternateTitleKey("[Digital] Example Book")).not.toBe(
    alternateTitleKey("Example Book"),
  );
});
