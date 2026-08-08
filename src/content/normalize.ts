import type {SupportedLanguage} from "~/content/schema";

const LANGUAGE_ALIASES: Readonly<Record<string, SupportedLanguage>> = {
  en: "english",
  eng: "english",
  english: "english",
  ja: "japanese",
  japanese: "japanese",
  jp: "japanese",
  jpn: "japanese",
};

export const normalizeTag = (tag: string) =>
  tag
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

export const normalizeTags = (tags: readonly string[]) => [
  ...new Set(tags.map(normalizeTag).filter(Boolean)),
];

export const parseSupportedLanguage = (
  language: string,
): SupportedLanguage | undefined =>
  LANGUAGE_ALIASES[
    language.normalize("NFKC").trim().toLocaleLowerCase("en-US")
  ];

export const languagePriority = (language: SupportedLanguage) =>
  language === "english" ? 0 : 1;
