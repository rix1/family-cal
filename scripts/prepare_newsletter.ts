/**
 * Monthly "prepare + notify" job (run by the launchd calendar job — see DEPLOY.md).
 *
 * Idempotently generates next month's newsletter draft(s) — with the intro
 * drafted by the local model — then emails every editor a link to review and
 * send. It never sends to the family; a human clicks Send in /admin/newsletters.
 * Safe to re-run: only segments without a draft for the month are created.
 */

import { getStore } from "@/lib/db.ts";
import { getEmailSender } from "@/lib/email.ts";
import { getIntroWriter } from "@/lib/intro_writer.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { addMonths, generateMissingDrafts, monthKey, osloToday } from "@/lib/newsletter.ts";

const store = await getStore();
const today = osloToday();
const target = addMonths({ year: today.year, month: today.month }, 1);
const month = monthKey(target);

const created = await generateMissingDrafts(store, target, "Scheduler", getIntroWriter());
console.log(`Prepared ${created.length} draft(s) for ${month}.`);
if (!created.length) Deno.exit(0);

const baseUrl = (Deno.env.get("BASE_URL") ?? "").replace(/\/+$/, "");
const link = `${baseUrl}/admin/newsletters/`;
const editors = (await store.listViewers()).filter((v) =>
  v.canEdit && v.email && viewerIsActive(v)
);
const sender = getEmailSender();

for (const editor of editors) {
  await sender.send({
    to: editor.email!,
    subject: `Nyhetsbrev klart til gjennomgang (${month})`,
    text: [
      `Hei ${editor.name.split(" ")[0] || editor.name},`,
      "",
      `Nyhetsbrevet for ${month} er klart med ${created.length} utkast.`,
      "Se gjennom, rediger om nødvendig, og send det herfra:",
      link,
    ].join("\n"),
  });
}
console.log(`Notified ${editors.length} editor(s).`);
