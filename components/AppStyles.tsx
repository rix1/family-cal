const styles = `
  :root {
    color-scheme: light dark;
  }

  body {
    margin: 0;
    background: #f7f4ee;
    color: #1d2422;
  }

  @media (prefers-color-scheme: dark) {
    body {
      background: #111412;
      color: #edf2ef;
    }

    input,
    textarea,
    select {
      border-color: #3b423e !important;
      background-color: #181c1a !important;
      color: #edf2ef !important;
    }

    input::placeholder,
    textarea::placeholder {
      color: #858e89;
    }

    [class~="bg-white"],
    [class*="bg-white/"] {
      background-color: rgba(27, 32, 29, 0.94) !important;
    }

    [class~="bg-zinc-50"] {
      background-color: #111412 !important;
    }

    [class~="bg-zinc-100"] {
      background-color: #252a27 !important;
    }

    [class~="bg-teal-50"] {
      background-color: #17332f !important;
    }

    [class~="bg-red-50"] {
      background-color: #3a2020 !important;
    }

    [class~="bg-amber-50"] {
      background-color: #382d16 !important;
    }

    [class~="bg-stone-100/80"] {
      background-color: rgba(38, 37, 34, 0.9) !important;
    }

    [class~="bg-stone-200"] {
      background-color: #363431 !important;
    }

    [class~="text-zinc-950"],
    [class~="text-zinc-900"] {
      color: #f4f4f5 !important;
    }

    [class~="text-zinc-700"],
    [class~="text-zinc-600"] {
      color: #c4cbc7 !important;
    }

    [class~="text-zinc-500"],
    [class~="text-zinc-400"] {
      color: #929b96 !important;
    }

    [class~="text-red-800"],
    [class~="text-red-600"] {
      color: #fca5a5 !important;
    }

    [class~="text-amber-900"] {
      color: #fde68a !important;
    }

    [class~="border-zinc-200"],
    [class~="border-zinc-300"] {
      border-color: #343a37 !important;
    }

    [class~="divide-zinc-200"] > :not([hidden]) ~ :not([hidden]) {
      border-color: #343a37 !important;
    }
  }
`;

export function AppStyles() {
  return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}
