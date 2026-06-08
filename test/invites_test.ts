import { createInvite, inviteUrl } from "../lib/invites.ts";
import { inviteIsActive } from "../lib/model.ts";
import { assertEquals } from "./asserts.ts";

Deno.test("createInvite defaults signups to editor access", () => {
  const invite = createInvite("2026-06-15T12:00:00Z", {
    token: "invite-token",
    createdAt: "2026-06-08T12:00:00Z",
  });
  assertEquals(invite.canEdit, true);
  assertEquals(
    inviteUrl(invite, "https://family.example/"),
    "https://family.example/invite/invite-token",
  );
  assertEquals(inviteIsActive(invite, new Date("2026-06-15T11:59:59Z")), true);
  assertEquals(inviteIsActive(invite, new Date("2026-06-15T12:00:00Z")), false);
});
