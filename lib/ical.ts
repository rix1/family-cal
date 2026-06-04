import type { CalEvent } from "./model.ts";
import { compactDate, compactStampUTC } from "./dates.ts";

const encoder = new TextEncoder();

/** Escape a TEXT value per RFC 5545 (backslash, semicolon, comma, newlines). */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to <= 75 octets, with continuation lines beginning with a
 * single space (RFC 5545 §3.1). Splits on character boundaries so multi-byte
 * UTF-8 (e.g. emoji) is never cut mid-codepoint.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const segments: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75; // continuation lines reserve 1 octet for the leading space
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (bytes + chBytes > limit) {
      segments.push(current);
      current = ch;
      bytes = chBytes;
      limit = 74;
    } else {
      current += ch;
      bytes += chBytes;
    }
  }
  if (current) segments.push(current);
  return segments.join("\r\n ");
}

export interface CalendarOptions {
  calName: string;
  /** Fixed timestamp for DTSTAMP; defaults to now. Injectable for tests. */
  dtstamp?: Date;
}

/** Serialize calendar events into an RFC 5545 iCalendar document. */
export function toICalendar(events: CalEvent[], opts: CalendarOptions): string {
  const stamp = compactStampUTC(opts.dtstamp ?? new Date());
  const lines: string[] = [];
  const prop = (line: string) => lines.push(foldLine(line));

  lines.push("BEGIN:VCALENDAR");
  prop("PRODID:-//family-cal//Family Calendar//EN");
  lines.push("VERSION:2.0");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  prop(`X-WR-CALNAME:${escapeText(opts.calName)}`);

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    prop(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${compactDate(ev.start)}`);
    if (ev.recurring) lines.push("RRULE:FREQ=YEARLY");
    prop(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) prop(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.categories?.length) prop(`CATEGORIES:${ev.categories.map(escapeText).join(",")}`);
    lines.push("TRANSP:TRANSPARENT");
    for (const trigger of ev.reminders) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      prop(`DESCRIPTION:${escapeText(ev.summary)}`);
      lines.push(`TRIGGER:${trigger}`);
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
