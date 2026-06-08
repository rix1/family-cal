import type { ComponentChildren } from "preact";
import { ThemeToggle } from "@/islands/ThemeToggle.tsx";

interface Props {
  title: string;
  eyebrow?: string;
  viewerName?: string;
  calendarUrl?: string;
  adminUrl?: string;
  aboutUrl?: string | null;
  logoutUrl?: string;
  children?: ComponentChildren;
  menuChildren?: ComponentChildren;
}

export function viewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase();
}

export function AppHeader({
  title,
  eyebrow = "Family calendar",
  viewerName,
  calendarUrl,
  adminUrl,
  aboutUrl = "/about",
  logoutUrl,
  children,
  menuChildren,
}: Props) {
  return (
    <header class="site-header">
      <div class="site-header-inner">
        <div class="site-header-title">
          <p class="site-header-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <div class="site-header-actions">
          {children}
          {viewerName
            ? (
              <details class="account-menu">
                <summary aria-label={`Open menu for ${viewerName}`}>
                  <span class="account-avatar" aria-hidden="true">
                    {viewerInitials(viewerName)}
                  </span>
                  <span class="account-name">{viewerName}</span>
                  <span class="account-chevron" aria-hidden="true"></span>
                </summary>
                <div class="account-popover">
                  {calendarUrl && <a href={calendarUrl}>Calendar</a>}
                  {adminUrl && <a href={adminUrl}>Administration</a>}
                  {aboutUrl && <a href={aboutUrl}>About</a>}
                  {menuChildren}
                  <ThemeToggle />
                  {logoutUrl && (
                    <>
                      <hr />
                      <a href={logoutUrl}>Log out</a>
                    </>
                  )}
                </div>
              </details>
            )
            : (
              <a class="site-header-access" href="/">
                Access
              </a>
            )}
        </div>
      </div>
    </header>
  );
}
