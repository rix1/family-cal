import { AppHeader } from "@/components/AppHeader.tsx";
import type { ComponentChildren } from "preact";

interface Props {
  current: "home" | "people" | "groups" | "viewers" | "invites" | "audit";
  viewerName: string;
  calendarUrl?: string;
  children: ComponentChildren;
}

const nav = [
  ["home", "/admin/", "Overview"],
  ["people", "/admin/people/", "People"],
  ["groups", "/admin/groups/", "Groups"],
  ["viewers", "/admin/viewers/", "Viewers"],
  ["invites", "/admin/invites/", "Invites"],
  ["audit", "/admin/audit/", "Audit"],
] as const;

export function AdminShell({ current, viewerName, calendarUrl, children }: Props) {
  return (
    <div class="min-h-screen">
      <AppHeader
        title="Administration"
        viewerName={viewerName}
        calendarUrl={calendarUrl}
        logoutUrl="/logout"
        wide
      />
      <div class="mx-auto grid max-w-7xl md:min-h-[calc(100vh-57px)] md:grid-cols-[200px_1fr]">
        <aside class="border-b border-line px-3 py-4 md:border-b-0 md:border-r md:py-6">
          <nav class="flex gap-1 overflow-x-auto md:grid" aria-label="Admin">
            {nav.map(([key, href, label]) => (
              <a
                key={key}
                href={href}
                aria-current={current === key ? "page" : undefined}
                class={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  current === key
                    ? "bg-inset font-semibold text-ink"
                    : "font-medium text-ink-2 hover:bg-inset hover:text-ink"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>
        <div class="min-w-0 p-4 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
