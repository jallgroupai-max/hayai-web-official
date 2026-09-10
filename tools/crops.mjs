// Hoja de contactos de los recortes declarados en PROJECTS[].fragments.
// Dibuja cada portada con sus rectangulos encima y, debajo, los recortes
// sueltos. Sirve para ajustar las coordenadas mirando, no adivinando.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { PROJECTS } from '../src/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { server, origin } = await serve();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });

const data = PROJECTS.map((x) => ({ id: x.id, cover: x.cover.replace('./', '/'), frags: x.fragments || [] }));

await p.goto(origin + '/', { waitUntil: 'domcontentloaded' });
await p.setContent(`<body style="margin:0;background:#111;color:#fff;font:12px monospace">
${data
  .map(
    (d) => `<section style="padding:14px">
  <h2 style="font:600 16px monospace;margin:0 0 8px">${d.id}</h2>
  <div style="display:flex;gap:14px;align-items:flex-start">
    <div style="position:relative;width:300px;flex:none">
      <img src="${origin}${d.cover}" style="width:300px;display:block">
      ${d.frags
        .map(
          (f, i) =>
            `<div style="position:absolute;left:${f[0] * 100}%;top:${f[1] * 100}%;width:${f[2] * 100}%;height:${
              f[3] * 100
            }%;outline:2px solid #0f0"><span style="position:absolute;top:-2px;left:0;background:#0f0;color:#000;padding:0 3px">${i}</span></div>`
        )
        .join('')}
    </div>
    ${d.frags
      .map(
        (f, i) =>
          `<div style="width:210px"><div style="opacity:.6">${i}</div>
       <div style="width:210px;aspect-ratio:${f[2] * 1080}/${f[3] * 1440};overflow:hidden;position:relative;outline:1px solid #333">
         <img src="${origin}${d.cover}" style="position:absolute;width:${100 / f[2]}%;left:${(-f[0] / f[2]) * 100}%;top:${
            (-f[1] / f[3]) * 100
          }%;height:${100 / f[3]}%;max-width:none">
       </div></div>`
      )
      .join('')}
  </div>
</section>`
  )
  .join('')}
</body>`);
await p.waitForTimeout(2500);
await p.screenshot({ path: path.join(ROOT, 'screenshots', 'check', 'crops.png'), fullPage: true });
console.log('screenshots/check/crops.png');
await b.close();
server.close();
