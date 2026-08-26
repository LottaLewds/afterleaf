import type {CatalogLanguage} from "~/catalog";

export type LanguageFilter = "all" | CatalogLanguage;

export const languageLabels: Record<LanguageFilter, string> = {
  all: "All",
  english: "English",
  japanese: "日本語",
};
