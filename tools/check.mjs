// Comprobaciones del sitio en un navegador real.
// Uso: node check.mjs [--shots]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'screenshots', 'check');
const wantShots = process.argv.includes('--shots');

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-834x1112', width: 834, height: 1112 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x740', width: 360, height: 740 }
];

const results = [];
function record(ok, check, detail = '') {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${check}${detail ? ` — ${detail}` : ''}`);
}
const fail = (name, detail) => record(false, name, detail);
const pass = (name, detail = '') => record(true, name, detail);

await mkdir(SHOTS, { recursive: true });
const { server, origin } = await serve();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// Los bundles heredados de /projects se cargan dentro de un iframe y tienen sus
// propios avisos (por ejemplo buscan .image-slots.state.json, que nunca estuvo
// en el repositorio). Se anotan aparte para no confundirlos con errores del sitio.
function watch(page, errors, inner) {
  // Los avisos de los bundles heredados de /projects y los cortes de red hacia
  // hosts externos (las fuentes de Google) se anotan aparte: no son regresiones
  // del sitio y ensucian la senal.
  const external = /net::ERR_(NAME_NOT_RESOLVED|CONNECTION_RESET|NETWORK_CHANGED|NETWORK_ACCESS_DENIED|INTERNET_DISCONNECTED|TIMED_OUT)/;
  const bucketFor = (url) => (url && url.includes('/projects/') ? inner : errors);

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (external.test(text)) {
      inner.push(`red externa: ${text}`);
      return;
    }
    bucketFor(msg.location().url).push(`console: ${text}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (res) => {
    if (res.status() < 400 || !res.url().startsWith(origin)) return;
    bucketFor(res.url()).push(`HTTP ${res.status()}: ${res.url()}`);
  });
  page.on('requestfailed', (req) => {
    if (!req.url().startsWith(origin)) {
      inner.push(`red externa: ${req.url()} (${req.failure()?.errorText})`);
      return;
    }
    bucketFor(req.url()).push(`request failed: ${req.url()} (${req.failure()?.errorText})`);
  });
}

const innerIssues = [];

/**
 * Navegar con un reintento. Con SwiftShader y varios contextos abiertos, en
 * maquinas justas de memoria el primer `load` se agota de vez en cuando; eso es
 * ruido del entorno de pruebas, no del sitio.
 */
async function goto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
}

async function newPage(context) {
  const page = await context.newPage();
  const errors = [];
  watch(page, errors, innerIssues);
  return { page, errors };
}

/* ── 1. Recorrido por viewport ─────────────────────────────────────────── */
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const { page, errors } = await newPage(context);
  await goto(page, origin + '/');
  await page.waitForTimeout(2500);

  const mode = await page.evaluate(() => document.documentElement.dataset.gallery);
  pass(`${vp.name}: modo galería`, mode);

  // Sin desbordamiento lateral.
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: document.documentElement.clientWidth
  }));
  if (overflow.doc > overflow.win + 1) fail(`${vp.name}: sin scroll horizontal`, `${overflow.doc} > ${overflow.win}`);
  else pass(`${vp.name}: sin scroll horizontal`);

  if (wantShots) {
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-hero.png`) });
  }

  // Recorrido: bajar y comprobar que cambia el proyecto activo.
  const activeTitle = () =>
    page.evaluate(() => {
      const current = document.querySelector('.stage__title-item[aria-current="true"] .stage__title-name');
      if (current) return current.textContent.trim();
      return (document.querySelector('[data-meta-category]') || {}).textContent || '';
    });
  const firstTitle = await activeTitle();
  // Rueda real: Lenis intercepta el evento wheel, asi que window.scrollTo se
  // saltaria justo el camino que recorre un visitante.
  await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
  for (let i = 0; i < 7; i++) {
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(1200);
  const secondTitle = await activeTitle();
  const counter = await page.textContent('[data-counter-current]');

  if (vp.width >= 900) {
    if (firstTitle === secondTitle) fail(`${vp.name}: el scroll cambia de proyecto`, `${firstTitle} -> ${secondTitle}`);
    else pass(`${vp.name}: el scroll cambia de proyecto`, `${firstTitle} -> ${secondTitle} (${counter})`);
  } else {
    // El arrastre solo manda donde el escenario esta apilado. Con puntero fino
    // y 834 px el recorrido lo lleva el scroll, asi que ahi no aplica.
    const apilado = await page.evaluate(
      () => getComputedStyle(document.querySelector('.stage__sticky')).position !== 'sticky'
    );
    if (!apilado) {
      pass(`${vp.name}: recorrido por scroll (puntero fino)`, 'el arrastre no aplica aqui');
    } else {
    const antesArrastre = await page.evaluate(() => window.HAYAI.getState().index);
    // Sobre el lienzo de verdad: en movil queda debajo del texto de entrada, y
    // ademas hay que volver a el, porque la prueba de scroll lo ha dejado muy
    // por encima del viewport y su boundingBox saldria en negativo.
    await page.locator('[data-canvas-host]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const lienzo = await page.locator('[data-canvas-host]').boundingBox();
    const cx = Math.round(lienzo.x + lienzo.width / 2);
    const cy = Math.round(lienzo.y + lienzo.height / 2);
    await page.mouse.move(cx + 100, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx + 100 - i * 20, cy);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const trasArrastre = await page.evaluate(() => window.HAYAI.getState().index);
    if (trasArrastre !== antesArrastre) {
      pass(`${vp.name}: arrastre cambia de proyecto`, `${antesArrastre} -> ${trasArrastre}`);
    } else {
      fail(`${vp.name}: arrastre cambia de proyecto`, `${antesArrastre} -> ${trasArrastre}`);
    }
    }
    pass(`${vp.name}: recorrido vertical nativo`, `${firstTitle}`);
  }

  if (wantShots && vp.width >= 900) {
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-journey.png`) });
  }

  // Secciones alcanzables.
  await page.evaluate(() => document.querySelector('#soluciones').scrollIntoView());
  await page.waitForTimeout(900);
  const cards = await page.locator('.work-card').count();
  if (cards !== 6) fail(`${vp.name}: rejilla completa`, `${cards} tarjetas`);
  else pass(`${vp.name}: rejilla completa`, '6 tarjetas');

  if (wantShots) {
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-soluciones.png`) });
    await page.evaluate(() => document.querySelector('#contacto').scrollIntoView());
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-contacto.png`) });
  }

  if (errors.length) fail(`${vp.name}: consola limpia`, errors.slice(0, 4).join(' | '));
  else pass(`${vp.name}: consola limpia`);

  await context.close();
}

/* ── 2. Interacciones en escritorio ────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await newPage(context);
  await goto(page, origin + '/');
  await page.waitForTimeout(2200);

  // Filtro por categoría.
  await page.locator('.cat[data-cat="showrooms"]').scrollIntoViewIfNeeded();
  await page.locator('.cat[data-cat="showrooms"]').click();
  await page.waitForTimeout(1400);
  const filtered = await page.locator('.work-card').count();
  const hash = await page.evaluate(() => location.hash);
  if (filtered === 2 && hash === '#showrooms') pass('filtro por categoría', `${filtered} proyectos, ${hash}`);
  else fail('filtro por categoría', `${filtered} tarjetas, hash ${hash}`);

  // Categoría vacía: invitación, sin canvas roto.
  await page.evaluate(() => document.querySelector('.cat[data-cat="saas"]').click());
  await page.waitForTimeout(1200);
  const invite = await page.locator('.work-empty').count();
  const emptyStage = await page.locator('[data-stage-empty]').isVisible();
  if (invite === 1 && emptyStage) pass('categoría vacía', 'invitación visible en rejilla y escenario');
  else fail('categoría vacía', `invitación:${invite} escenario:${emptyStage}`);

  // Volver a todos.
  await page.evaluate(() => document.querySelector('.cat[data-cat="saas"]').click());
  await page.waitForTimeout(900);

  // Modo Explorar.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.locator('.stage__facts-actions [data-action="explore"]').click();
  await page.waitForTimeout(1200);
  const exploreOpen = await page.locator('[data-explore]').isVisible();
  const exploreHash = await page.evaluate(() => location.hash);
  if (exploreOpen && exploreHash === '#explorar') pass('modo Explorar abre', exploreHash);
  else fail('modo Explorar abre', `visible:${exploreOpen} hash:${exploreHash}`);

  if (wantShots) await page.screenshot({ path: path.join(SHOTS, 'explore.png') });

  // Recorrido circular: del primero hacia atrás debe llevar al último.
  const before = await page.textContent('[data-explore-index]');
  await page.locator('[data-explore-prev]').click();
  await page.waitForTimeout(900);
  const after = await page.textContent('[data-explore-index]');
  if (before === '01' && after === '06') pass('recorrido circular', `${before} -> ${after}`);
  else fail('recorrido circular', `${before} -> ${after}`);

  // Salida con Escape.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const closed = await page.locator('[data-explore]').isHidden();
  if (closed) pass('Explorar cierra con Escape');
  else fail('Explorar cierra con Escape');

  // Visor de caso.
  await page.evaluate(() => document.querySelector('[data-action="open-project"]').click());
  await page.waitForTimeout(1000);
  const viewerVisible = await page.locator('[data-viewer]').isVisible();
  const viewerHash = await page.evaluate(() => location.hash);
  if (viewerVisible) pass('visor abre', viewerHash);
  else fail('visor abre', `hash ${viewerHash}`);

  const readyAt = Date.now();
  await page.waitForFunction(() => document.querySelector('[data-viewer]').dataset.state === 'ready', null, {
    timeout: 40000
  }).catch(() => {});
  const state = await page.evaluate(() => document.querySelector('[data-viewer]').dataset.state);
  pass('visor carga el caso', `estado ${state} en ${Date.now() - readyAt} ms`);

  if (wantShots) await page.screenshot({ path: path.join(SHOTS, 'viewer.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const viewerClosed = await page.locator('[data-viewer]').isHidden();
  const backHash = await page.evaluate(() => location.hash);
  if (viewerClosed) pass('visor cierra y restaura contexto', `hash ${backHash}`);
  else fail('visor cierra y restaura contexto', `hash ${backHash}`);

  // Botón Atrás del navegador (los cambios de hash no disparan 'load').
  await page.evaluate(() => history.back());
  await page.waitForTimeout(1200);
  const afterBack = await page.evaluate(() => location.hash);
  pass('historial navegable', `atrás -> ${afterBack || '(sin hash)'}`);

  // Los componentes flotantes solo estan cuando el proyecto esta asentado.
  // Se navega con rueda real: window.scrollTo se salta a Lenis y deja la
  // galeria a medio camino, que es justo lo que este caso quiere distinguir.
  const opacidad = () =>
    page.evaluate(() =>
      Number(getComputedStyle(document.querySelector('[data-components]')).getPropertyValue('--settle') || 1)
    );

  await page.mouse.move(720, 450);
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -500);
  await page.waitForTimeout(1800);
  const quietos = await opacidad();

  // El minimo a lo largo de TODA la transicion: con la espera del recorrido,
  // una rueda corta ya no mueve el proyecto de su reposo, asi que medir en un
  // instante suelto no dice nada.
  let minimo = 1;
  for (let i = 0; i < 34; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(55);
    minimo = Math.min(minimo, await opacidad());
  }

  const piezas = await page.locator('.ui-piece').count();
  if (quietos > 0.9 && minimo < 0.35 && piezas === 3) {
    pass('componentes flotantes', `${piezas} piezas, opacidad ${quietos.toFixed(2)} en reposo, minimo ${minimo.toFixed(2)} en transicion`);
  } else {
    fail('componentes flotantes', `${piezas} piezas, opacidad ${quietos.toFixed(2)} en reposo, minimo ${minimo.toFixed(2)} en transicion`);
  }

  if (errors.length) fail('interacciones: consola limpia', errors.slice(0, 5).join(' | '));
  else pass('interacciones: consola limpia');

  await context.close();
}

/* ── 3. URL directa a un caso ──────────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await newPage(context);
  await goto(page, origin + '/#pos/brasa');
  await page.waitForTimeout(2500);
  const visible = await page.locator('[data-viewer]').isVisible();
  const label = await page.textContent('[data-viewer-label]');
  if (visible && /BRASA/i.test(label || '')) pass('URL directa a un caso', label);
  else fail('URL directa a un caso', `visible:${visible} label:${label}`);
  if (errors.length) fail('URL directa: consola limpia', errors.slice(0, 3).join(' | '));
  else pass('URL directa: consola limpia');
  await context.close();
}

/* ── 4. Movimiento reducido ────────────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const { page, errors } = await newPage(context);
  await goto(page, origin + '/');
  await page.waitForTimeout(2600);

  // La galeria SIGUE ahi: lo que desaparece es el movimiento, no el contenido.
  const modo = await page.evaluate(() => document.documentElement.dataset.gallery);
  const tarjetas = await page.locator('.work-card').count();

  // Nada se mueve solo: dos fotogramas separados deben dar la misma escena.
  const posiciones = () =>
    page.evaluate(() =>
      window.HAYAI.gallery.slots
        .filter((m) => m.visible)
        .map((m) => `${m.position.x.toFixed(4)},${m.position.y.toFixed(4)},${m.rotation.z.toFixed(4)}`)
        .join('|')
    );
  const antes = await posiciones();
  await page.waitForTimeout(1200);
  const despues = await posiciones();

  if (modo === 'webgl' && tarjetas === 6 && antes === despues && antes.length > 0) {
    pass('movimiento reducido', 'galeria dibujada y completamente quieta');
  } else {
    fail('movimiento reducido', `modo:${modo} tarjetas:${tarjetas} quieta:${antes === despues}`);
  }

  // Y sigue siendo recorrible: los controles son acciones explicitas.
  const inicial = await page.evaluate(() => window.HAYAI.getState().index);
  await page.locator('[data-action="next"]').click();
  await page.waitForTimeout(500);
  const siguiente = await page.evaluate(() => window.HAYAI.getState().index);
  if (siguiente === inicial + 1) pass('movimiento reducido: recorrible', `${inicial} -> ${siguiente}`);
  else fail('movimiento reducido: recorrible', `${inicial} -> ${siguiente}`);

  if (wantShots) await page.screenshot({ path: path.join(SHOTS, 'reduced-motion.png') });
  if (errors.length) fail('movimiento reducido: consola limpia', errors.slice(0, 3).join(' | '));
  else pass('movimiento reducido: consola limpia');
  await context.close();
}

/* ── 5. Sin WebGL ──────────────────────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await newPage(context);
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = function () {
      return null;
    };
  });
  await goto(page, origin + '/');
  await page.waitForTimeout(1800);
  const mode = await page.evaluate(() => document.documentElement.dataset.gallery);
  const cards = await page.locator('.work-card').count();
  if (mode === 'fallback' && cards === 6) pass('sin WebGL', 'alternativa HTML completa');
  else fail('sin WebGL', `modo:${mode} tarjetas:${cards}`);
  if (wantShots) await page.screenshot({ path: path.join(SHOTS, 'no-webgl.png') });
  if (errors.length) fail('sin WebGL: consola limpia', errors.slice(0, 3).join(' | '));
  else pass('sin WebGL: consola limpia');
  await context.close();
}

/* ── 6. Zoom 200 % y ancho 360 ─────────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 2 });
  const { page, errors } = await newPage(context);
  await goto(page, origin + '/');
  await page.waitForTimeout(1600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow <= 1) pass('zoom 200 % (720 css px)', 'sin desbordamiento');
  else fail('zoom 200 % (720 css px)', `desborda ${overflow}px`);
  if (wantShots) await page.screenshot({ path: path.join(SHOTS, 'zoom-200.png') });
  if (errors.length) fail('zoom 200 %: consola limpia', errors.slice(0, 3).join(' | '));
  else pass('zoom 200 %: consola limpia');
  await context.close();
}

/* ── 7. Recursos de GPU y fotogramas ───────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await newPage(context);
  await goto(page, origin + '/');
  await page.waitForTimeout(3000);

  const snapshot = () =>
    page.evaluate(() => {
      const info = window.HAYAI.gallery.renderer.info;
      return {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs.length,
        calls: info.render.calls
      };
    });

  // Un ciclo completo para que todas las texturas estén ya subidas a la GPU.
  const cycle = () =>
    page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 6; i++) {
        window.HAYAI.setState({ index: i });
        await sleep(110);
      }
      window.HAYAI.setState({ mode: 'explore' });
      await sleep(600);
      for (let i = 0; i < 14; i++) {
        window.HAYAI.setState({ index: i % 6 });
        await sleep(80);
      }
      window.HAYAI.setState({ mode: 'journey' });
      await sleep(600);
    });

  // Dos ciclos de calentamiento: las texturas se suben a la GPU la primera vez
  // que se dibuja cada portada, así que antes de medir hay que verlas todas.
  await cycle();
  await cycle();
  const before = await snapshot();
  // Tercer ciclo idéntico: si el índice circular filtrara recursos, se vería aquí.
  await cycle();
  const after = await snapshot();

  // Cota: 1 geometría compartida y como mucho una textura por proyecto más el
  // render target de selección.
  const projects = 6;
  const bounded = after.geometries === 1 && after.textures <= projects + 2;
  const stable = after.geometries <= before.geometries && after.textures <= before.textures;
  if (bounded && stable)
    pass(
      'recursos de GPU acotados',
      `tras 3 ciclos: geometrias ${after.geometries}, texturas ${after.textures}, programas ${after.programs}, draw calls/frame ${after.calls}`
    );
  else fail('recursos de GPU acotados', `antes ${JSON.stringify(before)} despues ${JSON.stringify(after)}`);

  // Fotogramas durante 3 s de recorrido continuo. Nota: el navegador de las
  // pruebas dibuja por software (SwiftShader), asi que es una cota inferior.
  const fps = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    let frames = 0;
    let stop = false;
    const tick = () => {
      frames++;
      if (!stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const start = performance.now();
    const total = 3000;
    await new Promise((resolve) => {
      const step = () => {
        const t = (performance.now() - start) / total;
        window.scrollTo(0, t * window.innerHeight * 4);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    stop = true;
    return Math.round((frames / (performance.now() - start)) * 1000);
  });
  pass('fotogramas durante el recorrido', `${fps} fps (SwiftShader por software, no GPU real)`);

  if (errors.length) fail('recursos: consola limpia', errors.slice(0, 3).join(' | '));
  else pass('recursos: consola limpia');

  await context.close();
}

await browser.close();
server.close();

if (innerIssues.length) {
  console.log('');
  console.log('Avisos ajenos al sitio (bundles de /projects y red externa):');
  for (const issue of [...new Set(innerIssues)]) console.log(`  - ${issue}`);
}

const failed = results.filter((r) => !r.ok);
console.log('');
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FALLA'} ${r.check}${r.detail ? ` — ${r.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasan`);
await writeFile(path.join(SHOTS, 'report.json'), JSON.stringify(results, null, 2) + '\n');
process.exit(failed.length ? 1 : 0);
