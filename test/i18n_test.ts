import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";
import { localizedMonthNames } from "../lib/dates.ts";
import { locale, setLocale, t } from "../lib/i18n.ts";
import en from "../translations/en.json" with { type: "json" };
import nb from "../translations/nb.json" with { type: "json" };

Deno.env.set("KV_PATH", ":memory:");
const main = await import("../main.ts");

function placeholders(template: string): Set<string> {
  return new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

Deno.test("translation files have exactly the same keys", () => {
  const enKeys = new Set(Object.keys(en));
  const nbKeys = new Set(Object.keys(nb));
  const enOnly = [...enKeys].filter((k) => !nbKeys.has(k));
  const nbOnly = [...nbKeys].filter((k) => !enKeys.has(k));
  assertEquals(enOnly, [], `keys only in en.json: ${enOnly.join(", ")}`);
  assertEquals(nbOnly, [], `keys only in nb.json: ${nbOnly.join(", ")}`);
});

Deno.test("no translation value is empty", () => {
  for (const [key, value] of Object.entries(en)) {
    assert(value.trim().length > 0, `en.json "${key}" is empty`);
  }
  for (const [key, value] of Object.entries(nb)) {
    assert(value.trim().length > 0, `nb.json "${key}" is empty`);
  }
});

Deno.test("placeholders match between en and nb for every key", () => {
  const mismatches: string[] = [];
  for (const key of Object.keys(en)) {
    if (!(key in nb)) continue;
    const enPlaceholders = placeholders((en as Record<string, string>)[key]);
    const nbPlaceholders = placeholders((nb as Record<string, string>)[key]);
    const same = enPlaceholders.size === nbPlaceholders.size &&
      [...enPlaceholders].every((p) => nbPlaceholders.has(p));
    if (!same) mismatches.push(key);
  }
  assertEquals(mismatches, [], `placeholder mismatch in: ${mismatches.join(", ")}`);
});

Deno.test("t() resolves the active locale and falls back to English then the key", () => {
  const original = locale();
  try {
    setLocale("nb");
    assertEquals(t("nav.calendar"), "Kalender");
    setLocale("en");
    assertEquals(t("nav.calendar"), "Calendar");
    assertEquals(t("this.key.does.not.exist"), "this.key.does.not.exist");
  } finally {
    setLocale(original);
  }
});

Deno.test("t() interpolates {placeholder} params and leaves unknown ones intact", () => {
  const original = locale();
  try {
    setLocale("en");
    assertEquals(t("nav.openMenuFor", { name: "Kari" }), "Open menu for Kari");
    assertStringIncludes(t("error.label", {}), "{status}");
  } finally {
    setLocale(original);
  }
});

// fsRoutes() only resolves page routes through the Vite build, so a raw
// app.handler() call can't render a real page here — but it does exercise the
// full middleware chain up to the notFound fallback, whose title comes from
// t(), which is enough to prove the locale middleware picks up the cookie.
Deno.test("locale middleware defaults to nb, honors the cookie, and rejects garbage", async () => {
  const handler = main.app.handler();

  const noCookie = await handler(new Request("http://localhost/does-not-exist"));
  assertStringIncludes(await noCookie.text(), nb["error.notFound.title"]);

  const englishCookie = await handler(
    new Request("http://localhost/does-not-exist", { headers: { cookie: "family_lang=en" } }),
  );
  assertStringIncludes(await englishCookie.text(), en["error.notFound.title"]);

  const garbageCookie = await handler(
    new Request("http://localhost/does-not-exist", { headers: { cookie: "family_lang=xx" } }),
  );
  assertStringIncludes(await garbageCookie.text(), nb["error.notFound.title"]);
});

Deno.test("localizedMonthNames gives each locale its native style", () => {
  assertEquals(localizedMonthNames("nb-NO")[0], "januar");
  assertEquals(localizedMonthNames("en-GB", "short")[0], "Jan");
});
