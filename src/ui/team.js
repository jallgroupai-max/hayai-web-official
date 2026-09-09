/** Equipo: perfiles reales publicados, cada uno con su enlace externo. */
import { $, el, arrow } from '../dom.js';
import { TEAM } from '../data.js';

export function initTeam() {
  const grid = $('[data-team-grid]');
  if (!grid) return;

  grid.replaceChildren(
    ...TEAM.map((member) =>
      el(
        'a',
        {
          class: 'member',
          href: member.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          'data-reveal': '',
          style: { '--member-accent': member.accent }
        },
        [
          el('span', { class: 'member__photo' }, [
            el('img', {
              src: member.photo,
              alt: member.name,
              width: 640,
              height: 800,
              loading: 'lazy',
              decoding: 'async'
            })
          ]),
          el('span', {}, [
            el('span', { class: 'member__name', text: member.name, style: { display: 'block' } }),
            el('span', { class: 'member__role', text: member.role, style: { display: 'block' } }),
            el('span', { class: 'member__net' }, [document.createTextNode(member.network), arrow('↗')])
          ])
        ]
      )
    )
  );
}
