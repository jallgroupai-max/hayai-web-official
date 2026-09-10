// Genera /covers/<id>.jpg capturando cada experiencia real de /projects.
// Las portadas son la textura de las laminas 3D, por eso se capturan en vertical
// (relacion 3:4, la misma de la geometria de la galeria).
//
// Uso:  node covers.mjs            -> todas las que falten o hayan cambiado
//       node covers.mjs --force    -> vuelve a capturar todas
//       node covers.mjs jac brasa  -> solo esos ids
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { PROJECTS } from '../src/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'covers');

// 1440 de ancho es el lienzo para el que estan maquetados los case studies.
// El factor 0.75 baja la captura a 1080x1440 sin volver a muestrear a mano.
const VIEWPORT = { width: 1440, height: 1920 };
const SCALE = 0.75;
const SETTLE_MS = 7000;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const targets = PROJECTS.filter((p) => p.file).filter((p) => (only.length ? only.includes(p.id) : true));

await mkdir(OUT, { recursive: true });
const { server, origin } = await serve();
const browser = await chromium.launch();

const report = [];
for (const project of targets) {
  const out = path.join(OUT, `${project.id}.jpg`);
  if (!force && existsSync(out)) {
    console.log(`= ${project.id} (ya existe, --force para rehacer)`);
    continue;
  }

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  const url = origin + '/' + project.file.replace(/^\.\//, '');
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(SETTLE_MS);
    const shot = await page.screenshot({ type: 'jpeg', quality: 82 });
    await writeFile(out, shot);
    const kb = (shot.length / 1024).toFixed(0);
    report.push({ id: project.id, kb, errors: errors.length });
    console.log(`+ ${project.id}.jpg (${kb} kB)${errors.length ? ` [${errors.length} errores de pagina]` : ''}`);
  } catch (err) {
    console.error(`! ${project.id}: ${err.message}`);
    report.push({ id: project.id, error: err.message });
  }
  await context.close();
}

await browser.close();
server.close();
console.table(report);
