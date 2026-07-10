import { renderTransactionalEmail } from "../lib/email_template.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";

const SAMPLE = {
  subject: "Innloggingslenken din",
  greeting: "Hei Kari,",
  paragraphs: ["Bruk lenken under for å logge inn:"],
  cta: { label: "Logg inn", url: "https://fam.example/auth/login/abc123" },
  outro: ["Lenken virker én gang."],
  footnote: "Hvis du ikke ba om dette, kan du se bort fra e-posten.",
};

Deno.test("renderTransactionalEmail includes every block in both bodies", () => {
  const rendered = renderTransactionalEmail(SAMPLE, "nb");

  assertEquals(rendered.subject, "Innloggingslenken din");
  // Text: readable blank-line-separated blocks with the bare URL.
  assertEquals(
    rendered.text,
    [
      "Hei Kari,",
      "Bruk lenken under for å logge inn:",
      "https://fam.example/auth/login/abc123",
      "Lenken virker én gang.",
      "Hvis du ikke ba om dette, kan du se bort fra e-posten.",
    ].join("\n\n"),
  );
  // HTML: localized shell, button link, and all copy present.
  assertStringIncludes(rendered.html, 'lang="nb"');
  assertStringIncludes(rendered.html, "FAMILIEKALENDEREN");
  assertStringIncludes(rendered.html, 'href="https://fam.example/auth/login/abc123"');
  for (const copy of ["Hei Kari,", "Logg inn", "Lenken virker én gang."]) {
    assertStringIncludes(rendered.html, copy);
  }
});

Deno.test("renderTransactionalEmail localizes the shell and omits absent blocks", () => {
  const rendered = renderTransactionalEmail(
    { subject: "Plain note", paragraphs: ["Just one paragraph."] },
    "en",
  );
  assertStringIncludes(rendered.html, 'lang="en"');
  assertStringIncludes(rendered.html, "FAMILY CALENDAR");
  assertEquals(rendered.text, "Just one paragraph.");
  assert(!rendered.html.includes("<hr"), "no footnote → no divider");
  assert(!rendered.html.includes("<a "), "no cta → no link");
});

Deno.test("renderTransactionalEmail escapes user data in HTML", () => {
  const rendered = renderTransactionalEmail({
    subject: "S & <U>",
    greeting: 'Hei <b>"Kari"</b>,',
    paragraphs: [],
  }, "nb");
  assert(!rendered.html.includes("<b>"));
  assertStringIncludes(rendered.html, "Hei &lt;b&gt;&quot;Kari&quot;&lt;/b&gt;,");
  assertStringIncludes(rendered.html, "<title>S &amp; &lt;U&gt;</title>");
});
