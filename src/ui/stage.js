/**
 * Escenario de proyectos.
 *
 * Dos modos con responsabilidades separadas, nunca simultáneos:
 *
 *  · Recorrido normal (escritorio): el progreso del documento manda. La sección
 *    se fija con position:sticky y su altura se calcula a partir del número de
 *    proyectos (≈0,8 alturas de viewport por transición). El controlador de
 *    gestos queda en modo no-conductor: sigue leyendo puntero y clics, pero no
 *    mueve la galería.
 *
 *  · Móvil: no hay fijación. El gesto vertical sigue desplazando la página y el
 *    controlador toma sólo los arrastres horizontales (bloqueo de eje).
 *
 * Si no hay WebGL o el sistema pide movimiento reducido, el escenario cae a una
 * alternativa HTML con la misma portada, los mismos metadatos y los mismos
 * controles.
 */
import { $, $$, pad2, clamp } from '../dom.js';
import { getState, setState, setIndex, step, currentList, currentProject, subscribe } from '../store.js';
import { categoryById } from '../data.js';
import {
  ScrollTrigger,
  onFrame,
  onLayoutChange,
  isDesktopStage,
  prefersReducedMotion,
  hasWebGL,
  scrollTo
} from '../motion.js';
import { GalleryController } from '../gallery/controller.js';

/** Alturas de viewport que dura cada transición del recorrido. */
const TRAVEL = 0.8;
const HOVER_THROTTLE = 80;

export function initStage({ gallery, onOpenProject, onExplore }) {
  const stage = $('[data-stage]');
  const host = $('[data-canvas-host]');
  const meta = $('[data-stage-meta]');
  const emptyPanel = $('[data-stage-empty]');
  const fallbackImg = $('[data-fallback-img]');

  const metaIndex = $('[data-meta-index]');
  const metaCategory = $('[data-meta-category]');
  const metaTitle = $('[data-meta-title]');
  const metaDesc = $('[data-meta-desc]');
  const counterCurrent = $('[data-counter-current]');
  const counterTotal = $('[data-counter-total]');
  const railThumb = $('[data-rail-thumb]');
  const openBtn = $('[data-action="open-project"]');
  const prevBtn = $('[data-action="prev"]');
  const nextBtn = $('[data-action="next"]');

  const usesGallery = !!gallery;
  document.documentElement.dataset.gallery = usesGallery ? 'webgl' : 'fallback';

  let trigger = null;
  let controller = null;
  let suppressScrollSync = false;
  let lastHoverAt = 0;
  let swapTimer = 0;

  /* ── Presentación ─────────────────────────────────────────────────────── */

  function renderMeta() {
    const list = currentList();
    const project = currentProject();
    const total = list.length;
    const index = getState().index;

    counterTotal.textContent = pad2(total);
    counterCurrent.textContent = pad2(total ? index + 1 : 0);

    const share = total ? 100 / total : 100;
    railThumb.style.setProperty('--thumb-h', `${share}%`);
    railThumb.style.setProperty('--thumb-y', `${total ? (index / total) * 100 : 0}%`);

    const disabled = total < 2;
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;

    emptyPanel.hidden = total > 0;
    meta.hidden = total === 0;
    if (!project) {
      openBtn.disabled = true;
      return;
    }

    openBtn.disabled = !project.file;
    openBtn.querySelector('span').textContent = project.file ? 'Ver proyecto' : 'Próximamente';
    if (fallbackImg) {
      fallbackImg.src = project.cover;
      fallbackImg.alt = `Portada del proyecto ${project.title}`;
    }

    // El texto se cambia detrás de una máscara corta, no de golpe.
    const write = () => {
      metaIndex.textContent = pad2(index + 1);
      metaCategory.textContent = (categoryById(project.category) || {}).title || project.type;
      metaTitle.textContent = project.title;
      metaDesc.textContent = project.description;
    };

    if (prefersReducedMotion()) {
      write();
      return;
    }
    meta.dataset.swapping = 'true';
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      write();
      meta.dataset.swapping = 'false';
    }, 180);
  }

  function setIntroOut(out) {
    stage.dataset.intro = out ? 'out' : 'in';
  }

  /* ── Geometría del recorrido ──────────────────────────────────────────── */

  function stageTravel() {
    const total = currentList().length;
    return Math.max(0, total - 1) * TRAVEL;
  }

  function applyStageHeight() {
    if (!isDesktopStage() || !usesGallery) {
      stage.style.removeProperty('--stage-scroll');
      return;
    }
    stage.style.setProperty('--stage-scroll', `calc(100svh + ${stageTravel() * 100}svh)`);
  }

  function progressFor(index) {
    const total = currentList().length;
    return total > 1 ? index / (total - 1) : 0;
  }

  function scrollToIndex(index) {
    if (!trigger || !isDesktopStage()) return;
    const start = trigger.start;
    const range = trigger.end - trigger.start;
    if (range <= 0) return;
    suppressScrollSync = true;
    scrollTo(start + progressFor(index) * range, { duration: 0.9 });
    setTimeout(() => {
      suppressScrollSync = false;
    }, 1000);
  }

  /* ── Galería ──────────────────────────────────────────────────────────── */

  function configureGallery() {
    if (!usesGallery) return;
    const desktop = isDesktopStage();
    gallery.configure({
      fitRatio: desktop ? 0.6 : 0.86,
      widthRatio: desktop ? 0.62 : 0.74,
      offsetRatio: desktop ? 0.1 : 0
    });
    gallery.setLoop(false);
  }

  function syncGalleryList() {
    if (!usesGallery) return;
    const list = currentList();
    gallery.setProjects(list);
    if (controller) controller.setLength(list.length);
    host.hidden = list.length === 0;
  }

  function handleTap(x, y) {
    if (!usesGallery) return;
    const picked = gallery.pickAt(x, y);
    if (picked == null) return;
    const list = currentList();
    const project = list[picked];
    if (!project) return;

    if (picked === getState().index) {
      if (project.file) onOpenProject(project);
      return;
    }
    // Una lámina lateral se centra; no abre nada.
    setIndex(picked);
    if (isDesktopStage()) scrollToIndex(picked);
    else if (controller) controller.jumpTo(picked);
  }

  function handleHover(x, y) {
    if (!usesGallery) return;
    const now = performance.now();
    if (now - lastHoverAt < HOVER_THROTTLE) return;
    lastHoverAt = now;
    gallery.setHover(gallery.pickAt(x, y));
  }

  /* ── Arranque ─────────────────────────────────────────────────────────── */

  if (usesGallery) {
    gallery.mount(host);
    configureGallery();
    syncGalleryList();

    controller = new GalleryController(host, {
      axisLock: true,
      onTap: handleTap,
      onPointer: (nx, ny) => gallery.setPointer(nx, ny)
    });
    controller.enable();
    controller.jumpTo(getState().index, { immediate: true });

    host.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      handleHover(event.clientX, event.clientY);
    });
    host.addEventListener('pointerleave', () => gallery.setHover(null));

    onFrame((dt) => {
      // En modo Explorar manda el otro controlador: aqui no se dibuja nada.
      if (getState().mode === 'explore') return;
      const desktop = isDesktopStage();
      if (!desktop) {
        const pos = controller.update(dt);
        gallery.setPosition(pos);
        const idx = controller.index();
        if (idx !== getState().index) {
          suppressScrollSync = true;
          setIndex(idx);
          suppressScrollSync = false;
        }
      }
      gallery.update(dt);
    });

    window.addEventListener('resize', () => {
      gallery.resize();
      applyStageHeight();
    });
  }

  /* ── Recorrido con scroll ─────────────────────────────────────────────── */

  function buildTrigger() {
    if (trigger) {
      trigger.kill();
      trigger = null;
    }
    if (!usesGallery || !isDesktopStage()) {
      setIntroOut(false);
      if (controller) controller.setDriving(true);
      return;
    }
    if (controller) controller.setDriving(false);

    trigger = ScrollTrigger.create({
      trigger: stage,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const total = currentList().length;
        if (!total) return;
        const pos = self.progress * Math.max(0, total - 1);
        gallery.setPosition(pos);
        if (controller) controller.jumpTo(pos, { immediate: true });
        setIntroOut(self.progress > 0.035);

        const idx = clamp(Math.round(pos), 0, total - 1);
        if (idx !== getState().index) {
          const previous = suppressScrollSync;
          suppressScrollSync = true;
          setIndex(idx);
          suppressScrollSync = previous;
        }
      }
    });
  }

  applyStageHeight();
  buildTrigger();
  renderMeta();

  onLayoutChange(() => {
    configureGallery();
    applyStageHeight();
    buildTrigger();
    if (usesGallery) gallery.resize();
    ScrollTrigger.refresh();
  });

  /* ── Controles ────────────────────────────────────────────────────────── */

  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  openBtn.addEventListener('click', () => {
    const project = currentProject();
    if (project && project.file) onOpenProject(project);
  });
  $$('[data-action="explore"]').forEach((btn) => btn.addEventListener('click', () => onExplore()));

  // Teclado sobre el escenario: flechas para recorrer, Enter para abrir.
  host.tabIndex = 0;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Galería de proyectos. Usa las flechas para recorrerla.');
  host.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'Enter' || event.key === ' ') {
      const project = currentProject();
      if (project && project.file) {
        event.preventDefault();
        onOpenProject(project);
      }
      return;
    } else return;
    event.preventDefault();
  });

  /* ── Sincronía con el estado ──────────────────────────────────────────── */

  subscribe((state, changed) => {
    if (changed.has('filter')) {
      syncGalleryList();
      applyStageHeight();
      ScrollTrigger.refresh();
      if (usesGallery && controller) controller.jumpTo(state.index, { immediate: true });
      if (usesGallery) gallery.setPosition(state.index);
    }
    if (changed.has('index') || changed.has('filter')) {
      renderMeta();
      if (!suppressScrollSync && isDesktopStage() && usesGallery) scrollToIndex(state.index);
      if (!suppressScrollSync && !isDesktopStage() && controller) controller.jumpTo(state.index);
    }
  });

  return {
    /** Lleva el documento al escenario con el recorrido reiniciado. */
    focusStage() {
      applyStageHeight();
      ScrollTrigger.refresh();
      scrollTo(stage, { offset: 0, duration: 1 });
    },
    controller
  };
}

/** Decide si la galería WebGL puede usarse en este dispositivo/sesión. */
export function galleryIsViable() {
  return hasWebGL() && !prefersReducedMotion();
}
