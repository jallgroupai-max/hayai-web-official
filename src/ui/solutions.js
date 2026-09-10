/**
 * Soluciones: las seis categorías y el índice de proyectos.
 *
 * La rejilla de proyectos es HTML real y siempre está en el documento: sirve
 * como listado navegable, como resultado del filtro y como alternativa cuando
 * la galería WebGL no puede dibujarse.
 */
import { $, el, pad2 } from '../dom.js';
import { CATEGORIES, projectsOf, categoryById } from '../data.js';
import { getState, setState, currentList, subscribe } from '../store.js';
import { initReveal } from './reveal.js';
import { initParallax, clearParallax } from './parallax.js';

export function initSolutions({ onOpenProject, onFilterChange }) {
  const listHost = $('[data-cat-list]');
  const grid = $('[data-work-grid]');
  const emptyHost = $('[data-work-empty]');
  const indexTitle = $('[data-index-title]');
  const indexCount = $('[data-index-count]');

  /* ── Categorías ───────────────────────────────────────────────────────── */

  const buttons = CATEGORIES.map((category, i) => {
    const count = projectsOf(category.id).length;
    const button = el(
      'button',
      {
        class: 'cat',
        type: 'button',
        'aria-pressed': 'false',
        'data-cat': category.id
      },
      [
        el('span', { class: 'cat__num', text: pad2(i + 1) }),
        el('span', { class: 'cat__body' }, [
          el('span', { class: 'cat__title', text: category.title }),
          el('span', { class: 'cat__desc', text: category.description })
        ]),
        el('span', {
          class: 'cat__meta',
          text: count === 0 ? 'Sin casos' : count === 1 ? '1 proyecto' : `${count} proyectos`
        })
      ]
    );

    button.addEventListener('click', () => {
      const active = getState().filter === category.id;
      setState({ filter: active ? null : category.id, index: 0 });
      if (!active && onFilterChange) onFilterChange(category.id);
    });

    return button;
  });

  listHost.append(...buttons);

  /* ── Rejilla de proyectos ─────────────────────────────────────────────── */

  function projectCard(project, index) {
    const category = categoryById(project.category);
    const openable = !!project.file;

    const card = el(
      'button',
      {
        class: 'work-card',
        type: 'button',
        'data-soon': String(!openable),
        'aria-disabled': openable ? null : 'true'
      },
      [
        el('span', { class: 'work-card__shot', 'data-parallax': '' }, [
          el('img', {
            src: project.cover,
            alt: `Portada del proyecto ${project.title}`,
            width: 1080,
            height: 1440,
            loading: index < 2 ? 'eager' : 'lazy',
            decoding: 'async'
          })
        ]),
        el('span', { class: 'work-card__body' }, [
          el('span', { class: 'work-card__title', text: project.title }),
          el('span', { class: 'work-card__cta', text: openable ? 'Ver caso ↗' : 'Próximamente' }),
          el('span', { class: 'work-card__type', text: category ? category.title : project.type })
        ])
      ]
    );

    if (openable) card.addEventListener('click', () => onOpenProject(project));
    return card;
  }

  function emptyInvite(category) {
    return el('div', { class: 'work-empty' }, [
      el('h4', { text: `Todavía no hemos publicado un caso de ${category.title}.` }),
      el('p', {
        class: 'lede',
        text: 'Podemos hacer que el primero sea el tuyo: cuéntanos qué necesitas y te decimos cómo lo abordaríamos.'
      }),
      el('a', { class: 'action action--amber', href: '#contacto' }, [
        document.createTextNode('Hablemos de tu proyecto'),
        el('span', { class: 'glyph', 'aria-hidden': 'true', text: '↗' })
      ])
    ]);
  }

  function renderGrid() {
    const state = getState();
    const list = currentList();
    const category = state.filter ? categoryById(state.filter) : null;

    indexTitle.textContent = category ? category.title : 'Todos los proyectos';
    indexCount.textContent = list.length ? `${pad2(list.length)} ${list.length === 1 ? 'proyecto' : 'proyectos'}` : '';

    grid.replaceChildren(...list.map(projectCard));
    grid.hidden = list.length === 0;

    if (!list.length && category) {
      emptyHost.replaceChildren(emptyInvite(category));
      emptyHost.hidden = false;
    } else {
      emptyHost.replaceChildren();
      emptyHost.hidden = true;
    }

    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.cat === state.filter));
    }

    initReveal(grid);
    // La rejilla se reconstruye entera al filtrar: los disparadores viejos
    // apuntan a nodos que ya no existen.
    clearParallax();
    initParallax(grid);
  }

  renderGrid();
  subscribe((_, changed) => {
    if (changed.has('filter')) renderGrid();
  });
}
