import { EventForm } from "@/islands/EventForm.tsx";
import { PersonForm, type SavedGroup } from "@/islands/PersonForm.tsx";
import { type AddChoice, AddChooser } from "@/components/calendar/AddChooser.tsx";
import { groupBadgeClass } from "@/lib/group_colors.ts";
import { t } from "@/lib/i18n.ts";
import type { ViewEvent, ViewGroup, ViewPerson } from "@/lib/view_data.ts";
import type { Ref } from "preact";
import { relativeLabel } from "@/lib/calendar/dates.ts";
import type { PersonDetail } from "@/lib/calendar/people.ts";
import { LinkedNotes, PersonDate } from "@/components/calendar/text.tsx";

/**
 * The slide-over that shows a person's details and doubles as the add/edit
 * form: `editing` swaps the body in place for the selected person, `adding` /
 * `addingEvent` open it empty, and `choosing` shows the person-or-event
 * chooser step first. The open/closing animation state stays in the Calendar
 * island, which owns the timers and focus management.
 */
export function PersonSheet({
  open,
  closing,
  person,
  detail,
  adding,
  addingEvent,
  choosing,
  addChoice,
  editing,
  groups,
  people,
  personalKey,
  saveUrl,
  eventsSaveUrl,
  editUrl,
  todayKey,
  personLookup,
  onOpenPerson,
  onClose,
  onEditPerson,
  onPersonSaved,
  onEventSaved,
  onCancelForm,
  onShowInTimeline,
  onAddChoice,
  onContinueAdd,
  closeButtonRef,
}: {
  open: boolean;
  closing: boolean;
  person: ViewPerson | null;
  detail: PersonDetail | null;
  adding: boolean;
  addingEvent: boolean;
  choosing: boolean;
  addChoice: AddChoice;
  editing: boolean;
  groups: Record<string, ViewGroup>;
  people: ViewPerson[];
  personalKey: string | null;
  saveUrl?: string;
  eventsSaveUrl?: string;
  editUrl?: string;
  todayKey: string;
  /** Roster keyed by lowercased person id, for resolving @-mentions. */
  personLookup: Map<string, ViewPerson>;
  onOpenPerson: (person: ViewPerson) => void;
  onClose: () => void;
  onEditPerson: () => void;
  onPersonSaved: (saved: ViewPerson, newGroup?: SavedGroup) => void;
  onEventSaved: (saved: ViewEvent) => void;
  onCancelForm: () => void;
  onShowInTimeline: (person: ViewPerson) => void;
  onAddChoice: (choice: AddChoice) => void;
  onContinueAdd: () => void;
  closeButtonRef: Ref<HTMLButtonElement>;
}) {
  const group = person ? groups[person.affiliation] : undefined;
  return (
    <div
      class={`backdrop fixed inset-0 z-40 flex items-end bg-black/30 sm:items-stretch sm:justify-end ${
        closing ? "is-closing" : ""
      }`}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-detail-title"
        class={`sheet flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-6 shadow-pop sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-t-0 sm:border-l ${
          open ? "is-open" : ""
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="kicker">
              {choosing
                ? t("addChooser.kicker")
                : addingEvent
                ? t("eventForm.submit")
                : adding
                ? t("personForm.add")
                : editing
                ? t("calendar.editPerson")
                : t("calendar.person")}
            </p>
            <h2 id="person-detail-title" class="mt-1 text-xl font-semibold tracking-tight">
              {choosing
                ? t("addChooser.title")
                : addingEvent
                ? t("calendar.newEvent")
                : adding
                ? t("calendar.newPerson")
                : person?.name}
            </h2>
            {!adding && !addingEvent && !editing && group && (
              <span class={`badge mt-1.5 ${groupBadgeClass(group.color)}`}>
                {group.label}
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-ink-2 hover:bg-inset hover:text-ink"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <svg
              class="size-3.5"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {choosing
          ? (
            <AddChooser
              canPerson={Boolean(saveUrl)}
              canEvent={Boolean(eventsSaveUrl)}
              choice={addChoice}
              onChoice={onAddChoice}
              onContinue={onContinueAdd}
            />
          )
          : addingEvent && eventsSaveUrl
          ? (
            <EventForm
              groups={groups}
              people={people}
              saveUrl={eventsSaveUrl}
              onSaved={onEventSaved}
              onCancel={onCancelForm}
            />
          )
          : (editing || adding) && saveUrl
          ? (
            <PersonForm
              person={adding ? null : person}
              groups={groups}
              personalKey={personalKey}
              people={people}
              saveUrl={saveUrl}
              onSaved={onPersonSaved}
              onCancel={onCancelForm}
            />
          )
          : person && detail
          ? (
            <>
              <dl class="mt-6 grid grid-cols-2 gap-2 text-sm">
                <div class="rounded-lg bg-inset p-3">
                  <dt class="kicker">{t("personForm.born")}</dt>
                  <dd class="mt-1 font-medium tabular-nums">
                    <PersonDate value={detail.born} />
                  </dd>
                </div>
                <div class="rounded-lg bg-inset p-3">
                  <dt class="kicker">
                    {person.died ? t("calendar.wouldBeThisYear") : t("calendar.ageThisYear")}
                  </dt>
                  <dd class="mt-1 font-medium tabular-nums">
                    {detail.age ?? t("common.unknown")}
                  </dd>
                </div>
                {person.died && (
                  <>
                    <div class="rounded-lg bg-inset p-3">
                      <dt class="kicker">{t("personForm.died")}</dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        <PersonDate value={person.died} />
                      </dd>
                    </div>
                    <div class="rounded-lg bg-inset p-3">
                      <dt class="kicker">{t("calendar.ageAtDeath")}</dt>
                      <dd class="mt-1 font-medium tabular-nums">
                        {detail.ageAtDeath ?? t("common.unknown")}
                      </dd>
                    </div>
                  </>
                )}
                <div class="col-span-2 rounded-lg bg-inset p-3">
                  <dt class="kicker">{t("calendar.nextBirthday")}</dt>
                  <dd class="mt-1 font-medium tabular-nums">
                    {detail.next
                      ? (
                        <>
                          <PersonDate value={detail.next} /> ·{" "}
                          {relativeLabel(detail.next, todayKey)}
                        </>
                      )
                      : t("common.unknown")}
                  </dd>
                </div>
                {detail.nextMemorial && (
                  <div class="col-span-2 rounded-lg bg-inset p-3">
                    <dt class="kicker">{t("calendar.nextRemembrance")}</dt>
                    <dd class="mt-1 font-medium tabular-nums">
                      <PersonDate value={detail.nextMemorial} /> ·{" "}
                      {relativeLabel(detail.nextMemorial, todayKey)}
                    </dd>
                  </div>
                )}
              </dl>

              <div class="mt-2 rounded-lg bg-inset p-3">
                <p class="kicker">{t("common.notes")}</p>
                <p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink-2">
                  {person.notes
                    ? (
                      <LinkedNotes
                        text={person.notes}
                        personLookup={personLookup}
                        onOpenPerson={onOpenPerson}
                      />
                    )
                    : t("calendar.noNotes")}
                </p>
              </div>

              {detail.mentionedBy.length > 0 && (
                <div class="mt-4">
                  <p class="kicker">
                    {t("calendar.mentionedBy", { count: detail.mentionedBy.length })}
                  </p>
                  <ul class="mt-2 grid gap-0.5">
                    {detail.mentionedBy.map(({ person: mentioner, age }) => (
                      <li key={mentioner.id}>
                        <button
                          type="button"
                          onClick={() => onOpenPerson(mentioner)}
                          class="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left text-sm hover:bg-inset"
                          title={mentioner.notes}
                        >
                          <span class="font-medium">{mentioner.name}</span>
                          <span class="tabular-nums text-ink-3">
                            {age === null
                              ? "—"
                              : age === 1
                              ? t("calendar.oneYear")
                              : t("calendar.nYears", { count: age })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(saveUrl || editUrl || detail.next) && (
                <div class="mt-6 grid gap-2 sm:mt-auto">
                  {saveUrl && (
                    <button
                      type="button"
                      class="btn btn-ghost w-full"
                      onClick={onEditPerson}
                    >
                      {t("calendar.editPerson")}
                    </button>
                  )}
                  {!saveUrl && editUrl && (
                    <a
                      class="btn btn-ghost w-full"
                      href={`${editUrl}?person=${encodeURIComponent(person.id)}`}
                    >
                      {t("calendar.editPerson")}
                    </a>
                  )}
                  {detail.next && (
                    <button
                      type="button"
                      class="btn btn-primary w-full"
                      onClick={() => onShowInTimeline(person)}
                    >
                      {t("calendar.showInTimeline")}
                    </button>
                  )}
                </div>
              )}
            </>
          )
          : null}
      </aside>
    </div>
  );
}
