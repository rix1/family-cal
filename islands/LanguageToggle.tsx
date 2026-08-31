import { LANG_COOKIE, locale, t } from "@/lib/i18n.ts";

/**
 * Switches the UI language, always labeled with the language it switches *to*.
 * The default "menu" variant is a row for the account menu (globe icon + the
 * target language's own name); "compact" is the small header pill used where
 * no account menu exists (logged-out pages). The preference cookie is not
 * sensitive, so it is set client-side (no HttpOnly/Secure) and a full reload
 * re-renders the server strings in the new locale.
 */
export function LanguageToggle({ variant = "menu" }: { variant?: "menu" | "compact" }) {
  const next = locale() === "nb" ? "en" : "nb";

  function switchLanguage() {
    const year = 60 * 60 * 24 * 365;
    document.cookie = `${LANG_COOKIE}=${next}; Path=/; SameSite=Lax; Max-Age=${year}`;
    location.reload();
  }

  if (variant === "compact") {
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

  return (
    <button
      type="button"
      onClick={switchLanguage}
      aria-label={t("lang.switchTo")}
      title={t("lang.switchTo")}
      lang={next}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.3 4 5.5 4 9s-1.5 6.7-4 9c-2.5-2.3-4-5.5-4-9s1.5-6.7 4-9Z" />
      </svg>
      <span>{next === "en" ? "English" : "Norsk"}</span>
    </button>
  );
}
