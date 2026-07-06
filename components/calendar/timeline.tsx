import { groupBadgeClass } from "@/lib/group_colors.ts";
import { t } from "@/lib/i18n.ts";
import type { ViewGroup, ViewPerson } from "@/lib/view_data.ts";
import { dayFormat, parseDate, relativeLabel } from "@/lib/calendar/dates.ts";
import { ageText, type BirthdayEvent, type CalendarEvent } from "@/lib/calendar/events.ts";
import { occasionLabel } from "@/lib/calendar/labels.ts";
import { SparkIcon, TypeIcon } from "@/components/calendar/icons.tsx";
import { LinkedNotes, PersonDate } from "@/components/calendar/text.tsx";

/** Context every card needs: the day anchor, badges, and mention links. */
export interface TimelineContext {
  todayKey: string;
  groups: Record<string, ViewGroup>;
  /** Roster keyed by lowercased person id, for resolving @-mentions. */
  personLookup: Map<string, ViewPerson>;
  onOpenPerson: (person: ViewPerson) => void;
}

/** Compact "next up" / "recently celebrated" birthday line. */
export function SummaryCard({
  event,
  highlight = false,
  ctx,
}: {
  event: BirthdayEvent;
  highlight?: boolean;
  ctx: TimelineContext;
}) {
  // "today" is already carried by the relative label, so drop ageText's suffix.
  const age = ageText(event, ctx.todayKey, true);
  const relative = relativeLabel(event.date, ctx.todayKey);
  const when = `${relative.charAt(0).toUpperCase()}${relative.slice(1)}`;
  return (
    <div
      class={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${highlight ? "bg-accent-soft" : ""}`}
    >
      <div
        class={`grid size-10 shrink-0 place-items-center rounded-lg ${
          event.flare
            ? "bg-gold-soft text-gold"
            : highlight
            ? "bg-surface text-accent-2"
            : "bg-inset text-ink-2"
        }`}
      >
        <TypeIcon type={event.type} />
      </div>
      <div class="min-w-0">
        <p class="flex items-center gap-2 truncate text-sm">
          <button
            type="button"
            class="truncate text-left font-semibold hover:underline"
            onClick={() => ctx.onOpenPerson(event.person)}
          >
            {event.name}
          </button>
          {highlight && <span class="badge bg-accent text-on-accent">{t("calendar.next")}</span>}
        </p>
        <p class="text-sm tabular-nums">
          <span class={`${highlight ? "text-accent-2" : "text-ink"}`}>
            {when}
          </span>
          <span class={highlight ? "text-accent-2/70" : "text-ink-3"}>
            {" · "}
            <PersonDate value={event.date} short />
            {age ? ` · ${age}` : ""}
          </span>
        </p>
      </div>
    </div>
  );
}

export function EventCard({ event, ctx }: { event: CalendarEvent; ctx: TimelineContext }) {
  const { groups, personLookup, onOpenPerson } = ctx;
  if (event.type === "holiday") {
    return (
      <div class="rounded-lg bg-inset px-3.5 py-2.5">
        <p class="text-sm font-medium text-ink-2">{event.name}</p>
      </div>
    );
  }
  if (event.type === "occasion") {
    const yearsText = event.years && event.years > 0
      ? (event.years === 1 ? t("calendar.oneYear") : t("calendar.nYears", { count: event.years }))
      : "";
    return (
      <div
        id={`event-${event.occasion.id}-${event.date}`}
        class="card flex items-start gap-3 p-3"
      >
        <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-2">
          <TypeIcon type={event.kind} />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-semibold">{event.name}</p>
            <span class="badge bg-inset text-ink-2">{occasionLabel(event.kind)}</span>
          </div>
          <p class="mt-0.5 text-sm text-ink-2">
            {yearsText}
            {yearsText && event.occasion.notes && " · "}
            {event.occasion.notes
              ? (
                <LinkedNotes
                  text={event.occasion.notes}
                  personLookup={personLookup}
                  onOpenPerson={onOpenPerson}
                />
              )
              : !yearsText && occasionLabel(event.kind)}
          </p>
        </div>
      </div>
    );
  }
  if (event.type === "memorial") {
    const group = groups[event.person.affiliation];
    // "i 2003, 22 år siden" — the death is a full YYYY-MM-DD date by model rule.
    const deathYear = Number(event.person.died!.slice(0, 4));
    const yearsSince = Number(event.date.slice(0, 4)) - deathYear;
    const sinceText = yearsSince === 1
      ? t("calendar.deathAnniversaryYears.one", { year: deathYear })
      : yearsSince > 1
      ? t("calendar.deathAnniversaryYears.other", { year: deathYear, count: yearsSince })
      : "";
    return (
      <div
        id={`event-${event.person.id}-${event.date}-memorial`}
        class="card flex items-start gap-3 p-3"
      >
        <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-inset text-ink-2">
          <TypeIcon type="memorial" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="font-semibold hover:underline"
              onClick={() => onOpenPerson(event.person)}
            >
              {t("calendar.inMemoryOf", { name: event.person.name })}
            </button>
            {group && (
              <span class={`badge ml-auto ${groupBadgeClass(group.color)}`}>
                {group.label}
              </span>
            )}
          </div>
          <p class="mt-0.5 text-sm text-ink-2">
            {t("calendar.deathAnniversary")}
            {sinceText && ` — ${sinceText}`}
            {event.person.notes && (
              <>
                {" · "}
                <LinkedNotes
                  text={event.person.notes}
                  personLookup={personLookup}
                  onOpenPerson={onOpenPerson}
                />
              </>
            )}
          </p>
        </div>
      </div>
    );
  }
  const group = groups[event.person.affiliation];
  const age = ageText(event, ctx.todayKey);
  const notes = event.person.notes;
  return (
    <div
      id={`event-${event.person.id}-${event.date}`}
      class="card flex items-start gap-3 p-3"
    >
      <div
        class={`grid size-10 shrink-0 place-items-center rounded-lg ${
          event.flare ? "bg-gold-soft text-gold" : "bg-accent-soft text-accent-2"
        }`}
      >
        <TypeIcon type={event.person.died ? "memorial" : event.type} />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="font-semibold hover:underline"
            onClick={() => onOpenPerson(event.person)}
          >
            {event.name}
          </button>
          {event.flare && (
            <span class="badge bg-gold-soft text-gold">
              <SparkIcon /> {event.age}
            </span>
          )}
          {group && (
            <span class={`badge ml-auto ${groupBadgeClass(group.color)}`}>
              {group.label}
            </span>
          )}
        </div>
        <p class="mt-0.5 text-sm text-ink-2">
          {age}
          {age && notes && " · "}
          {notes
            ? <LinkedNotes text={notes} personLookup={personLookup} onOpenPerson={onOpenPerson} />
            : !age && t("calendar.birthday")}
        </p>
      </div>
    </div>
  );
}

/** One timeline day: the date column plus its stack of event cards. */
export function DayGroup({
  dateKey,
  dayEvents,
  ctx,
}: {
  dateKey: string;
  dayEvents: CalendarEvent[];
  ctx: TimelineContext;
}) {
  const isToday = dateKey === ctx.todayKey;
  const d = parseDate(dateKey);
  return (
    <div
      id={`day-${dateKey}`}
      class="grid gap-x-4 gap-y-2 sm:grid-cols-[72px_1fr]"
      style={{ scrollMarginTop: "118px" }}
    >
      <PersonDate
        value={dateKey}
        class="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:pt-2.5 sm:text-right"
      >
        <span
          class={`text-xl font-semibold leading-none tabular-nums ${
            isToday ? "text-accent-2" : "text-ink"
          }`}
        >
          {d.getDate()}
        </span>
        <span class={`kicker ${isToday ? "text-accent-2" : ""}`}>
          {dayFormat().format(d).slice(0, 3)}
        </span>
        {isToday && (
          <span class="badge bg-accent text-on-accent sm:mt-1">
            {t("calendar.today")}
          </span>
        )}
      </PersonDate>
      <div class="space-y-2">
        {dayEvents.length
          ? (
            dayEvents.map((event) => (
              <EventCard
                key={`${event.type}-${event.date}-${event.name}`}
                event={event}
                ctx={ctx}
              />
            ))
          )
          : (
            <div class="rounded-lg border border-dashed border-line-2 px-3.5 py-3 text-sm text-ink-3">
              {t("calendar.nothingToday")}
            </div>
          )}
      </div>
    </div>
  );
}
