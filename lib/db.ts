import { KvStore } from "@/lib/kv_store.ts";
import type { Store } from "@/lib/store.ts";

let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  storePromise ??= KvStore.create(Deno.env.get("KV_PATH"));
  return storePromise;
}

/** Test helper: close the process-global KV handle and force a fresh store next time. */
export async function closeStoreForTests(): Promise<void> {
  if (!storePromise) return;
  const store = await storePromise;
  if ("close" in store && typeof store.close === "function") store.close();
  storePromise = null;
}
