import { easterSunday, holidaysForYear, holidaysForYears } from "../lib/holidays.ts";
import { assert, assertEquals } from "./asserts.ts";

Deno.test("easterSunday matches known Gregorian dates", () => {
  // Reference: well-known Western Easter dates.
  assertEquals(easterSunday(2023), { year: 2023, month: 4, day: 9 });
  assertEquals(easterSunday(2024), { year: 2024, month: 3, day: 31 });
  assertEquals(easterSunday(2025), { year: 2025, month: 4, day: 20 });
  assertEquals(easterSunday(2026), { year: 2026, month: 4, day: 5 });
  assertEquals(easterSunday(2027), { year: 2027, month: 3, day: 28 });
});

Deno.test("holidaysForYear includes fixed and movable feasts", () => {
  const h = holidaysForYear(2025);
  const find = (name: string) => h.find((x) => x.name === name);

  // Fixed
  assertEquals(find("New Year's Day")?.date, { year: 2025, month: 1, day: 1 });
  assertEquals(find("Constitution Day")?.date, { year: 2025, month: 5, day: 17 }); // NO (first match)

  // Movable (Easter 2025-04-20)
  assertEquals(find("Good Friday")?.date, { year: 2025, month: 4, day: 18 });
  assertEquals(find("Easter Monday")?.date, { year: 2025, month: 4, day: 21 });
  assertEquals(find("Ascension Day")?.date, { year: 2025, month: 5, day: 29 });
  assertEquals(find("Whit Monday")?.date, { year: 2025, month: 6, day: 9 });
});

Deno.test("holidays are sorted within a year", () => {
  const h = holidaysForYear(2026);
  for (let i = 1; i < h.length; i++) {
    const prev = h[i - 1].date;
    const cur = h[i].date;
    const prevN = prev.month * 100 + prev.day;
    const curN = cur.month * 100 + cur.day;
    assert(prevN <= curN, `holidays out of order at index ${i}`);
  }
});

Deno.test("country filter narrows the set", () => {
  const all = holidaysForYears(2025, 2025);
  const noOnly = holidaysForYears(2025, 2025, ["NO"]);
  const dkOnly = holidaysForYears(2025, 2025, ["DK"]);
  assert(noOnly.length < all.length, "NO-only should drop DK-only holidays");
  assert(dkOnly.length < all.length, "DK-only should drop NO-only holidays");
  // May 17 (NO) present in NO-only, absent in DK-only.
  assert(
    noOnly.some((h) => h.name === "Constitution Day" && h.date.month === 5 && h.date.day === 17),
  );
  assert(!dkOnly.some((h) => h.date.month === 5 && h.date.day === 17));
});
