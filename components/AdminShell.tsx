import type { ComponentChildren } from "preact";

interface Props {
  current: "home" | "people" | "groups" | "viewers" | "audit";
  viewerName: string;
  children: ComponentChildren;
}

const nav = [
  ["home", "/admin/", "Overview"],
  ["people", "/admin/people/", "People"],
  ["groups", "/admin/groups/", "Groups"],
  ["viewers", "/admin/viewers/", "Viewers"],
  ["audit", "/admin/audit/", "Audit"],
] as const;

export function AdminShell({ current, viewerName, children }: Props) {
  return (
    <div class="min-h-screen bg-zinc-50 text-zinc-950">
      <div class="mx-auto grid max-w-7xl md:min-h-screen md:grid-cols-[220px_1fr]">
        <aside class="border-b border-zinc-200 bg-white p-5 md:border-b-0 md:border-r">
          <a href="/admin/" class="text-lg font-semibold">Family Calendar</a>
          <p class="mt-1 text-xs text-zinc-500">Administration</p>
          <nav class="mt-6 flex gap-2 overflow-x-auto md:grid" aria-label="Admin">
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
