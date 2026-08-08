import {CdpSession, findAfterleafTarget} from "./client";

const outputPath =
  process.env.AFTERLEAF_CDP_SCREENSHOT_PATH ?? "/tmp/afterleaf-cdp.png";

const target = await findAfterleafTarget();
const session = await CdpSession.connect(target);

try {
  await session.request("Page.bringToFront");
  const screenshot = await session.request<{data?: string}>(
    "Page.captureScreenshot",
    {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    },
  );
  if (!screenshot.data) throw new Error("CDP screenshot returned no data");
  await Bun.write(outputPath, Buffer.from(screenshot.data, "base64"));
  console.log(`Captured ${target.url} to ${outputPath}`);
} finally {
  session.close();
}
