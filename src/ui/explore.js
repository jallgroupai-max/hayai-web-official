/**
 * Modo Explorar: la galería inmersiva de recorrido circular.
 *
 * Reutiliza la misma escena y el mismo lienzo que el escenario —el canvas
 * simplemente cambia de contenedor—, así que abrirlo no duplica geometrías,
 * materiales ni texturas en la GPU. Mientras está abierto, el controlador de
 * gestos es el único que mueve la galería; el recorrido por scroll queda
 * suspendido. Siempre hay salida visible: botón, Escape y acceso a la lista.
 */
import { $, el, pad2, trapFocus } from '../dom.js';
import { getState, setState, setIndex, currentList, currentProject, subscribe } from '../store.js';
import { categoryById } from '../data.js';
import { onFrame, lockScroll, scrollTo } from '../motion.js';
import { GalleryController } from '../gallery/controller.js';

export function initExplore({ gallery, stageHost, stageController, onOpenProject }) {
  const root = $('[data-explore]');
  const host = $('[data-explore-canvas-host]');
  const indexEl = $('[data-explore-index]');
  const categoryEl = $('[data-explore-category]');
  const countEl = $('[data-explore-count]');
  const titleEl = $('[data-explore-title]');
  const descEl = $('[data-explore-desc]');
  const dotsHost = $('[data-explore-dots]');
  const openBtn = $('[data-explore-open]');
  const prevBtn = $('[data-explore-prev]');
  const nextBtn = $('[data-explore-next]');
  const closeBtn = $('[data-explore-close]');
  const listBtn = $('[data-explore-list]');

  if (!root || !gallery) return { open: () => {}, close: () => {} };

  const controller = new GalleryController(host, {
    onTap: handleTap,
    onPointer: (nx, ny) => gallery.setPointer(nx, ny)
  });

  let releaseTrap = null;
  let restoreFocus = null;

  /* ── Presentación ─────────────────────────────────────────────────────── */

  function renderDots() {
    const list = currentList();
    dotsHost.replaceChildren(
      ...list.map((project, i) => {
        const button = el(
          'button',
          { type: 'button', 'aria-label': `Ir a ${project.title}`, 'aria-current': 'false' },
          [el('span', { 'aria-hidden': 'true' })]
        );
        button.addEventListener('click', () => {
          setIndex(i);
          controller.jumpTo(i);
        });
        return button;
      })
    );
  }

  function renderMeta() {
    const list = currentList();
    const project = currentProject();
    const index = getState().index;

    indexEl.textContent = pad2(list.length ? index + 1 : 0);
    countEl.textContent = `/ ${pad2(list.length)}`;

    if (!project) {
      categoryEl.textContent = '';
      titleEl.textContent = 'Sin casos en esta categoría';
      descEl.textContent = 'Vuelve al listado completo o cuéntanos tu proyecto.';
      openBtn.disabled = true;
      return;
    }

    categoryEl.textContent = (categoryById(project.category) || {}).title || project.type;
    titleEl.textContent = project.title;
    descEl.textContent = project.description;
    openBtn.disabled = !project.file;

    Array.from(dotsHost.children).forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  }

  /* ── Gestos ───────────────────────────────────────────────────────────── */

  function handleTap(x, y) {
    const picked = gallery.pickAt(x, y);
    if (picked == null) return;
    const project = currentList()[picked];
    if (!project) return;
    if (picked === getState().index) {
      if (project.file) onOpenProject(project);
      return;
    }
    setIndex(picked);
    controller.jumpTo(picked);
  }

  host.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    gallery.setHover(gallery.pickAt(event.clientX, event.clientY));
  });
  host.addEventListener('pointerleave', () => gallery.setHover(null));

  /* ── Apertura y cierre ────────────────────────────────────────────────── */

  function open() {
    if (!root.hidden) return;
    const list = currentList();
    restoreFocus = document.activeElement;

    root.hidden = false;
    lockScroll(true);
    requestAnimationFrame(() => {
      root.dataset.open = 'true';
      gallery.mount(host);
      // Más aire que en el escenario: aquí la galería es todo el contenido.
      gallery.configure({ fitRatio: 0.58, widthRatio: 0.34, offsetRatio: 0, offsetYRatio: 0 });
      gallery.resize();
    });

    // El recorrido por scroll se suspende: un solo controlador por gesto.
    if (stageController) stageController.disable();
    gallery.setLoop(list.length >= 4);
    controller.setLoop(list.length >= 4);
    controller.setLength(list.length);
    controller.setDriving(true);
    controller.enable();
    controller.jumpTo(getState().index, { immediate: true });

    renderDots();
    renderMeta();
    releaseTrap = trapFocus(root);
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (root.hidden) return;
    root.dataset.open = 'false';
    controller.disable();
    if (releaseTrap) releaseTrap();
    releaseTrap = null;

    setTimeout(() => {
      root.hidden = true;
      gallery.setLoop(false);
      gallery.mount(stageHost);
      gallery.configure();
      gallery.resize();
      if (stageController) stageController.enable();
      lockScroll(false);
      if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    }, 240);
  }

  /* ── Controles ────────────────────────────────────────────────────────── */

  closeBtn.addEventListener('click', () => setState({ mode: 'journey' }));
  prevBtn.addEventListener('click', () => controller.step(-1));
  nextBtn.addEventListener('click', () => controller.step(1));
  openBtn.addEventListener('click', () => {
    const project = currentProject();
    if (project && project.file) onOpenProject(project);
  });
  listBtn.addEventListener('click', () => {
    setState({ mode: 'journey' });
    setTimeout(() => scrollTo('#soluciones', { offset: -80 }), 280);
  });

  document.addEventListener('keydown', (event) => {
    if (root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setState({ mode: 'journey' });
    } else if (event.key === 'ArrowRight') controller.step(1);
    else if (event.key === 'ArrowLeft') controller.step(-1);
  });

  window.addEventListener('resize', () => {
    if (!root.hidden) gallery.resize();
  });

  /* ── Fotograma ────────────────────────────────────────────────────────── */

  onFrame((dt) => {
    if (root.hidden || getState().mode !== 'explore') return;
    const pos = controller.update(dt);
    gallery.setPosition(pos);
    const idx = controller.index();
    if (idx !== getState().index) setIndex(idx);
    gallery.update(dt);
  });

  /* ── Sincronía con el estado ──────────────────────────────────────────── */

  subscribe((state, changed) => {
    if (changed.has('mode')) {
      if (state.mode === 'explore') open();
      else close();
    }
    if (root.hidden) return;
    if (changed.has('filter')) {
      const list = currentList();
      controller.setLength(list.length);
      controller.setLoop(list.length >= 4);
      gallery.setLoop(list.length >= 4);
      controller.jumpTo(state.index, { immediate: true });
      renderDots();
    }
    if (changed.has('index') || changed.has('filter')) renderMeta();
  });

  return { open: () => setState({ mode: 'explore' }), close: () => setState({ mode: 'journey' }) };
}
