/**
 * Outbound email seam. The login flow depends only on `EmailSender`, so the
 * concrete provider — Mailgun, Postmark, SES, ... — stays swappable, mirroring
 * the `Store` seam. With no provider configured, `getEmailSender()` falls back to
 * logging to the console, so magic-link login is fully exercisable in local dev.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always provided; `html` is optional enrichment. */
  text: string;
  html?: string;
  /** Extra MIME headers, e.g. `List-Unsubscribe`. */
  headers?: Record<string, string>;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Dev/default sender: prints the message so links can be copied from the log. */
export class ConsoleEmailSender implements EmailSender {
  // deno-lint-ignore require-await
  async send(message: EmailMessage): Promise<void> {
    console.info(
      [
        "",
        "📧 [email] (console sender — no provider configured)",
        `   to:      ${message.to}`,
        `   subject: ${message.subject}`,
        ...message.text.split("\n").map((line) => `   ${line}`),
        "",
      ].join("\n"),
    );
  }
}

export interface MailgunConfig {
  apiKey: string;
  domain: string;
  from: string;
  /** API base, region-specific (EU: https://api.eu.mailgun.net). */
  baseUrl: string;
}

/** Sends through the Mailgun HTTP messages API. */
export class MailgunEmailSender implements EmailSender {
  #config: MailgunConfig;

  constructor(config: MailgunConfig) {
    this.#config = config;
  }

  async send(message: EmailMessage): Promise<void> {
    const body = new FormData();
    body.set("from", this.#config.from);
    body.set("to", message.to);
    body.set("subject", message.subject);
    body.set("text", message.text);
    if (message.html) body.set("html", message.html);
    for (const [name, value] of Object.entries(message.headers ?? {})) {
      body.set(`h:${name}`, value);
    }

    const auth = btoa(`api:${this.#config.apiKey}`);
    const res = await fetch(
      `${this.#config.baseUrl}/v3/${this.#config.domain}/messages`,
      { method: "POST", headers: { authorization: `Basic ${auth}` }, body },
    );
    if (!res.ok) {
      throw new Error(`Mailgun send failed (${res.status}): ${await res.text()}`);
    }
  }
}

/** API base for Mailgun: explicit override, else region (EU default). */
export function mailgunBaseUrl(): string {
  const explicit = Deno.env.get("MAILGUN_BASE_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  return Deno.env.get("MAILGUN_REGION")?.toLowerCase() === "us"
    ? "https://api.mailgun.net"
    : "https://api.eu.mailgun.net";
}

/** Mailgun when fully configured by env, else the console fallback. */
export function getEmailSender(): EmailSender {
  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  const from = Deno.env.get("MAILGUN_FROM");
  if (apiKey && domain && from) {
    return new MailgunEmailSender({ apiKey, domain, from, baseUrl: mailgunBaseUrl() });
  }
  return new ConsoleEmailSender();
}
