/**
 * Profundidad ligada al scroll para las imágenes del documento.
 *
 * Por qué existe: arriba, la galería WebGL coloca las portadas en planos a
 * distinta profundidad. Si más abajo las mismas portadas fueran rectángulos
 * planos pegados a la página, el sitio se partiría en dos lenguajes. Aquí la
 * imagen viaja más despacio que su marco, así que las secciones de documento
 * heredan la misma sensación de capas. No es adorno: es continuidad.
 *
 * Un único ScrollTrigger con scrub por imagen, y todo se apaga con
 * prefers-reduced-motion.
 */
import { $$ } from '../dom.js';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../motion.js';

/** Recorrido de la imagen dentro de su marco, en porcentaje de su alto. */
const TRAVEL = 7;

/** @type {ScrollTrigger[]} */
let triggers = [];

/**
 * @param {ParentNode} root Ámbito a recorrer (la rejilla se reconstruye al filtrar).
 */
export function initParallax(root = document) {
  if (prefersReducedMotion()) return;

  const frames = $$('[data-parallax]', root);
  if (!frames.length) return;

  for (const frame of frames) {
    const image = frame.querySelector('img');
    if (!image || image.dataset.parallaxBound === 'true') continue;
    image.dataset.parallaxBound = 'true';

    // La imagen es más alta que el marco para que quede recorrido a ambos lados.
    gsap.set(image, { height: `${100 + TRAVEL * 2}%`, yPercent: -TRAVEL });

    const tween = gsap.to(image, {
      yPercent: TRAVEL,
      ease: 'none',
      scrollTrigger: {
        trigger: frame,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true
      }
    });

    triggers.push(tween.scrollTrigger);
  }
}

/** Limpia los disparadores de un ámbito que se va a reconstruir. */
export function clearParallax() {
  for (const trigger of triggers) trigger.kill();
  triggers = [];
}
