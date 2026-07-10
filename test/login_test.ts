import type { EmailMessage, EmailSender } from "../lib/email.ts";
import { completeLogin, emailInUse, findViewerByEmail, requestLogin } from "../lib/login.ts";
import type { LoginToken, Viewer } from "../lib/model.ts";
import { loginTokenIsActive, viewerIsActive } from "../lib/model.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals, assertRejects } from "./asserts.ts";

class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  // deno-lint-ignore require-await
  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

const VIEWERS: Viewer[] = [
  {
    token: "kari-token",
    name: "Kari Berg",
    email: "kari@example.com",
    groups: ["no"],
    isAdmin: false,
  },
  {
    token: "old-token",
    name: "Old Link",
    email: "old@example.com",
    groups: [],
    isAdmin: false,
    expiredAt: "2026-01-01T00:00:00Z",
  },
];

function store(): SeedStore {
  return new SeedStore([], [], VIEWERS);
}

/** Pull the /auth/login/<token> token out of a sent email body. */
function tokenFromMessage(message: EmailMessage): string {
  const match = (message.text ?? "").match(/\/auth\/login\/(\S+)/);
  assert(match, "email should contain a sign-in link");
  return match![1];
}

Deno.test("findViewerByEmail matches active viewers case-insensitively", async () => {
  const s = store();
  assertEquals((await findViewerByEmail(s, "KARI@example.com"))?.token, "kari-token");
  assertEquals(await findViewerByEmail(s, "old@example.com"), null); // expired
  assertEquals(await findViewerByEmail(s, "nobody@example.com"), null);
  assertEquals(await findViewerByEmail(s, "not-an-email"), null);
});

Deno.test("emailInUse ignores expired viewers and an excepted token", async () => {
  const s = store();
  assertEquals(await emailInUse(s, "kari@example.com"), true);
  assertEquals(await emailInUse(s, "kari@example.com", "kari-token"), false);
  assertEquals(await emailInUse(s, "old@example.com"), false); // expired link
});

Deno.test("requestLogin mints and emails a single-use link for a known email", async () => {
  const s = store();
  const sender = new FakeEmailSender();
  const result = await requestLogin(s, "Kari@example.com", "https://fam.example/", sender);

  assertEquals(result.sent, true);
  assertEquals(sender.messages.length, 1);
  assertEquals(sender.messages[0].to, "kari@example.com");
  // Norwegian by default, with an HTML body carrying the same link.
  assertEquals(sender.messages[0].subject, "Innloggingslenken din til Familiekalenderen");
  assert(sender.messages[0].text.includes("Hei Kari,"));

  const token = tokenFromMessage(sender.messages[0]);
  assert(sender.messages[0].html?.includes(`/auth/login/${token}`));
  const loginToken = await s.getLoginToken(token);
  assert(loginToken);
  assertEquals(loginToken!.viewerToken, "kari-token");
  assertEquals(loginToken!.email, "kari@example.com");
  assert(loginTokenIsActive(loginToken!));
  // ~30 minute TTL.
  const ttl = new Date(loginToken!.expiresAt).getTime() - new Date(loginToken!.createdAt).getTime();
  assertEquals(ttl, 30 * 60_000);
});

Deno.test("requestLogin renders the email in the requester's locale", async () => {
  const s = store();
  const sender = new FakeEmailSender();
  await requestLogin(s, "kari@example.com", "https://fam.example/", sender, "en");
  assertEquals(sender.messages[0].subject, "Your sign-in link for the Family Calendar");
  assert(sender.messages[0].text.includes("Hi Kari,"));
});

Deno.test("requestLogin stays neutral for unknown or malformed emails", async () => {
  const s = store();
  const sender = new FakeEmailSender();
  assertEquals((await requestLogin(s, "nobody@example.com", "https://x", sender)).sent, false);
  assertEquals((await requestLogin(s, "old@example.com", "https://x", sender)).sent, false);
  assertEquals((await requestLogin(s, "garbage", "https://x", sender)).sent, false);
  assertEquals(sender.messages.length, 0);
});

Deno.test("completeLogin rotates the token and expires the old session", async () => {
  const s = store();
  const sender = new FakeEmailSender();
  await requestLogin(s, "kari@example.com", "https://x", sender);
  const token = tokenFromMessage(sender.messages[0]);
  const loginToken = await s.getLoginToken(token);

  const rotated = await completeLogin(s, loginToken!);
  assert(rotated.token !== "kari-token");
  assertEquals(rotated.email, "kari@example.com");
  assertEquals(rotated.name, "Kari Berg");
  assert(viewerIsActive(rotated));

  // Old link is now expired; the email resolves to exactly the new link.
  assert(!viewerIsActive((await s.getViewer("kari-token"))!));
  assertEquals((await findViewerByEmail(s, "kari@example.com"))?.token, rotated.token);

  // Single-use: the token is burned and can't be redeemed again.
  assert(!loginTokenIsActive((await s.getLoginToken(token))!));
  await assertRejects(() => completeLogin(s, loginToken!));
});

Deno.test("completeLogin rejects an expired login token", async () => {
  const s = store();
  const expired: LoginToken = {
    token: "stale",
    email: "kari@example.com",
    viewerToken: "kari-token",
    createdAt: "2026-06-01T00:00:00Z",
    expiresAt: "2026-06-01T00:30:00Z",
  };
  await s.upsertLoginToken(expired);
  await assertRejects(() => completeLogin(s, expired, new Date("2026-06-02T00:00:00Z")));
});
