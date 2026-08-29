import {describe, expect, test} from "bun:test";

import type {InspectionController} from "~/game/inspection/InspectionController";
import {ShopInputController, type ShopInputHost} from "~/game/shopInputController";

const createHost = (inspectionMode: "none" | "spread" = "none") => {
  const inspection = {inspectionMode} as unknown as InspectionController;
  return {
    inspection: () => inspection,
    paused: () => false,
  } as unknown as ShopInputHost;
};

describe("shop input controller", () => {
  test("routes movement actions only while pointer lock is owned", () => {
    const controller = new ShopInputController(createHost());

    expect(controller.handleActionDown("jump")).toBe(false);
    controller.state.pointerLocked = true;

    expect(controller.handleActionDown("jump")).toBe(true);
    expect(controller.state.jumpQueued).toBe(true);
    expect(controller.handleActionDown("moveForward")).toBe(true);
    expect(controller.handleActionDown("crouch")).toBe(true);
    expect(controller.state.crouchToggled).toBe(true);
    expect(controller.handleActionUp("crouch")).toBe(false);
    expect(controller.handleActionDown("crouch")).toBe(true);
    expect(controller.state.crouchToggled).toBe(false);
  });

  test("lets an open inspection consume unrelated actions", () => {
    const controller = new ShopInputController(createHost("spread"));

    expect(controller.handleActionDown("jump")).toBe(true);
    expect(controller.state.jumpQueued).toBe(false);
  });
});
