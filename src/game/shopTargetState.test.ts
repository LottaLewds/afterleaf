import {expect, test} from "bun:test";
import type {ShopBookLifecycle} from "~/game/shopBookLifecycle";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import type {InteractionScanner} from "~/game/interactionScanner";
import {createShopTargetState, type ShopTargetStateHost} from "~/game/shopTargetState";
import type {ShopTelevision} from "~/game/ShopTelevision";

test("target state clears television state and resets its scrub session", () => {
  const calls: string[] = [];
  let currentTelevision: ShopTelevision | undefined;
  let currentInteraction: "screen" | "body" | undefined;
  const television = {
    setTargeted: (interaction: "screen" | "body" | undefined) => {
      calls.push(`target:${interaction ?? "none"}`);
    },
  } as unknown as ShopTelevision;
  const host = {
    bookLifecycle: () =>
      ({
        applyBookStates: () => calls.push("apply-books"),
      }) as unknown as ShopBookLifecycle,
    bookTextures: () => ({}) as BookTextureRuntime,
    booksById: () => new Map(),
    currentArcadeCabinet: () => undefined,
    currentProp: () => undefined,
    currentTelevision: () => currentTelevision,
    currentTelevisionInteraction: () => currentInteraction,
    emitGameState: () => calls.push("emit"),
    hoveredPublicationId: () => undefined,
    resetTelevisionWheel: () => calls.push("reset-wheel"),
    scanner: () => ({trashTargeted: false}) as unknown as InteractionScanner,
    setArcadeCabinet: () => {},
    setHoveredPublicationId: () => {},
    setProp: () => {},
    setTelevisionState: (
      targeted: boolean,
      interaction: "screen" | "body" | undefined,
      nextTelevision: ShopTelevision | undefined,
    ) => {
      currentTelevision = nextTelevision;
      currentInteraction = interaction;
      calls.push(`state:${targeted}`);
    },
  } as ShopTargetStateHost;
  const targetState = createShopTargetState(host);

  targetState.setTelevisionTargeted(true, "screen", television);
  targetState.setTelevisionTargeted(false);

  expect(calls).toEqual([
    "reset-wheel",
    "state:true",
    "target:screen",
    "emit",
    "reset-wheel",
    "target:none",
    "state:false",
    "emit",
  ]);
});

test("clearing the hovered publication also clears shelf browsing", () => {
  const scanner = {
    shelfBrowsePublicationId: "book-1",
    trashTargeted: false,
  } as unknown as InteractionScanner;
  const host = {
    bookLifecycle: () => ({applyBookStates: () => {}}) as unknown as ShopBookLifecycle,
    bookTextures: () => ({}) as BookTextureRuntime,
    booksById: () => new Map(),
    currentArcadeCabinet: () => undefined,
    currentProp: () => undefined,
    currentTelevision: () => undefined,
    currentTelevisionInteraction: () => undefined,
    emitGameState: () => {},
    hoveredPublicationId: () => undefined,
    resetTelevisionWheel: () => {},
    scanner: () => scanner,
    setArcadeCabinet: () => {},
    setHoveredPublicationId: () => {},
    setProp: () => {},
    setTelevisionState: () => {},
  } as ShopTargetStateHost;

  createShopTargetState(host).setHoveredPublicationId(undefined);

  expect(scanner.shelfBrowsePublicationId).toBeUndefined();
});

test("restores the previous hovered book to atlas rendering", () => {
  const calls: string[] = [];
  let hoveredPublicationId: string | undefined = "book-1";
  const bookTextures = {
    ensureStandaloneBookTextures: (publicationId: string) => calls.push(`ensure:${publicationId}`),
    syncBookAtlasBatch: (publicationId: string) => calls.push(`sync:${publicationId}`),
  } as unknown as BookTextureRuntime;
  const host = {
    bookLifecycle: () => ({applyBookStates: () => calls.push("apply-books")}) as unknown as ShopBookLifecycle,
    bookTextures: () => bookTextures,
    booksById: () => new Map([["book-2", {}]]) as unknown as ReadonlyMap<string, never>,
    currentArcadeCabinet: () => undefined,
    currentProp: () => undefined,
    currentTelevision: () => undefined,
    currentTelevisionInteraction: () => undefined,
    emitGameState: () => calls.push("emit"),
    hoveredPublicationId: () => hoveredPublicationId,
    resetTelevisionWheel: () => {},
    scanner: () => ({shelfBrowsePublicationId: undefined, trashTargeted: false}) as unknown as InteractionScanner,
    setArcadeCabinet: () => {},
    setHoveredPublicationId: (publicationId: string | undefined) => {
      hoveredPublicationId = publicationId;
    },
    setProp: () => {},
    setTelevisionState: () => {},
  } as ShopTargetStateHost;

  createShopTargetState(host).setHoveredPublicationId("book-2");

  expect(calls).toEqual(["sync:book-1", "ensure:book-2", "apply-books", "emit"]);
});
