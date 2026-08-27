import {readFileSync} from "node:fs";
import type {NhentaiClientOptions} from "./client";

export const nhentaiClientOptionsFromEnvironment = (): NhentaiClientOptions => {
  const cookieFile = process.env.AFTERLEAF_NHENTAI_COOKIE_FILE?.trim();
  const cookie = cookieFile ? readFileSync(cookieFile, "utf8").trim() : undefined;
  return {
    ...(cookie ? {cookie} : {}),
    ...(process.env.AFTERLEAF_FLARESOLVERR_URL ? {flaresolverrUrl: process.env.AFTERLEAF_FLARESOLVERR_URL} : {}),
    ...(process.env.AFTERLEAF_NHENTAI_USER_AGENT ? {userAgent: process.env.AFTERLEAF_NHENTAI_USER_AGENT} : {}),
  };
};
