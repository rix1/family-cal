const iconProps = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.4",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": true,
} as const;

/* Four-point spark marking milestone birthdays. */
export function SparkIcon({ class: cls = "size-3" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <path d="M8 2.2 9.3 6.7 13.8 8 9.3 9.3 8 13.8 6.7 9.3 2.2 8 6.7 6.7Z" />
    </svg>
  );
}

/* Bulleted lines for the timeline view toggle. */
export function ListIcon({ class: cls = "size-4" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8" />
      <path d="M2.4 4.5h.01M2.4 8h.01M2.4 11.5h.01" />
    </svg>
  );
}

/* Grid for the table view toggle. */
export function TableIcon({ class: cls = "size-4" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.2" />
      <path d="M2.5 6.5h11M6.5 6.5V13" />
    </svg>
  );
}

/* Check mark for confirmed states. */
export function CheckIcon({ class: cls = "size-4" }: { class?: string }) {
  return (
    <svg class={cls} {...iconProps}>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

/* Event-type glyphs: cake, candle, rings, droplet, spark, pennant. */
export function TypeIcon({ type, class: cls = "size-4" }: { type: string; class?: string }) {
  if (type === "memorial") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M6.6 13.5V9.2c0-.4.3-.7.7-.7h1.4c.4 0 .7.3.7.7v4.3" />
        <path d="M4.5 13.5h7" />
        <path d="M8 6.6c1-.7 1-2 0-2.9-1 .9-1 2.2 0 2.9Z" />
      </svg>
    );
  }
  if (type === "anniversary" || type === "wedding") {
    return (
      <svg class={cls} {...iconProps}>
        <circle cx="6" cy="9.2" r="3.4" />
        <circle cx="10" cy="9.2" r="3.4" />
      </svg>
    );
  }
  if (type === "baptism") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M8 2.5C5.7 5.6 4.6 7.7 4.6 9.5a3.4 3.4 0 0 0 6.8 0c0-1.8-1.1-3.9-3.4-7Z" />
      </svg>
    );
  }
  if (type === "confirmation") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M8 2.2 9.3 6.7 13.8 8 9.3 9.3 8 13.8 6.7 9.3 2.2 8 6.7 6.7Z" />
      </svg>
    );
  }
  if (type === "other") {
    return (
      <svg class={cls} {...iconProps}>
        <path d="M4.2 13.8V2.5" />
        <path d="M4.2 2.8h7.3L9.6 5.4l1.9 2.6H4.2" />
      </svg>
    );
  }
  return (
    <svg class={cls} {...iconProps}>
      <path d="M3.2 13.5V9.9c0-.7.6-1.3 1.3-1.3h7c.7 0 1.3.6 1.3 1.3v3.6" />
      <path d="M1.8 13.5h12.4" />
      <path d="M8 8.6V6.4" />
      <path d="M8 4.8c.8-.5.8-1.6 0-2.3-.8.7-.8 1.8 0 2.3Z" />
    </svg>
  );
}
