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
}

export const GROUP_COLORS: GroupColor[] = [
  {
    key: "slate",
    label: "Slate",
    bg: "bg-gc-slate-soft",
    text: "text-gc-slate",
    border: "border-gc-slate",
  },
  {
    key: "teal",
    label: "Teal",
    bg: "bg-gc-teal-soft",
    text: "text-gc-teal",
    border: "border-gc-teal",
  },
  {
    key: "green",
    label: "Green",
    bg: "bg-gc-green-soft",
    text: "text-gc-green",
    border: "border-gc-green",
  },
  {
    key: "blue",
    label: "Blue",
    bg: "bg-gc-blue-soft",
    text: "text-gc-blue",
    border: "border-gc-blue",
  },
  {
    key: "indigo",
    label: "Indigo",
    bg: "bg-gc-indigo-soft",
    text: "text-gc-indigo",
    border: "border-gc-indigo",
  },
  {
    key: "pink",
    label: "Pink",
    bg: "bg-gc-pink-soft",
    text: "text-gc-pink",
    border: "border-gc-pink",
  },
  {
    key: "rose",
    label: "Rose",
    bg: "bg-gc-rose-soft",
    text: "text-gc-rose",
    border: "border-gc-rose",
  },
  {
    key: "amber",
    label: "Amber",
    bg: "bg-gc-amber-soft",
    text: "text-gc-amber",
    border: "border-gc-amber",
  },
];

export const DEFAULT_GROUP_COLOR = GROUP_COLORS[0].key;

function colorOf(key: string | undefined): GroupColor {
  return GROUP_COLORS.find((color) => color.key === key) ?? GROUP_COLORS[0];
}

/** Tailwind classes for a group badge (background + text). */
export function groupBadgeClass(key: string | undefined): string {
  const color = colorOf(key);
  return `${color.bg} ${color.text}`;
}
