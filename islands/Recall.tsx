import { localizedMonthNames } from "@/lib/dates.ts";
import { dateLocale, t } from "@/lib/i18n.ts";
import type { ViewPerson } from "@/lib/view_data.ts";
import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";

/**
 * A low-stakes memory exercise: a few questions drawn straight from the family's
 * birthdays, in the spirit of Readwise recall. No scores, no streaks, nothing
 * stored — a fresh handful each visit. Per-question feedback is for learning,
 * not keeping score: every question reveals the real answer once resolved.
 *
 * Difficulty changes the *granularity* of recall. Easy asks for the birthday
 * month; hard asks for birth years, ages, and exact dates (for people whose
 * birth year is known — otherwise it falls back to exact dates).
 */

type Difficulty = "easy" | "hard";
type Attr = "month" | "date" | "year" | "age";

interface Eligible {
  person: ViewPerson;
  month: number;
  day: number;
  year: number | null;
}

interface MCQuestion {
  kind: "mc";
  prompt: string;
  options: string[];
  answer: string;
  /** The real fact, shown in feedback whether right or wrong. */
  fact: string;
}

interface TFQuestion {
  kind: "tf";
  /** The statement under test, shown as the prompt. */
  prompt: string;
  statementTrue: boolean;
  fact: string;
}

interface MatchQuestion {
  kind: "match";
  prompt: string;
  items: { id: string; name: string; label: string }[];
}

type Question = MCQuestion | TFQuestion | MatchQuestion;

/** The fewest eligible people that still make for a varied, fair set. */
const MIN_PEOPLE = 3;
const MAX_QUESTIONS = 5;

const month = (m: number) => localizedMonthNames(dateLocale())[m - 1];

// Cached per locale — the locale is fixed per page load (the toggle reloads).
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function formatDay(m: number, d: number): string {
  const locale = dateLocale();
  let format = dayFormatters.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" });
    dayFormatters.set(locale, format);
  }
  return format.format(new Date(2000, m - 1, d));
}

function partsOf(date: string): { month: number; day: number } | null {
  if (!date) return null;
  const md = date.length === 10 ? date.slice(5) : date;
  if (!/^\d{2}-\d{2}$/.test(md)) return null;
  return { month: Number(md.slice(0, 2)), day: Number(md.slice(3, 5)) };
}

function dayLabel(e: Eligible): string {
  return formatDay(e.month, e.day);
}

function fullLabel(e: Eligible): string {
  return e.year != null ? t("recall.fullDate", { date: dayLabel(e), year: e.year }) : dayLabel(e);
}

function birthdayFact(e: Eligible): string {
  return t("recall.fact.birthday", { name: e.person.name, date: dayLabel(e) });
}

function yearFact(e: Eligible): string {
  return t("recall.fact.year", { name: e.person.name, year: e.year! });
}

function ageFact(e: Eligible, currentYear: number): string {
  return t("recall.fact.age", { name: e.person.name, age: currentYear - e.year! });
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** `count` distinct values from `pool`, skipping anything in `exclude`. */
function sample(pool: string[], count: number, exclude: string): string[] {
  const picks: string[] = [];
  for (const v of shuffle(pool)) {
    if (v === exclude || picks.includes(v)) continue;
    picks.push(v);
    if (picks.length === count) break;
  }
  return picks;
}

/** Numbers within `spread` of `value` (excluding `value`), clamped at `min`. */
function nearby(value: number, spread: number, min = -Infinity): number[] {
  const pool: number[] = [];
  for (let d = -spread; d <= spread; d++) {
    const v = value + d;
    if (d !== 0 && v >= min) pool.push(v);
  }
  return pool;
}

function oneWrong(pool: number[], correct: number): number {
  const opts = pool.filter((v) => v !== correct);
  return opts[Math.floor(Math.random() * opts.length)];
}

function randomDayLabel(): string {
  return formatDay(1 + Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
}

interface Ctx {
  currentYear: number;
  datePool: string[];
}

function pickAttribute(e: Eligible, difficulty: Difficulty): Attr {
  if (difficulty === "easy") return "month";
  const opts: Attr[] = e.year != null ? ["date", "year", "age"] : ["date"];
  return opts[Math.floor(Math.random() * opts.length)];
}

function altDate(e: Eligible, ctx: Ctx): string {
  const correct = dayLabel(e);
  const opts = ctx.datePool.filter((l) => l !== correct);
  if (opts.length) return shuffle(opts)[0];
  let r = randomDayLabel();
  while (r === correct) r = randomDayLabel();
  return r;
}

function makeMC(e: Eligible, attr: Attr, ctx: Ctx): MCQuestion {
  const name = e.person.name;
  if (attr === "month") {
    const answer = month(e.month);
    const options = shuffle([answer, ...sample(ALL_MONTHS.map(month), 3, answer)]);
    return {
      kind: "mc",
      prompt: t("recall.q.month", { name }),
      options,
      answer,
      fact: birthdayFact(e),
    };
  }
  if (attr === "date") {
    const answer = dayLabel(e);
    const distractors = sample(ctx.datePool, 3, answer);
    while (distractors.length < 3) {
      const r = randomDayLabel();
      if (r !== answer && !distractors.includes(r)) distractors.push(r);
    }
    return {
      kind: "mc",
      prompt: t("recall.q.date", { name }),
      options: shuffle([answer, ...distractors]),
      answer,
      fact: birthdayFact(e),
    };
  }
  if (attr === "year") {
    const answer = String(e.year);
    const distractors = sample(nearby(e.year!, 8).map(String), 3, answer);
    return {
      kind: "mc",
      prompt: t("recall.q.year", { name }),
      options: shuffle([answer, ...distractors]),
      answer,
      fact: yearFact(e),
    };
  }
  const age = ctx.currentYear - e.year!;
  const answer = String(age);
  const distractors = sample(nearby(age, 10, 0).map(String), 3, answer);
  return {
    kind: "mc",
    prompt: t("recall.q.age", { name }),
    options: shuffle([answer, ...distractors]),
    answer,
    fact: ageFact(e, ctx.currentYear),
  };
}

function makeTF(e: Eligible, attr: Attr, ctx: Ctx): TFQuestion {
  const name = e.person.name;
  const truthful = Math.random() < 0.5;
  if (attr === "month") {
    const shown = truthful ? e.month : oneWrong(ALL_MONTHS, e.month);
    return {
      kind: "tf",
      prompt: t("recall.tf.month", { name, month: month(shown) }),
      statementTrue: truthful,
      fact: birthdayFact(e),
    };
  }
  if (attr === "date") {
    const shown = truthful ? dayLabel(e) : altDate(e, ctx);
    return {
      kind: "tf",
      prompt: t("recall.tf.date", { name, date: shown }),
      statementTrue: truthful,
      fact: birthdayFact(e),
    };
  }
  if (attr === "year") {
    const shown = truthful ? e.year! : oneWrong(nearby(e.year!, 8), e.year!);
    return {
      kind: "tf",
      prompt: t("recall.tf.year", { name, year: shown }),
      statementTrue: truthful,
      fact: yearFact(e),
    };
  }
  const age = ctx.currentYear - e.year!;
  const shown = truthful ? age : oneWrong(nearby(age, 10, 0), age);
  return {
    kind: "tf",
    prompt: t("recall.tf.age", { name, age: shown }),
    statementTrue: truthful,
    fact: ageFact(e, ctx.currentYear),
  };
}

function buildMatch(eligible: Eligible[], difficulty: Difficulty): MatchQuestion | null {
  const items: MatchQuestion["items"] = [];
  const seen = new Set<string>();
  for (const e of shuffle(eligible)) {
    const label = difficulty === "hard" ? fullLabel(e) : dayLabel(e);
    if (seen.has(label)) continue; // each chip must map to exactly one person
    seen.add(label);
    items.push({ id: e.person.id, name: e.person.name, label });
    if (items.length === 4) break;
  }
  if (items.length < 3) return null;
  return { kind: "match", prompt: t("recall.match.prompt"), items };
}

function buildQuestions(
  eligible: Eligible[],
  difficulty: Difficulty,
  currentYear: number,
): Question[] {
  const ctx: Ctx = { currentYear, datePool: [...new Set(eligible.map(dayLabel))] };
  const questions: Question[] = [];
  const match = buildMatch(eligible, difficulty);
  if (match) questions.push(match);
  shuffle(eligible).slice(0, 4).forEach((e, i) => {
    const attr = pickAttribute(e, difficulty);
    questions.push(i % 2 === 0 ? makeMC(e, attr, ctx) : makeTF(e, attr, ctx));
  });
  return shuffle(questions).slice(0, MAX_QUESTIONS);
}

const optionBase =
  "rounded-lg border px-3.5 py-3 text-left text-sm font-medium transition-colors disabled:cursor-default";
const idleOption = "border-line-2 bg-surface hover:bg-inset";
const correctOption = "border-accent bg-accent-soft text-accent-2";
const wrongOption = "border-danger bg-danger-soft text-danger";
const mutedOption = "border-line bg-surface text-ink-3";

function Feedback({ correct, children }: { correct: boolean; children: ComponentChildren }) {
  return (
    <p
      class={`mt-3 text-sm leading-relaxed ${correct ? "font-medium text-accent-2" : "text-ink-2"}`}
    >
      {children}
    </p>
  );
}

function MultipleChoice({ q, onResolved }: { q: MCQuestion; onResolved: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const locked = picked != null;
  return (
    <div>
      <p class="text-base leading-relaxed">{q.prompt}</p>
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        {q.options.map((opt) => {
          let cls = idleOption;
          if (locked) {
            if (opt === q.answer) cls = correctOption;
            else if (opt === picked) cls = wrongOption;
            else cls = mutedOption;
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={locked}
              onClick={() => {
                setPicked(opt);
                onResolved();
              }}
              class={`${optionBase} ${cls}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {locked && (
        <Feedback correct={picked === q.answer}>
          {picked === q.answer
            ? t("recall.feedback.correct", { fact: q.fact })
            : t("recall.feedback.wrong", { fact: q.fact })}
        </Feedback>
      )}
    </div>
  );
}

function TrueFalse({ q, onResolved }: { q: TFQuestion; onResolved: () => void }) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const locked = picked != null;
  return (
    <div>
      <p class="text-base leading-relaxed">{q.prompt}</p>
      <div class="mt-4 grid grid-cols-2 gap-2">
        {[true, false].map((value) => {
          let cls = idleOption;
          if (locked) {
            if (value === q.statementTrue) cls = correctOption;
            else if (value === picked) cls = wrongOption;
            else cls = mutedOption;
          }
          return (
            <button
              key={String(value)}
              type="button"
              disabled={locked}
              onClick={() => {
                setPicked(value);
                onResolved();
              }}
              class={`${optionBase} text-center ${cls}`}
            >
              {value ? t("recall.true") : t("recall.false")}
            </button>
          );
        })}
      </div>
      {locked && (
        <Feedback correct={picked === q.statementTrue}>
          {picked === q.statementTrue
            ? t("recall.feedback.correct", { fact: q.fact })
            : q.statementTrue
            ? t("recall.feedback.wasTrue", { fact: q.fact })
            : t("recall.feedback.wasFalse", { fact: q.fact })}
        </Feedback>
      )}
    </div>
  );
}

function Matching({ q, onResolved }: { q: MatchQuestion; onResolved: () => void }) {
  const chips = useMemo(
    () => shuffle(q.items.map((it) => ({ ownerId: it.id, label: it.label }))),
    [q],
  );
  const labelByOwner = useMemo(() => new Map(q.items.map((it) => [it.id, it.label])), [q]);
  const [selected, setSelected] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const usedOwners = new Set(Object.values(assign));
  const allAssigned = q.items.every((it) => assign[it.id]);
  const allRight = q.items.every((it) => assign[it.id] === it.id);

  function pickPerson(id: string) {
    if (checked) return;
    setSelected((prev) => (prev === id ? null : id));
  }
  function pickChip(ownerId: string) {
    if (checked || !selected) return;
    setAssign((prev) => {
      const next: Record<string, string> = {};
      for (const [pid, oid] of Object.entries(prev)) {
        if (oid !== ownerId) next[pid] = oid; // a chip pairs with one person only
      }
      next[selected] = ownerId;
      return next;
    });
    setSelected(null);
  }

  return (
    <div>
      <p class="text-base leading-relaxed">{q.prompt}</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          {q.items.map((it) => {
            const chosen = assign[it.id];
            const isSel = selected === it.id;
            let cls = isSel
              ? "border-accent bg-accent-soft"
              : "border-line-2 bg-surface hover:bg-inset";
            if (checked) cls = chosen === it.id ? correctOption : wrongOption;
            return (
              <button
                key={it.id}
                type="button"
                disabled={checked}
                onClick={() => pickPerson(it.id)}
                class={`${optionBase} flex items-center justify-between gap-2 ${cls}`}
              >
                <span class="truncate">{it.name}</span>
                <span class="shrink-0 text-xs font-normal text-ink-3">
                  {checked && chosen !== it.id ? it.label : chosen ? labelByOwner.get(chosen) : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div class="grid gap-2">
          {chips.map((c) => {
            const used = usedOwners.has(c.ownerId);
            return (
              <button
                key={c.ownerId}
                type="button"
                disabled={checked || !selected}
                onClick={() => pickChip(c.ownerId)}
                class={`${optionBase} text-center ${
                  used ? "border-line bg-inset text-ink-3" : idleOption
                } ${!selected && !checked ? "opacity-60" : ""}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      {!checked && (
        <button
          type="button"
          disabled={!allAssigned}
          onClick={() => {
            setChecked(true);
            onResolved();
          }}
          class="btn btn-primary btn-sm mt-4 disabled:opacity-50"
        >
          {t("recall.check")}
        </button>
      )}
      {checked && (
        <Feedback correct={allRight}>
          {allRight ? t("recall.match.correct") : t("recall.match.wrong")}
        </Feedback>
      )}
    </div>
  );
}

function QuestionView({ q, onResolved }: { q: Question; onResolved: () => void }) {
  if (q.kind === "mc") return <MultipleChoice q={q} onResolved={onResolved} />;
  if (q.kind === "tf") return <TrueFalse q={q} onResolved={onResolved} />;
  return <Matching q={q} onResolved={onResolved} />;
}

export function Recall({ people, calendarUrl }: { people: ViewPerson[]; calendarUrl: string }) {
  const currentYear = new Date().getFullYear();
  const eligible = useMemo<Eligible[]>(
    () =>
      people
        .map((person) => {
          const parts = partsOf(person.date);
          if (!parts) return null;
          const year = person.date.length === 10 ? Number(person.date.slice(0, 4)) : null;
          return { person, month: parts.month, day: parts.day, year };
        })
        .filter((e): e is Eligible => e !== null),
    [people],
  );

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [done, setDone] = useState(false);

  const questions = useMemo(
    () => (difficulty ? buildQuestions(eligible, difficulty, currentYear) : []),
    [eligible, difficulty, round, currentYear],
  );

  if (eligible.length < MIN_PEOPLE) {
    return (
      <article class="card p-6">
        <p class="text-sm leading-relaxed text-ink-2">
          {t("recall.notEnough")}
        </p>
        <a href={calendarUrl} class="btn btn-ghost btn-sm mt-4">{t("recall.backToCalendar")}</a>
      </article>
    );
  }

  function start(level: Difficulty) {
    setDifficulty(level);
    setRound((r) => r + 1);
    setIndex(0);
    setAnswered(false);
    setDone(false);
  }

  if (!difficulty) {
    return (
      <article class="card p-6">
        <p class="text-base font-medium">{t("recall.difficulty.title")}</p>
        <p class="mt-1 text-sm text-ink-2">
          {t("recall.difficulty.hint")}
        </p>
        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => start("easy")}
            class="rounded-lg border border-line-2 bg-surface px-4 py-3 text-left transition-colors hover:bg-inset"
          >
            <span class="block font-medium">{t("recall.easy")}</span>
            <span class="mt-0.5 block text-xs text-ink-3">{t("recall.easy.hint")}</span>
          </button>
          <button
            type="button"
            onClick={() => start("hard")}
            class="rounded-lg border border-line-2 bg-surface px-4 py-3 text-left transition-colors hover:bg-inset"
          >
            <span class="block font-medium">{t("recall.hard")}</span>
            <span class="mt-0.5 block text-xs text-ink-3">{t("recall.hard.hint")}</span>
          </button>
        </div>
        <a href={calendarUrl} class="btn btn-ghost btn-sm mt-4">{t("recall.backToCalendar")}</a>
      </article>
    );
  }

  if (done) {
    return (
      <article class="card p-6">
        <p class="text-base font-medium">{t("recall.done.title")}</p>
        <p class="mt-1 text-sm leading-relaxed text-ink-2">
          {t("recall.done.body")}
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => start(difficulty)} class="btn btn-primary btn-sm">
            {t("recall.again")}
          </button>
          <button type="button" onClick={() => setDifficulty(null)} class="btn btn-ghost btn-sm">
            {t("recall.changeDifficulty")}
          </button>
          <a href={calendarUrl} class="btn btn-ghost btn-sm">{t("recall.backToCalendar")}</a>
        </div>
      </article>
    );
  }

  const isLast = index === questions.length - 1;

  function next() {
    if (isLast) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(false);
  }

  return (
    <article class="card p-6">
      <div class="flex items-center gap-1.5">
        {questions.map((_, i) => (
          <span
            key={i}
            class={`h-1.5 flex-1 rounded-full ${
              i < index ? "bg-accent" : i === index ? "bg-accent/50" : "bg-line-2"
            }`}
          />
        ))}
      </div>
      <p class="mt-3 text-xs text-ink-3">
        {t("recall.questionOf", { current: index + 1, total: questions.length })}
      </p>

      <div class="mt-4">
        <QuestionView key={index} q={questions[index]} onResolved={() => setAnswered(true)} />
      </div>

      <div class="mt-6 flex justify-end">
        <button
          type="button"
          disabled={!answered}
          onClick={next}
          class="btn btn-primary btn-sm disabled:opacity-50"
        >
          {isLast ? t("recall.finish") : t("recall.next")}
        </button>
      </div>
    </article>
  );
}
