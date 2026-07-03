import { useEffect, useRef, useState } from "preact/hooks";

interface Props {
  /** The complete email HTML document, exactly as it is sent via Resend. */
  html: string;
}

/** How long typing must pause before the preview re-renders. */
const DEBOUNCE_MS = 600;

/**
 * Renders the full email document (template chrome included) in a sandboxed
 * iframe, so the admin previews exactly what recipients get — page styles
 * can't leak in, and the email's own inline styles apply.
 *
 * The preview follows the editor live: edits to the subject/title/body fields
 * are debounced and posted to the route's read-only `preview` action, which
 * renders the email for the unsaved values. "Copy HTML" hands the currently
 * shown document to the clipboard for pasting into email testers.
 */
export function NewsletterPreview({ html }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState(html);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // The editor form is server-rendered JSX (not part of this island), so we
    // reach it by field name; sent drafts render no form and this is a no-op.
    const fields = document.querySelectorAll<HTMLElement>(
      'input[name="subject"], input[name="title"], textarea[name="body"]',
    );
    if (!fields.length) return;

    let timer: number | undefined;
    let controller: AbortController | undefined;

    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      setRefreshing(true);
      try {
        const data = new FormData();
        data.set("action", "preview");
        for (const field of fields) {
          const input = field as HTMLInputElement | HTMLTextAreaElement;
          data.set(input.name, input.value);
        }
        const res = await fetch(globalThis.location.pathname, {
          method: "POST",
          body: data,
          signal: controller.signal,
        });
        if (res.ok) setDoc(await res.text());
      } catch {
        // Aborted by a newer edit, or offline — the previous preview stands.
      } finally {
        setRefreshing(false);
      }
    };

    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, DEBOUNCE_MS);
    };
    for (const field of fields) field.addEventListener("input", onInput);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      for (const field of fields) field.removeEventListener("input", onInput);
    };
  }, []);

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(doc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between gap-3">
        <p class="kicker">
          Email preview
          {refreshing && <span class="ml-2 font-normal normal-case text-ink-3">updating…</span>}
        </p>
        <button type="button" onClick={copyHtml} class="btn btn-ghost btn-sm shrink-0">
          {copied ? "Copied" : "Copy HTML"}
        </button>
      </div>
      <iframe
        ref={frame}
        srcDoc={doc}
        // Scripts stay blocked; same-origin only so onLoad can read the height.
        sandbox="allow-same-origin"
        title="Newsletter email preview"
        class="mt-3 h-[40rem] w-full rounded-lg border border-line bg-white"
        // Size to the email's own layout once loaded, capped by the class height.
        onLoad={() => {
          const body = frame.current?.contentDocument?.body;
          if (body && frame.current) {
            frame.current.style.height = `${Math.min(body.scrollHeight + 32, 900)}px`;
          }
        }}
      />
    </div>
  );
}
