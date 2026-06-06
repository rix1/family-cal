import type { Viewer } from "./model.ts";

export interface AccessLinkOptions {
  name: string;
  groups: string[];
  canEdit: boolean;
  token?: string;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return encodeBase64Url(bytes);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function createViewer(options: AccessLinkOptions): Viewer {
  const name = options.name.trim();
  if (!name) throw new Error("--name is required");
  return {
    token: options.token ?? randomToken(),
    name,
    groups: options.groups,
    canEdit: options.canEdit,
  };
}

export function accessUrls(viewer: Viewer, baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    calendar: `${base}/view/${viewer.token}`,
    editor: viewer.canEdit ? `${base}/admin/?token=${viewer.token}` : null,
    ical: `${base}/cal/${viewer.token}.ics`,
  };
}
