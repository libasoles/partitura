import type { Strings } from '../i18n';
import { renderShortcuts, renderDot, renderBar, renderTabEdit, renderTabMove } from './score-tutorial.js';

export const slugs = ['start', 'features', 'shortcuts', 'dots', 'delete-barline', 'edit-tab', 'move-tab', 'faq'] as const;
export type Slug = (typeof slugs)[number];

const items = (list: string[], tag: 'ul' | 'ol') => `<${tag} class="tutorial-list">${list.map((i) => `<li>${i}</li>`).join('')}</${tag}>`;

/** The HTML body of one tutorial, built from the same strings the editor catalog already carries. */
export function tutorialBody(slug: Slug, s: Strings): string {
  switch (slug) {
    case 'start': return items(s.scoreHow, 'ol');
    case 'features': return items(s.scoreFeatures, 'ul');
    case 'shortcuts': return renderShortcuts(s);
    case 'dots': return `<p>${s.scoreDotBody}</p>${renderDot(s)}`;
    case 'delete-barline': return `<p>${s.scoreBarBody}</p>${renderBar(s)}`;
    case 'edit-tab': return `<p>${s.scoreTabEditBody}</p>${renderTabEdit(s)}`;
    case 'move-tab': return `<p>${s.scoreTabMoveBody}</p>${renderTabMove(s)}`;
    case 'faq':
      return `<dl class="faq">${s.scoreFaq.map(([q, a]) => `<div><dt><h2>${q}</h2></dt><dd>${a}</dd></div>`).join('')}</dl>`;
  }
}
