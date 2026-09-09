// Empaqueta las dependencias de terceros como modulos ESM minificados en /vendor.
// Se ejecuta a mano (`npm run vendor` dentro de tools/) y su salida se commitea:
// el sitio se sirve como estatico, sin paso de build en el despliegue.
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'vendor');

const targets = [
  { entry: 'entries/three.js', out: 'three.min.js', pkg: 'three' },
  { entry: 'entries/gsap.js', out: 'gsap.min.js', pkg: 'gsap' },
  { entry: 'entries/lenis.js', out: 'lenis.min.js', pkg: 'lenis' }
];

await mkdir(outDir, { recursive: true });

const manifest = [];
for (const t of targets) {
  const version = JSON.parse(
    await readFile(path.join(here, 'node_modules', t.pkg, 'package.json'), 'utf8')
  ).version;

  const result = await build({
    entryPoints: [path.join(here, t.entry)],
    outfile: path.join(outDir, t.out),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'none',
    treeShaking: true,
    banner: { js: `/* ${t.pkg} v${version} — bundle ESM generado por tools/vendor.mjs. No editar a mano. */` },
    metafile: true
  });

  const bytes = Object.values(result.metafile.outputs)[0].bytes;
  manifest.push({ package: t.pkg, version, file: `vendor/${t.out}`, bytes });
  console.log(`${t.pkg}@${version} -> vendor/${t.out} (${(bytes / 1024).toFixed(1)} kB)`);
}

await writeFile(
  path.join(outDir, 'VENDOR.json'),
  JSON.stringify({ generatedBy: 'tools/vendor.mjs', bundles: manifest }, null, 2) + '\n'
);
