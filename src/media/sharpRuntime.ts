import sharp from "sharp";

// sharp.concurrency() controls libvips threads per image, not how many images
// Sharp processes concurrently through the runtime worker queue. Bun on
// Windows can intermittently abort in GLib's g_system_thread_free when an
// image uses multiple libvips threads, including with Sharp 0.35.3 / GLib
// 2.89.0. Use one thread per image on every host: image jobs remain parallel,
// Linux and Windows share one policy, and higher values did not improve our
// import benchmark.
sharp.concurrency(1);

// Sharp's default libvips cache retains up to 20 open files. These pipelines
// atomically rename completed asset trees, so keep memory/operation caching
// while releasing file descriptors after each operation on every host.
sharp.cache({files: 0});

export default sharp;
export type {FitEnum, Metadata} from "sharp";
