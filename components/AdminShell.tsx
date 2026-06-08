import { AppHeader } from "@/components/AppHeader.tsx";
import type { ComponentChildren } from "preact";

interface Props {
  current: "home" | "people" | "groups" | "viewers" | "audit";
  viewerName: string;
  calendarUrl?: string;
  children: ComponentChildren;
}

const nav = [
  ["home", "/admin/", "Overview"],
  ["people", "/admin/people/", "People"],
  ["groups", "/admin/groups/", "Groups"],
  ["viewers", "/admin/viewers/", "Viewers"],
  ["audit", "/admin/audit/", "Audit"],
] as const;

export function AdminShell({ current, viewerName, calendarUrl, children }: Props) {
  return (
    <div class="min-h-screen bg-zinc-50 text-zinc-950">
      <AppHeader
        title="Administration"
        viewerName={viewerName}
        calendarUrl={calendarUrl}
        logoutUrl="/logout"
      />
      <div class="mx-auto grid max-w-7xl md:min-h-[calc(100vh-65px)] md:grid-cols-[220px_1fr]">
        <aside class="border-b border-zinc-200 bg-white p-5 md:border-b-0 md:border-r">
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Administration</p>
          <nav class="mt-4 flex gap-2 overflow-x-auto md:grid" aria-label="Admin">
            {nav.map(([key, href, label]) => (
              <a
                key={key}
                href={href}
                aria-current={current === key ? "page" : undefined}
                class={`rounded-lg px-3 py-2 text-sm font-medium ${
                  current === key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
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
