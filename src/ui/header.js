/**
 * Cabecera: contraste según la superficie que tiene debajo, menú móvil y
 * navegación por anclas con el mismo suavizado que el resto del sitio.
 */
import { $, $$, trapFocus, focusFirst } from '../dom.js';
import { ScrollTrigger, scrollTo, lockScroll, prefersReducedMotion } from '../motion.js';

/** Secciones oscuras: sobre ellas la cabecera va en claro. */
const DARK_SECTIONS = ['#trabajo', '#contacto', '.site-footer'];

export function initHeader() {
  const header = $('.site-header');
  const toggle = $('.menu-toggle');
  const menu = $('#menu-movil');
  if (!header) return;

  /* ── Contraste ─────────────────────────────────────────────────────── */
  let darkCount = 0;
  const apply = () => header.setAttribute('data-theme', darkCount > 0 ? 'dark' : 'light');
  apply();

  const headerH = () => header.offsetHeight || 68;

  for (const selector of DARK_SECTIONS) {
    const section = $(selector);
    if (!section) continue;
    ScrollTrigger.create({
      trigger: section,
      start: () => `top ${headerH() - 1}px`,
      end: () => `bottom ${headerH() - 1}px`,
      onToggle: (self) => {
        darkCount += self.isActive ? 1 : -1;
        darkCount = Math.max(0, darkCount);
        apply();
      }
    });
  }

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
      offset: -headerH(),
      duration: prefersReducedMotion() ? 0 : 1.1
    });
    // El foco acompaña al salto para no perder el hilo con teclado.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  return { setMenu };
}
