/**
 * The fixed palette a group can be tagged with. Each color reuses the app's
 * semantic tokens, so light/dark are handled and group badges stay on-theme.
 * `bg`+`text` style the badge; `bg`+`border` draw the picker swatch (a filled
 * circle ringed in the badge's text color).
 *
 * The literal class strings below must stay visible to Tailwind's scanner —
 * `styles.css` adds `@source "./lib"` so this file is included.
 */
export interface GroupColor {
  key: string;
  label: string;
  bg: string;
  text: string;
  border: string;
  /** Solid fill for the small scanning dot on timeline cards. */
  dot: string;
}

export const GROUP_COLORS: GroupColor[] = [
  {
    key: "slate",
    label: "Slate",
    bg: "bg-gc-slate-soft",
    text: "text-gc-slate",
    border: "border-gc-slate",
    dot: "bg-gc-slate",
  },
  {
    key: "teal",
    label: "Teal",
    bg: "bg-gc-teal-soft",
    text: "text-gc-teal",
    border: "border-gc-teal",
    dot: "bg-gc-teal",
  },
  {
    key: "green",
    label: "Green",
    bg: "bg-gc-green-soft",
    text: "text-gc-green",
    border: "border-gc-green",
    dot: "bg-gc-green",
  },
  {
    key: "blue",
    label: "Blue",
    bg: "bg-gc-blue-soft",
    text: "text-gc-blue",
    border: "border-gc-blue",
    dot: "bg-gc-blue",
  },
  {
    key: "indigo",
    label: "Indigo",
    bg: "bg-gc-indigo-soft",
    text: "text-gc-indigo",
    border: "border-gc-indigo",
    dot: "bg-gc-indigo",
  },
  {
    key: "pink",
    label: "Pink",
    bg: "bg-gc-pink-soft",
    text: "text-gc-pink",
    border: "border-gc-pink",
    dot: "bg-gc-pink",
  },
  {
    key: "rose",
    label: "Rose",
    bg: "bg-gc-rose-soft",
    text: "text-gc-rose",
    border: "border-gc-rose",
    dot: "bg-gc-rose",
  },
  {
    key: "amber",
    label: "Amber",
    bg: "bg-gc-amber-soft",
    text: "text-gc-amber",
    border: "border-gc-amber",
    dot: "bg-gc-amber",
  },
];

export const DEFAULT_GROUP_COLOR = GROUP_COLORS[0].key;

/**
 * The single reserved style for personal lists ("Mine folk"). Deliberately
 * outside GROUP_COLORS: user-created lists are unbounded and must not consume
 * palette slots or dilute the branch color coding, so they all share this
 * neutral look and the admin color picker never offers it.
 */
export const PERSONAL_GROUP_COLOR: GroupColor = {
  key: "personal",
  label: "Personal list",
  bg: "bg-inset",
  text: "text-ink-2",
  border: "border-line",
  dot: "bg-ink-3",
};

function colorOf(key: string | undefined): GroupColor {
  if (key === PERSONAL_GROUP_COLOR.key) return PERSONAL_GROUP_COLOR;
  return GROUP_COLORS.find((color) => color.key === key) ?? GROUP_COLORS[0];
}

/**
 * Palette key for a new branch: the least-used color, first-listed winning
 * ties — so member-created branches stay visually distinct for as long as the
 * palette allows.
 */
export function nextFreeColor(usedColors: string[]): string {
  const counts = new Map(GROUP_COLORS.map((color) => [color.key, 0]));
  for (const used of usedColors) {
    if (counts.has(used)) counts.set(used, counts.get(used)! + 1);
  }
  let best = GROUP_COLORS[0].key;
  for (const [key, count] of counts) {
    if (count < counts.get(best)!) best = key;
  }
  return best;
}

/** Tailwind classes for a group badge (background + text). */
export function groupBadgeClass(key: string | undefined): string {
  const color = colorOf(key);
  return `${color.bg} ${color.text}`;
}

/** Tailwind class for the solid group-colored scanning dot. */
export function groupDotClass(key: string | undefined): string {
  return colorOf(key).dot;
}
