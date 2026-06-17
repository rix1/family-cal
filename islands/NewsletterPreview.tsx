import { useRef, useState } from "preact/hooks";

interface Props {
  /** Server-rendered, sanitized HTML of the draft's Markdown body. */
  html: string;
}

/**
 * Email clients ignore stylesheets pasted alongside HTML, so the rich-text
 * copy clones the rendered preview and bakes every element's computed style
 * into inline `style` attributes before handing HTML + plain text to the
 * clipboard.
 */
function inlineComputedStyles(source: Element, target: Element): void {
  if (target instanceof HTMLElement) {
    target.style.cssText = getComputedStyle(source).cssText;
  }
  for (let i = 0; i < source.children.length; i++) {
    inlineComputedStyles(source.children[i], target.children[i]);
  }
}

export function NewsletterPreview({ html }: Props) {
  const preview = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  async function copyRichText() {
    const node = preview.current;
    if (!node) return;
    try {
      const clone = node.cloneNode(true) as HTMLElement;
      inlineComputedStyles(node, clone);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([clone.outerHTML], { type: "text/html" }),
          "text/plain": new Blob([node.innerText], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between gap-3">
        <p class="kicker">Preview</p>
        <button type="button" onClick={copyRichText} class="btn btn-ghost btn-sm shrink-0">
          {copied ? "Copied" : "Copy rich text"}
        </button>
      </div>
      <div
        ref={preview}
        class="md-preview mt-3"
        // Sanitized server-side by @deno/gfm.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
