/**
 * Icônes PWA / écran d’accueil — source unique :
 *   public/app-icon-source.png
 *   (= cœur plein cadre, sans coins arrondis ni ombre — pas brand-mark.png)
 *
 * Sorties dans public/ :
 *   icon-192.png, icon-512.png
 *   icon-maskable-192.png, icon-maskable-512.png  (safe zone ~80 %)
 *   apple-touch-icon.png (180×180)
 *
 * Régénérer la source : node scripts/build-app-icon-source.cjs
 */
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'app-icon-source.png');
const OUT = path.join(ROOT, 'public');

/** Fond blanc plein (maskable : remplit hors safe zone). */
const EDGE = { r: 255, g: 255, b: 255, alpha: 1 };

async function writeSized(size, filename, { maskable = false } = {}) {
  const contentRatio = maskable ? 0.8 : 1;
  const inner = Math.max(1, Math.round(size * contentRatio));
  const artwork = await sharp(SRC)
    .resize(inner, inner, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  const left = Math.round((size - inner) / 2);
  const top = left;

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: EDGE,
    },
  })
    .composite([{ input: artwork, left, top }])
    .png()
    .toFile(path.join(OUT, filename));

  return { filename, size, maskable, inner };
}

(async () => {
  const meta = await sharp(SRC).metadata();
  console.log(
    `Source: public/app-icon-source.png (${meta.width}×${meta.height}) — plein cadre`
  );

  const results = [];
  results.push(await writeSized(192, 'icon-192.png'));
  results.push(await writeSized(512, 'icon-512.png'));
  results.push(await writeSized(192, 'icon-maskable-192.png', { maskable: true }));
  results.push(await writeSized(512, 'icon-maskable-512.png', { maskable: true }));
  results.push(await writeSized(180, 'apple-touch-icon.png'));

  for (const r of results) {
    console.log(
      `✓ ${r.filename}  ${r.size}×${r.size}` +
        (r.maskable ? `  (maskable, contenu ${r.inner}px)` : '')
    );
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
