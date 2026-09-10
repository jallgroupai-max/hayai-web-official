/**
 * GLSL de las láminas de la galería.
 *
 * La geometría es siempre un plano de 1 × 4/3 unidades locales (el tamaño real
 * lo pone la escala de la malla), así que dentro del shader "1.0" equivale al
 * ancho de la lámina y todas las deformaciones se expresan como fracción suya.
 *
 * Dos rasgos definen la forma:
 *  · Flexión ligada a la velocidad. El centro se queda quieto y los bordes
 *    viajan, así el proyecto sigue siendo reconocible por rápido que se avance.
 *
 * El shader de selección comparte vértice con el de pintado: el área que se
 * puede pulsar es exactamente la que ve el usuario, cizalla y curvatura
 * incluidas.
 */

export const PLANE_ASPECT = 3 / 4; // ancho / alto

const COMMON_VERT = /* glsl */ `
  uniform float uBend;    // curvatura ligada a la velocidad, -1..1
  uniform float uShear;   // cizalla horizontal en función de la altura
  uniform float uOffset;  // distancia con signo al centro del abanico
  uniform float uFocus;   // 1 en la lámina activa, 0 en las demás
  uniform float uHover;

  varying vec2 vUv;
  varying float vShade;

  void main() {
    vUv = uv;
    vec3 p = position;

    // -1 en el borde izquierdo, +1 en el derecho; lo mismo en vertical.
    float nx = p.x * 2.0;
    float ny = p.y * 2.0 * ${(PLANE_ASPECT).toFixed(6)};
    float parab = 1.0 - nx * nx;

    // Cizalla: el borde de arriba se adelanta al de abajo.
    p.x += ny * uShear;

    // Flexión principal.
    p.z += parab * uBend * 0.26;

    // Curvatura de reposo: las piezas del fondo se enroscan un poco más.
    float rest = clamp(abs(uOffset), 0.0, 2.4) * 0.04;
    p.z -= nx * nx * rest;

    // Al curvarse la lámina se acorta y se alabea: sensación de papel.
    p.x -= nx * abs(uBend) * 0.04;
    p.y += nx * uBend * 0.04;

    // La activa se adelanta ligeramente.
    p.z += uFocus * 0.05 + uHover * 0.03;

    vShade = parab;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SDF = /* glsl */ `
  // Distancia con signo a un rectángulo (radio 0: la página no redondea nada),
  // en un espacio con la proporción real de la lámina.
  float roundedBox(vec2 uv, float aspect, float radius) {
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 b = vec2(aspect, 1.0) * 0.5 - radius;
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
  }
`;

export const SHEET_VERTEX = COMMON_VERT;

export const SHEET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3 uPaper;       // color del papel: hacia ahí se retiran las piezas
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uFocus;
  uniform float uHover;
  uniform float uOpacity;
  uniform float uRadius;

  varying vec2 vUv;
  varying float vShade;

  ${SDF}

  // Equivalente a object-fit: cover. zoom < 1 acerca la imagen.
  vec2 coverUv(vec2 uv, float imgAspect, float boxAspect, float zoom) {
    vec2 s = imgAspect > boxAspect
      ? vec2(boxAspect / imgAspect, 1.0)
      : vec2(1.0, imgAspect / boxAspect);
    return (uv - 0.5) * s * zoom + 0.5;
  }

  void main() {
    float sd = roundedBox(vUv, uPlaneAspect, uRadius);
    float mask = 1.0 - smoothstep(-0.003, 0.003, sd);
    if (mask <= 0.002) discard;

    float zoom = 1.0 - 0.045 * uFocus - 0.02 * uHover;
    vec2 uv = clamp(coverUv(vUv, uImageAspect, uPlaneAspect, zoom), 0.0015, 0.9985);
    vec3 col = texture2D(uMap, uv).rgb;

    // Sobre papel claro la profundidad no se hace apagando a negro: las piezas
    // que no mandan se retiran HACIA el papel, como si se alejaran en la página.
    float presence = clamp(uFocus + uHover * 0.3, 0.0, 1.0);
    col = mix(uPaper, col, mix(0.46, 1.0, presence));

    // Sombreado de la flexión: el borde que se va al fondo pierde luz.
    col *= 0.9 + 0.1 * vShade;

    // Filo interior de un píxel: separa lámina de lámina cuando se solapan.
    float edge = smoothstep(-0.006, -0.0012, sd) * mask;
    col = mix(col, col * 0.72, edge * (0.35 + 0.35 * uFocus));

    gl_FragColor = vec4(col, mask * uOpacity);
  }
`;

export const PICK_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uPickColor;
  uniform float uPlaneAspect;
  uniform float uRadius;

  varying vec2 vUv;
  varying float vShade;

  ${SDF}

  void main() {
    float sd = roundedBox(vUv, uPlaneAspect, uRadius);
    if (sd > 0.0) discard;
    gl_FragColor = vec4(uPickColor, 1.0);
  }
`;
