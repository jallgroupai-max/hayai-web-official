/**
 * Tira superior: menú móvil y navegación por anclas con el mismo suavizado que
 * el resto del sitio.
 *
 * No hay conmutación de contraste porque no hace falta: la página entera va
 * sobre el mismo papel, de la cabecera al pie.
 */
import { $, $$, trapFocus, focusFirst } from '../dom.js';
import { scrollTo, lockScroll, prefersReducedMotion } from '../motion.js';

export function initHeader() {
  const topbar = $('[data-topbar]');
  const toggle = $('.menu-toggle');
  const menu = $('#menu-movil');
  if (!topbar) return;

  const barHeight = () => topbar.offsetHeight || 56;

  /* ── Menú móvil ────────────────────────────────────────────────────── */
  let releaseTrap = null;

  const setMenu = (open) => {
    if (!menu || !toggle) return;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    lockScroll(open);
    if (open) {
      releaseTrap = trapFocus(menu);
      focusFirst(menu);
    } else {
      if (releaseTrap) releaseTrap();
      releaseTrap = null;
      toggle.focus({ preventScroll: true });
    }
  };

  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(menu.hidden));
    $$('[data-menu-link]', menu).forEach((link) => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) setMenu(false);
    });
  }

  /* ── Anclas ────────────────────────────────────────────────────────── */
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute('data-no-smooth')) return;
    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;
    const target = document.querySelector(hash === '#top' ? 'body' : hash);
    if (!target) return;

    event.preventDefault();
    if (menu && !menu.hidden) setMenu(false);
    history.pushState({ hayai: true }, '', hash === '#top' ? location.pathname + location.search : hash);
    scrollTo(target, {
      offset: -barHeight(),
      duration: prefersReducedMotion() ? 0 : 1.1
    });
    // El foco acompaña al salto para no perder el hilo con teclado.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  return { setMenu };
}
