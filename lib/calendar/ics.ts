import type { ViewEvent, ViewPerson } from "@/lib/view_data.ts";
import { exportIcon, occasionLabel } from "@/lib/calendar/labels.ts";
import { hasYear, monthDayOf } from "@/lib/calendar/people.ts";

/** The current filter view as a downloadable yearly-recurring iCalendar file. */
export function buildIcs(options: {
  people: ViewPerson[];
  occasions: ViewEvent[];
  activeGroups: Set<string>;
  activeTypes: Set<string>;
  query: string;
  today: Date;
}): { ics: string; count: number } {
  const { people, occasions, activeGroups, activeTypes, query, today } = options;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//family-cal//Family Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const stamp = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${
    String(
      today.getUTCDate(),
    ).padStart(2, "0")
  }T000000Z`;
  const q = query.trim().toLowerCase();
  const exported = people.filter(
    (p) =>
      p.date &&
      activeGroups.has(p.affiliation) &&
      activeTypes.has(p.type || "birthday") &&
      (!q || `${p.name} ${p.notes || ""}`.toLowerCase().includes(q)),
  );
  for (const [i, p] of exported.entries()) {
    const md = monthDayOf(p).replace("-", "");
    const sy = hasYear(p) ? p.date.slice(0, 4) : "2000";
    const summary = `${exportIcon(p.type)} ${p.name}`;
    const uid = `${md}-${i}-${p.name.replace(/[^a-z0-9]/gi, "")}@family-cal`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${sy}${md}`,
      "RRULE:FREQ=YEARLY",
      `SUMMARY:${summary}`,
      p.notes
        ? `DESCRIPTION:${p.notes.replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n")}`
        : "DESCRIPTION:",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  const exportedOccasions = occasions.filter(
    (occasion) =>
      activeTypes.has(occasion.kind) &&
      occasion.groups.some((group) => activeGroups.has(group)) &&
      (!q ||
        `${occasion.title} ${occasion.notes}`
          .toLowerCase()
          .includes(q)),
  );
  for (const occasion of exportedOccasions) {
    const hasYr = occasion.date.length === 10;
    const md = (hasYr ? occasion.date.slice(5) : occasion.date).replace("-", "");
    const sy = hasYr ? occasion.date.slice(0, 4) : "2000";
    lines.push(
      "BEGIN:VEVENT",
      `UID:event-${occasion.id}@family-cal`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${sy}${md}`,
      "RRULE:FREQ=YEARLY",
      `SUMMARY:${exportIcon(occasion.kind)} ${occasion.title} (${
        occasionLabel(occasion.kind).toLowerCase()
      })`,
      occasion.notes
        ? `DESCRIPTION:${occasion.notes.replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n")}`
        : "DESCRIPTION:",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n"), count: exported.length + exportedOccasions.length };
}
