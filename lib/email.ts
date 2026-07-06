/**
 * Outbound email seam. The login flow depends only on `EmailSender`, so the
 * concrete provider — Resend, Postmark, SES, ... — stays swappable, mirroring
 * the `Store` seam. With no provider configured — and always in DEV —
 * `getEmailSender()` logs to the console instead of sending, so magic-link
 * login is fully exercisable in local dev without mailing the family.
 */

import { isDev } from "@/lib/env.ts";

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
  #reason: string;

  constructor(reason = "no provider configured") {
    this.#reason = reason;
  }

  // deno-lint-ignore require-await
  async send(message: EmailMessage): Promise<void> {
    console.info(
      [
        "",
        `📧 [email] (console sender — ${this.#reason})`,
        `   to:      ${message.to}`,
        `   subject: ${message.subject}`,
        ...message.text.split("\n").map((line) => `   ${line}`),
        "",
      ].join("\n"),
    );
  }
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  /** API base; override for testing. Defaults to https://api.resend.com. */
  baseUrl?: string;
}

const RESEND_DEFAULT_BASE_URL = "https://api.resend.com";

/** Sends through the Resend HTTP API (`POST /emails`). */
export class ResendEmailSender implements EmailSender {
  #config: ResendConfig;

  constructor(config: ResendConfig) {
    this.#config = config;
  }

  async send(message: EmailMessage): Promise<void> {
    const baseUrl = (this.#config.baseUrl ?? RESEND_DEFAULT_BASE_URL).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.#config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        // Resend requires at least one of html/text; we always send text.
        ...(message.html ? { html: message.html } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
    }
  }
}

/** Resend when fully configured by env, else the console fallback. */
export function getEmailSender(): EmailSender {
  // DEV never sends real mail, no matter what is configured: the dev database
  // is a copy of production, so viewer emails are the family's real addresses
  // (and Resend has no Mailgun-style test mode that intercepts them).
  if (isDev()) return new ConsoleEmailSender("ENVIRONMENT=DEV never sends");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (apiKey && from) {
    return new ResendEmailSender({ apiKey, from, baseUrl: Deno.env.get("RESEND_BASE_URL") });
  }
  return new ConsoleEmailSender();
}
