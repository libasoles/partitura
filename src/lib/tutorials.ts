import type { Strings } from '../i18n';
import { renderShortcuts, renderDot, renderBar, renderTabEdit, renderTabMove } from './score-tutorial.js';
import * as demos from './demos.js';

/** The sidebar: every tutorial, grouped. The order here is the reading order of "previous" and "next". */
export const categories = [
  { id: 'basics', slugs: ['start', 'features', 'notes-rests', 'accidentals', 'shortcuts', 'dots', 'settings', 'playback'] },
  { id: 'editing', slugs: ['select-move', 'copy', 'voices', 'patterns', 'tuplets', 'ties'] },
  { id: 'structure', slugs: ['signatures', 'measures', 'delete-barline', 'repeats', 'dynamics'] },
  { id: 'guitar', slugs: ['tab-toggle', 'edit-tab', 'move-tab', 'refinger', 'chords', 'barre'] },
  { id: 'files', slugs: ['files', 'scores', 'faq'] },
] as const;

export type Category = (typeof categories)[number]['id'];
export const slugs = categories.flatMap((c) => c.slugs) as unknown as readonly Slug[];
export type Slug = (typeof categories)[number]['slugs'][number];

export function categoryOf(slug: Slug): Category {
  return categories.find((c) => (c.slugs as readonly string[]).includes(slug))!.id;
}

const items = (list: string[], tag: 'ul' | 'ol') => `<${tag} class="tutorial-list">${list.map((i) => `<li>${i}</li>`).join('')}</${tag}>`;

type Body = { steps: string[]; tip?: string };
type Demo = (s: Strings, aria: string) => string;

/** Tutorials whose animation is drawn by demos.js; the older ones keep their own renderers, and some (settings) have none. */
const animated: Partial<Record<Slug, Demo>> = {
  start: demos.place,
  'notes-rests': demos.notesRests,
  accidentals: demos.accidentals,
  'select-move': demos.selectMove,
  copy: demos.copy,
  tuplets: demos.tuplets,
  ties: demos.ties,
  signatures: demos.signatures,
  measures: demos.measures,
  repeats: demos.repeats,
  dynamics: demos.dynamics,
  'tab-toggle': demos.tabToggle,
  refinger: demos.refinger,
  barre: demos.barre,
  files: demos.files,
  scores: demos.scores,
};

const figure = (slug: Slug, s: Strings) => (animated[slug] ? `<div class="tutorial-demo">${animated[slug]!(s, s.tutorials.items[slug][0])}</div>` : '');

function guide(slug: Slug, s: Strings): string {
  const t = s.tutorials;
  const body = (t.bodies as Record<string, Body>)[slug];
  return (
    figure(slug, s) +
    `<h2 class="tutorial-h">${t.stepsHeading}</h2>` +
    items(body.steps, 'ol') +
    (body.tip ? `<p class="tutorial-tip"><strong>${t.tipLabel}:</strong> ${body.tip}</p>` : '')
  );
}

/** The HTML body of one tutorial, built from the same strings the editor catalog already carries. */
export function tutorialBody(slug: Slug, s: Strings): string {
  switch (slug) {
    case 'start':
      return figure(slug, s) + `<h2 class="tutorial-h">${s.tutorials.stepsHeading}</h2>` + items(s.scoreHow, 'ol') + figure('signatures', s) +
        (s.tutorials.startTip ? `<p class="tutorial-tip">${s.tutorials.startTip}</p>` : '');
    case 'features': return items(s.scoreFeatures, 'ul');
    case 'shortcuts': return renderShortcuts(s);
    case 'dots': return `<p>${s.scoreDotBody}</p>${renderDot(s)}`;
    case 'delete-barline': return `<p>${s.scoreBarBody}</p>${renderBar(s)}`;
    case 'edit-tab': return `<p>${s.scoreTabEditBody}</p>${renderTabEdit(s)}`;
    case 'move-tab': return `<p>${s.scoreTabMoveBody}</p>${renderTabMove(s)}`;
    case 'faq':
      return `<dl class="faq">${s.scoreFaq.map(([q, a]) => `<div><dt><h2>${q}</h2></dt><dd>${a}</dd></div>`).join('')}</dl>`;
    default: return guide(slug, s);
  }
}

/** Topically close tutorials, shown below each guide with descriptive anchor text (in addition to previous/next). */
export const related: Record<Slug, Slug[]> = {
  start: ['notes-rests', 'shortcuts', 'files'],
  features: ['start', 'settings', 'files'],
  'notes-rests': ['dots', 'accidentals', 'shortcuts'],
  accidentals: ['notes-rests', 'signatures', 'shortcuts'],
  shortcuts: ['notes-rests', 'accidentals', 'select-move'],
  dots: ['notes-rests', 'ties', 'tuplets'],
  settings: ['playback', 'voices', 'patterns'],
  playback: ['settings', 'voices', 'files'],
  'select-move': ['copy', 'measures', 'shortcuts'],
  copy: ['voices', 'patterns', 'select-move'],
  voices: ['copy', 'playback', 'settings'],
  patterns: ['copy', 'ties', 'settings'],
  tuplets: ['notes-rests', 'ties', 'dots'],
  ties: ['dots', 'tuplets', 'notes-rests'],
  signatures: ['measures', 'accidentals', 'repeats'],
  measures: ['signatures', 'delete-barline', 'copy'],
  'delete-barline': ['measures', 'repeats', 'signatures'],
  repeats: ['measures', 'dynamics', 'delete-barline'],
  dynamics: ['repeats', 'notes-rests', 'signatures'],
  'tab-toggle': ['settings', 'edit-tab', 'refinger'],
  'edit-tab': ['move-tab', 'tab-toggle', 'refinger'],
  'move-tab': ['edit-tab', 'refinger', 'barre'],
  refinger: ['move-tab', 'edit-tab', 'barre'],
  chords: ['tab-toggle', 'refinger', 'barre'],
  barre: ['tab-toggle', 'refinger', 'edit-tab'],
  files: ['scores', 'faq', 'start'],
  scores: ['files', 'faq', 'start'],
  faq: ['start', 'features', 'files'],
};
