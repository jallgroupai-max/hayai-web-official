# hayai-web-official

Portafolio de HAYAI. Sitio estático con una galería de proyectos en WebGL
(Three.js + shaders propios), recorrido por scroll con GSAP/ScrollTrigger y
alternativa HTML completa cuando WebGL no está disponible.

---

## Ejecutar en local

No hay paso de build. Cualquier servidor estático sirve, pero el del repositorio
reproduce el `try_files` de Caddy:

```bash
cd tools
npm install      # sólo la primera vez
node serve.mjs   # http://127.0.0.1:4173
```

Abrir el `index.html` con `file://` **no** funciona: los módulos ES y el import
map necesitan un origen HTTP.

## Desplegar

Igual que antes de esta versión y sin cambios de configuración: Railway detecta
el provider `staticfile` de Railpack por el archivo `Staticfile` y sirve la raíz
con el `Caddyfile.template` del repositorio. No hay `package.json` en la raíz a
propósito — el de `tools/` es sólo de autoría y su `node_modules` está ignorado.

---

## Configuración

Todo lo editable vive en [`config.js`](./config.js), que se carga antes que la
aplicación y no requiere tocar `/src`:

| Variable | Qué hace |
| --- | --- |
| `whatsapp` | Número internacional sin `+` ni espacios (ej. `"584121234567"`). El formulario compone el mensaje y abre `wa.me`. |
| `email` | Correo de contacto. Se usa si no hay `whatsapp`. |
| `leadEndpoint` | URL opcional que recibe el lead por `POST` JSON. Tiene prioridad sobre los anteriores: el formulario espera la respuesta HTTP real y sólo confirma con un 2xx. |

**Si los tres están vacíos el botón de envío queda deshabilitado con un aviso
explícito.** El formulario nunca dice «enviado» sin que el mensaje haya salido.

Cuerpo que recibe `leadEndpoint`:

```json
{
  "source": "hayai.com.ve",
  "types": ["Sistema de Comandas"],
  "phone": "+58 412 000 0000",
  "email": "cliente@correo.com",
  "idea": "…",
  "sentAt": "2026-09-09T18:00:00.000Z"
}
```

---

## Añadir un proyecto

1. Deja la experiencia navegable en `projects/<archivo>.html`.
2. Genera su portada:

   ```bash
   cd tools
   node covers.mjs <id>        # captura vertical 1080×1440 -> covers/<id>.jpg
   ```

3. Añade el objeto a `PROJECTS` en [`src/data.js`](./src/data.js):

   ```js
   {
     id: 'mi-proyecto',           // también es el slug de la URL
     title: 'Mi Proyecto',
     category: 'pos',             // id de una CATEGORIES
     type: 'Sistema de Comandas',
     description: 'Una frase.',
     accent: '#1A1413',           // color mientras carga la portada
     cover: './covers/mi-proyecto.jpg',
     // Componentes que flotan alrededor de la lámina, recortados de la propia
     // portada: [x, y, ancho, alto] normalizados, con origen ARRIBA a la
     // izquierda. Entre 2 y 3, con proporciones entre 0,7 y 4.
     fragments: [[0.15, 0.48, 0.34, 0.19]],
     logo: './assets-min/logo-mi-proyecto.png',
     file: './projects/mi-proyecto.html'  // null => tarjeta "Próximamente"
   }
   ```

Eso es todo: galería 3D, rejilla HTML, filtros, contador, recorrido de scroll y
visor se construyen a partir de esos datos. Una categoría sin proyectos muestra
sola una invitación a conversar, sin cifras inventadas.

Para añadir una categoría, basta un objeto en `CATEGORIES` con `id`, `title`,
`short`, `description`, `accent` y `formTitle`.

---

## Estructura

```
index.html            Documento: cabecera, escenario, soluciones, equipo, contacto
config.js             Canal de contacto (editable sin tocar /src)
styles/
  base.css            Tokens, reset, tipografía, botones, utilidades
  site.css            Secciones, componentes y responsive
src/
  main.js             Arranque y cableado
  data.js             Categorías, proyectos, equipo  ← fuente única de contenido
  store.js            Estado compartido + enrutado por hash
  motion.js           Un único ticker (gsap.ticker) para Lenis, ScrollTrigger y la escena
  dom.js              Utilidades de DOM y de interpolación
  gallery/
    shaders.js        GLSL: flexión de las láminas y recorte tipo object-fit: cover
    scene.js          Escena Three.js, reciclado de mallas y selección por GPU
    controller.js     Rueda, trackpad, arrastre e inercia normalizados
  ui/
    header.js  stage.js  solutions.js  team.js  contact.js  viewer.js  explore.js
    reveal.js  parallax.js
vendor/               Bundles ESM de three, gsap y lenis (generados, no editar)
covers/               Portadas capturadas de cada caso
tools/                Autoría: vendorizado, portadas y comprobaciones en navegador
```

### Decisiones de diseño

- **Un solo tema.** La página entera va sobre piedra clara (`#E9E6E0`), de la
  cabecera al pie. Ninguna sección se invierte a oscuro a mitad de recorrido.
- **Un solo radio: 0.** Nada redondeado. Ni botones, ni láminas, ni campos.
- **La jerarquía la hacen la opacidad y el desenfoque**, no las cajas. Casi no
  hay bordes ni sombras en todo el sitio.
- **El acento va en dos pesos.** El ámbar de marca `#EF9D25` sólo mide 1,77:1
  contra el papel: sirve como relleno (con tinta encima llega a 8,4:1) pero
  nunca como texto ni como filete. Para eso está `--amber-ink` `#8F4A05`,
  5,35:1. Los escalones de tinta pensados para texto pasan AA; los dos últimos
  son sólo filetes.
- **Tipografía en dos registros.** Archivo para todo lo que se lee, IBM Plex
  Mono para las etiquetas diminutas ancladas a los bordes.

### Decisiones técnicas

- **Un solo ciclo de animación.** `gsap.ticker` alimenta a Lenis, a ScrollTrigger
  y a la escena. No hay ningún `requestAnimationFrame` adicional, así que la
  escena no se dibuja dos veces por fotograma. Con la pestaña oculta rAF no
  corre y el trabajo se detiene solo.
- **Dos modos, nunca simultáneos.** En el recorrido normal manda el progreso del
  documento y el controlador de gestos queda en modo no-conductor; en Explorar
  manda el controlador y el recorrido se suspende. Un gesto no lo procesan dos
  controladores a la vez.
- **Recursos acotados.** Una geometría, un programa de shader y una textura por
  proyecto. El índice lógico da la vuelta reasignando las mismas mallas.
- **Selección por GPU.** El shader de selección comparte vértice con el de
  pintado, así que la zona que se puede pulsar arrastra la misma curvatura que
  se ve, también cerca de los bordes.
- **El recorrido se detiene en cada proyecto.** El scroll no mapea linealmente
  a la posición de la galería: cada tramo pasa un 45 % detenido y el resto
  cambiando. Sin eso el recorrido se queda parado entre dos proyectos, con los
  componentes flotantes a medio desvanecer para siempre.
- **Los componentes flotantes salen de la propia portada.** Son recortes UV de
  la misma textura, no imágenes aparte: cero descargas nuevas y la cuenta de
  texturas no se mueve. Sus coordenadas se declaran desde arriba a la izquierda
  y la escena les da la vuelta en Y, porque el eje v de una textura se mide
  desde abajo.
- **El abanico es diagonal y cizallado.** Cada lámina es un paralelogramo
  (cizalla constante en el vertex shader) y el recorrido sube hacia la derecha
  con solape fuerte. Es lo que separa un abanico de un carrusel de tarjetas.
- **La escena siempre gira en círculo, aunque el recorrido sea finito.** El
  scroll recorre 0..n-1; sólo el dibujado envuelve, para que el abanico se vea
  lleno también en el primer y el último proyecto.
- **El recorte de las máscaras de texto va en un hijo, nunca en el elemento
  observado.** IntersectionObserver tiene en cuenta el `clip-path` del propio
  objetivo: un titular recortado al 100 % nunca se considera visible y nunca se
  revelaría. De ahí el `<span class="mask-line">`.
- **`vendor/` se regenera**, no se edita a mano: `cd tools && node vendor.mjs`.
  Las versiones exactas quedan en `vendor/VENDOR.json`.

---

## Comprobaciones

```bash
cd tools
node check.mjs            # comprobaciones en Chromium
node check.mjs --shots    # además guarda capturas en screenshots/check/
node crops.mjs            # hoja de contactos de los recortes de fragments
```

`crops.mjs` dibuja cada portada con sus rectángulos encima y los recortes
sueltos al lado. Es la forma de ajustar las coordenadas de `fragments`
mirándolas, en vez de estimarlas: un recorte mal puesto cae en una zona vacía y
en las portadas oscuras se ve como un rectángulo negro.

Cubre cinco viewports (1440×900, 1280×800, 834×1112, 390×844, 360×740), zoom al
200 %, filtros, categoría vacía, modo Explorar y su recorrido circular, visor,
URLs directas, botón Atrás, movimiento reducido, ausencia de WebGL, límites de
recursos de GPU y consola limpia.

---

## Herencia del sitio anterior

- Se conservan las URLs `#<categoría>`, `#<categoría>/<proyecto>` y `#equipo`, y
  las rutas `projects/*.html` y `assets*/`.
- `support.js`, `vendor/babel.min.js`, `vendor/react*.js`,
  `standalone-src.dc.html` y `HAYAI Portfolio.html` son artefactos de la versión
  anterior (runtime DCLogic). El sitio ya no los carga; se mantienen sólo como
  referencia y pueden borrarse cuando queráis.
- El CSP de `Caddyfile.template` sigue permitiendo `unsafe-eval` porque los
  bundles autoextraíbles de `projects/*.html` lo necesitan. La página principal
  ya no lo requiere.
