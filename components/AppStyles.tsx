const styles = `
  :root {
    color-scheme: light dark;
  }

  body {
    margin: 0;
    background: #f7f4ee;
    color: #1d2422;
  }

  .site-header {
    position: sticky;
    top: 0;
    z-index: 40;
    border-bottom: 1px solid rgba(212, 200, 184, .78);
    background: rgba(246, 241, 232, .9);
    backdrop-filter: blur(16px);
  }

  .site-header-inner {
    display: flex;
    max-width: 80rem;
    min-height: 4.5rem;
    margin: 0 auto;
    padding: .75rem 1.25rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    box-sizing: border-box;
  }

  .site-header-title {
    min-width: 0;
  }

  .site-header-eyebrow {
    margin: 0;
    color: #0b4f4a;
    font-size: .7rem;
    font-weight: 700;
    letter-spacing: .16em;
    text-transform: uppercase;
  }

  .site-header-title h1 {
    overflow: hidden;
    margin: .2rem 0 0;
    font-size: 1.3rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .site-header-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: .6rem;
  }

  .site-header-access {
    border: 1px solid #d4c8b8;
    border-radius: 999px;
    padding: .65rem .9rem;
    color: inherit;
    font-size: .85rem;
    font-weight: 650;
    text-decoration: none;
  }

  .account-menu {
    position: relative;
  }

  .account-menu summary {
    display: flex;
    min-height: 2.5rem;
    align-items: center;
    gap: .55rem;
    border: 1px solid #d4c8b8;
    border-radius: 999px;
    background: rgba(255, 250, 241, .82);
    padding: .25rem .65rem .25rem .3rem;
    color: inherit;
    font-size: .85rem;
    font-weight: 650;
    list-style: none;
    cursor: pointer;
    box-sizing: border-box;
  }

  .account-menu summary::-webkit-details-marker {
    display: none;
  }

  .account-menu summary:hover {
    background: #fffaf1;
  }

  .account-avatar {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 999px;
    background: #1d2422;
    color: white;
    font-size: .72rem;
    letter-spacing: .04em;
  }

  .account-chevron {
    width: .42rem;
    height: .42rem;
    margin: 0 .2rem 0 .1rem;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-.12rem) rotate(45deg);
    transition: transform 140ms ease;
  }

  .account-menu[open] .account-chevron {
    transform: translateY(.12rem) rotate(225deg);
  }

  .account-popover {
    position: absolute;
    top: calc(100% + .55rem);
    right: 0;
    display: grid;
    min-width: 13rem;
    overflow: hidden;
    border: 1px solid #d4c8b8;
    border-radius: .9rem;
    background: #fffaf1;
    padding: .4rem;
    box-shadow: 0 18px 55px rgba(52, 41, 24, .14);
  }

  .account-popover a,
  .account-popover button {
    display: block;
    width: 100%;
    border: 0;
    border-radius: .6rem;
    background: transparent;
    padding: .7rem .75rem;
    color: inherit;
    font: inherit;
    font-size: .86rem;
    font-weight: 600;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    box-sizing: border-box;
  }

  .account-popover a:hover,
  .account-popover button:hover {
    background: #efe8dc;
  }

  .account-popover hr {
    width: 100%;
    margin: .35rem 0;
    border: 0;
    border-top: 1px solid #e4dccf;
  }

  .theme-toggle {
    display: block;
  }

  html[data-theme="dark"] body {
    background: #111412;
    color: #edf2ef;
  }

  html[data-theme="dark"] .site-header {
    border-color: #343a37;
    background: rgba(17, 20, 18, .9);
  }

  html[data-theme="dark"] .site-header-eyebrow {
    color: #8edbd0;
  }

  html[data-theme="dark"] .site-header-access,
  html[data-theme="dark"] .account-menu summary {
    border-color: #414a45;
    background: rgba(25, 30, 27, .9);
  }

  html[data-theme="dark"] .account-menu summary:hover,
  html[data-theme="dark"] .account-popover {
    background: #191e1b;
  }

  html[data-theme="dark"] .account-popover {
    border-color: #414a45;
    box-shadow: 0 18px 55px rgba(0, 0, 0, .32);
  }

  html[data-theme="dark"] .account-popover a:hover,
  html[data-theme="dark"] .account-popover button:hover {
    background: #252b27;
  }

  html[data-theme="dark"] .account-popover hr {
    border-color: #343a37;
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

  @media (max-width: 520px) {
    .site-header-inner {
      padding-inline: 1rem;
    }

    .account-name {
      display: none;
    }

  }
`;

export function AppStyles() {
  return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}
