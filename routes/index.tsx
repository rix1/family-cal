import { BrandMark } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    if (viewer) {
      return new Response(null, { status: 303, headers: { location: "/calendar/" } });
    }
    return page({});
  },
});

export default define.page<typeof handlers>(function AccessRequired() {
  return (
    <>
      <title>Family Calendar</title>
      <main class="grid min-h-screen place-items-center px-4 py-12">
        <div class="w-full max-w-md">
          <div class="card p-8">
            <BrandMark />
            <p class="kicker mt-8">Private</p>
            <h1 class="mt-2 text-2xl font-semibold tracking-tight">Family Calendar</h1>
            <p class="mt-3 leading-relaxed text-ink-2">
              Birthdays, remembrances, and holidays for the whole family — kept in one quiet place.
            </p>
            <p class="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-3">
              Access is by personal link only. If yours stopped working, ask the family member who
              shared it for a new one.
            </p>
          </div>
        </div>
      </main>
    </>
  );
});
