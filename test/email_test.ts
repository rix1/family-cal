import { ResendEmailSender } from "../lib/email.ts";
import { assertEquals, assertRejects, assertStringIncludes } from "./asserts.ts";

/** Capture the request a sender makes by stubbing global fetch. */
function withStubbedFetch(
  respond: (req: Request) => Response,
): { calls: Request[]; restore: () => void } {
  const calls: Request[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req);
    return Promise.resolve(respond(req));
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

Deno.test("ResendEmailSender posts to /emails with auth and JSON body", async () => {
  const stub = withStubbedFetch(() => new Response('{"id":"abc"}', { status: 200 }));
  try {
    const sender = new ResendEmailSender({
      apiKey: "re_test",
      from: "Familiekalender <noreply@updates.example.com>",
      baseUrl: "https://api.resend.com/",
    });
    await sender.send({
      to: "admin@example.com",
      subject: "Hello World",
      text: "plain",
      html: "<p>hi</p>",
      headers: { "List-Unsubscribe": "<https://example.com/u>" },
    });

    assertEquals(stub.calls.length, 1);
    const req = stub.calls[0];
    // Trailing slash on baseUrl is trimmed, not doubled.
    assertEquals(req.url, "https://api.resend.com/emails");
    assertEquals(req.method, "POST");
    assertEquals(req.headers.get("authorization"), "Bearer re_test");
    const body = await req.json();
    assertEquals(body.from, "Familiekalender <noreply@updates.example.com>");
    assertEquals(body.to, "admin@example.com");
    assertEquals(body.subject, "Hello World");
    assertEquals(body.text, "plain");
    assertEquals(body.html, "<p>hi</p>");
    assertEquals(body.headers["List-Unsubscribe"], "<https://example.com/u>");
  } finally {
    stub.restore();
  }
});

Deno.test("ResendEmailSender throws on a non-2xx response", async () => {
  const stub = withStubbedFetch(() => new Response("bad key", { status: 401 }));
  try {
    const sender = new ResendEmailSender({ apiKey: "re_test", from: "x@updates.example.com" });
    await assertRejects(() =>
      sender.send({ to: "a@b.com", subject: "s", text: "t" })
    );
  } finally {
    stub.restore();
  }
});

Deno.test("ResendEmailSender omits html when not provided", async () => {
  const stub = withStubbedFetch(() => new Response("{}", { status: 200 }));
  try {
    const sender = new ResendEmailSender({ apiKey: "re_test", from: "x@updates.example.com" });
    await sender.send({ to: "a@b.com", subject: "s", text: "t" });
    const body = await stub.calls[0].json();
    assertEquals("html" in body, false);
    assertStringIncludes(stub.calls[0].url, "api.resend.com/emails");
  } finally {
    stub.restore();
  }
});
