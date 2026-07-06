import { t } from "@/lib/i18n.ts";
import { useRef, useState } from "preact/hooks";
import { addDays, shortDate, shortDateFormat, toKey } from "@/lib/calendar/dates.ts";

// ---- Year heatmap experiment (delete this file + its call site to remove) ----

interface HeatmapEvent {
  date: string;
  text: string;
}

interface HeatmapCell {
  label: string;
  events: HeatmapEvent[];
  isCurrentWeek: boolean;
}

const heatmapCellSize = 13;
const heatmapGap = 4;
const heatmapColumns = 13;

/** One cell per week (Sun-Sat) spanning the full calendar `year`. */
export function weekCells(
  year: number,
  eventMap: Map<string, string[]>,
  todayKey: string,
): HeatmapCell[] {
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const cells: HeatmapCell[] = [];
  let cursor = start;
  while (cursor <= end) {
    const events: HeatmapEvent[] = [];
    let firstInYear: Date | null = null;
    let isCurrentWeek = false;
    for (let i = 0; i < 7; i++) {
      const date = toKey(cursor);
      if (date === todayKey) isCurrentWeek = true;
      if (cursor.getFullYear() === year) {
        firstInYear ??= cursor;
        for (const text of eventMap.get(date) ?? []) events.push({ date, text });
      }
      cursor = addDays(cursor, 1);
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    const label = firstInYear
      ? t("calendar.weekOf", { date: shortDateFormat().format(firstInYear) })
      : "";
    cells.push({ label, events, isCurrentWeek });
  }
  return cells;
}

const heatmapLevelClasses = [
  "bg-inset",
  "bg-accent/25",
  "bg-accent/50",
  "bg-accent/75",
  "bg-accent",
];

function heatmapLevelClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return heatmapLevelClasses[0];
  const level = Math.max(1, Math.min(4, Math.ceil((count / max) * 4)));
  return heatmapLevelClasses[level];
}

/** The week-by-week activity grid plus its hover/focus tooltip and legend. */
export function YearHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const max = Math.max(1, ...cells.map((cell) => cell.events.length));
  const wrap = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<{ cell: HeatmapCell; left: number; top: number } | null>(null);

  function showTip(target: HTMLElement, cell: HeatmapCell) {
    const wrapEl = wrap.current;
    if (!wrapEl) return;
    const wrapRect = wrapEl.getBoundingClientRect();
    const cellRect = target.getBoundingClientRect();
    setTip({
      cell,
      left: cellRect.left - wrapRect.left + cellRect.width / 2,
      top: cellRect.top - wrapRect.top,
    });
  }

  return (
    <div ref={wrap} class="relative">
      <div
        class="grid"
        style={{
          gridTemplateColumns: `repeat(${heatmapColumns}, ${heatmapCellSize}px)`,
          gap: `${heatmapGap}px`,
        }}
      >
        {cells.map((cell, i) => (
          <div
            key={i}
            tabIndex={0}
            aria-label={cell.events.length
              ? `${cell.label}: ${cell.events.length} ${
                cell.events.length === 1 ? t("calendar.eventOne") : t("calendar.eventOther")
              }, ${cell.events.map((event) => event.text).join(", ")}`
              : cell.label}
            onMouseEnter={(e) => showTip(e.currentTarget, cell)}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => showTip(e.currentTarget, cell)}
            onBlur={() => setTip(null)}
            class={`rounded-[2px] outline-none ${heatmapLevelClass(cell.events.length, max)} ${
              cell.isCurrentWeek ? "ring-2 ring-accent" : ""
            }`}
            style={{ width: `${heatmapCellSize}px`, height: `${heatmapCellSize}px` }}
          />
        ))}
      </div>
      <div
        class={`heatmap-tip ${tip ? "visible" : ""}`}
        style={tip ? { left: `${tip.left}px`, top: `${tip.top}px` } : undefined}
      >
        {tip && (
          <>
            <p class="text-[0.625rem] font-semibold uppercase tracking-wide text-page/60">
              {tip.cell.label}
            </p>
            {tip.cell.events.length
              ? (
                <ul class="mt-0.5 grid gap-0.5">
                  {tip.cell.events.map((event, i) => (
                    <li key={i}>
                      {shortDate(event.date)}: {event.text}
                    </li>
                  ))}
                </ul>
              )
              : <p class="mt-0.5">{t("calendar.noEvents")}</p>}
          </>
        )}
      </div>
      <div class="mt-1.5 flex items-center justify-end gap-1 text-[0.625rem] text-ink-3">
        <span>{t("calendar.less")}</span>
        {heatmapLevelClasses.map((cls, level) => (
          <span
            key={level}
            class={`rounded-[2px] ${cls}`}
            style={{ width: "9px", height: "9px" }}
          />
        ))}
        <span>{t("calendar.more")}</span>
      </div>
    </div>
  );
}
