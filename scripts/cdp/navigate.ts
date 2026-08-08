import {afterleafGameUrl, CdpSession} from "./client";

const url = process.env.AFTERLEAF_CDP_NAVIGATE_URL ?? afterleafGameUrl();
const session = await CdpSession.connect();
try {
  await session.request("Page.navigate", {url});
  console.log(`Navigated the Afterleaf profiling tab to ${url}`);
} finally {
  session.close();
}
