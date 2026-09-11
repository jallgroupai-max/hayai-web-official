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
 * La escena siempre gira en círculo aunque el recorrido sea finito: así el
 * abanico se ve lleno también en el primer y el último proyecto. El scroll
 * recorre 0..n-1; sólo el dibujado envuelve.
 *
 * Si no hay WebGL o el sistema pide movimiento reducido, el escenario cae a una
 * alternativa HTML con la misma portada, los mismos datos y los mismos controles.
 */
import { $, $$, el, pad2, clamp, damp } from '../dom.js';
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

/**
 * Alturas de viewport que dura cada tramo del recorrido. Con 1 hacia falta
 * bajar una pantalla entera por proyecto y se hacia largo; con 0,38 bastan un
 * par de muescas de rueda para pasar al siguiente.
 */
const TRAVEL = 0.38;
const HOVER_THROTTLE = 80;

/**
 * Fracción de cada tramo que el recorrido pasa DETENIDO en el proyecto.
 * Sin esto el scroll mapea linealmente a la posición de la galería y el
 * recorrido se queda parado en sitios como 0,694: ni un proyecto ni el
 * siguiente, con los componentes flotantes a medio desvanecer para siempre.
 * Con la espera, cada proyecto es una pantalla: se sostiene, y el cambio ocurre
 * en el resto del tramo.
 *
 * Se mantiene baja a propósito: el reposo sirve para que el proyecto se lea,
 * no para obligar a seguir bajando. Con el tramo ya corto, una espera larga
 * haría que el scroll pareciera no responder.
 */
const DWELL = 0.26;

/**
 * Cuánto de asentado está el proyecto: 1 quieto en su sitio, 0 en mitad del
 * cruce. Gobierna la aparición y la retirada de las piezas flotantes, así que
 * su ida y venida ocurre exactamente con el scroll.
 */
export function settleAmount(position) {
  const d = Math.abs(position - Math.round(position));
  const t = clamp((d - 0.08) / 0.34, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/** Mapea el avance continuo del documento a un recorrido con reposos. */
function dwellPosition(raw) {
  const index = Math.floor(raw);
  const within = raw - index;
  if (within <= DWELL) return index;
  const t = (within - DWELL) / (1 - DWELL);
  return index + t * t * (3 - 2 * t);
}

export function initStage({ gallery, components, onOpenProject, onExplore }) {
  const stage = $('[data-stage]');
  const host = $('[data-canvas-host]');
  const meta = $('[data-stage-meta]');
  const emptyPanel = $('[data-stage-empty]');
  const fallbackImg = $('[data-fallback-img]');

  const metaCategory = $('[data-meta-category]');
  const metaDesc = $('[data-meta-desc]');
  const counterCurrent = $('[data-counter-current]');
  const counterTotal = $('[data-counter-total]');
  const titleList = $('[data-title-list]');
  const openBtn = $('[data-action="open-project"]');
  const prevBtn = $('[data-action="prev"]');
  const nextBtn = $('[data-action="next"]');

  const usesGallery = !!gallery;
  const calm = prefersReducedMotion();
  document.documentElement.dataset.gallery = usesGallery ? 'webgl' : 'fallback';

  let trigger = null;
  let controller = null;
  let suppressScrollSync = false;
  let lastHoverAt = 0;
  let swapTimer = 0;
  /* Destino que marca el scroll. La galeria NO salta a el: lo persigue con
     suavizado propio en el bucle de fotograma. Sin esto, con el scroll nativo
     (o con movimiento reducido, donde no hay Lenis) cada muesca de rueda mueve
     la posicion de golpe y el fundido se ve como un corte seco. */
  let scrollTarget = 0;
  let titleItems = [];

  /* ── Columna de títulos ───────────────────────────────────────────────── */

  function buildTitles() {
    const list = currentList();
    titleItems = list.map((project, i) => {
      const category = categoryById(project.category);
      const item = el('button', { class: 'stage__title-item', type: 'button', 'aria-current': 'false' }, [
        el('span', { class: 'tag stage__title-cat', text: category ? category.short : project.type }),
        el('span', { class: 'stage__title-name', text: project.title }),
        el('span', { class: 'stage__title-desc', text: project.description })
      ]);
      item.addEventListener('click', () => {
        if (i === getState().index) {
          if (project.file) onOpenProject(project);
          return;
        }
        goToIndex(i);
      });
      return item;
    });
    titleList.replaceChildren(...titleItems);
  }

  function paintTitles() {
    const index = getState().index;
    titleItems.forEach((item, i) => item.setAttribute('aria-current', String(i === index)));

    // La lista se desplaza para que el proyecto activo quede en el eje de la
    // pantalla; los demás se alejan hacia arriba y hacia abajo.
    const active = titleItems[index];
    if (!active || !titleList.offsetHeight) return;
    const shift = titleList.offsetHeight / 2 - (active.offsetTop + active.offsetHeight / 2);
    titleList.style.transform = `translateY(${shift}px)`;
  }

  /* ── Presentación ─────────────────────────────────────────────────────── */

  function renderMeta() {
    const list = currentList();
    const project = currentProject();
    const total = list.length;
    const index = getState().index;

    counterCurrent.textContent = pad2(total ? index + 1 : 0);
    counterTotal.textContent = `/${pad2(total)}`;

    const disabled = total < 2;
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;

    emptyPanel.hidden = total > 0;
    meta.hidden = total === 0;
    titleList.hidden = total === 0;

    if (!project) {
      openBtn.disabled = true;
      return;
    }

    openBtn.disabled = !project.file;
    openBtn.querySelector('span').textContent = project.file ? 'Ver caso' : 'Próximamente';
    if (fallbackImg) {
      fallbackImg.src = project.cover;
      fallbackImg.alt = `Portada del proyecto ${project.title}`;
    }

    paintTitles();

    // El texto se cambia detrás de una máscara corta, no de golpe.
    const write = () => {
      metaCategory.textContent = (categoryById(project.category) || {}).title || project.type;
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
    }, 170);
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
    const range = trigger.end - trigger.start;
    if (range <= 0) return;
    suppressScrollSync = true;
    scrollTo(trigger.start + progressFor(index) * range, { duration: 0.9 });
    setTimeout(() => {
      suppressScrollSync = false;
    }, 1000);
  }

  /**
   * Quién manda la posición de la galería. Con el recorrido fijado manda el
   * scroll; en móvil manda el controlador. Sin esta distinción, el bucle de
   * fotograma leía el controlador y pisaba el índice que acababa de poner un
   * botón.
   */
  function controllerDrives() {
    return !isDesktopStage();
  }

  function goToIndex(index) {
    setIndex(index);
    if (controllerDrives()) {
      if (controller) controller.jumpTo(index);
    } else {
      scrollToIndex(index);
    }
  }

  /* ── Galería ──────────────────────────────────────────────────────────── */

  function configureGallery() {
    if (!usesGallery) return;
    const desktop = isDesktopStage();
    gallery.configure({
      // El logotipo se fue a la esquina superior derecha, asi que la portada
      // recupera todo el alto del escenario.
      fitRatio: desktop ? 0.8 : 0.76,
      widthRatio: desktop ? 0.4 : 0.6,
      offsetRatio: 0,
      offsetYRatio: 0
    });
    // El abanico envuelve siempre; el recorrido de scroll sigue siendo finito.
    gallery.setLoop(true);
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
    const project = currentList()[picked];
    if (!project) return;

    if (picked === getState().index) {
      if (project.file) onOpenProject(project);
      return;
    }
    // Una lámina lateral se centra; no abre nada.
    goToIndex(picked);
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
    // syncGalleryList() corrio antes de que existiera el controlador, asi que su
    // `if (controller) setLength(...)` no hizo nada. Sin longitud, update() e
    // index() devuelven 0 siempre y el bucle de fotograma pisa cualquier cambio
    // de indice. Se le da la longitud aqui, ya creado.
    controller.setLength(currentList().length);
    controller.setCalm(calm);
    controller.enable();
    controller.jumpTo(getState().index, { immediate: true });

    host.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      handleHover(event.clientX, event.clientY);
    });
    host.addEventListener('pointerleave', () => gallery.setHover(null));

    onFrame((dt) => {
      // En modo Explorar manda el otro controlador: aquí no se dibuja nada.
      if (getState().mode === 'explore') return;
      const total = currentList().length;

      if (controllerDrives()) {
        const pos = controller.update(dt);
        gallery.setPosition(pos);
        scrollTarget = pos;
      } else if (total) {
        // La galeria persigue al scroll en vez de pegarse a el: asi el fundido
        // dura lo que tiene que durar aunque la rueda avance a saltos.
        const eased = damp(gallery.position, scrollTarget, 0.2, dt);
        gallery.setPosition(Math.abs(eased - scrollTarget) < 0.0008 ? scrollTarget : eased);
      }

      if (total) {
        const idx = clamp(Math.round(gallery.position), 0, total - 1);
        if (idx !== getState().index) {
          const previous = suppressScrollSync;
          suppressScrollSync = true;
          setIndex(idx);
          suppressScrollSync = previous;
        }
      }

      gallery.update(dt);
      if (components) components.setSettle(settleAmount(gallery.position));
    });

    window.addEventListener('resize', () => {
      gallery.resize();
      applyStageHeight();
      paintTitles();
    });
  }

  /* ── Recorrido con scroll ─────────────────────────────────────────────── */

  function buildTrigger() {
    if (trigger) {
      trigger.kill();
      trigger = null;
    }
    if (!usesGallery || !isDesktopStage()) {
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
        scrollTarget = dwellPosition(self.progress * Math.max(0, total - 1));
      }
    });
  }

  buildTitles();
  applyStageHeight();
  buildTrigger();
  renderMeta();

  onLayoutChange(() => {
    configureGallery();
    applyStageHeight();
    buildTrigger();
    if (usesGallery) gallery.resize();
    paintTitles();
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
      buildTitles();
      applyStageHeight();
      ScrollTrigger.refresh();
      if (usesGallery && controller) controller.jumpTo(state.index, { immediate: true });
      if (usesGallery) {
        gallery.setPosition(state.index);
        scrollTarget = state.index;
      }
    }
    if (changed.has('index') || changed.has('filter')) {
      renderMeta();
      if (suppressScrollSync) return;
      if (controllerDrives()) {
        if (controller) controller.jumpTo(state.index);
      } else if (usesGallery) {
        scrollToIndex(state.index);
      }
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

/**
 * La galería WebGL sólo se descarta si el dispositivo no puede dibujarla.
 * Con movimiento reducido NO se descarta: se queda quieta. Apagarla entera
 * dejaba sin contenido a quien sólo pedía que las cosas no se movieran solas.
 */
export function galleryIsViable() {
  return hasWebGL();
}
