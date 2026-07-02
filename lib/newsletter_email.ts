/**
 * Local HTML email shell for the monthly newsletter. Kept in-repo (rather than a
 * Resend-hosted template) so we own the markup and the variable substitution:
 * no invalid block-in-`<p>` nesting, no stray heading anchors, and every value is
 * ours to set. Adapted from the original Resend template design.
 *
 * Placeholders are `{{name}}` and filled by `fillNewsletterEmail`. `content` is
 * trusted HTML (already-rendered, sanitized Markdown); the rest are plain text we
 * generate, so a straight substitution is safe.
 */

export interface NewsletterEmailVars {
  /** Preheader / inbox snippet (also the document <title>). */
  preview: string;
  /** Large heading under the FAMILIEKALENDEREN kicker. */
  title: string;
  /** e.g. "#6". */
  issue_number: string;
  /** e.g. "juni 2026". */
  issue_date: string;
  /** Rendered HTML body. */
  content: string;
  /** Self-serve manage/unsubscribe link. */
  unsubscribe_url: string;
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', " +
  "'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";
const DIVIDER =
  "width:100%;border:none;border-top:2px solid #eaeaea;margin:0;padding-bottom:1em";

const TEMPLATE = `<!DOCTYPE html>
<html dir="ltr" lang="nb">
<head>
<meta content="width=device-width" name="viewport"/>
<meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection"/>
<title>{{preview}}</title>
<style>@media (prefers-color-scheme: dark){li::marker{color:#c4c4c4}}</style>
</head>
<body dir="ltr" style="margin:0;background-color:#faf6f1">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">{{preview}}</div>
<table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
<tbody><tr><td style="font-family:${FONT_STACK};font-size:14px;line-height:155%;background-color:#faf6f1">
<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:#ffffff;width:100%;border-radius:12px">
<tbody><tr><td style="padding:40px 36px">
<p style="margin:0 0 8px;font-size:12px;color:#a08a76;line-height:165%;letter-spacing:2px;text-align:center">FAMILIEKALENDEREN</p>
<h1 style="margin:0 0 8px;font-size:2.25em;line-height:1.44em;font-weight:600;color:#3f342b;text-align:center">{{title}}</h1>
<p style="margin:0;font-size:13px;color:#8a7867;line-height:165%;font-style:italic;text-align:center">Utgave {{issue_number}} · {{issue_date}}</p>
<hr style="${DIVIDER};margin-top:1.5em"/>
<div style="font-size:1em;color:#3f342b;line-height:165%">{{content}}</div>
<hr style="${DIVIDER};margin-top:1.5em"/>
<p style="margin:0;font-size:12px;color:#a08a76;line-height:165%">Du får denne e-posten fordi du har meldt deg på familiekalenderen. <a href="{{unsubscribe_url}}" style="color:#b8663a;text-decoration:underline" target="_blank"><span style="color:#a08a76">Administrer eller meld deg av</span></a>.</p>
</td></tr></tbody></table>
</td></tr></tbody></table>
</body>
</html>`;

/** Substitute `{{name}}` placeholders. Unknown placeholders resolve to "". */
export function fillNewsletterEmail(vars: NewsletterEmailVars): string {
  return TEMPLATE.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => vars[key as keyof NewsletterEmailVars] ?? "",
  );
}
