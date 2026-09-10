/**
 * Normalización de entrada de la galería.
 *
 * Un único controlador traduce rueda, trackpad, arrastre y teclado a una misma
 * posición lógica continua, con inercia moderada y ajuste al proyecto más
 * cercano cuando la entrada termina. En el recorrido normal este controlador
 * está suspendido: ahí manda el progreso del documento.
 */
import { clamp, damp } from '../dom.js';

const WHEEL_COOLDOWN = 190;   // ms entre pasos de una rueda de ratón
const SNAP_IDLE = 130;        // ms de calma antes de ajustar al más cercano
const TAP_SLOP = 9;           // px que separan un clic de un arrastre
const TAP_TIME = 420;         // ms máximos de un clic

export class GalleryController {
  /**
   * @param {HTMLElement} element Superficie que captura los gestos.
   * @param {{
   *   onTap?: (x:number, y:number) => void,
   *   onPointer?: (nx:number, ny:number) => void,
   *   axisLock?: boolean
   * }} [hooks]
   */
  constructor(element, hooks = {}) {
    this.el = element;
    this.hooks = hooks;
    this.enabled = false;
    // driving=false: el controlador sigue leyendo puntero y clics, pero no
    // mueve la galeria. Es el estado del recorrido normal, donde manda el scroll.
    this.driving = true;
    this.calm = false;
    this.loop = false;
    this.length = 0;

    this.position = 0;
    this.target = 0;
    this.lastInput = 0;
    this.lastWheel = 0;

    this.drag = null;

    this._onWheel = this.onWheel.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onPointerHover = this.onPointerHover.bind(this);
    this._onLeave = this.onLeave.bind(this);
  }

  setLength(n) {
    this.length = n;
    if (!this.loop) {
      this.target = clamp(this.target, 0, Math.max(0, n - 1));
      this.position = clamp(this.position, 0, Math.max(0, n - 1));
    }
  }

  setLoop(loop) {
    this.loop = loop;
  }

  setDriving(driving) {
    this.driving = driving;
    if (!driving) this.drag = null;
  }

  /** Movimiento reducido: sin inercia ni ajuste progresivo, salto directo. */
  setCalm(calm) {
    this.calm = calm;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.el.addEventListener('wheel', this._onWheel, { passive: false });
    this.el.addEventListener('pointerdown', this._onPointerDown);
    this.el.addEventListener('pointermove', this._onPointerHover);
    this.el.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.drag = null;
    this.el.removeEventListener('wheel', this._onWheel);
    this.el.removeEventListener('pointerdown', this._onPointerDown);
    this.el.removeEventListener('pointermove', this._onPointerHover);
    this.el.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  }

  /** Coloca el objetivo sin pasar por la inercia (filtros, enlaces directos). */
  jumpTo(index, { immediate = false } = {}) {
    this.target = index;
    if (immediate) this.position = index;
  }

  /** Avanza al vecino por el camino más corto cuando el recorrido es circular. */
  step(dir) {
    this.moveTarget(Math.round(this.target) + dir);
    this.lastInput = performance.now();
  }

  moveTarget(next) {
    if (this.loop) {
      this.target = next;
    } else {
      this.target = clamp(next, 0, Math.max(0, this.length - 1));
    }
  }

  /* ── Rueda y trackpad ────────────────────────────────────────────────── */

  onWheel(event) {
    if (!this.enabled || !this.driving || this.length < 2) return;
    event.preventDefault();
    this.lastInput = performance.now();

    // Eje dominante: un trackpad horizontal también mueve la galería.
    const dx = event.deltaX;
    const dy = event.deltaY;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;

    // Una rueda de ratón manda saltos grandes y discretos; un trackpad, valores
    // pequeños y continuos. Cada uno merece una respuesta distinta.
    const lines = event.deltaMode === 1;
    const discrete = lines || (Math.abs(delta) >= 45 && Number.isInteger(delta));

    if (discrete) {
      const now = performance.now();
      if (now - this.lastWheel < WHEEL_COOLDOWN) return;
      this.lastWheel = now;
      this.step(Math.sign(delta));
      return;
    }

    const step = lines ? delta / 3 : delta / 180;
    this.moveTarget(this.target + step);
  }

  /* ── Arrastre ────────────────────────────────────────────────────────── */

  onPointerDown(event) {
    if (!this.enabled || event.button != null && event.button !== 0) return;
    this.drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      startTarget: this.target,
      startTime: performance.now(),
      moved: false,
      captured: false,
      velocity: 0
    };
  }

  onPointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!this.driving) return;

    if (!drag.captured) {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
      // Con bloqueo de eje, un gesto vertical se devuelve a la página.
      if (this.hooks.axisLock && Math.abs(dy) > Math.abs(dx)) {
        this.drag = null;
        return;
      }
      drag.captured = true;
      drag.moved = true;
      try {
        this.el.setPointerCapture(event.pointerId);
      } catch {
        /* algunos navegadores rechazan la captura en punteros sintéticos */
      }
    }

    event.preventDefault();
    const stepPx = Math.max(120, this.el.clientWidth * 0.32);
    const frameDx = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    drag.velocity = -frameDx / stepPx;

    this.moveTarget(drag.startTarget - dx / stepPx);
    this.lastInput = performance.now();
  }

  onPointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.drag = null;

    const elapsed = performance.now() - drag.startTime;
    const dx = Math.abs(event.clientX - drag.startX);
    const dy = Math.abs(event.clientY - drag.startY);

    if (!drag.moved && dx < TAP_SLOP && dy < TAP_SLOP && elapsed < TAP_TIME) {
      if (this.hooks.onTap) this.hooks.onTap(event.clientX, event.clientY);
      return;
    }

    // Inercia moderada: un lanzamiento salta como mucho dos posiciones.
    const fling = clamp(drag.velocity * 9, -2, 2);
    this.moveTarget(this.target + fling);
    this.lastInput = performance.now();
  }

  /* ── Puntero (reacción de la escena) ─────────────────────────────────── */

  onPointerHover(event) {
    if (!this.hooks.onPointer) return;
    const rect = this.el.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    this.hooks.onPointer(clamp(nx, -1, 1), clamp(ny, -1, 1));
  }

  onLeave() {
    if (this.hooks.onPointer) this.hooks.onPointer(0, 0);
  }

  /* ── Fotograma ───────────────────────────────────────────────────────── */

  update(dt) {
    if (!this.length) return this.position;

    const idle = performance.now() - this.lastInput > SNAP_IDLE;
    if (idle && !this.drag) {
      // Ajuste al proyecto más cercano en cuanto la entrada se calma.
      const snapped = Math.round(this.target);
      if (snapped !== this.target) {
        this.target = damp(this.target, snapped, 0.28, dt);
        if (Math.abs(this.target - snapped) < 0.002) this.target = snapped;
      }
    }

    if (this.calm) {
      this.position = this.target;
      return this.position;
    }

    this.position = damp(this.position, this.target, this.drag ? 0.32 : 0.16, dt);
    if (Math.abs(this.position - this.target) < 0.0004) this.position = this.target;
    return this.position;
  }

  /** Índice normalizado a la lista. */
  index() {
    if (!this.length) return 0;
    const rounded = Math.round(this.position);
    return this.loop ? ((rounded % this.length) + this.length) % this.length : clamp(rounded, 0, this.length - 1);
  }
}
