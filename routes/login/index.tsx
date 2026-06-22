import { BrandMark } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { getEmailSender } from "@/lib/email.ts";
import { requestLogin } from "@/lib/login.ts";
import { clientKey, RateLimiter } from "@/lib/rate_limit.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

// Bound abuse of this unauthenticated endpoint without blocking a real household
// asking for a couple of links.
const loginLimiter = new RateLimiter({ windowMs: 10 * 60_000, max: 20 });

/** Canonical public origin for emailed links: APP_BASE_URL wins behind a proxy. */
function baseUrl(req: Request): string {
  return Deno.env.get("APP_BASE_URL") ?? new URL(req.url).origin;
}

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    if (viewer) {
      return new Response(null, { status: 303, headers: { location: "/calendar/" } });
    }
    return page({ submitted: false });
  },
  async POST(ctx) {
    if (!loginLimiter.check(clientKey(ctx.req, ctx.info)).allowed) {
      throw new HttpError(429, "Too many sign-in attempts from your network. Please wait.");
    }
    const form = await ctx.req.formData();
    // Always neutral: never reveal whether the email is registered.
    await requestLogin(await getStore(), form.get("email"), baseUrl(ctx.req), getEmailSender());
    return page({ submitted: true });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Sign in | Family Calendar</title>
    <main class="grid min-h-screen place-items-center px-4 py-12">
      <div class="w-full max-w-md">
        <div class="card p-8">
          <BrandMark />
          {data.submitted
            ? (
              <>
                <p class="kicker mt-8">Check your inbox</p>
                <h1 class="mt-2 text-2xl font-semibold tracking-tight">Sign-in link sent</h1>
                <p class="mt-3 leading-relaxed text-ink-2">
                  If that email belongs to a family member, a sign-in link is on its way. It works
                  once and expires in 30 minutes.
                </p>
                <p class="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-3">
                  Signing in on this device ends your other active session.
                </p>
              </>
            )
            : (
              <>
                <p class="kicker mt-8">Private</p>
                <h1 class="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
                <p class="mt-3 leading-relaxed text-ink-2">
                  Enter the email you signed up with and we'll send a one-time link to sign in on
                  this device.
                </p>
                <form method="post" class="mt-6 grid gap-4">
                  <label class="grid gap-2 text-sm font-medium">
                    Email
                    <input
                      type="email"
                      name="email"
                      required
                      autofocus
                      autocomplete="email"
                      class="input"
                      placeholder="you@example.com"
                    />
                  </label>
                  <button type="submit" class="btn btn-primary w-full">
                    Send sign-in link
                  </button>
                </form>
                <p class="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-3">
                  No account yet? Access is by personal invite — ask the family member who set up
                  the calendar.
                </p>
              </>
            )}
        </div>
      </div>
    </main>
  </>
));
