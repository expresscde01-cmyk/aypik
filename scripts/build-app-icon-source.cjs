/**
 * Source icône PWA / launcher (plein cadre, sans tuile ni ombre) :
 *   public/app-icon-source.png (1024×1024)
 *
 * Cœur détouré = public/brand-mark-transparent.png
 * Fond = dégradé doux bord à bord (le launcher applique l’arrondi).
 *
 * Ne modifie PAS brand-mark.png ni brand-mark-transparent.png.
 */
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const HEART = path.join(ROOT, 'public', 'brand-mark-transparent.png');
const OUT = path.join(ROOT, 'public', 'app-icon-source.png');
const SIZE = 1024;
/** Cœur ≈ 62 % du cadre — marge confortable avant masque launcher. */
const HEART_RATIO = 0.62;

async function main() {
  const bgSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
</svg>`);

  const heartPx = Math.round(SIZE * HEART_RATIO);
  const heartBuf = await sharp(HEART)
    .trim()
    .resize(heartPx, heartPx, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const meta = await sharp(heartBuf).metadata();
  const left = Math.round((SIZE - (meta.width || heartPx)) / 2);
  const top = Math.round((SIZE - (meta.height || heartPx)) / 2);

  await sharp(bgSvg)
    .png()
    .composite([{ input: heartBuf, left, top }])
    .toFile(OUT);

  const outMeta = await sharp(OUT).metadata();
  console.log(`✓ app-icon-source.png  ${outMeta.width}×${outMeta.height}  (plein cadre, sans tuile)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
