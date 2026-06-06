const styles = `
  :root {
    color-scheme: light dark;
  }

  body {
    margin: 0;
    background: #f7f4ee;
    color: #1d2422;
  }

  .theme-toggle {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 60;
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    gap: .45rem;
    border: 1px solid #d4c8b8;
    border-radius: 999px;
    background: rgba(255, 250, 241, .94);
    padding: .6rem .85rem;
    color: #1d2422;
    font: inherit;
    font-size: .8rem;
    font-weight: 650;
    box-shadow: 0 10px 30px rgba(52, 41, 24, .12);
    cursor: pointer;
  }

  .theme-toggle:hover {
    transform: translateY(-1px);
  }

  html[data-theme="dark"] body {
    background: #111412;
    color: #edf2ef;
  }

  html[data-theme="dark"] input,
  html[data-theme="dark"] textarea,
  html[data-theme="dark"] select {
    border-color: #3b423e !important;
    background-color: #181c1a !important;
    color: #edf2ef !important;
  }

  html[data-theme="dark"] input::placeholder,
  html[data-theme="dark"] textarea::placeholder {
    color: #858e89;
  }

  html[data-theme="dark"] [class~="bg-white"],
  html[data-theme="dark"] [class*="bg-white/"] {
    background-color: rgba(27, 32, 29, 0.94) !important;
  }

  html[data-theme="dark"] [class~="bg-zinc-50"] {
    background-color: #111412 !important;
  }

  html[data-theme="dark"] [class~="bg-zinc-100"] {
    background-color: #252a27 !important;
  }

  html[data-theme="dark"] [class~="bg-teal-50"] {
    background-color: #17332f !important;
  }

  html[data-theme="dark"] [class~="bg-red-50"] {
    background-color: #3a2020 !important;
  }

  html[data-theme="dark"] [class~="bg-amber-50"] {
    background-color: #382d16 !important;
  }

  html[data-theme="dark"] [class~="bg-stone-100/80"] {
    background-color: rgba(38, 37, 34, 0.9) !important;
  }

  html[data-theme="dark"] [class~="bg-stone-200"] {
    background-color: #363431 !important;
  }

  html[data-theme="dark"] [class~="text-zinc-950"],
  html[data-theme="dark"] [class~="text-zinc-900"] {
    color: #f4f4f5 !important;
  }

  html[data-theme="dark"] [class~="text-zinc-700"],
  html[data-theme="dark"] [class~="text-zinc-600"] {
    color: #c4cbc7 !important;
  }

  html[data-theme="dark"] [class~="text-zinc-500"],
  html[data-theme="dark"] [class~="text-zinc-400"] {
    color: #929b96 !important;
  }

  html[data-theme="dark"] [class~="text-red-800"],
  html[data-theme="dark"] [class~="text-red-600"] {
    color: #fca5a5 !important;
  }

  html[data-theme="dark"] [class~="text-amber-900"] {
    color: #fde68a !important;
  }

  html[data-theme="dark"] [class~="border-zinc-200"],
  html[data-theme="dark"] [class~="border-zinc-300"] {
    border-color: #343a37 !important;
  }

  html[data-theme="dark"] [class~="divide-zinc-200"] > :not([hidden]) ~ :not([hidden]) {
    border-color: #343a37 !important;
  }

  html[data-theme="dark"] .theme-toggle {
    border-color: #414a45;
    background: rgba(25, 30, 27, .96);
    color: #edf2ef;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .28);
  }

  @media (max-width: 520px) {
    .theme-toggle-label {
      display: none;
    }
  }
`;

export function AppStyles() {
  return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}
