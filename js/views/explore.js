/**
 * #/explore: interactive studies, pages that make a passage visible (its
 * images, history and places). #/explore/<id>: one of them. Each page has
 * its own view; register it in VIEWS. Their content lives in
 * data/study/explore/ and is listed in data/study/explore.json.
 */
import { t } from '../i18n.js';
import { pageHref, PAGES } from '../router.js';
import { icon, ICONS } from '../ui/dom.js';
import { renderDanielStatue } from './explore/daniel-statue.js';
import { renderRevelationAnimals } from './explore/revelation-animals.js';
import { localize } from './maps.js';
import { linkCards, studyPage } from './templates/study-page.js';

/** Page id → its view: (options) => { element, destroy }. */
export const VIEWS = Object.freeze({ 'daniel-statue': renderDanielStatue, 'revelation-animals': renderRevelationAnimals });

export const exploreHref = (id = null, query = '') => `${pageHref(PAGES.explore)}${id ? `/${id}` : ''}${query ? `?${query}` : ''}`;

/** A link card for an explore page (also used on book introductions). */
export function exploreCard(page) {
  return { href: exploreHref(page.id), title: localize(page.title), text: localize(page.summary), icon: icon(ICONS[page.icon] ?? ICONS.research, { size: 22, className: 'icon link-card-icon' }) };
}

export function renderExploreIndex({ pages }) {
  return studyPage({
    kicker: t('page.study'),
    title: t('explore.title'),
    lead: t('explore.intro'),
    className: 'explore-page',
    sections: [{ id: 'explore-list', title: t('explore.all'), content: linkCards(pages.map(exploreCard)) }],
  });
}
