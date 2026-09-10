/**
 * Arranque de la aplicación.
 *
 * Orden intencionado: primero el documento (cabecera, secciones, formulario),
 * después la galería WebGL, que se importa bajo demanda. Si Three.js no carga,
 * si el dispositivo no tiene WebGL o si el sistema pide movimiento reducido, la
 * página sigue siendo la misma: cambia el escenario por su alternativa HTML.
 */
import { startRouter, setState, getState, currentList } from './store.js';
import { startLoop, ScrollTrigger, scrollTo, prefersReducedMotion } from './motion.js';
import { initHeader } from './ui/header.js';
import { initReveal } from './ui/reveal.js';
import { initTeam } from './ui/team.js';
import { initContact } from './ui/contact.js';
import { initViewer } from './ui/viewer.js';
import { initSolutions } from './ui/solutions.js';
import { initStage, galleryIsViable } from './ui/stage.js';
import { initExplore } from './ui/explore.js';
import { $ } from './dom.js';

/** Abre un caso de estudio dejando el escenario en el proyecto correcto. */
function openProject(project) {
  if (!project || !project.file) return;
  let index = currentList().findIndex((p) => p.id === project.id);
  if (index < 0) {
    // El proyecto no está en el filtro actual: se ajusta antes de abrirlo.
    setState({ filter: project.category });
    index = currentList().findIndex((p) => p.id === project.id);
  }
  setState({ mode: 'journey', index: Math.max(0, index), viewer: project.id });
}

async function loadGallery() {
  if (!galleryIsViable()) {
    // Sin esto, "el scroll no cambia los proyectos" es indistinguible de un
    // fallo. Aquí queda dicho por qué.
    console.info(
      '[hayai] galería en modo alternativa HTML —',
      prefersReducedMotion() ? 'el sistema pide movimiento reducido' : 'WebGL no disponible'
    );
    return null;
  }
  try {
    const { Gallery } = await import('./gallery/scene.js');
    return new Gallery({
      onContextLost: () => {
        // Contexto perdido: se conserva el contenido con la alternativa HTML.
        document.documentElement.dataset.gallery = 'fallback';
        ScrollTrigger.refresh();
      }
    });
  } catch (error) {
    console.warn('[hayai] galería WebGL no disponible:', error);
    return null;
  }
}

async function boot() {
  startLoop();

  initHeader();
  initTeam();
  initContact();
  initViewer();

  const gallery = await loadGallery();

  const stage = initStage({
    gallery,
    onOpenProject: openProject,
    onExplore: () => {
      if (gallery) setState({ mode: 'explore' });
      else scrollTo('#soluciones', { offset: -80 });
    }
  });

  if (gallery) {
    initExplore({
      gallery,
      stageHost: $('[data-canvas-host]'),
      stageController: stage.controller,
      onOpenProject: openProject
    });
  }

  initSolutions({
    onOpenProject: openProject,
    // Filtrar devuelve al visitante al trabajo, con el recorrido reiniciado.
    onFilterChange: () => stage.focusStage()
  });

  initReveal();
  startRouter();

  // Las medidas del recorrido dependen de fuentes y portadas ya cargadas.
  ScrollTrigger.refresh();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener('load', () => ScrollTrigger.refresh());

  document.documentElement.dataset.ready = 'true';
  if (prefersReducedMotion()) document.documentElement.dataset.motion = 'reduced';

  // Punto de entrada para depurar desde la consola sin exponer nada sensible.
  window.HAYAI = { getState, setState, gallery };
}

boot();
