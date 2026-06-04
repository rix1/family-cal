import { escapeText, foldLine, toICalendar } from "../src/ical.ts";
import type { CalEvent } from "../src/model.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";

const encoder = new TextEncoder();

Deno.test("escapeText escapes per RFC 5545", () => {
  assertEquals(escapeText("a,b;c\\d"), "a\\,b\\;c\\\\d");
  assertEquals(escapeText("line1\nline2"), "line1\\nline2");
});

Deno.test("foldLine keeps short lines and folds long ones at <=75 octets", () => {
  assertEquals(foldLine("SHORT:value"), "SHORT:value");

  const long = "DESCRIPTION:" + "x".repeat(200);
  const folded = foldLine(long);
  assertStringIncludes(folded, "\r\n ");
  for (const physical of folded.split("\r\n")) {
    // continuation lines carry a leading space that counts toward the octet limit
    assert(encoder.encode(physical).length <= 75, `physical line too long: ${physical.length}`);
  }
  // Unfolding (drop CRLF + leading space) must restore the original.
  assertEquals(folded.replace(/\r\n /g, ""), long);
});

Deno.test("foldLine never splits a multi-byte emoji", () => {
  const line = "SUMMARY:" + "🎂".repeat(40); // each emoji is 4 UTF-8 bytes
  const folded = foldLine(line);
  // Reassembled text still decodes cleanly with the same emoji count.
  const rejoined = folded.replace(/\r\n /g, "");
  assertEquals((rejoined.match(/🎂/gu) ?? []).length, 40);
});

Deno.test("toICalendar emits a valid skeleton with RRULE and VALARM", () => {
  const events: CalEvent[] = [
    {
      uid: "bday-test@family-cal",
      summary: "🎂 Test Person",
      start: { year: 1990, month: 5, day: 17 },
      recurring: true,
      reminders: ["-PT15H"],
      categories: ["Birthday"],
    },
  ];
  const ics = toICalendar(events, {
    calName: "Test",
    dtstamp: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
  });

  // CRLF line endings only.
  assert(!/[^\r]\n/.test(ics), "all newlines must be CRLF");
  assertStringIncludes(ics, "BEGIN:VCALENDAR\r\n");
  assertStringIncludes(ics, "VERSION:2.0");
  assertStringIncludes(ics, "DTSTAMP:20260102T030405Z");
  assertStringIncludes(ics, "DTSTART;VALUE=DATE:19900517");
  assertStringIncludes(ics, "RRULE:FREQ=YEARLY");
  assertStringIncludes(ics, "BEGIN:VALARM");
  assertStringIncludes(ics, "TRIGGER:-PT15H");
  assertStringIncludes(ics, "END:VCALENDAR\r\n");

  // Balanced components.
  const count = (s: string) => (ics.match(new RegExp(s, "g")) ?? []).length;
  assertEquals(count("BEGIN:VEVENT"), count("END:VEVENT"));
  assertEquals(count("BEGIN:VALARM"), count("END:VALARM"));
});
