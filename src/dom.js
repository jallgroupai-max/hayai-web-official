/** Utilidades de DOM. Sin dependencias: el sitio no usa framework. */

/** @type {(sel: string, root?: ParentNode) => any} */
export const $ = (sel, root = document) => root.querySelector(sel);

/** @type {(sel: string, root?: ParentNode) => any[]} */
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Crea un elemento con atributos e hijos en una sola expresión.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {(Node|string|null|false|undefined)[]} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Índice con dos dígitos: 1 -> "01". */
export const pad2 = (n) => String(n).padStart(2, '0');

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Interpolación independiente del framerate: `factor` es la fracción de camino
 * recorrida en 1/60 s. Sin esto el movimiento cambia entre 60 y 120 Hz.
 */
export function damp(current, target, factor, dt) {
  const t = 1 - Math.pow(1 - factor, dt * 60);
  return current + (target - current) * t;
}

/** Enfoca el primer elemento enfocable dentro de `root`. */
export function focusFirst(root) {
  const target = root.querySelector(
    'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (target) target.focus({ preventScroll: true });
}

/**
 * Mantiene el foco dentro de un diálogo mientras está abierto.
 * Devuelve la función de limpieza.
 */
export function trapFocus(root) {
  const onKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const items = $$(
      'button:not([disabled]):not([hidden]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      root
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKeydown);
  return () => root.removeEventListener('keydown', onKeydown);
}

/** Icono de flecha reutilizable. */
export const arrow = (glyph = '↗') => el('span', { class: 'arrow', 'aria-hidden': 'true', text: glyph });
