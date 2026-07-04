import { LANG_COOKIE, locale, t } from "@/lib/i18n.ts";

/**
 * Compact header button showing the language it switches *to*. The preference
 * cookie is not sensitive, so it is set client-side (no HttpOnly/Secure) and a
 * full reload re-renders the server strings in the new locale.
 */
export function LanguageToggle() {
  const next = locale() === "nb" ? "en" : "nb";

  function switchLanguage() {
    const year = 60 * 60 * 24 * 365;
    document.cookie = `${LANG_COOKIE}=${next}; Path=/; SameSite=Lax; Max-Age=${year}`;
    location.reload();
  }

  return (
    <button
      type="button"
      onClick={switchLanguage}
      class="btn btn-ghost h-9 px-2.5 text-xs font-semibold tracking-wide"
      aria-label={t("lang.switchTo")}
      title={t("lang.switchTo")}
      lang={next}
    >
      {next === "en" ? "EN" : "NO"}
    </button>
  );
}
