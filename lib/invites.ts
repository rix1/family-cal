import { randomToken } from "./access_links.ts";
import type { Invite } from "./model.ts";

export function createInvite(
  expiresAt: string,
  options: { token?: string; createdAt?: string; canEdit?: boolean } = {},
): Invite {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime())) throw new Error("Invite expiry is invalid.");
  if (expiry.getTime() <= new Date(createdAt).getTime()) {
    throw new Error("Invite expiry must be after its creation time.");
  }
  return {
    token: options.token ?? randomToken(),
    createdAt,
    expiresAt: expiry.toISOString(),
    canEdit: options.canEdit ?? true,
  };
}

export function inviteUrl(invite: Invite, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/invite/${invite.token}`;
}
