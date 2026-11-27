/**
 * Reading plans: the list of plans (#/plans), one plan's page
 * (#/plans/bible-year), the bar under a chapter that belongs to today's
 * reading ("Mark as read · Next: Genesis 35"), and the home page's
 * "Today's reading" links.
 *
 * Views only: the schedule logic is js/plans/model.js and progress is kept
 * by js/plans/store.js; main.js passes in what changes it (callbacks).
 */
import { getBook } from '../canon.js';
import { bookName, getLanguage, t } from '../i18n.js';
import { addDays, dayChapters, isChapterRead, isDayDone, nextDay, parseChapterKey, parsePassage, passageChapters, summarize } from '../plans/model.js';
import { chapterHref, pageHref, PAGES, planHref } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';

const BLOCK = 30; // days per fold-out group on a plan's page

export const planName = (plan) => plan.name[getLanguage()] ?? plan.name.en;
const planDescription = (plan) => plan.description[getLanguage()] ?? plan.description.en;

/** "Genesis 1–3" in the interface language. */
export function passageLabel(text) {
  const passage = parsePassage(text);
  if (!passage) return text;
  const name = bookName(getBook(passage.book));
  return passage.from === passage.to ? `${name} ${passage.from}` : `${name} ${passage.from}–${passage.to}`;
}

const dayLabel = (plan, index) => plan.days[index].map(passageLabel).join('; ');

function chapterLink(key) {
  const { book, chapter } = parseChapterKey(key);
  return chapterHref(getBook(book), chapter);
}

const passageHref = (text) => chapterLink(passageChapters(text)[0]);

function formatDate(date, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(getLanguage(), options).format(new Date(y, m - 1, d));
}

const averageMinutes = (plan) => Math.round(plan.minutes.reduce((a, b) => a + b, 0) / plan.minutes.length);

/** "On schedule" / "2 days behind" / "1 day ahead" / "Finished". */
function statusText(summary) {
  if (summary.finished) return t('plans.finished');
  if (summary.behind) return t('plans.behind', { n: summary.behind });
  if (summary.ahead) return t('plans.ahead', { n: summary.ahead });
  return t('plans.onSchedule');
}

function progressBar(summary, labelledBy) {
  return el(
    'div',
    { class: 'plan-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(summary.percent), 'aria-labelledby': labelledBy },
    el('span', { class: 'plan-progress-bar', style: `width: ${summary.percent}%` }),
  );
}

/* ---------------------------------------------------------------------- */
/* #/plans                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {object[]} options.plans    data/plans.json's plans
 * @param {object[]} options.records  progress in the started ones
 * @param {string} options.today      "2026-11-27"
 */
export function renderPlansList({ plans, records, today }) {
  const started = plans.filter((plan) => records.some((r) => r.plan === plan.id));
  const others = plans.filter((plan) => !started.includes(plan));
  return el(
    'section',
    { class: 'plans-page', 'aria-labelledby': 'view-title' },
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, t('plans.title')),
    el('p', { class: 'view-subtitle' }, t('plans.intro')),
    started.length > 0 &&
      el(
        'section',
        { class: 'plans-section', 'aria-labelledby': 'plans-mine' },
        el('h2', { class: 'plans-section-title', id: 'plans-mine' }, t('plans.mine')),
        el('ul', { class: 'plan-cards', role: 'list' }, started.map((plan) => el('li', {}, planCard(plan, records.find((r) => r.plan === plan.id), today)))),
      ),
    others.length > 0 &&
      el(
        'section',
        { class: 'plans-section', 'aria-labelledby': 'plans-all' },
        el('h2', { class: 'plans-section-title', id: 'plans-all' }, started.length ? t('plans.more') : t('plans.choose')),
        el('ul', { class: 'plan-cards', role: 'list' }, others.map((plan) => el('li', {}, planCard(plan, null, today)))),
      ),
  );
}

function planCard(plan, record, today) {
  const id = `plan-card-${plan.id}`;
  if (!record) {
    return el(
      'a',
      { class: 'plan-card', href: planHref(plan.id) },
      el('span', { class: 'plan-card-title', id }, planName(plan)),
      el('span', { class: 'plan-card-text' }, planDescription(plan)),
      el('span', { class: 'plan-card-meta' }, `${t('plans.days', { n: plan.days.length })} · ${t('plans.minutesADay', { n: averageMinutes(plan) })}`),
    );
  }
  const summary = summarize(plan, record, today);
  return el(
    'a',
    { class: 'plan-card is-started', href: planHref(plan.id) },
    el('span', { class: 'plan-card-title', id }, planName(plan)),
    el(
      'span',
      { class: 'plan-card-meta' },
      summary.finished ? t('plans.finished') : `${t('plans.dayOf', { day: summary.next + 1, total: summary.total })} · ${statusText(summary)}`,
    ),
    !summary.finished && el('span', { class: 'plan-card-text' }, dayLabel(plan, summary.next)),
    progressBar(summary, id),
  );
}

/* ---------------------------------------------------------------------- */
/* #/plans/<id>                                                            */
/* ---------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {object} options.plan
 * @param {object | null} options.record  progress, or null if not started
 * @param {string} options.today
 * @param {number | null} [options.cardDay]  the day the reading card shows (default: the next unfinished)
 * @param {{ start(date), toggle(day, keys, read, fromCard), reschedule(), stop(), nextDay() }} options.actions
 */
export function renderPlanPage({ plan, record, today, cardDay = null, actions }) {
  return el(
    'section',
    { class: 'plans-page plan-page', 'aria-labelledby': 'view-title' },
    el('p', { class: 'back' }, el('a', { class: 'back-link', href: planHref() }, el('span', { 'aria-hidden': 'true' }, '←'), t('plans.all'))),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, planName(plan)),
    el('p', { class: 'view-subtitle' }, planDescription(plan)),
    el('p', { class: 'plan-meta' }, `${t('plans.days', { n: plan.days.length })} · ${t('plans.minutesADay', { n: averageMinutes(plan) })}`),
    record ? startedPlan(plan, record, today, cardDay, actions) : startForm(today, actions),
  );
}

function startForm(today, actions) {
  const date = el('input', { type: 'date', id: 'plan-start-date', class: 'plan-date-input', value: today, 'data-focus-key': 'plan-start-date' });
  return el(
    'div',
    { class: 'plan-start' },
    el('button', { type: 'button', class: 'button button--primary', 'data-focus-key': 'plan-start', onclick: () => actions.start(today) }, t('plans.startToday')),
    el(
      'p',
      { class: 'plan-start-other' },
      el('label', { for: 'plan-start-date' }, t('plans.startOn')),
      ' ',
      date,
      ' ',
      el('button', { type: 'button', class: 'button', onclick: () => date.value && actions.start(date.value) }, t('plans.start')),
    ),
    el('p', { class: 'plan-hint' }, t('plans.startHint')),
  );
}

function startedPlan(plan, record, today, cardDay, actions) {
  const summary = summarize(plan, record, today);
  // The card stays on a day just finished there (ticked, with "Next day"),
  // rather than jumping to the next one under the reader's finger.
  const next = cardDay ?? (summary.finished ? null : summary.next);
  return [
    el(
      'div',
      { class: 'plan-status' },
      el(
        'p',
        { class: 'plan-status-text', id: 'plan-status' },
        el('strong', {}, summary.finished ? t('plans.finished') : t('plans.dayOf', { day: summary.next + 1, total: summary.total })),
        ' · ',
        t('plans.percent', { n: summary.percent }),
        !summary.finished && ` · ${statusText(summary)}`,
      ),
      progressBar(summary, 'plan-status'),
      summary.behind > 0 &&
        el(
          'p',
          { class: 'plan-behind' },
          t('plans.behindHint', { n: summary.behind }),
          ' ',
          el('button', { type: 'button', class: 'text-button', 'data-focus-key': 'plan-reschedule', onclick: actions.reschedule }, t('plans.reschedule')),
        ),
    ),
    next !== null && nextReading(plan, record, next, actions),
    summary.finished && el('p', { class: 'plan-done-note' }, t('plans.finishedHint')),
    allDays(plan, record, today, summary, actions),
    el(
      'p',
      { class: 'plan-manage' },
      el('span', { class: 'plan-started-on' }, t('plans.startedOn', { date: formatDate(record.started, { day: 'numeric', month: 'long', year: 'numeric' }) })),
      ' ',
      el('button', { type: 'button', class: 'text-button plan-stop', 'data-focus-key': 'plan-stop', onclick: actions.stop }, t('plans.stop')),
    ),
  ];
}

/** Today's reading: a tick and a link per passage, and Read (or, once done, Next day). */
function nextReading(plan, record, index, actions) {
  const firstUnread = dayChapters(plan, index).find((key) => !isChapterRead(record, index, key));
  const done = !firstUnread;
  return el(
    'section',
    { class: 'plan-next', 'aria-labelledby': 'plan-next-title' },
    el(
      'h2',
      { class: 'plan-next-title', id: 'plan-next-title' },
      t('plans.dayN', { day: index + 1 }),
      el('span', { class: 'plan-next-date' }, ` · ${formatDate(addDays(record.started, index))} · ${t('plans.minutes', { n: plan.minutes[index] })}`),
    ),
    el(
      'ul',
      { class: 'plan-passages', role: 'list' },
      plan.days[index].map((passage, j) => {
        const keys = passageChapters(passage);
        const id = `plan-next-${j}`;
        return el(
          'li',
          { class: 'plan-passage' },
          tickBox({ id, keys, record, day: index, actions, label: passageLabel(passage), focusKey: `next-${j}`, fromCard: true }),
          el('a', { href: passageHref(passage), class: 'plan-passage-link' }, passageLabel(passage)),
        );
      }),
    ),
    firstUnread && el('a', { class: 'button button--primary plan-read', href: chapterLink(firstUnread) }, icon(ICONS.play, { size: 16 }), t('plans.read')),
    done &&
      el(
        'p',
        { class: 'plan-next-done' },
        el('span', { class: 'plan-next-done-text' }, icon(ICONS.check, { size: 18 }), t('plans.dayDone')),
        nextDay(plan, record) !== -1 &&
          el('button', { type: 'button', class: 'button button--primary', 'data-focus-key': 'plan-next-day', onclick: actions.nextDay }, t('plans.nextDay'), el('span', { 'aria-hidden': 'true' }, ' →')),
      ),
  );
}

/**
 * A checkbox for some chapters of one day: ticked when all are read,
 * half-ticked when some are. Its visible label is next to it (a link), so
 * the box carries its own accessible name.
 */
function tickBox({ id, keys, record, day, actions, label, focusKey, fromCard = false }) {
  const read = keys.filter((key) => isChapterRead(record, day, key)).length;
  const box = el('input', {
    type: 'checkbox',
    id,
    class: 'plan-tick',
    'aria-label': t('plans.markRead', { what: label }),
    'data-focus-key': focusKey,
  });
  box.checked = read === keys.length;
  box.indeterminate = read > 0 && read < keys.length;
  box.addEventListener('change', () => actions.toggle(day, keys, box.checked, fromCard));
  return box;
}

/** Every day, in fold-out groups of 30; the group with the next day is open. */
function allDays(plan, record, today, summary, actions) {
  const groups = [];
  const current = summary.finished ? -1 : summary.next;
  const scheduled = summary.scheduled;
  for (let from = 0; from < plan.days.length; from += BLOCK) {
    const to = Math.min(plan.days.length, from + BLOCK) - 1;
    const details = el(
      'details',
      { class: 'plan-block', open: current >= from && current <= to ? '' : null },
      el(
        'summary',
        { class: 'plan-block-title' },
        t('plans.daysRange', { from: from + 1, to: to + 1 }),
        el('span', { class: 'plan-block-dates' }, ` · ${formatDate(addDays(record.started, from), { day: 'numeric', month: 'short' })} – ${formatDate(addDays(record.started, to), { day: 'numeric', month: 'short' })}`),
      ),
    );
    const list = el('ol', { class: 'plan-days', role: 'list', start: String(from + 1) });
    for (let i = from; i <= to; i += 1) {
      const done = isDayDone(plan, record, i);
      list.append(
        el(
          'li',
          { class: `plan-day${done ? ' is-done' : ''}${i === scheduled && !summary.finished ? ' is-today' : ''}` },
          tickBox({ id: `plan-day-${i}`, keys: dayChapters(plan, i), record, day: i, actions, label: t('plans.dayN', { day: i + 1 }), focusKey: `day-${i}` }),
          el('span', { class: 'plan-day-number' }, t('plans.dayN', { day: i + 1 })),
          el('span', { class: 'plan-day-date' }, formatDate(addDays(record.started, i))),
          el(
            'span',
            { class: 'plan-day-passages' },
            plan.days[i].flatMap((passage, j) => [j > 0 && '; ', el('a', { href: passageHref(passage) }, passageLabel(passage))]),
          ),
          i === scheduled && !summary.finished && el('span', { class: 'plan-day-today' }, t('plans.today')),
        ),
      );
    }
    details.append(list);
    groups.push(details);
  }
  return el('section', { class: 'plan-all', 'aria-labelledby': 'plan-all-title' }, el('h2', { class: 'plans-section-title', id: 'plan-all-title' }, t('plans.allDays')), groups);
}

/* ---------------------------------------------------------------------- */
/* Under a chapter in the reader                                           */
/* ---------------------------------------------------------------------- */

/**
 * "Bible in a year · Day 12   [Mark as read]   Next: Genesis 35 →"
 * @param {object} options
 * @param {{ day: number, key: string } | null} options.next  what to read after this chapter
 * @param {(read: boolean) => void} options.onToggle
 */
export function renderPlanBar({ plan, record, day, key, next, onToggle }) {
  const read = isChapterRead(record, day, key);
  const dayDone = isDayDone(plan, record, day);
  const nextKey = next?.key;
  return el(
    'div',
    { class: `plan-bar${read ? ' is-read' : ''}`, 'data-plan': plan.id },
    el(
      'a',
      { class: 'plan-bar-plan', href: planHref(plan.id) },
      icon(ICONS.calendar, { size: 16 }),
      el('span', {}, `${planName(plan)} · ${t('plans.dayN', { day: day + 1 })}`),
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'plan-bar-toggle',
        'aria-pressed': String(read),
        'data-focus-key': `plan-bar-${plan.id}`,
        onclick: () => onToggle(!read),
      },
      read && icon(ICONS.check, { size: 16 }),
      read ? t('plans.isRead') : t('plans.markChapter'),
    ),
    read &&
      (nextKey
        ? el(
            'a',
            { class: 'plan-bar-next', href: chapterLink(nextKey) },
            dayDone && next.day !== day ? `${t('plans.dayDone')} ` : '',
            t('plans.nextChapter', { title: chapterTitleOf(nextKey) }),
            el('span', { 'aria-hidden': 'true' }, ' →'),
          )
        : el('span', { class: 'plan-bar-next' }, t('plans.finished'))),
  );
}

function chapterTitleOf(key) {
  const { book, chapter } = parseChapterKey(key);
  return `${bookName(getBook(book))} ${chapter}`;
}

/* ---------------------------------------------------------------------- */
/* The home page                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Links for the home page: today's reading in each unfinished plan.
 * [{ href, label, target }]
 */
export function todaysReadings({ plans, records, today }) {
  return records.flatMap((record) => {
    const plan = plans.find((p) => p.id === record.plan);
    if (!plan) return [];
    const summary = summarize(plan, record, today);
    if (summary.finished) return [];
    const firstUnread = dayChapters(plan, summary.next).find((key) => !isChapterRead(record, summary.next, key));
    return [{ href: chapterLink(firstUnread), label: `${planName(plan)} · ${t('plans.dayN', { day: summary.next + 1 })}`, target: dayLabel(plan, summary.next) }];
  });
}

export const plansPageHref = () => pageHref(PAGES.plans);
