/**
 * Favicons PNG 16 / 32 + ICO — cœur SVG + étoile peinte pixel à pixel
 * (pas un simple downscale du SVG avec l’étoile).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'public');

const HEART_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="35%" stop-color="#f43f5e"/>
      <stop offset="50%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#fbbf24"/>
    </linearGradient>
  </defs>
  <path
    d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
    fill="url(#g)"
    stroke="url(#g)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

function setPx(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  // Ne peindre l’étoile que sur le cœur (alpha déjà présent)
  if (buf[i + 3] < 40) return;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

/** Étoile 4 branches — 16×16 : plus croisé 3 px (lisibilité max). */
function paintSparkle16(buf) {
  // Centre (10, 4) — haut-droit du lobe ; tip-à-tip = 3
  const cx = 10;
  const cy = 4;
  const W = [255, 255, 255];
  setPx(buf, 16, cx, cy - 1, ...W);
  setPx(buf, 16, cx, cy, ...W);
  setPx(buf, 16, cx, cy + 1, ...W);
  setPx(buf, 16, cx - 1, cy, ...W);
  setPx(buf, 16, cx + 1, cy, ...W);
}

/**
 * Étoile 4 branches — 32×32 : croix fine ~8 px (25 % d’un cœur ~28–30 px),
 * avec un léger creux (pas de coins diagonaux pleins).
 */
function paintSparkle32(buf) {
  const cx = 21;
  const cy = 8;
  const W = [255, 255, 255];
  // Verticale (pointe haute → basse), tip-à-tip = 9
  for (let dy = -4; dy <= 4; dy++) {
    setPx(buf, 32, cx, cy + dy, ...W);
  }
  // Horizontale
  for (let dx = -4; dx <= 4; dx++) {
    if (dx === 0) continue;
    setPx(buf, 32, cx + dx, cy, ...W);
  }
  // Légère amorce des côtés concaves (1 px près du centre, pas les coins)
  setPx(buf, 32, cx - 1, cy - 1, 255, 255, 255, 180);
  setPx(buf, 32, cx + 1, cy - 1, 255, 255, 255, 180);
  setPx(buf, 32, cx - 1, cy + 1, 255, 255, 255, 180);
  setPx(buf, 32, cx + 1, cy + 1, 255, 255, 255, 180);
}

async function makePng(size, paintSparkle, filename) {
  const { data } = await sharp(Buffer.from(HEART_ONLY_SVG))
    .resize(size, size, { kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buf = Buffer.from(data);
  paintSparkle(buf);

  await sharp(buf, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(path.join(OUT, filename));
}

/** ICO multi-taille minimal (PNG embarqués) — 16 + 32. */
async function makeIco(png16Path, png32Path, icoPath) {
  const png16 = fs.readFileSync(png16Path);
  const png32 = fs.readFileSync(png32Path);
  const images = [
    { size: 16, data: png16 },
    { size: 32, data: png32 },
  ];
  const headerSize = 6;
  const dirEntrySize = 16;
  const offset0 = headerSize + dirEntrySize * images.length;
  let offset = offset0;
  const entries = images.map((img) => {
    const entry = {
      width: img.size,
      height: img.size,
      bytes: img.data.length,
      offset,
    };
    offset += img.data.length;
    return entry;
  });
  const total = offset;
  const out = Buffer.alloc(total);
  // ICONDIR
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2); // ICO
  out.writeUInt16LE(images.length, 4);
  let p = 6;
  for (const e of entries) {
    out.writeUInt8(e.width >= 256 ? 0 : e.width, p);
    out.writeUInt8(e.height >= 256 ? 0 : e.height, p + 1);
    out.writeUInt8(0, p + 2); // colors
    out.writeUInt8(0, p + 3);
    out.writeUInt16LE(1, p + 4); // planes
    out.writeUInt16LE(32, p + 6); // bit count
    out.writeUInt32LE(e.bytes, p + 8);
    out.writeUInt32LE(e.offset, p + 12);
    p += 16;
  }
  for (let i = 0; i < images.length; i++) {
    images[i].data.copy(out, entries[i].offset);
  }
  fs.writeFileSync(icoPath, out);
}

(async () => {
  await makePng(16, paintSparkle16, 'favicon-16x16.png');
  await makePng(32, paintSparkle32, 'favicon-32x32.png');
  await makeIco(
    path.join(OUT, 'favicon-16x16.png'),
    path.join(OUT, 'favicon-32x32.png'),
    path.join(OUT, 'favicon.ico')
  );
  console.log('Wrote favicon-16x16.png, favicon-32x32.png, favicon.ico');
})();
