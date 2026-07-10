/**
 * Shared shell for transactional emails — sign-in links today, welcome/invite
 * mail tomorrow. Callers describe the message as structured, localized plain
 * text (greeting, paragraphs, one action link, small print) and get back both
 * bodies for `EmailMessage`: readable plain text and an HTML version styled to
 * match the newsletter shell in `newsletter_email.ts`.
 *
 * Unlike the newsletter (whose body is already-sanitized trusted HTML), every
 * string here is treated as plain text and HTML-escaped: greetings interpolate
 * viewer names, which are user data.
 */

import { DEFAULT_LOCALE, type Locale, translate } from "@/lib/i18n.ts";

export interface TransactionalEmail {
  /** Subject line; doubles as the HTML <title> and inbox preview. */
  subject: string;
  /** Optional salutation, e.g. "Hei Kari,". */
  greeting?: string;
  /** Body paragraphs shown before the action link. */
  paragraphs: string[];
  /** The one thing this email asks the reader to do: a button in HTML, a bare URL in text. */
  cta?: { label: string; url: string };
  /** Paragraphs after the action link, e.g. expiry caveats. */
  outro?: string[];
  /** Small print under a divider, e.g. "if you didn't ask for this, ignore it". */
  footnote?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// Mirrors the newsletter shell so both mails read as one product.
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', " +
  "'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";
const DIVIDER =
  "width:100%;border:none;border-top:2px solid #eaeaea;margin:1.5em 0 0;padding-bottom:1em";
const PARAGRAPH = "margin:0 0 1em;font-size:1em;color:#3f342b;line-height:165%";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Render both bodies. `locale` sets the shell's lang attribute and kicker. */
export function renderTransactionalEmail(
  email: TransactionalEmail,
  locale: Locale = DEFAULT_LOCALE,
): RenderedEmail {
  return {
    subject: email.subject,
    text: renderText(email),
    html: renderHtml(email, locale),
  };
}

function renderText(email: TransactionalEmail): string {
  const blocks = [
    email.greeting,
    ...email.paragraphs,
    email.cta?.url,
    ...(email.outro ?? []),
    email.footnote,
  ].filter((block): block is string => Boolean(block));
  return blocks.join("\n\n");
}

function renderHtml(email: TransactionalEmail, locale: Locale): string {
  const kicker = translate(locale, "app.name").toUpperCase();
  const paragraph = (text: string) => `<p style="${PARAGRAPH}">${escapeHtml(text)}</p>`;
  const body = [
    email.greeting ? paragraph(email.greeting) : "",
    ...email.paragraphs.map(paragraph),
    email.cta
      ? `<p style="margin:1.5em 0;text-align:center"><a href="${
        escapeHtml(email.cta.url)
      }" target="_blank" style="display:inline-block;background-color:#b8663a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px">${
        escapeHtml(email.cta.label)
      }</a></p>
<p style="margin:0 0 1em;font-size:12px;color:#8a7867;line-height:165%;text-align:center;word-break:break-all">${
        escapeHtml(email.cta.url)
      }</p>`
      : "",
    ...(email.outro ?? []).map(paragraph),
    email.footnote
      ? `<hr style="${DIVIDER}"/>
<p style="margin:0;font-size:12px;color:#a08a76;line-height:165%">${escapeHtml(email.footnote)}</p>`
      : "",
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html dir="ltr" lang="${locale}">
<head>
<meta content="width=device-width" name="viewport"/>
<meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection"/>
<title>${escapeHtml(email.subject)}</title>
</head>
<body dir="ltr" style="margin:0;background-color:#faf6f1">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${
    escapeHtml(email.subject)
  }</div>
<table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
<tbody><tr><td style="font-family:${FONT_STACK};font-size:14px;line-height:155%;background-color:#faf6f1;padding:24px 8px">
<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:#ffffff;width:100%;border-radius:12px">
<tbody><tr><td style="padding:40px 36px">
<p style="margin:0 0 24px;font-size:12px;color:#a08a76;line-height:165%;letter-spacing:2px;text-align:center">${
    escapeHtml(kicker)
  }</p>
${body}
</td></tr></tbody></table>
</td></tr></tbody></table>
</body>
</html>`;
}
