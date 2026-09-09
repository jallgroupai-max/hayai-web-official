/**
 * Estado compartido y enrutado por hash.
 *
 * Un único objeto de estado alimenta la escena WebGL, la rejilla HTML, el
 * contador, el visor y el formulario, de modo que un cambio de filtro los
 * actualiza a todos en la misma transición.
 *
 * URLs conservadas del sitio anterior:
 *   #<categoria>              -> filtro de categoría
 *   #<categoria>/<proyecto>   -> abre el caso de estudio
 *   #equipo                   -> ancla real de la sección Equipo
 * Y una nueva:
 *   #explorar                 -> galería inmersiva
 */
import { projectsOf, categoryById, projectById } from './data.js';
import { clamp } from './dom.js';

/**
 * @typedef {Object} State
 * @property {string|null} filter   Categoría activa (null = portafolio completo).
 * @property {number} index         Índice del proyecto activo dentro de la lista filtrada.
 * @property {'journey'|'explore'} mode
 * @property {string|null} viewer   id del proyecto abierto en el visor.
 */

/** @type {State} */
const state = {
  filter: null,
  index: 0,
  mode: 'journey',
  viewer: null
};

/** @type {Set<(state: State, changed: Set<string>) => void>} */
const listeners = new Set();

let applyingHash = false;

export function getState() {
  return state;
}

/** Proyectos visibles con el filtro actual. */
export function currentList() {
  return projectsOf(state.filter);
}

/** Proyecto activo, o null si la categoría está vacía. */
export function currentProject() {
  const list = currentList();
  if (!list.length) return null;
  return list[clamp(state.index, 0, list.length - 1)] || null;
}

/** @param {(state: State, changed: Set<string>) => void} fn */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @param {Partial<State>} patch */
export function setState(patch) {
  const changed = new Set();
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] === value) continue;
    state[key] = value;
    changed.add(key);
  }
  if (!changed.size) return;

  if (changed.has('filter')) {
    // Al filtrar se conserva el proyecto activo si sigue en la lista.
    const list = currentList();
    state.index = clamp(state.index, 0, Math.max(0, list.length - 1));
  }

  for (const fn of listeners) fn(state, changed);
  if (!applyingHash) syncHash();
}

/** Cambia el proyecto activo respetando los límites de la lista. */
export function setIndex(next) {
  const list = currentList();
  if (!list.length) return;
  const len = list.length;
  const wrapped = ((next % len) + len) % len;
  setState({ index: wrapped });
}

export function step(dir) {
  setIndex(state.index + dir);
}

/* ── Hash ─────────────────────────────────────────────────────────────── */

/** Anclas de documento que NO son rutas: el navegador las resuelve solo. */
const ANCHORS = new Set(['top', 'contenido', 'trabajo', 'soluciones', 'equipo', 'contacto']);

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { kind: 'home' };
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 'explorar') return { kind: 'explore' };
  const category = categoryById(parts[0]);
  if (category) {
    const project = parts[1] ? projectById(parts[1]) : null;
    return { kind: 'category', category, project };
  }
  if (ANCHORS.has(parts[0])) return { kind: 'anchor' };
  // Enlace antiguo a un proyecto sin categoría: #guarowook
  const direct = projectById(parts[0]);
  if (direct) return { kind: 'category', category: categoryById(direct.category), project: direct };
  return { kind: 'unknown' };
}

export function applyHash() {
  const route = parseHash();
  applyingHash = true;
  try {
    if (route.kind === 'home') {
      setState({ filter: null, viewer: null, mode: 'journey' });
    } else if (route.kind === 'explore') {
      setState({ mode: 'explore', viewer: null });
    } else if (route.kind === 'category') {
      const list = projectsOf(route.category.id);
      const index = route.project ? Math.max(0, list.findIndex((p) => p.id === route.project.id)) : 0;
      setState({
        filter: route.category.id,
        index,
        mode: 'journey',
        viewer: route.project && route.project.file ? route.project.id : null
      });
    } else if (route.kind === 'anchor') {
      // Ancla de sección: sólo cerramos lo que estuviera encima.
      setState({ viewer: null, mode: 'journey' });
    }
  } finally {
    applyingHash = false;
  }
}

function hashFor(s) {
  if (s.mode === 'explore') return '#explorar';
  if (s.viewer) {
    const project = projectById(s.viewer);
    if (project) return `#${project.category}/${project.id}`;
  }
  if (s.filter) return `#${s.filter}`;
  return '';
}

function syncHash() {
  const next = hashFor(state);
  const current = location.hash;
  // Una sección enfocada por ancla no debe perder su hash al cambiar de índice.
  if (!next && current && ANCHORS.has(current.replace(/^#\/?/, ''))) return;
  if (current === next) return;
  const url = next || location.pathname + location.search;
  history.pushState({ hayai: true }, '', url);
}

export function startRouter() {
  window.addEventListener('popstate', applyHash);
  window.addEventListener('hashchange', applyHash);
  applyHash();
}
