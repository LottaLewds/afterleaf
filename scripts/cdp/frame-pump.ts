/**
 * Keeps the dedicated Chrome tab producing real GPU-composited frames while
 * its window is minimized, fully occluded, or the Windows session is locked.
 *
 * Chromium only schedules compositor BeginFrames when something consumes
 * them; with no visible surface, requestAnimationFrame stops and every
 * frametime sample would be garbage. Registering a screencast sink makes the
 * compositor treat this CDP session as a frame consumer, so the full render
 * pipeline keeps running. Captured frames are acknowledged immediately and
 * discarded - captures are tiny (320x180, 1-in-30, jpeg q5) so the encode
 * cost stays negligible next to the scene's own submission cost.
 */
import {CdpSession} from "./client";

export type FramePump = {
  /** Screencast frames received (and discarded) since the pump started. */
  readonly framesPumped: () => number;
  stop: () => Promise<void>;
};

export const startFramePump = async (session: CdpSession): Promise<FramePump> => {
  await session.request("Page.enable");
  let framesPumped = 0;
  const unsubscribe = session.onEvent((method, params) => {
    if (method !== "Page.screencastFrame") return;
    framesPumped += 1;
    const {sessionId} = params as {sessionId?: number};
    // Unacknowledged screencast frames stall delivery; ack and drop.
    if (sessionId !== undefined) void session.request("Page.screencastFrameAck", {sessionId}).catch(() => {});
  });
  await session.request("Page.startScreencast", {
    everyNthFrame: 30,
    format: "jpeg",
    maxHeight: 180,
    maxWidth: 320,
    quality: 5,
  });
  return {
    framesPumped: () => framesPumped,
    stop: async () => {
      unsubscribe();
      await session.request("Page.stopScreencast").catch(() => {});
    },
  };
};

/**
 * True when the page cannot currently produce representative frames on its
 * own: hidden, occluded, or otherwise not visible to a display.
 */
export const pageIsHidden = async (session: CdpSession) =>
  (await session.evaluate<string>("document.visibilityState")) !== "visible";
