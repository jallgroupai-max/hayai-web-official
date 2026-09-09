/**
 * Visor de casos de estudio.
 *
 * Carga la experiencia real de /projects bajo demanda dentro de un diálogo
 * modal. No hay espera mínima artificial: la cortina se retira en cuanto el
 * documento avisa de que ha cargado. Si no carga, hay error y reintento.
 */
import { $, trapFocus } from '../dom.js';
import { getState, setState, currentList, subscribe } from '../store.js';
import { projectById } from '../data.js';
import { lockScroll } from '../motion.js';

/** Ancho para el que están maquetados los casos de estudio. */
const DESIGN_WIDTH = 1440;
const LOAD_TIMEOUT = 30000;

export function initViewer() {
  const root = $('[data-viewer]');
  const stage = $('[data-viewer-stage]');
  const frame = $('[data-viewer-frame]');
  const label = $('[data-viewer-label]');
  const curtainTitle = $('[data-viewer-curtain-title]');
  const curtainNote = $('[data-viewer-curtain-note]');
  const retry = $('[data-viewer-retry]');
  const closeBtn = $('[data-viewer-close]');
  const prevBtn = $('[data-viewer-prev]');
  const nextBtn = $('[data-viewer-next]');
  const openLink = $('[data-viewer-open]');

  let releaseTrap = null;
  let restoreFocus = null;
  let timeoutId = 0;
  let observer = null;
  let current = null;

  /* ── Escalado del marco ───────────────────────────────────────────────── */

  function measure() {
    if (root.hidden) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    // Fit-to-width: el caso se ve completo y el visor nunca genera scroll lateral.
    const scale = Math.min(1, w / DESIGN_WIDTH);
    frame.style.width = `${w < DESIGN_WIDTH ? DESIGN_WIDTH : w}px`;
    frame.style.height = `${h / scale}px`;
    frame.style.transform = `scale(${scale})`;
  }

  /* ── Contenido del marco ──────────────────────────────────────────────── */

  function patchFrame() {
    // El caso maqueta a 100vw: si aparece su barra de scroll vertical, 100vw
    // excede el ancho visible y aparece scroll horizontal. Se neutraliza dentro.
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      if (doc.getElementById('__hayai_no_hscroll')) return;
      const style = doc.createElement('style');
      style.id = '__hayai_no_hscroll';
      style.textContent = 'html{overflow-x:hidden !important;}';
      (doc.head || doc.documentElement).append(style);
    } catch {
      /* otro origen: el iframe conserva su comportamiento */
    }
  }

  function setPhase(state) {
    root.dataset.state = state;
    curtainNote.textContent =
      state === 'error' ? 'No pudimos cargar la experiencia' : 'Cargando experiencia';
  }

  function load(project) {
    current = project;
    label.textContent = `${project.title} · ${project.type}`;
    curtainTitle.textContent = project.title;
    openLink.href = project.file;
    openLink.setAttribute('aria-label', `Abrir ${project.title} en una pestaña nueva`);

    setPhase('loading');
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => setPhase('error'), LOAD_TIMEOUT);

    frame.src = project.file;
  }

  frame.addEventListener('load', () => {
    if (!frame.src) return;
    clearTimeout(timeoutId);
    patchFrame();
    measure();
    setPhase('ready');
  });

  frame.addEventListener('error', () => {
    clearTimeout(timeoutId);
    setPhase('error');
  });

  retry.addEventListener('click', () => {
    if (current) load(current);
  });

  /* ── Apertura y cierre ────────────────────────────────────────────────── */

  function open(project) {
    restoreFocus = document.activeElement;
    root.hidden = false;
    lockScroll(true);
    // Fuerza un fotograma antes de la transición de opacidad.
    requestAnimationFrame(() => {
      root.dataset.open = 'true';
      measure();
    });

    observer = new ResizeObserver(measure);
    observer.observe(stage);
    releaseTrap = trapFocus(root);
    closeBtn.focus({ preventScroll: true });

    load(project);
    updateNav();
  }

  function close() {
    if (root.hidden) return;
    clearTimeout(timeoutId);
    root.dataset.open = 'false';
    if (observer) observer.disconnect();
    observer = null;
    if (releaseTrap) releaseTrap();
    releaseTrap = null;

    const finish = () => {
      root.hidden = true;
      // Descargar el iframe libera la memoria del bundle del caso.
      frame.removeAttribute('src');
      current = null;
      lockScroll(false);
      if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    };

    setTimeout(finish, 260);
  }

  function updateNav() {
    const list = currentList().filter((p) => p.file);
    const many = list.length > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
  }

  function stepProject(dir) {
    const list = currentList().filter((p) => p.file);
    if (list.length < 2 || !current) return;
    const i = list.findIndex((p) => p.id === current.id);
    const next = list[(i + dir + list.length) % list.length];
    // Mover el visor mueve también el proyecto activo del escenario detrás.
    const fullIndex = currentList().findIndex((p) => p.id === next.id);
    setState({ index: fullIndex >= 0 ? fullIndex : getState().index, viewer: next.id });
  }

  closeBtn.addEventListener('click', () => setState({ viewer: null }));
  prevBtn.addEventListener('click', () => stepProject(-1));
  nextBtn.addEventListener('click', () => stepProject(1));

  document.addEventListener('keydown', (event) => {
    if (root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setState({ viewer: null });
    } else if (event.key === 'ArrowRight') stepProject(1);
    else if (event.key === 'ArrowLeft') stepProject(-1);
  });

  window.addEventListener('resize', measure);

  /* ── Sincronía con el estado ──────────────────────────────────────────── */

  subscribe((state, changed) => {
    if (!changed.has('viewer')) {
      if (!root.hidden) updateNav();
      return;
    }
    const project = state.viewer ? projectById(state.viewer) : null;
    if (project && project.file) {
      if (root.hidden) open(project);
      else load(project);
      updateNav();
    } else {
      close();
    }
  });

  return { isOpen: () => !root.hidden };
}
