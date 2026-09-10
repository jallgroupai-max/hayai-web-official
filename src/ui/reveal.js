/**
 * Aparición de los bloques del documento, ejecutada POR el scroll.
 *
 * No es un disparo al entrar en pantalla: la animación está enganchada a la
 * posición de la página con `scrub`, así que avanza y retrocede con el gesto
 * del usuario, igual que el recorrido de la galería. El sitio entero responde
 * al mismo mando.
 *
 * Los titulares grandes se descubren tras una máscara. Ojo con dónde va el
 * recorte: si el `clip-path` estuviera en el mismo elemento que dispara, el
 * bloque nunca se consideraría visible. Aquí se anima el hijo `.mask-line`.
 */
import { $$ } from '../dom.js';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../motion.js';

/** @type {ScrollTrigger[]} */
let triggers = [];

/** @param {ParentNode} root Ámbito a recorrer. */
export function initReveal(root = document) {
  const items = $$('[data-reveal]', root);
  if (!items.length) return;

  if (prefersReducedMotion()) {
    items.forEach((node) => node.classList.add('is-in'));
    return;
  }

  for (const node of items) {
    if (node.dataset.revealBound === 'true') continue;
    node.dataset.revealBound = 'true';

    const delay = parseFloat(node.style.getPropertyValue('--reveal-delay')) || 0;
    // El retardo declarado en CSS se convierte en un desfase del tramo de
    // scroll: con scrub no hay tiempo, hay recorrido.
    const offset = Math.min(delay / 1000, 0.25) * 10;

    const mask = node.getAttribute('data-reveal') === 'mask' ? node.querySelector('.mask-line') : null;
    const target = mask || node;

    const from = mask
      ? { clipPath: 'inset(0% 0% 100% 0%)', yPercent: 8 }
      : { autoAlpha: 0, y: 26 };
    const to = mask
      ? { clipPath: 'inset(0% 0% -14% 0%)', yPercent: 0 }
      : { autoAlpha: 1, y: 0 };

    const tween = gsap.fromTo(target, from, {
      ...to,
      ease: 'none',
      scrollTrigger: {
        trigger: node,
        start: () => `top ${92 - offset}%`,
        end: () => `top ${58 - offset}%`,
        scrub: true,
        invalidateOnRefresh: true,
        // La clase la siguen usando los estilos y el modo de movimiento reducido.
        onEnter: () => node.classList.add('is-in'),
        onLeaveBack: () => node.classList.add('is-in')
      }
    });

    if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
  }
}

/** Limpia los disparadores de un ámbito que se va a reconstruir. */
export function clearReveal(root) {
  if (!root) {
    triggers.forEach((t) => t.kill());
    triggers = [];
    return;
  }
  triggers = triggers.filter((t) => {
    if (root.contains(t.trigger)) {
      t.kill();
      return false;
    }
    return true;
  });
}
