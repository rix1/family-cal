/**
 * Who fetches the iCal feed, and what that means. `recordFeedFetch` keeps one
 * fixed-size rolling record per feed token (see `FeedActivity`); everything
 * else here is pure derivation over that record — no clocks, no I/O.
 */

import type { FeedActivity, FeedAgent } from "./model.ts";
import type { Store } from "./store.ts";

/**
 * How long a subscription may stay silent before we call it stopped. Generous
 * on purpose: Google's poll cadence is erratic (12–48 h) and Apple Calendar's
 * default refresh on macOS can be weekly.
 */
export const SYNC_WINDOW_DAYS = 14;

/** At most ~one write per agent per hour; hourly pollers cost ≤ 24 writes/day. */
const WRITE_THROTTLE_MS = 60 * 60 * 1000;

/** Agents that poll on their own — a fetch from these means a live subscription. */
const SUBSCRIPTION_AGENTS: FeedAgent[] = ["google", "apple", "outlook"];

/** Bucket a User-Agent into a client family. Specific fetchers before Mozilla. */
export function classifyAgent(userAgent: string): FeedAgent {
  const ua = userAgent.toLowerCase();
  if (ua.includes("google-calendar")) return "google";
  if (ua.includes("dataaccessd") || ua.includes("calendaragent") || ua.includes("remindd")) {
    return "apple";
  }
  if (ua.includes("outlook") || ua.includes("microsoft")) return "outlook";
  if (ua.includes("mozilla/")) return "browser";
  return "other";
}

export interface FeedFetch {
  userAgent: string;
  /** The quoted ETag of the content served (or confirmed unchanged via 304). */
  etag: string;
  now?: Date;
}

/**
 * Note a feed fetch on the rolling record, throttled: a repeat fetch by a known
 * agent with unchanged content within an hour is not persisted, so `fetches`
 * counts are a lower bound. A 304 response records too — it is proof of life.
 */
export async function recordFeedFetch(
  store: Store,
  feedToken: string,
  { userAgent, etag, now }: FeedFetch,
): Promise<void> {
  const agent = classifyAgent(userAgent);
  const at = (now ?? new Date()).toISOString();
  const existing = await store.getFeedActivity(feedToken);
  if (!existing) {
    await store.upsertFeedActivity({
      feedToken,
      firstFetchAt: at,
      lastServed: { at, etag },
      agents: { [agent]: { lastFetchAt: at, fetches: 1 } },
    });
    return;
  }
  const prev = existing.agents[agent];
  const withinThrottle = prev &&
    new Date(at).getTime() - new Date(prev.lastFetchAt).getTime() < WRITE_THROTTLE_MS;
  if (withinThrottle && etag === existing.lastServed.etag) return;
  await store.upsertFeedActivity({
    ...existing,
    lastServed: { at, etag },
    agents: {
      ...existing.agents,
      [agent]: { lastFetchAt: at, fetches: (prev?.fetches ?? 0) + 1 },
    },
  });
}

export type FeedSyncState =
  /** The feed URL has never been fetched. */
  | { state: "never" }
  /** A calendar app polled within the sync window — the subscription lives. */
  | { state: "active"; agent: FeedAgent; lastFetchAt: string }
  /** A calendar app used to poll but has gone silent past the window. */
  | { state: "stopped"; agent: FeedAgent; lastFetchAt: string; changed: boolean }
  /** Only browsers/unknown clients ever fetched — a one-shot copy, not a subscription. */
  | { state: "downloaded"; lastFetchAt: string; changed: boolean };

/** The most recent fetch by a subscribing calendar app, or null if only browsers came. */
export function lastSubscriptionFetch(
  activity: FeedActivity,
): { agent: FeedAgent; lastFetchAt: string } | null {
  let latest: { agent: FeedAgent; lastFetchAt: string } | null = null;
  for (const agent of SUBSCRIPTION_AGENTS) {
    const seen = activity.agents[agent];
    if (seen && (!latest || seen.lastFetchAt > latest.lastFetchAt)) {
      latest = { agent, lastFetchAt: seen.lastFetchAt };
    }
  }
  return latest;
}

/**
 * What the fetch record means for this viewer right now. `currentEtag` is the
 * feed's present fingerprint (`feedEtag`); `changed` compares it against what
 * the client last got.
 */
export function feedSyncState(
  activity: FeedActivity | null,
  currentEtag: string,
  now = new Date(),
): FeedSyncState {
  if (!activity) return { state: "never" };
  const changed = currentEtag !== activity.lastServed.etag;

  const latest = lastSubscriptionFetch(activity);
  if (latest) {
    const silentMs = now.getTime() - new Date(latest.lastFetchAt).getTime();
    if (silentMs <= SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return { state: "active", ...latest };
    }
    return { state: "stopped", ...latest, changed };
  }
  return { state: "downloaded", lastFetchAt: activity.lastServed.at, changed };
}
