import {expect, test} from "bun:test";
import type {ShopInteractionCommandsHost} from "~/game/shopInteractionCommands";
import {createShopInteractionCommands} from "~/game/shopInteractionCommands";

test("interaction commands preserve placement precedence", () => {
  const calls: string[] = [];
  const host = {
    artFrames: () => ({
      placeDigitalArtFrame: () => calls.push("frame"),
      placement: {},
      records: new Map(),
      assets: [],
      channels: [],
      targetedId: undefined,
    }),
    bookActions: () => ({
      discardBusy: false,
      shelveAnimation: undefined,
      throwChargeActive: false,
      pickUpBook: () => calls.push("book"),
    }),
    bookTextures: () => ({}),
    booksById: () => new Map(),
    carriedPublicationId: () => undefined,
    carriedPublicationIds: () => [],
    emitGameState: () => {},
    hoveredPublicationId: () => "book-1",
    inspection: () => ({inspectionMode: "none"}),
    posters: () => ({
      placement: {},
      records: new Map(),
      assets: [],
      targetedId: undefined,
    }),
    props: () => ({carriedProp: undefined}),
    scanner: () => ({trashTargeted: false, shelfTargeted: false}),
    setCarriedPublicationId: () => {},
    signs: () => ({targetedKey: undefined}),
    syncCarriedBookPresentation: () => {},
    targetedArcadeCabinet: () => undefined,
    targetedProp: () => undefined,
    targetedTelevision: () => undefined,
    televisionInteraction: () => undefined,
    televisionTargeted: () => false,
    updateHeldPhysicsTarget: () => {},
  } as unknown as ShopInteractionCommandsHost;

  createShopInteractionCommands(host).interact();

  expect(calls).toEqual(["frame"]);
});
