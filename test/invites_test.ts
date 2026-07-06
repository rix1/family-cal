import { createInvite, inviteUrl } from "../lib/invites.ts";
import { inviteIsActive, inviteUsesRemaining } from "../lib/model.ts";
import { assertEquals, assertThrows } from "./asserts.ts";

Deno.test("createInvite defaults signups to view-only access", () => {
  const invite = createInvite("2026-06-15T12:00:00Z", {
    token: "invite-token",
    createdAt: "2026-06-08T12:00:00Z",
  });
  assertEquals(invite.isAdmin, false);
  assertEquals(invite.maxUses, null);
  assertEquals(invite.uses, 0);
  assertEquals(
    inviteUrl(invite, "https://family.example/"),
    "https://family.example/invite/invite-token",
  );
  assertEquals(inviteIsActive(invite, new Date("2026-06-15T11:59:59Z")), true);
  assertEquals(inviteIsActive(invite, new Date("2026-06-15T12:00:00Z")), false);
});

Deno.test("a signup limit expires the invite once it is reached", () => {
  const invite = createInvite("2026-06-15T12:00:00Z", {
    token: "limited",
    createdAt: "2026-06-08T12:00:00Z",
    maxUses: 2,
  });
  const before = new Date("2026-06-09T12:00:00Z");
  assertEquals(inviteUsesRemaining(invite), 2);
  assertEquals(inviteIsActive(invite, before), true);
  assertEquals(inviteIsActive({ ...invite, uses: 1 }, before), true);
  assertEquals(inviteUsesRemaining({ ...invite, uses: 2 }), 0);
  assertEquals(inviteIsActive({ ...invite, uses: 2 }, before), false);
});

Deno.test("createInvite rejects an invalid signup limit", () => {
  assertThrows(() => createInvite("2026-06-15T12:00:00Z", { maxUses: 0 }));
  assertThrows(() => createInvite("2026-06-15T12:00:00Z", { maxUses: 1.5 }));
});
