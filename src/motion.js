/**
 * Un único ciclo de animación para todo el sitio.
 *
 * gsap.ticker es el reloj: alimenta a Lenis, a ScrollTrigger y a cualquier
 * consumidor registrado con onFrame(). No existe ningún otro requestAnimationFrame,
 * de modo que la escena WebGL no se dibuja dos veces por fotograma. Como rAF no
 * corre con la pestaña oculta, el trabajo se detiene solo en segundo plano.
 */
import { gsap, ScrollTrigger } from 'gsap';
import { Lenis } from 'lenis';

/** @type {Set<(dt: number, time: number) => void>} */
const updaters = new Set();

/** @type {import('lenis').default|null} */
let lenis = null;
let started = false;

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/*
 * Quién recibe el recorrido por scroll. No basta con el ancho: un portátil con
 * el escalado de Windows al 150 % se queda en unos 820 px CSS y seguiría siendo
 * un escritorio con rueda al que le tocaría la experiencia táctil. Se decide
 * también por el puntero. Debe coincidir con el bloque equivalente de site.css.
 */
const wideQuery = window.matchMedia('(min-width: 900px)');
const pointerQuery = window.matchMedia('(pointer: fine) and (min-width: 720px)');

export const prefersReducedMotion = () => reducedQuery.matches;
export const isDesktopStage = () => wideQuery.matches || pointerQuery.matches;

/** @param {(matches: boolean) => void} fn */
export function onLayoutChange(fn) {
  const handler = () => fn(isDesktopStage());
  wideQuery.addEventListener('change', handler);
  pointerQuery.addEventListener('change', handler);
  return () => {
    wideQuery.removeEventListener('change', handler);
    pointerQuery.removeEventListener('change', handler);
  };
}

/** ¿Hay contexto WebGL utilizable? */
export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

/**
 * Registra una función que se ejecuta una vez por fotograma.
 * @param {(dt: number, time: number) => void} fn dt en segundos, acotado.
 */
export function onFrame(fn) {
  updaters.add(fn);
  return () => updaters.delete(fn);
}

export function startLoop({ smooth = true } = {}) {
  if (started) return { lenis };
  started = true;

  gsap.ticker.lagSmoothing(0);

  if (smooth && !prefersReducedMotion()) {
    lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // El gesto táctil vertical sigue siendo el scroll nativo del sistema.
      syncTouch: false
    });
    lenis.on('scroll', ScrollTrigger.update);
    document.documentElement.classList.add('lenis');
  }

  gsap.ticker.add((time, deltaMS) => {
    if (lenis) lenis.raf(time * 1000);
    const dt = Math.min(deltaMS / 1000, 1 / 20);
    for (const fn of updaters) fn(dt, time);
  });

  return { lenis };
}

/** Desplaza el documento con el mismo suavizado que el resto del sitio. */
export function scrollTo(target, options = {}) {
  if (lenis) {
    lenis.scrollTo(target, { offset: 0, duration: 1.1, ...options });
    return;
  }
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (typeof target === 'number') {
    window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } else if (node) {
    node.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}

/** Congela el scroll del documento mientras hay una capa modal encima. */
export function lockScroll(locked) {
  document.body.dataset.locked = locked ? 'true' : 'false';
  if (lenis) locked ? lenis.stop() : lenis.start();
}

export { gsap, ScrollTrigger };
