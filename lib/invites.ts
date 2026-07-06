import { randomToken } from "./access_links.ts";
import type { Invite } from "./model.ts";

export function createInvite(
  expiresAt: string,
  options: {
    token?: string;
    createdAt?: string;
    isAdmin?: boolean;
    maxUses?: number | null;
  } = {},
): Invite {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime())) throw new Error("Invite expiry is invalid.");
  if (expiry.getTime() <= new Date(createdAt).getTime()) {
    throw new Error("Invite expiry must be after its creation time.");
  }
  const maxUses = normalizeMaxUses(options.maxUses);
  return {
    token: options.token ?? randomToken(),
    createdAt,
    expiresAt: expiry.toISOString(),
    isAdmin: options.isAdmin ?? false,
    maxUses,
    uses: 0,
  };
}

/** A signup limit, if given, must be a positive whole number. null = unlimited. */
function normalizeMaxUses(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Invite signup limit must be a positive whole number.");
  }
  return value;
}

export function inviteUrl(invite: Invite, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/invite/${invite.token}`;
}
