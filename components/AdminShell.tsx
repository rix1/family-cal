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
      <header class="border-b border-zinc-200 bg-white">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <a href="/admin/" class="font-semibold">Family Calendar Admin</a>
          {calendarUrl && (
            <a
              href={calendarUrl}
              class="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              View calendar
            </a>
          )}
        </div>
      </header>
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
          <p class="mt-6 text-xs text-zinc-500 md:mt-10">
            Signed in as <strong class="text-zinc-700">{viewerName}</strong>
          </p>
        </aside>
        <div class="min-w-0 p-4 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
