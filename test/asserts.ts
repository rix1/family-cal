/** Tiny zero-dependency assertions so tests run fully offline. */

export function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg ?? `expected ${e} but got ${a}`);
}

export function assertStringIncludes(actual: string, needle: string, msg?: string): void {
  if (!actual.includes(needle)) {
    throw new Error(msg ?? `expected string to include ${JSON.stringify(needle)}`);
  }
}

export function assertMatch(actual: string, re: RegExp, msg?: string): void {
  if (!re.test(actual)) throw new Error(msg ?? `expected ${re} to match string`);
}
