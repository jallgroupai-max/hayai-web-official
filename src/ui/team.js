/** Equipo: perfiles reales publicados, cada uno con su enlace externo. */
import { $, el } from '../dom.js';
import { TEAM } from '../data.js';
import { initParallax } from './parallax.js';

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
          'data-reveal': ''
        },
        [
          el('span', { class: 'member__photo', 'data-parallax': '' }, [
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
            el('span', { class: 'member__name', text: member.name }),
            el('span', { class: 'member__role', text: member.role }),
            el('span', { class: 'member__net tag', text: `${member.network} ↗` })
          ])
        ]
      )
    )
  );

  initParallax(grid);
}
