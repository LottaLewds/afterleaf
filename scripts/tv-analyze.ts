import {resolve} from "node:path";

import {readAfterleafLibraryConfigSync} from "~/content/libraryConfig";
import {createCachedTvVideoAnalyzer} from "~/tv/channelAnalysis";
import {discoverTvChannels} from "~/tv/channelCatalog";
import {tvMediaUrl} from "~/tv/protocol";

const channelsDirectory = resolve(import.meta.dirname, "../content/channels");
const channelsDirectories = [
  channelsDirectory,
  ...readAfterleafLibraryConfigSync(resolve(import.meta.dirname, "..")).tvChannelPaths,
];
const cachePath = resolve(channelsDirectory, ".afterleaf-tv-analysis.json");
let failureCount = 0;
const analyzer = createCachedTvVideoAnalyzer({
  cachePath,
  onError: (filePath, error) => {
    failureCount += 1;
    console.warn(`Could not analyze ${filePath}`, error);
  },
});
const manifest = await discoverTvChannels(channelsDirectories, tvMediaUrl, analyzer);
const videos = manifest.channels.flatMap((channel) => channel.videos);
const analyzedCount = videos.filter((video) => video.activePicture).length;
const croppedCount = videos.filter(
  (video) => video.activePicture && (video.activePicture.width < 1 || video.activePicture.height < 1),
).length;

console.log(
  `Analyzed ${analyzedCount}/${videos.length} TV videos; detected ${croppedCount} embedded active picture${croppedCount === 1 ? "" : "s"}.`,
);
console.log(`Cache: ${cachePath}`);
if (failureCount > 0) process.exitCode = 1;
