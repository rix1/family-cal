import { ageAtDate } from "../lib/dates.ts";
import { assertEquals } from "./asserts.ts";

Deno.test("ageAtDate accounts for whether the birthday occurred", () => {
  assertEquals(ageAtDate("1926-03-26", "2020-02-01"), 93);
  assertEquals(ageAtDate("1926-03-26", "2020-04-01"), 94);
});

Deno.test("ageAtDate requires full dates and rejects impossible ordering", () => {
  assertEquals(ageAtDate("03-26", "2020-04-01"), null);
  assertEquals(ageAtDate("2021-03-26", "2020-04-01"), null);
});
