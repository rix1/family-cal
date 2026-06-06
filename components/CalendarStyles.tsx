const styles = `
  :root {
    --paper: #f6f1e8;
    --paper-strong: #fffaf1;
    --ink: #1d2422;
    --muted: #68736f;
    --soft-muted: #8a938f;
    --line: #e4dccf;
    --line-strong: #d4c8b8;
    --teal: #0f766e;
    --teal-ink: #0b4f4a;
    --teal-soft: #dff5ee;
    --amber: #b7791f;
    --amber-soft: #fff1c7;
    --blue-soft: #dceeff;
    --blue-ink: #164276;
    --red-soft: #ffe1de;
    --red-ink: #84251d;
    --shadow: 0 18px 55px rgba(52, 41, 24, 0.08), 0 2px 10px rgba(52, 41, 24, 0.05);
    --shadow-tight: 0 10px 30px rgba(52, 41, 24, 0.08), 0 1px 4px rgba(52, 41, 24, 0.05);
  }

  html { scroll-behavior: smooth; }

  body {
    background:
      linear-gradient(
        180deg,
        rgba(255, 250, 241, 0.9) 0%,
        rgba(246, 241, 232, 0.95) 42%,
        rgba(247, 244, 238, 1) 100%
      ),
      var(--paper);
    color: var(--ink);
  }

  .day-dot { box-shadow: 0 0 0 6px rgba(15, 118, 110, 0.12); }
  .topbar {
    border-color: rgba(212, 200, 184, 0.78);
    background: rgba(246, 241, 232, 0.86);
  }
  .eyebrow { color: var(--teal-ink); letter-spacing: 0.18em; }
  .surface {
    border: 1px solid var(--line);
    background: rgba(255, 250, 241, 0.84);
    box-shadow: var(--shadow-tight);
  }
  .surface-raised {
    border: 1px solid var(--line);
    background: rgba(255, 250, 241, 0.94);
    box-shadow: var(--shadow);
  }
  .action {
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 999px;
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1;
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }
  .action:hover { transform: translateY(-1px); }
  .action-primary {
    background: var(--ink);
    color: white;
    box-shadow: 0 10px 24px rgba(29, 36, 34, 0.18);
  }
  .action-primary:hover { background: #2b3330; }
  .action-secondary {
    border: 1px solid var(--line-strong);
    background: rgba(255, 250, 241, 0.78);
    color: var(--ink);
  }
  .action-secondary:hover {
    background: white;
    box-shadow: var(--shadow-tight);
  }
  .month-bar {
    border-color: rgba(212, 200, 184, 0.78);
    background: rgba(246, 241, 232, 0.92);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    padding: 0.35rem 0.7rem;
    font-size: 0.84rem;
    font-weight: 600;
  }
  .chip {
    display: inline-flex;
    cursor: pointer;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: rgba(255, 250, 241, 0.7);
    padding: 0.4rem 0.8rem;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--muted);
    transition:
      background 140ms ease,
      color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease;
  }
  .chip:hover { background: white; }
  .chip[aria-pressed="true"] {
    border-color: var(--teal);
    background: var(--teal-soft);
    color: var(--teal-ink);
    box-shadow: var(--shadow-tight);
  }
  .next-highlight {
    border-color: var(--teal) !important;
    background: var(--teal-soft) !important;
    box-shadow: 0 0 0 1px var(--teal) inset, var(--shadow-tight);
  }

  .person-backdrop { animation: person-backdrop-in 160ms ease-out both; }
  .person-backdrop.is-closing { animation: person-backdrop-out 180ms ease-in both; }
  .person-sheet {
    transform: translateY(100%);
    transition: transform 190ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .person-sheet.is-open { transform: translateY(0); }

  @keyframes person-backdrop-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes person-backdrop-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @media (min-width: 640px) {
    .person-sheet { transform: translateX(100%); }
    .person-sheet.is-open { transform: translateX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .person-backdrop,
    .person-backdrop.is-closing {
      animation-duration: 1ms;
    }
    .person-sheet { transition-duration: 1ms; }
  }

  .toast {
    pointer-events: none;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 180ms ease, transform 180ms ease;
  }
  .toast.visible {
    opacity: 1;
    transform: translateY(0);
  }

  html[data-theme="dark"] {
      --paper: #111412;
      --paper-strong: #191e1b;
      --ink: #edf2ef;
      --muted: #a8b1ac;
      --soft-muted: #858e89;
      --line: #303733;
      --line-strong: #414a45;
      --teal: #45b8a9;
      --teal-ink: #8edbd0;
      --teal-soft: #15352f;
      --amber: #d9a441;
      --amber-soft: #3b2f17;
      --blue-soft: #172d43;
      --blue-ink: #a8d2ff;
      --red-soft: #402321;
      --red-ink: #ffb4ad;
      --shadow: 0 18px 55px rgba(0, 0, 0, 0.3), 0 2px 10px rgba(0, 0, 0, 0.24);
      --shadow-tight: 0 10px 30px rgba(0, 0, 0, 0.24), 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  html[data-theme="dark"] body {
      background:
        linear-gradient(
          180deg,
          rgba(25, 30, 27, 0.96) 0%,
          rgba(17, 20, 18, 0.98) 48%,
          rgba(14, 17, 15, 1) 100%
        ),
        var(--paper);
  }

  html[data-theme="dark"] .topbar,
  html[data-theme="dark"] .month-bar {
      border-color: rgba(65, 74, 69, 0.86);
      background: rgba(17, 20, 18, 0.9);
  }

  html[data-theme="dark"] .surface { background: rgba(25, 30, 27, 0.88); }
  html[data-theme="dark"] .surface-raised { background: rgba(27, 32, 29, 0.96); }
  html[data-theme="dark"] .action-primary { background: #edf2ef; color: #17201c; }
  html[data-theme="dark"] .action-primary:hover { background: white; }
  html[data-theme="dark"] .action-secondary { background: rgba(25, 30, 27, 0.88); }
  html[data-theme="dark"] .action-secondary:hover { background: #242a26; }
  html[data-theme="dark"] .chip { background: rgba(25, 30, 27, 0.8); }
  html[data-theme="dark"] .chip:hover { background: #242a26; }
`;

export function CalendarStyles() {
  return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}
