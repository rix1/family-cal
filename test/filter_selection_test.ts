import { retainAvailable, toggleSelection } from "../lib/filter_selection.ts";
import { assertEquals } from "./asserts.ts";

Deno.test("toggleSelection allows every filter to be deselected", () => {
  const selected = new Set(["birthday"]);
  assertEquals([...toggleSelection(selected, "birthday")], []);
});

Deno.test("retainAvailable removes stale filters without restoring deselected ones", () => {
  const selected = new Set(["birthday", "removed"]);
  assertEquals([...retainAvailable(selected, ["birthday", "holiday"])], ["birthday"]);
  assertEquals([...retainAvailable(new Set(), ["birthday", "holiday"])], []);
});
