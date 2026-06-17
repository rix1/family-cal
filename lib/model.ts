/**
 * Domain model for the family calendar.
 *
 * `Person` is the canonical fact. Birthdays are derived from `born`; explicit
 * life events (weddings, baptisms, ...) live in `FamilyEvent`. Per the
 * architecture, holidays, ages and "would have turned" are *computed*, never
 * stored.
 */

/** A date string: full ISO `YYYY-MM-DD`, recurring `MM-DD`, or `null` if unknown. */
export type PartialDate = string;

export interface Person {
  id: string;
  name: string;
  /** Birth date: `YYYY-MM-DD` (full), `MM-DD` (year unknown), or null. */
  born: PartialDate | null;
  /** Death date: `YYYY-MM-DD` or null. Drives "in memory" + remembrance. */
  died: PartialDate | null;
  /** Many-to-many visibility tags (NOT access control). */
  groups: string[];
  /** Free text for informal color ("praktikant for Sigurd"). */
  notes: string;
}

export interface GroupInfo {
  key: string;
  label: string;
  flag: string;
}

export const EVENT_KINDS = ["wedding", "baptism", "confirmation", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * An explicit life event (wedding, baptism, ...). Every event recurs yearly by
 * nature — this app has no one-off events. Birthdays stay derived from
 * `Person.born` and never live here. People are referenced informally through
 * `@id` mentions in `notes`, not structurally.
 */
export interface FamilyEvent {
  id: string;
  kind: EventKind;
  title: string;
  /** `YYYY-MM-DD` (year known) or `MM-DD` (year unknown). */
  date: PartialDate;
  /**
   * Visibility tags, like `Person.groups` (1+; overlapping or distinct are
   * both valid). A viewer sees the event when any group matches.
   */
  groups: string[];
  notes: string;
}

/**
 * A viewer's opt-in to the monthly birthday email. Absence on the viewer means
 * unsubscribed. `groups` selects newsletter content independently of the
 * viewer's calendar groups; empty = all groups.
 */
export interface NewsletterPreference {
  email: string;
  groups: string[];
  subscribedAt: string;
  updatedAt: string;
}

/**
 * A subscriber. The `token` is a capability: it both authorizes access to a feed
 * and identifies the viewer (for subsetting and, later, attribution). Rotating a
 * token revokes exactly one person.
 */
export interface Viewer {
  token: string;
  name: string;
  /** Group tags this viewer's feed includes. Empty = everyone. */
  groups: string[];
  /** Whether this capability may load the editor and mutate family data. */
  canEdit: boolean;
  /** Set when a newer capability is issued for the same named viewer. */
  expiredAt?: string;
  /** Monthly email opt-in. Absent = unsubscribed. */
  newsletter?: NewsletterPreference;
}

export function viewerIsActive(viewer: Viewer): boolean {
  return !viewer.expiredAt;
}

/** A reusable signup capability that creates viewer links until it expires. */
export interface Invite {
  token: string;
  createdAt: string;
  expiresAt: string;
  /** Permission inherited by every viewer created through this invite. */
  canEdit: boolean;
  /** Max redemptions allowed. null/undefined = unlimited until expiry. */
  maxUses?: number | null;
  /** Redemptions so far. Absent on legacy invites = 0. */
  uses?: number;
}

export function inviteUsesRemaining(invite: Invite): number | null {
  if (invite.maxUses == null) return null;
  return Math.max(0, invite.maxUses - (invite.uses ?? 0));
}

export function inviteIsActive(invite: Invite, now = new Date()): boolean {
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return false;
  const remaining = inviteUsesRemaining(invite);
  return remaining === null || remaining > 0;
}

/** Admin-configurable newsletter behavior. */
export interface NewsletterSettings {
  /**
   * Drafts for next month are auto-ensured during the final `leadDays`
   * calendar days of a month (Europe/Oslo). Valid range 1–28.
   */
  leadDays: number;
}

export const DEFAULT_NEWSLETTER_SETTINGS: NewsletterSettings = { leadDays: 7 };

export type NewsletterDraftStatus = "draft" | "sent";

/**
 * One newsletter issue for one audience segment. Drafts are editable and their
 * recipient list stays dynamic; once `status` is "sent" the draft is an
 * immutable record of what went out and to how many people.
 */
export interface NewsletterDraft {
  id: string;
  /** Target month, `YYYY-MM`. */
  month: string;
  /** Canonical group-segment key: sorted unique groups joined by `+`, or `all`. */
  segment: string;
  subject: string;
  /** Editable Markdown body. */
  body: string;
  /** Copyable, anonymous LLM prompt for the introduction. */
  prompt: string;
  /** Audience groups (normalized). Empty = all groups. */
  groups: string[];
  createdAt: string;
  updatedAt: string;
  status: NewsletterDraftStatus;
  sentAt?: string;
  sentBy?: string;
  recipientCount?: number;
}

/** An append-only record of a change, keyed by who made it. */
export interface AuditEntry {
  /** ISO timestamp. */
  at: string;
  /** Display name of the actor (from the editor identity). */
  actor: string;
  action: string;
  /** Affected person id, when applicable. */
  targetId?: string;
  detail?: string;
}

/** Country codes used for holiday sets. */
export type Country = "NO" | "DK";

/** A normalized, render-ready calendar entry consumed by the iCal serializer. */
export interface CalEvent {
  uid: string;
  summary: string;
  description?: string;
  /** All-day anchor date. For recurring events this is the first occurrence. */
  start: CalDate;
  /** When true, emit `RRULE:FREQ=YEARLY`. */
  recurring: boolean;
  /** iCal `TRIGGER` values for embedded reminders, e.g. `"-PT15H"`. */
  reminders: string[];
  categories?: string[];
}

export interface CalDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}
