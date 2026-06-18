#!/usr/bin/env node
/*
 * Regenerate raster favicons from src/public/images/favicon.svg.
 *
 * One-time / on-change use. Requires dev tooling that is NOT a runtime dependency:
 *   npm i -D @resvg/resvg-js png-to-ico
 * then: node scripts/generate-favicons.js
 *
 * Outputs (committed as static assets, so the server needs no deps to serve them):
 *   src/public/images/favicon-16.png, -32.png, -192.png, -512.png
 *   src/public/images/apple-touch-icon.png (180)
 *   src/public/favicon.ico (16/32/48 — answers the browser's default /favicon.ico)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SVG = path.join(ROOT, 'src/public/images/favicon.svg');
const IMG_DIR = path.join(ROOT, 'src/public/images');

let Resvg, pngToIco;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
  pngToIco = require('png-to-ico');
  if (pngToIco && typeof pngToIco !== 'function' && pngToIco.default) pngToIco = pngToIco.default;
} catch (e) {
  console.error('Missing dev tooling. Run:\n  npm i -D @resvg/resvg-js png-to-ico\nthen re-run this script.');
  process.exit(1);
}

const svg = fs.readFileSync(SVG, 'utf8');
function render(size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  return r.render().asPng();
}

(async () => {
  const sizes = { 'favicon-16.png': 16, 'favicon-32.png': 32, 'apple-touch-icon.png': 180, 'favicon-192.png': 192, 'favicon-512.png': 512 };
  for (const [name, size] of Object.entries(sizes)) {
    fs.writeFileSync(path.join(IMG_DIR, name), render(size));
    console.log('wrote', name, `(${size}px)`);
  }
  const ico = await pngToIco([render(16), render(32), render(48)]);
  fs.writeFileSync(path.join(ROOT, 'src/public/favicon.ico'), ico);
  console.log('wrote favicon.ico (16/32/48)');
})().catch((e) => { console.error(e); process.exit(1); });
