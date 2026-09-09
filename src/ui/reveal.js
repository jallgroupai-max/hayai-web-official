/** Revelado de bloques al entrar en pantalla. El contenido ya está en el DOM:
 *  esto sólo anima opacidad y desplazamiento, nunca condiciona la lectura. */
import { $$ } from '../dom.js';
import { prefersReducedMotion } from '../motion.js';

export function initReveal(root = document) {
  const items = $$('[data-reveal]', root);
  if (!items.length) return;

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((node) => node.classList.add('is-in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
  );

  items.forEach((node) => observer.observe(node));
  return observer;
}
