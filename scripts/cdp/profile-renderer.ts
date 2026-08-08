import {CdpSession, positiveNumber} from "./client";

const warmupMs = positiveNumber(process.env.AFTERLEAF_CDP_WARMUP_MS, 1_200);
const sampleMs = positiveNumber(process.env.AFTERLEAF_CDP_SAMPLE_MS, 5_000);
const session = await CdpSession.connect();
try {
  await session.request("Emulation.setFocusEmulationEnabled", {enabled: true});
  await session.request("Page.setWebLifecycleState", {state: "active"});
  const result = await session.evaluate(`
    (async () => {
      const debug = window.__AFTERLEAF_PERFORMANCE_DEBUG__;
      if (!debug) throw new Error("Afterleaf performance handle unavailable");
      const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
      const percentile = (values, ratio) => {
        const sorted = values.slice().sort((left, right) => left - right);
        return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
      };
      await wait(${warmupMs});
      const frames = [];
      let previous;
      const deadline = performance.now() + ${sampleMs};
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("No representative animation frames arrived; keep the Chrome window visible and focused")),
          ${sampleMs} + 30_000,
        );
        const frame = (time) => {
          if (previous !== undefined) frames.push(time - previous);
          previous = time;
          if (performance.now() >= deadline) {
            clearTimeout(timeout);
            resolve();
          }
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const duration = frames.reduce((sum, value) => sum + value, 0);
      const batches = [];
      debug.scene.traverse((object) => {
        if (object.name === "book-atlas-batch") batches.push(object);
      });
      return {
        averageFps: frames.length / (duration / 1000),
        bookBatchCount: batches.length,
        bookBatchInstances: batches.reduce(
          (total, batch) => total + (batch._instanceInfo?.length ?? 0),
          0,
        ),
        devicePixelRatio,
        focused: document.hasFocus(),
        frameCount: frames.length,
        maxFrameTimeMs: Math.max(...frames),
        onePercentLowFps: 1000 / percentile(frames, 0.99),
        p50FrameTimeMs: percentile(frames, 0.5),
        p95FrameTimeMs: percentile(frames, 0.95),
        p99FrameTimeMs: percentile(frames, 0.99),
        renderCalls: debug.renderer.info.render.calls,
        rendererMemory: {...debug.renderer.info.memory},
        shaderErrors: debug.renderer.info.programs
          .flatMap((program) => {
            const diagnostics = program.diagnostics;
            if (!diagnostics || diagnostics.runnable) return [];
            return [
              diagnostics.programLog ||
                diagnostics.fragmentShader?.log ||
                diagnostics.vertexShader?.log,
            ];
          })
          .filter(Boolean),
        triangles: debug.renderer.info.render.triangles,
        url: location.href,
        visibility: document.visibilityState,
        viewport: innerWidth + "x" + innerHeight,
      };
    })()
  `);
  console.log(JSON.stringify(result, null, 2));
} finally {
  session.close();
}
