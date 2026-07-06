import { LanguageToggle } from "@/islands/LanguageToggle.tsx";
import { PopoverBehavior } from "@/islands/PopoverBehavior.tsx";
import { ThemeToggle } from "@/islands/ThemeToggle.tsx";
import { t } from "@/lib/i18n.ts";
import type { ComponentChildren } from "preact";

interface Props {
  title: string;
  eyebrow?: string;
  viewerName?: string;
  /** Marks the matching destination as the current page in the account menu. */
  current?: "calendar" | "admin" | "profile" | "about";
  calendarUrl?: string;
  /** Present only for admins; gates the Administration link (stable per viewer). */
  adminUrl?: string;
  profileUrl?: string;
  aboutUrl?: string;
  logoutUrl?: string;
  wide?: boolean;
  children?: ComponentChildren;
  menuChildren?: ComponentChildren;
}

export function viewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase();
}

/* Leading glyph for a menu row; sized and colored by the `.menu svg` rule. */
export function MenuIcon({ children }: { children: ComponentChildren }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/* Eight-point celebration spark, the app's mark. */
export function BrandMark({ class: className = "size-8" }: { class?: string }) {
  return (
    <span
      class={`grid shrink-0 place-items-center rounded-lg bg-accent text-on-accent ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-[55%]"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      >
        <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" />
      </svg>
    </span>
  );
}

export function AppHeader({
  title,
  eyebrow,
  viewerName,
  current,
  calendarUrl = "/calendar/",
  adminUrl,
  profileUrl = "/profile/",
  aboutUrl = "/about",
  logoutUrl,
  wide = false,
  children,
  menuChildren,
}: Props) {
  return (
    <header class="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-md">
      {/* One global behavior for every `<details data-popover>` on the page. */}
      <PopoverBehavior />
      <div
        class={`mx-auto flex h-14 items-center justify-between gap-3 px-4 ${
          wide ? "max-w-7xl" : "max-w-5xl"
        }`}
      >
        <a href="/calendar/" class="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div class="min-w-0">
            <p class="kicker">{eyebrow ?? t("app.name")}</p>
            <h1 class="truncate text-[15px] font-semibold leading-snug capitalize">{title}</h1>
          </div>
        </a>
        <div class="flex shrink-0 items-center gap-2">
          <LanguageToggle />
          {children}
          {viewerName
            ? (
              <details data-popover class="relative">
                <summary
                  class="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-line-2 bg-surface pl-1 pr-2.5 hover:bg-inset [&::-webkit-details-marker]:hidden"
                  aria-label={t("nav.openMenuFor", { name: viewerName })}
                >
                  <span
                    class="grid size-7 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-2"
                    aria-hidden="true"
                  >
                    {viewerInitials(viewerName)}
                  </span>
                  <span class="text-sm font-medium max-sm:hidden">{viewerName}</span>
                  <svg
                    class="size-3 text-ink-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2.5 4.5L6 8l3.5-3.5" />
                  </svg>
                </summary>
                <div class="menu">
                  <a href={calendarUrl} aria-current={current === "calendar" ? "page" : undefined}>
                    <MenuIcon>
                      <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" />
                    </MenuIcon>
                    {t("nav.calendar")}
                  </a>
                  {adminUrl && (
                    <a href={adminUrl} aria-current={current === "admin" ? "page" : undefined}>
                      <MenuIcon>
                        <path d="M4 8h16M4 16h16" />
                        <circle cx="9" cy="8" r="2" />
                        <circle cx="15" cy="16" r="2" />
                      </MenuIcon>
                      {t("nav.admin")}
                    </a>
                  )}
                  <a href={profileUrl} aria-current={current === "profile" ? "page" : undefined}>
                    <MenuIcon>
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
                    </MenuIcon>
                    {t("nav.profile")}
                  </a>
                  <a href={aboutUrl} aria-current={current === "about" ? "page" : undefined}>
                    <MenuIcon>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 11v5M12 7.5v.01" />
                    </MenuIcon>
                    {t("nav.about")}
                  </a>

                  {menuChildren && (
                    <>
                      <hr />
                      <p class="menu-label">{t("nav.onThisPage")}</p>
                      {menuChildren}
                    </>
                  )}

                  <hr />
                  <ThemeToggle />

                  {logoutUrl && (
                    <>
                      <hr />
                      <form method="post" action={logoutUrl}>
                        <button type="submit" class="menu-danger">
                          <MenuIcon>
                            <path d="M15 17l5-5-5-5M20 12H9M9 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
                          </MenuIcon>
                          {t("nav.logout")}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </details>
            )
            : (
              <a class="btn btn-ghost" href="/">
                {t("nav.access")}
              </a>
            )}
        </div>
      </div>
    </header>
  );
}
