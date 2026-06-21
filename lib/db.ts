import { KvStore } from "@/lib/kv_store.ts";
import type { Store } from "@/lib/store.ts";

let storePromise: Promise<Store> | null = null;

/**
 * Deno's default KV (no path given) resolves to a different on-disk database
 * depending on how the process was launched — the dev server (via Vite) and a
 * plain `deno run` script do NOT share one, even with identical env. Pin a
 * fixed path so every entrypoint in this project lands on the same database
 * unless KV_PATH is explicitly set.
 */
export function defaultKvPath(): string {
  return `${Deno.cwd()}/.data/kv.sqlite3`;
}

/** Resolve the KV path to use, creating its parent directory if needed. */
export async function resolveKvPath(): Promise<string> {
  const path = Deno.env.get("KV_PATH") ?? defaultKvPath();
  if (path !== ":memory:") {
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
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
