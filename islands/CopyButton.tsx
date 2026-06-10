import { useState } from "preact/hooks";

interface Props {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = "Copy" }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copy} class="btn btn-ghost btn-sm shrink-0">
      {copied ? "Copied" : label}
    </button>
  );
}
