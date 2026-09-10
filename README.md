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
     // Piezas de interfaz que flotan alrededor de la portada. Son HTML real,
     // no recortes de la imagen. Tres clases: stat, row y action. Los valores
     // salen de la captura del caso; no se inventan.
     components: [
       { kind: 'stat', value: '$4.280', label: 'ventas del día' },
       { kind: 'row', meta: 'Más vendido', title: 'Brasa Burger', trailing: '38 hoy' },
       { kind: 'action', label: 'Mesa 07', value: '$41,60', action: 'Nuevo pedido' }
     ],
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
- **Un proyecto a la vez, centrado.** El cambio es un fundido cruzado en el
  sitio, no un desplazamiento: la portada que sale se apaga mientras la que
  entra aparece. Por eso bastan tres mallas.
- **Los componentes flotantes son HTML real**, no recortes de la imagen: se leen
  nítidos a cualquier tamaño y no dependen de dónde caiga un rectángulo sobre
  una captura. Su opacidad la escribe el recorrido, así que entran y salen
  exactamente con el scroll.
- **Con movimiento reducido la galería sigue funcionando.** Se apaga lo que se
  mueve solo (flotación, flexión por velocidad, reacción al puntero, inercia)
  pero el cambio de proyecto con scroll se conserva, porque es un fundido y no
  una transición espacial.
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
```

Cubre cinco viewports (1440×900, 1280×800, 834×1112, 390×844, 360×740), zoom al
200 %, filtros, categoría vacía, modo Explorar y su recorrido circular, visor,
URLs directas, botón Atrás, movimiento reducido, ausencia de WebGL, límites de
recursos de GPU y consola limpia.

Sobre movimiento reducido: la galería **no** se apaga. Se dibuja igual y deja de
moverse sola (sin flotación, sin flexión por velocidad, sin reacción al puntero,
sin recorrido fijado ni inercia) y se recorre con los controles y la lista de
títulos, que son acciones explícitas. La alternativa HTML se reserva para cuando
no hay WebGL.

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
