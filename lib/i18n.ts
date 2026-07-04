import en from "@/translations/en.json" with { type: "json" };
import nb from "@/translations/nb.json" with { type: "json" };

export type Locale = "nb" | "en";

export const LANG_COOKIE = "family_lang";
export const DEFAULT_LOCALE: Locale = "nb";

const tables: Record<Locale, Record<string, string>> = { en, nb };

// One page render sticks to one locale: the server sets it per request at the
// top of _app.tsx (Fresh renders in a single synchronous renderToString, so
// concurrent requests cannot interleave), and the client reads the lang
// attribute the server stamped on <html> before islands hydrate.
let current: Locale = DEFAULT_LOCALE;
if (typeof document !== "undefined") {
  current = parseLocale(document.documentElement.lang);
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function locale(): Locale {
  return current;
}

/** BCP-47 tag for Intl formatters. */
export function dateLocale(): string {
  return current === "nb" ? "nb-NO" : "en-GB";
}

/** Normalize an untrusted value (cookie, lang attribute). */
export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

/** Look up a flat key with nb→en→key fallback; `{name}` placeholders interpolate. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = tables[current][key] ?? tables.en[key] ?? key;
  if (!params) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (match, name) => name in params ? String(params[name]) : match,
  );
}
