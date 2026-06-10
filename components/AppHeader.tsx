import type { ComponentChildren } from "preact";
import { AccountMenuBehavior } from "@/islands/AccountMenuBehavior.tsx";
import { ThemeToggle } from "@/islands/ThemeToggle.tsx";

interface Props {
  title: string;
  eyebrow?: string;
  viewerName?: string;
  calendarUrl?: string;
  adminUrl?: string;
  aboutUrl?: string | null;
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
  eyebrow = "Family Calendar",
  viewerName,
  calendarUrl,
  adminUrl,
  aboutUrl = "/about",
  logoutUrl,
  wide = false,
  children,
  menuChildren,
}: Props) {
  return (
    <header class="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-md">
      <div
        class={`mx-auto flex h-14 items-center justify-between gap-3 px-4 ${
          wide ? "max-w-7xl" : "max-w-5xl"
        }`}
      >
        <div class="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div class="min-w-0">
            <p class="kicker">{eyebrow}</p>
            <h1 class="truncate text-[15px] font-semibold leading-snug">{title}</h1>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          {children}
          {viewerName
            ? (
              <details class="relative">
                <AccountMenuBehavior />
                <summary
                  class="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-line-2 bg-surface pl-1 pr-2.5 hover:bg-inset [&::-webkit-details-marker]:hidden"
                  aria-label={`Open menu for ${viewerName}`}
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
                  {calendarUrl && <a href={calendarUrl}>Calendar</a>}
                  {adminUrl && <a href={adminUrl}>Administration</a>}
                  {aboutUrl && <a href={aboutUrl}>About</a>}
                  {menuChildren}
                  <ThemeToggle />
                  {logoutUrl && (
                    <>
                      <hr />
                      <form method="post" action={logoutUrl}>
                        <button type="submit">Log out</button>
                      </form>
                    </>
                  )}
                </div>
              </details>
            )
            : (
              <a class="btn btn-ghost" href="/">
                Access
              </a>
            )}
        </div>
      </div>
    </header>
  );
}
