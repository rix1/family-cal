import { environment } from "@/lib/env.ts";
import { KvStore } from "@/lib/kv_store.ts";
import type { Store } from "@/lib/store.ts";

let storePromise: Promise<Store> | null = null;

/**
 * The database is chosen by ENVIRONMENT, never by guessing: PROD is the live
 * family data, DEV is a disposable copy made by `deno task subset`. The paths
 * are pinned (Deno's pathless default KV resolves differently per entrypoint)
 * and deliberately distinct, so a dev server can't touch production.
 *
 * KV_PATH remains as an explicit override for tests (":memory:") and
 * maintenance jobs like verifying a backup copy.
 */
export async function resolveKvPath(options: { createIfMissing?: boolean } = {}): Promise<string> {
  const override = Deno.env.get("KV_PATH");
  if (override) {
    if (override !== ":memory:") {
      await Deno.mkdir(override.slice(0, override.lastIndexOf("/")), { recursive: true });
    }
    return override;
  }
  if (environment() === "PROD") {
    const path = `${Deno.cwd()}/.data/kv.sqlite3`;
    await Deno.mkdir(`${Deno.cwd()}/.data`, { recursive: true });
    return path;
  }
  const path = `${Deno.cwd()}/.data/dev.sqlite3`;
  await Deno.mkdir(`${Deno.cwd()}/.data`, { recursive: true });
  if (!options.createIfMissing) {
    // A missing dev DB means "you haven't made one", not "start empty" — an
    // empty calendar looks like lost data. Fail loudly instead.
    const exists = await Deno.stat(path).then(() => true, () => false);
    if (!exists) {
      throw new Error(
        `No dev database at ${path}. Run \`deno task subset\` to copy production, ` +
          "or `ENVIRONMENT=DEV deno task seed` for a fresh one.",
      );
    }
  }
  return path;
}

export function getStore(): Promise<Store> {
  storePromise ??= resolveKvPath().then((path) => KvStore.create(path));
  return storePromise;
}

/** Test helper: close the process-global KV handle and force a fresh store next time. */
export async function closeStoreForTests(): Promise<void> {
  if (!storePromise) return;
  const store = await storePromise;
  if ("close" in store && typeof store.close === "function") store.close();
  storePromise = null;
}
