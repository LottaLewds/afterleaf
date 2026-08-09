import {availableParallelism} from "node:os";
import sharp from "sharp";

// Sharp can process four images concurrently through the runtime worker queue.
// Divide the host CPU budget between those images so Windows and glibc Linux
// use the same policy without oversubscribing high-core-count machines.
const threadsPerImage = Math.max(1, Math.ceil(availableParallelism() / 4));

// Sharp 0.34.5's Windows binary (GLib 2.86.1) could abort in
// g_system_thread_free during Bun teardown. The failure no longer reproduces
// with Sharp 0.35.3's newer native stack, including at 20 threads per image.
// Do not add a Windows-only worker limit here.
sharp.concurrency(threadsPerImage);

// Sharp's default libvips cache retains up to 20 open files. These pipelines
// atomically rename completed asset trees, so keep memory/operation caching
// while releasing file descriptors after each operation on every host.
sharp.cache({files: 0});

export default sharp;
export type {FitEnum, Metadata} from "sharp";
