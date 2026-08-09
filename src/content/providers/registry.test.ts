import {afterEach, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {createLibraryProviderRegistry} from "~/content/providers/registry";
import type {PackedPublication} from "~/content/schema";
import type {LibraryProviderPluginContext} from "~/content/providers/types";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const descriptor = {
  contentKinds: ["magazine"],
  defaultBlockedTags: ["spoiler"],
  defaultLanguages: ["english"],
  defaultQuery: "new",
  id: "fixture-provider",
  name: "Fixture Provider",
  queryGuide: {
    entries: [
      {
        description: "Title",
        exclusion: '-title:"…"',
        expression: 'title:"…"',
      },
    ],
    examples: ['title:"Example"'],
    introduction: "Search fixture titles.",
  },
  queryHelp: "Search fixture publications",
  queryLabel: "Search",
  queryPlaceholder: "Title",
  requiresLanguageTag: true,
  summary: "Synthetic test publications",
} as const;

const createPlugin = async (entrySource: string, entry = "plugin.js") => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-provider-registry-"));
  temporaryDirectories.push(root);
  const pluginDirectory = resolve(root, "fixture-provider");
  await mkdir(pluginDirectory);
  await writeFile(
    resolve(pluginDirectory, "afterleaf-provider.json"),
    `${JSON.stringify(
      {
        apiVersion: 1,
        descriptor,
        entry,
        kind: "afterleaf-content-provider",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(resolve(pluginDirectory, entry), entrySource);
  return {pluginDirectory, root};
};

const packedPublication: PackedPublication = {
  alternates: [],
  assets: {
    back: "back.webp",
    front: "front.webp",
    frontDetail: "front-detail.webp",
    pages: ["001.webp"],
    spine: "spine.webp",
  },
  contentHash: "fixture-content",
  id: "fixture-publication",
  language: "english",
  originalTags: [],
  physical: {aspectRatio: 2 / 3, readingDirection: "ltr"},
  shelfAtlasIndex: 0,
  tags: [],
  title: "Fixture publication",
};

test("discovers descriptors without importing provider code", async () => {
  const {pluginDirectory} = await createPlugin(
    'throw new Error("provider entry was imported eagerly");\n',
  );
  const registry = createLibraryProviderRegistry({
    pluginPaths: [pluginDirectory],
  });

  expect(registry.getDescriptor(descriptor.id)).toEqual(descriptor);
  await expect(registry.load(descriptor.id)).rejects.toThrow(
    "Could not load content provider fixture-provider",
  );
});

test("loads a dynamically discovered provider once requested", async () => {
  const {pluginDirectory} = await createPlugin(`
export const createProvider = ({descriptor}) => ({
  descriptor,
  resolvePastedImport: (text) =>
    text === "fixture:42"
      ? {publicationId: "fixture-42", query: "id:42"}
      : undefined,
  sync: async (options) => ({
    addedCount: 0,
    diagnostics: [],
    outputDirectory: options.outputDirectory,
    providerId: descriptor.id,
    query: options.query,
    requestedLimit: options.limit,
    selectedPublicationIds: [],
    unchangedCount: 0,
    updatedCount: 0,
    wroteCatalog: false,
  }),
});
`);
  const registry = createLibraryProviderRegistry({
    pluginPaths: [pluginDirectory],
  });

  const provider = await registry.load(descriptor.id);

  expect(provider.descriptor).toEqual(descriptor);
  expect(await provider.resolvePastedImport?.("fixture:42")).toEqual({
    publicationId: "fixture-42",
    query: "id:42",
  });
  expect(typeof provider.sync).toBe("function");
});

test("loads CommonJS plugin entries", async () => {
  const {pluginDirectory} = await createPlugin(
    `exports.createProvider = ({descriptor}) => ({
  descriptor,
  sync: async (options) => ({
    addedCount: 0,
    diagnostics: [],
    outputDirectory: options.outputDirectory,
    providerId: descriptor.id,
    query: options.query,
    requestedLimit: options.limit,
    selectedPublicationIds: [],
    unchangedCount: 0,
    updatedCount: 0,
    wroteCatalog: false,
  }),
});
`,
    "plugin.cjs",
  );
  const registry = createLibraryProviderRegistry({
    pluginPaths: [pluginDirectory],
  });

  const provider = await registry.load(descriptor.id);

  expect(provider.descriptor.id).toBe(descriptor.id);
});

test("loads built-in TypeScript providers with the Afterleaf project config", async () => {
  const registry = createLibraryProviderRegistry({
    rootDirectory: resolve(import.meta.dirname, "../../.."),
  });

  const provider = await registry.load("mangadex");

  expect(provider.descriptor.id).toBe("mangadex");
  expect(typeof provider.materializePage).toBe("function");
});

test("delegates provider entry loading to the host module loader", async () => {
  const {pluginDirectory} = await createPlugin(
    'throw new Error("native import should not run");\n',
  );
  const moduleLocations: unknown[] = [];
  const contexts: LibraryProviderPluginContext[] = [];
  const registry = createLibraryProviderRegistry({
    loadModule: async (location) => {
      moduleLocations.push(location);
      return {
        createProvider: (context: LibraryProviderPluginContext) => {
          contexts.push(context);
          return {
            descriptor: context.descriptor,
            sync: async (options: {outputDirectory: string}) => ({
              addedCount: 0,
              diagnostics: [],
              outputDirectory: options.outputDirectory,
              providerId: context.descriptor.id,
              query: "",
              requestedLimit: 0,
              selectedPublicationIds: [],
              unchangedCount: 0,
              updatedCount: 0,
              wroteCatalog: false,
            }),
          };
        },
      };
    },
    pluginPaths: [pluginDirectory],
  });

  const first = await registry.load(descriptor.id);
  const second = await registry.load(descriptor.id);

  expect(first).toBe(second);
  expect(moduleLocations).toEqual([
    {
      entryPath: resolve(pluginDirectory, "plugin.js"),
      projectDirectory: pluginDirectory,
    },
  ]);
  expect(contexts).toEqual([{descriptor, pluginDirectory}]);
});

test("runs a cloned TypeScript plugin with its own tsconfig and binary pages", async () => {
  const {pluginDirectory} = await createPlugin(
    'export {createProvider} from "@fixture/provider";\n',
    "plugin.ts",
  );
  await mkdir(resolve(pluginDirectory, "lib"));
  await Promise.all([
    writeFile(
      resolve(pluginDirectory, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {"@fixture/*": ["./lib/*"]},
          },
          include: ["**/*.ts"],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      resolve(pluginDirectory, "lib/provider.ts"),
      `import {
  createRepresentativePagePlan,
  type LibraryProviderPluginContext,
} from "@afterleaf/provider-sdk";

export const createProvider = (context: LibraryProviderPluginContext) => ({
  descriptor: context.descriptor,
  materializePage: async ({pageCount, pageNumber}: {pageCount: number; pageNumber: number}) =>
    Buffer.from([
      0x41,
      createRepresentativePagePlan(pageCount).backPageIndex,
      pageNumber,
      0x5a,
    ]),
  sync: async (options: {
    limit: number;
    onProgress?: (message: string) => void;
    outputDirectory: string;
    query: string;
  }) => {
    options.onProgress?.(\`loaded from \${context.pluginDirectory}\`);
    return {
      addedCount: 0,
      diagnostics: [],
      outputDirectory: options.outputDirectory,
      providerId: context.descriptor.id,
      query: options.query,
      requestedLimit: options.limit,
      selectedPublicationIds: [],
      unchangedCount: 0,
      updatedCount: 0,
      wroteCatalog: false,
    };
  },
});
`,
    ),
  ]);
  const registry = createLibraryProviderRegistry({
    pluginPaths: [pluginDirectory],
  });

  const provider = await registry.load(descriptor.id);
  const progress: string[] = [];
  const report = await provider.sync({
    blockedTags: [],
    excludedPublicationIds: [],
    languages: ["english"],
    limit: 4,
    maxSearchPages: 1,
    onProgress: (message) => progress.push(message),
    outputDirectory: resolve(pluginDirectory, "output"),
    query: "typescript fixture",
    selectionMode: "unseen",
    write: false,
  });
  const materializePage = provider.materializePage;
  if (!materializePage) throw new Error("Fixture must materialize pages");
  const page = await materializePage({
    metadataHash: "fixture-metadata",
    pageCount: 3,
    pageNumber: 2,
    publication: packedPublication,
    sourceDirectory: resolve(pluginDirectory, "source"),
  });

  expect(report.providerId).toBe(descriptor.id);
  expect(report.query).toBe("typescript fixture");
  expect(progress).toEqual([`loaded from ${pluginDirectory}`]);
  expect(page).toEqual(Buffer.from([0x41, 2, 2, 0x5a]));
});

test("rejects duplicate provider IDs", async () => {
  const first = await createPlugin(
    "export const createProvider = () => ({});\n",
  );
  const second = await createPlugin(
    "export const createProvider = () => ({});\n",
  );

  expect(() =>
    createLibraryProviderRegistry({
      pluginPaths: [first.pluginDirectory, second.pluginDirectory],
    }),
  ).toThrow("Duplicate content provider fixture-provider");
});
