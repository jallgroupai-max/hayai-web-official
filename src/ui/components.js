/**
 * Piezas de interfaz que flotan alrededor de la portada activa.
 *
 * Son HTML real, no recortes de la imagen: se leen nítidas a cualquier tamaño,
 * escalan con la tipografía del sitio y no dependen de dónde caiga un
 * rectángulo sobre una captura. Los valores salen de la captura del caso, no se
 * inventan (ver `components` en data.js).
 *
 * Aparecen y desaparecen con el mismo avance de scroll que gobierna la galería:
 * enteras cuando el proyecto está asentado, retiradas mientras se cruza al
 * siguiente. La capa no intercepta el puntero, así que la lámina se sigue
 * pudiendo arrastrar y pulsar por debajo.
 *
 * Van marcadas como decorativas para lectores de pantalla: lo que de verdad
 * describe el proyecto vive en el rail y en la lista de títulos.
 */
import { $, el } from '../dom.js';
import { currentProject, subscribe } from '../store.js';

/** @param {import('../data.js').Component} c */
function render(c) {
  if (c.kind === 'stat') {
    return el('div', { class: 'ui-piece ui-piece--stat' }, [
      el('span', { class: 'ui-piece__value', text: c.value }),
      el('span', { class: 'ui-piece__label', text: c.label })
    ]);
  }

  if (c.kind === 'action') {
    return el('div', { class: 'ui-piece ui-piece--action' }, [
      el('div', { class: 'ui-piece__head' }, [
        el('span', { class: 'ui-piece__label', text: c.label }),
        el('span', { class: 'ui-piece__value', text: c.value })
      ]),
      el('span', { class: 'ui-piece__btn', text: c.action })
    ]);
  }

  return el('div', { class: 'ui-piece ui-piece--row' }, [
    el('span', { class: 'ui-piece__label', text: c.meta }),
    el('div', { class: 'ui-piece__line' }, [
      el('span', { class: 'ui-piece__title', text: c.title }),
      el('span', { class: 'ui-piece__trailing', text: c.trailing })
    ])
  ]);
}

export function initComponents() {
  const layer = $('[data-components]');
  if (!layer) return { setSettle: () => {} };

  let currentId = null;

  function paint() {
    const project = currentProject();
    if (!project || project.id === currentId) return;
    currentId = project.id;
    const pieces = project.components || [];
    layer.replaceChildren(...pieces.slice(0, 3).map(render));
  }

  paint();
  subscribe((_, changed) => {
    if (changed.has('index') || changed.has('filter')) paint();
  });

  return {
    /** 1 con el proyecto asentado, 0 en mitad del cruce. */
    setSettle(value) {
      layer.style.setProperty('--settle', value.toFixed(3));
    }
  };
}
