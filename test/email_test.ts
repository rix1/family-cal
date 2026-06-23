import { mailgunBaseUrl } from "../lib/email.ts";
import { assertEquals } from "./asserts.ts";

Deno.test("mailgunBaseUrl defaults to EU, honors region and explicit override", () => {
  const keys = ["MAILGUN_BASE_URL", "MAILGUN_REGION"];
  const previous = Object.fromEntries(keys.map((k) => [k, Deno.env.get(k)]));
  try {
    for (const k of keys) Deno.env.delete(k);
    assertEquals(mailgunBaseUrl(), "https://api.eu.mailgun.net");

    Deno.env.set("MAILGUN_REGION", "us");
    assertEquals(mailgunBaseUrl(), "https://api.mailgun.net");

    // Explicit override wins and trailing slashes are trimmed.
    Deno.env.set("MAILGUN_BASE_URL", "https://example.test/");
    assertEquals(mailgunBaseUrl(), "https://example.test");
  } finally {
    for (const k of keys) {
      const v = previous[k];
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});
