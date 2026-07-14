import {
  classifyAgent,
  feedSyncState,
  lastSubscriptionFetch,
  recordFeedFetch,
} from "../lib/feed_activity.ts";
import type { FeedActivity } from "../lib/model.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals } from "./asserts.ts";

Deno.test("classifyAgent buckets real-world calendar fetchers", () => {
  assertEquals(classifyAgent("Google-Calendar-Importer"), "google");
  assertEquals(classifyAgent("iOS/17.5 (21F79) dataaccessd/1.0"), "apple");
  assertEquals(classifyAgent("macOS/14.5 (23F79) CalendarAgent/1042"), "apple");
  assertEquals(classifyAgent("Microsoft Office/16.0 (Windows NT 10.0)"), "outlook");
  assertEquals(
    classifyAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0.0.0"),
    "browser",
  );
  assertEquals(classifyAgent("curl/8.6.0"), "other");
  assertEquals(classifyAgent(""), "other");
});

const t0 = new Date("2026-06-01T12:00:00Z");
const minutesLater = (min: number) => new Date(t0.getTime() + min * 60 * 1000);

Deno.test("recordFeedFetch creates the rolling record on first fetch", async () => {
  const store = new SeedStore();
  await recordFeedFetch(store, "feed-1", {
    userAgent: "Google-Calendar-Importer",
    etag: '"aaa"',
    now: t0,
  });
  const activity = await store.getFeedActivity("feed-1");
  assert(activity);
  assertEquals(activity.firstFetchAt, t0.toISOString());
  assertEquals(activity.lastServed, { at: t0.toISOString(), etag: '"aaa"' });
  assertEquals(activity.agents.google, { lastFetchAt: t0.toISOString(), fetches: 1 });
});

Deno.test("recordFeedFetch throttles repeat fetches with unchanged content", async () => {
  const store = new SeedStore();
  const fetch = { userAgent: "Google-Calendar-Importer", etag: '"aaa"' };
  await recordFeedFetch(store, "feed-1", { ...fetch, now: t0 });
  await recordFeedFetch(store, "feed-1", { ...fetch, now: minutesLater(30) });
  let activity = await store.getFeedActivity("feed-1");
  assertEquals(activity?.agents.google?.fetches, 1, "within the hour: skip the write");
  assertEquals(activity?.lastServed.at, t0.toISOString());

  await recordFeedFetch(store, "feed-1", { ...fetch, now: minutesLater(61) });
  activity = await store.getFeedActivity("feed-1");
  assertEquals(activity?.agents.google?.fetches, 2, "past the hour: record again");
  assertEquals(activity?.agents.google?.lastFetchAt, minutesLater(61).toISOString());
});

Deno.test("recordFeedFetch writes through the throttle on content change or new agent", async () => {
  const store = new SeedStore();
  await recordFeedFetch(store, "feed-1", {
    userAgent: "Google-Calendar-Importer",
    etag: '"aaa"',
    now: t0,
  });
  await recordFeedFetch(store, "feed-1", {
    userAgent: "Google-Calendar-Importer",
    etag: '"bbb"',
    now: minutesLater(5),
  });
  let activity = await store.getFeedActivity("feed-1");
  assertEquals(activity?.agents.google?.fetches, 2, "changed etag bypasses the throttle");
  assertEquals(activity?.lastServed.etag, '"bbb"');

  await recordFeedFetch(store, "feed-1", {
    userAgent: "iOS/17.5 dataaccessd/1.0",
    etag: '"bbb"',
    now: minutesLater(6),
  });
  activity = await store.getFeedActivity("feed-1");
  assertEquals(activity?.agents.apple?.fetches, 1, "a new agent class always records");
  assertEquals(activity?.agents.google?.fetches, 2, "existing agents keep their state");
});

function activity(agents: FeedActivity["agents"], etag = '"aaa"'): FeedActivity {
  const at = Object.values(agents)
    .map((a) => a.lastFetchAt)
    .sort()
    .at(-1) ?? "2026-01-01T00:00:00.000Z";
  return {
    feedToken: "feed-1",
    firstFetchAt: "2026-01-01T00:00:00.000Z",
    lastServed: { at, etag },
    agents,
  };
}

const now = new Date("2026-06-21T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

Deno.test("feedSyncState: never fetched", () => {
  assertEquals(feedSyncState(null, '"aaa"', now), { state: "never" });
});

Deno.test("feedSyncState: a calendar app polling within the window is active", () => {
  const state = feedSyncState(
    activity({ google: { lastFetchAt: daysAgo(2), fetches: 9 } }),
    '"bbb"',
    now,
  );
  assertEquals(state, { state: "active", agent: "google", lastFetchAt: daysAgo(2) });

  // Exactly on the 14-day boundary still counts as active.
  const boundary = feedSyncState(
    activity({ apple: { lastFetchAt: daysAgo(14), fetches: 3 } }),
    '"aaa"',
    now,
  );
  assertEquals(boundary.state, "active");
});

Deno.test("feedSyncState: a silent subscription is stopped, not downloaded", () => {
  const state = feedSyncState(
    activity({
      google: { lastFetchAt: daysAgo(20), fetches: 9 },
      // A recent browser visit must not revive the subscription.
      browser: { lastFetchAt: daysAgo(1), fetches: 1 },
    }),
    '"bbb"',
    now,
  );
  assertEquals(state, {
    state: "stopped",
    agent: "google",
    lastFetchAt: daysAgo(20),
    changed: true,
  });
});

Deno.test("feedSyncState: browser-only fetches are a download, changed tracks the etag", () => {
  const record = activity({ browser: { lastFetchAt: daysAgo(3), fetches: 1 } });
  assertEquals(feedSyncState(record, '"aaa"', now), {
    state: "downloaded",
    lastFetchAt: daysAgo(3),
    changed: false,
  });
  assertEquals(feedSyncState(record, '"bbb"', now), {
    state: "downloaded",
    lastFetchAt: daysAgo(3),
    changed: true,
  });
});

Deno.test("lastSubscriptionFetch picks the freshest calendar app and ignores browsers", () => {
  const latest = lastSubscriptionFetch(activity({
    google: { lastFetchAt: daysAgo(5), fetches: 2 },
    apple: { lastFetchAt: daysAgo(1), fetches: 7 },
    browser: { lastFetchAt: daysAgo(0), fetches: 1 },
  }));
  assertEquals(latest, { agent: "apple", lastFetchAt: daysAgo(1) });
  assertEquals(
    lastSubscriptionFetch(activity({ other: { lastFetchAt: daysAgo(1), fetches: 1 } })),
    null,
  );
});
