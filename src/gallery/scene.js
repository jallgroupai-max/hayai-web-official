/**
 * Galería WebGL: la portada del proyecto activo, en 3D.
 *
 * Se ve UN proyecto a la vez, centrado y grande. El cambio es un fundido
 * cruzado en el sitio, no un desplazamiento: por eso bastan tres mallas (la
 * activa y sus dos vecinas) y una textura por proyecto. El índice lógico avanza
 * y da la vuelta sin que crezca nada: cada malla se reasigna a la que le toca. El renderer y el lienzo son únicos y viajan entre el escenario y el
 * modo Explorar, así que abrir la galería inmersiva no duplica memoria de GPU.
 */
import {
  WebGLRenderer,
  WebGLRenderTarget,
  Scene,
  PerspectiveCamera,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  CanvasTexture,
  Color,
  Vector2,
  MathUtils,
  SRGBColorSpace,
  LinearFilter,
  LinearMipmapLinearFilter,
  ClampToEdgeWrapping,
  DoubleSide
} from 'three';

import { PLANE_ASPECT, SHEET_VERTEX, SHEET_FRAGMENT, PICK_FRAGMENT } from './shaders.js';
import { clamp, damp } from '../dom.js';

const MAX_SLOTS = 9;

/* La galeria muestra UN proyecto a la vez, centrado. El cambio no es un
   desplazamiento lateral sino un fundido cruzado: la pieza que sale se apaga
   mientras la que entra aparece, las dos en el mismo sitio. Por eso aqui no hay
   separacion horizontal; solo un pelin de profundidad y de escala para que el
   cruce tenga cuerpo. */
const DEPTH = 0.06;
const SHEAR = 0;           // sin cizalla: la portada va recta y alineada
const CORNER_RADIUS = 0;   // la pagina no redondea nada

/** Basta con la activa y sus dos vecinas para resolver el cruce. */
function slotCountFor(total) {
  return total <= 1 ? 1 : 3;
}

const mod = (n, m) => ((n % m) + m) % m;

/** Colocacion de una lamina segun su distancia con signo al centro. */
function layoutFor(offset) {
  const abs = Math.abs(offset);
  return {
    x: 0,
    y: 0,
    z: -abs * DEPTH,
    rotY: 0,
    rotZ: 0,
    // La entrante llega un pelin mas pequena y crece hasta su sitio.
    scale: 1 - Math.min(abs, 1) * 0.05,
    // Fundido: a media transicion las dos estan al 50 %.
    opacity: 1 - MathUtils.smoothstep(Math.min(abs, 1.2), 0, 1)
  };
}

export class Gallery {
  /** @param {{ onContextLost?: () => void, calm?: boolean }} [hooks] */
  constructor(hooks = {}) {
    this.hooks = hooks;
    /* Movimiento reducido: se apaga lo que va enganchado a la entrada del
       usuario —flexión por velocidad y reacción al puntero—, que es lo que
       puede sentirse inestable. El cabeceo de reposo se conserva por decisión
       expresa: es lento, de poca amplitud y no viaja con el gesto. */
    this.calm = !!hooks.calm;

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    // Fondo transparente: el papel de la pagina se ve a traves del lienzo y el
    // logotipo gigante queda detras de las laminas.
    this.renderer.setClearColor(new Color('#e9e6e0'), 0);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-hidden', 'true');

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    this.group = new Group();
    this.scene.add(this.group);

    this.geometry = new PlaneGeometry(1, 1 / PLANE_ASPECT, 40, 32);

    /** @type {Map<string, Texture>} */
    this.textures = new Map();
    /** @type {import('../data.js').Project[]} */
    this.list = [];

    this.slots = [];
    this.activeSlots = 0;

    this.position = 0;
    this.time = 0;
    this.velocity = 0;
    this.smoothVelocity = 0;
    this.loop = false;
    this.hoverIndex = null;

    this.pointer = new Vector2(0, 0);
    this.pointerTarget = new Vector2(0, 0);

    this.planeWidth = 1;
    this.fitRatio = 0.62;   // alto de la lamina respecto al alto visible
    this.widthRatio = 0.62; // tope de ancho respecto al ancho visible
    this.offsetRatio = 0;
    this.offsetYRatio = 0;
    this.size = { w: 1, h: 1 };
    this.dpr = 1;
    this.needsRender = true;
    this.lost = false;

    this.pickTarget = new WebGLRenderTarget(1, 1);
    this.pickBuffer = new Uint8Array(4);

    this.buildSlots();

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      if (this.hooks.onContextLost) this.hooks.onContextLost();
    });
  }

  /* ── Mallas ───────────────────────────────────────────────────────────── */

  buildSlots() {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const uniforms = {
        uMap: { value: null },
        uImageAspect: { value: PLANE_ASPECT },
        uPlaneAspect: { value: PLANE_ASPECT },
        uBend: { value: 0 },
        uShear: { value: SHEAR },
        uPaper: { value: new Color('#e9e6e0') },
        uOffset: { value: 0 },
        uFocus: { value: 0 },
        uHover: { value: 0 },
        uOpacity: { value: 1 },
        uRadius: { value: CORNER_RADIUS },
        uPickColor: { value: new Color(0, 0, 0) }
      };

      const material = new ShaderMaterial({
        uniforms,
        vertexShader: SHEET_VERTEX,
        fragmentShader: SHEET_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide
      });

      // Comparte el mismo objeto de uniforms: la silueta que se puede pulsar
      // arrastra exactamente la misma deformación que la que se ve.
      const pickMaterial = new ShaderMaterial({
        uniforms,
        vertexShader: SHEET_VERTEX,
        fragmentShader: PICK_FRAGMENT,
        transparent: false,
        depthWrite: true,
        side: DoubleSide
      });

      const mesh = new Mesh(this.geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData = { uniforms, material, pickMaterial, dataIndex: -1, projectId: null, hover: 0, focus: 0 };
      // Identificador de selección: el canal rojo guarda el índice de malla + 1.
      uniforms.uPickColor.value.setRGB((i + 1) / 255, 0, 0);

      this.group.add(mesh);
      this.slots.push(mesh);
    }

  }

  /* ── Datos ────────────────────────────────────────────────────────────── */

  /** @param {import('../data.js').Project[]} list */
  setProjects(list) {
    this.list = list.slice();
    this.activeSlots = this.list.length ? slotCountFor(this.list.length) : 0;
    this.slots.forEach((mesh, i) => {
      mesh.visible = i < this.activeSlots;
      mesh.userData.dataIndex = -1;
    });
    this.position = clamp(this.position, 0, Math.max(0, this.list.length - 1));
    for (const project of this.list) this.loadTexture(project);
    this.needsRender = true;
  }

  loadTexture(project) {
    if (this.textures.has(project.id)) return this.textures.get(project.id);

    // Marcador de posición del color del proyecto mientras llega la portada:
    // evita el hueco negro y ya comunica la identidad del caso.
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = project.accent || '#241e17';
    ctx.fillRect(0, 0, 24, 32);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.userData = { aspect: PLANE_ASPECT, ready: false };
    this.textures.set(project.id, texture);

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const loaded = new Texture(img);
      loaded.colorSpace = SRGBColorSpace;
      loaded.minFilter = LinearMipmapLinearFilter;
      loaded.magFilter = LinearFilter;
      loaded.wrapS = ClampToEdgeWrapping;
      loaded.wrapT = ClampToEdgeWrapping;
      loaded.generateMipmaps = true;
      loaded.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      loaded.userData = { aspect: img.naturalWidth / img.naturalHeight, ready: true };
      loaded.needsUpdate = true;

      const previous = this.textures.get(project.id);
      this.textures.set(project.id, loaded);
      if (previous) previous.dispose();

      // Re-vincula la textura en las mallas que ya mostraban este proyecto.
      for (const mesh of this.slots) {
        if (mesh.userData.projectId === project.id) {
          mesh.userData.uniforms.uMap.value = loaded;
          mesh.userData.uniforms.uImageAspect.value = loaded.userData.aspect;
        }
      }
      this.needsRender = true;
    };
    img.onerror = () => {
      /* Se queda el marcador de color: la lámina nunca aparece vacía. */
    };
    img.src = project.cover;

    return texture;
  }

  /* ── Medidas ──────────────────────────────────────────────────────────── */

  /** @param {HTMLElement} host */
  mount(host) {
    if (this.canvas.parentElement !== host) host.append(this.canvas);
    this.host = host;
    this.resize();
  }

  /**
   * @param {{ fitRatio?: number, widthRatio?: number, offsetRatio?: number,
   *           offsetYRatio?: number }} opts
   */
  configure({ fitRatio, widthRatio, offsetRatio, offsetYRatio } = {}) {
    if (fitRatio != null) this.fitRatio = fitRatio;
    if (widthRatio != null) this.widthRatio = widthRatio;
    if (offsetRatio != null) this.offsetRatio = offsetRatio;
    if (offsetYRatio != null) this.offsetYRatio = offsetYRatio;
    this.resize();
  }

  resize() {
    const host = this.host;
    if (!host) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);

    const maxDpr = window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    this.size = { w, h };
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Altura visible del plano z = 0; de ahí sale el tamaño de las láminas.
    const visibleH = 2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2) * this.camera.position.z;
    const visibleW = visibleH * this.camera.aspect;
    const planeH = visibleH * this.fitRatio;
    this.planeWidth = planeH * PLANE_ASPECT;

    // Con láminas anchas y viewport estrecho, limitamos por ancho.
    const maxWidth = visibleW * this.widthRatio;
    if (this.planeWidth > maxWidth) this.planeWidth = maxWidth;

    this.group.position.x = visibleW * this.offsetRatio;
    this.group.position.y = visibleH * this.offsetYRatio;
    this.needsRender = true;
  }

  /* ── Estado de recorrido ──────────────────────────────────────────────── */

  setLoop(loop) {
    this.loop = loop;
  }

  /** Escribe la posición lógica (la manda el scroll o el controlador). */
  setPosition(pos) {
    if (this.loop && this.list.length) {
      this.position = pos;
    } else {
      this.position = clamp(pos, 0, Math.max(0, this.list.length - 1));
    }
    this.needsRender = true;
  }

  setPointer(nx, ny) {
    this.pointerTarget.set(nx, ny);
  }

  setHover(index) {
    if (this.hoverIndex === index) return;
    this.hoverIndex = index;
    this.needsRender = true;
  }

  /** Índice lógico redondeado, normalizado a la lista. */
  activeIndex() {
    if (!this.list.length) return 0;
    const rounded = Math.round(this.position);
    return this.loop ? mod(rounded, this.list.length) : clamp(rounded, 0, this.list.length - 1);
  }

  /* ── Fotograma ────────────────────────────────────────────────────────── */

  update(dt) {
    if (this.lost || !this.host || !this.list.length) return;

    this.time += dt;
    const previous = this.lastPosition ?? this.position;
    const raw = dt > 0 ? (this.position - previous) / dt : 0;
    this.lastPosition = this.position;
    // La velocidad se suaviza y se disipa sola al soltar la entrada.
    this.smoothVelocity = damp(this.smoothVelocity, raw, 0.18, dt);
    this.velocity = this.smoothVelocity;

    if (this.calm) {
      this.group.rotation.y = 0;
      this.group.rotation.x = 0;
    } else {
      this.pointer.x = damp(this.pointer.x, this.pointerTarget.x, 0.09, dt);
      this.pointer.y = damp(this.pointer.y, this.pointerTarget.y, 0.09, dt);
      this.group.rotation.y = this.pointer.x * 0.055;
      this.group.rotation.x = -this.pointer.y * 0.03;
    }

    const bend = this.calm ? 0 : clamp(this.velocity * 0.16, -1, 1);
    const half = Math.floor(this.activeSlots / 2);
    const base = Math.round(this.position);
    const total = this.list.length;
    const hovered = this.hoverIndex;

    for (let s = 0; s < this.slots.length; s++) {
      const mesh = this.slots[s];
      if (s >= this.activeSlots) {
        mesh.visible = false;
        continue;
      }

      const logical = base + (s - half);
      const dataIndex = this.loop ? mod(logical, total) : logical;

      if (dataIndex < 0 || dataIndex >= total) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      const project = this.list[dataIndex];
      const data = mesh.userData;

      if (data.projectId !== project.id) {
        const texture = this.textures.get(project.id) || this.loadTexture(project);
        data.uniforms.uMap.value = texture;
        data.uniforms.uImageAspect.value = texture.userData?.aspect || PLANE_ASPECT;
        data.projectId = project.id;
        data.dataIndex = dataIndex;
      }
      data.dataIndex = dataIndex;

      const offset = logical - this.position;
      const l = layoutFor(offset);
      const width = this.planeWidth;

      // Flotacion: cada lamina cabecea a su propio ritmo, mas la activa.
      const bob = Math.sin(this.time * 0.7 + logical * 1.7) * 0.02;
      mesh.position.set(l.x * width, (l.y + bob) * width, l.z * width);
      mesh.rotation.y = l.rotY;
      mesh.rotation.z = l.rotZ + Math.sin(this.time * 0.45 + logical) * 0.007;
      mesh.scale.setScalar(width * l.scale);

      // De atrás hacia delante: las transparencias se apilan en orden.
      mesh.renderOrder = 100 - Math.round(Math.abs(offset) * 10);

      const focusTarget = 1 - MathUtils.smoothstep(Math.abs(offset), 0.05, 0.85);
      const hoverTarget = hovered === dataIndex && Math.abs(offset) > 0.1 ? 1 : 0;
      data.focus = damp(data.focus, focusTarget, 0.22, dt);
      data.hover = damp(data.hover, hoverTarget, 0.2, dt);

      data.uniforms.uOffset.value = offset;
      data.uniforms.uFocus.value = data.focus;
      data.uniforms.uHover.value = data.hover;
      data.uniforms.uOpacity.value = l.opacity;
      // La flexión se atenúa hacia el fondo: las piezas lejanas no se retuercen.
      data.uniforms.uBend.value = bend * (1 - Math.min(Math.abs(offset), 3) * 0.18);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ── Selección por GPU ────────────────────────────────────────────────── */

  /**
   * Devuelve el índice de proyecto bajo el puntero, o null.
   * Se resuelve pintando un píxel con el mismo shader de vértice, de modo que
   * la zona sensible coincide con la lámina curvada que ve el usuario.
   * @param {number} clientX @param {number} clientY
   */
  pickAt(clientX, clientY) {
    if (this.lost || !this.host || !this.list.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    const dpr = this.dpr;
    const fullW = Math.max(1, Math.round(rect.width * dpr));
    const fullH = Math.max(1, Math.round(rect.height * dpr));

    for (const mesh of this.slots) mesh.material = mesh.userData.pickMaterial;

    // Encuadra el frustum en un único píxel: sólo se dibuja lo que hay bajo el cursor.
    this.camera.setViewOffset(fullW, fullH, Math.round(x * dpr), Math.round(y * dpr), 1, 1);
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickBuffer);
    this.renderer.setRenderTarget(null);
    this.camera.clearViewOffset();
    this.renderer.setClearColor(0xe9e6e0, 0);

    for (const mesh of this.slots) mesh.material = mesh.userData.material;
    this.needsRender = true;

    const slot = this.pickBuffer[0] - 1;
    if (slot < 0 || slot >= this.activeSlots) return null;
    const mesh = this.slots[slot];
    if (!mesh.visible) return null;
    return mesh.userData.dataIndex;
  }

  dispose() {
    this.geometry.dispose();
    for (const mesh of this.slots) {
      mesh.userData.material.dispose();
      mesh.userData.pickMaterial.dispose();
    }
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.pickTarget.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
