"use client";

/** Reader-side generation preferences, persisted in the browser. */
import type { WritingStyle } from "@/types";

export type ReadingLanguage = "en" | "fr" | "es" | "pt" | "de" | "it";

export const LANGUAGE_LABELS: Readonly<Record<ReadingLanguage, string>> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  it: "Italiano",
};

const LANG_KEY = "ags:reading-language";
const STYLE_KEY = "ags:reading-style";

export function getReadingLanguage(): ReadingLanguage {
  if (typeof window === "undefined") return "en";
  const value = window.localStorage.getItem(LANG_KEY);
  return value !== null && value in LANGUAGE_LABELS ? (value as ReadingLanguage) : "en";
}

export function setReadingLanguage(language: ReadingLanguage): void {
  window.localStorage.setItem(LANG_KEY, language);
}

export function getDefaultStyle(): WritingStyle {
  if (typeof window === "undefined") return "conversational";
  const value = window.localStorage.getItem(STYLE_KEY);
  return value === "poetic" || value === "clinical" ? value : "conversational";
}

export function setDefaultStyle(style: WritingStyle): void {
  window.localStorage.setItem(STYLE_KEY, style);
}
