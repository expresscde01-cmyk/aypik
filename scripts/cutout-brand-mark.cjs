/**
 * Détourage brand-mark : flood-fill du blanc connecté aux bords
 * (préserve l’étincelle blanche interne), crop + PNG alpha.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'brand-mark.png');
const OUT = path.join(__dirname, '..', 'public', 'brand-mark-transparent.png');
const PREVIEW = path.join(__dirname, '..', 'public', 'brand-mark-transparent-preview.png');

function isBackground(r, g, b, a) {
  if (a < 8) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Blanc / gris très clair (ombre portée, plaque) — pas rose/pêche
  return max >= 215 && min >= 200 && max - min <= 28;
}

function idx(x, y, w) {
  return (y * w + x) * 4;
}

async function main() {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const buf = Buffer.from(data);
  const visited = new Uint8Array(w * h);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const i = p * 4;
    if (!isBackground(buf[i], buf[i + 1], buf[i + 2], buf[i + 3])) return;
    visited[p] = 1;
    queue.push(p);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (queue.length) {
    const p = queue.pop();
    const x = p % w;
    const y = (p / w) | 0;
    const i = p * 4;
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // Nettoyage liseré : pixels quasi-blancs adjacents à du transparent
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y, w);
      if (buf[i + 3] === 0) continue;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (!(max >= 235 && min >= 220 && max - min <= 20)) continue;
      let nearClear = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (buf[idx(x + dx, y + dy, w) + 3] === 0) {
          nearClear = true;
          break;
        }
      }
      if (nearClear) {
        buf[i + 3] = 0;
      }
    }
  }

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (buf[idx(x, y, w) + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const padX = Math.max(2, Math.round(bw * 0.08));
  const padY = Math.max(2, Math.round(bh * 0.08));
  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const right = Math.min(w - 1, maxX + padX);
  const bottom = Math.min(h - 1, maxY + padY);
  const cw = right - left + 1;
  const ch = bottom - top + 1;

  const cropped = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = idx(left + x, top + y, w);
      const di = idx(x, y, cw);
      cropped[di] = buf[si];
      cropped[di + 1] = buf[si + 1];
      cropped[di + 2] = buf[si + 2];
      cropped[di + 3] = buf[si + 3];
    }
  }

  let outW = cw;
  let outH = ch;
  if (outW < 512) {
    const scale = 512 / outW;
    outW = 512;
    outH = Math.round(ch * scale);
  }

  await sharp(cropped, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(outW, outH, { kernel: 'lanczos3' })
    .png()
    .toFile(OUT);

  // Aperçu sur dégradé rose → pêche (landing)
  const previewSize = 512;
  const gradSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${previewSize}" height="${previewSize}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff1f2"/>
      <stop offset="45%" stop-color="#ffe4e6"/>
      <stop offset="100%" stop-color="#ffedd5"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`);

  const mark = await sharp(OUT)
    .resize(Math.round(previewSize * 0.55), Math.round(previewSize * 0.55), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp(gradSvg)
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(PREVIEW);

  const meta = await sharp(OUT).metadata();
  console.log(
    JSON.stringify({
      out: OUT,
      width: meta.width,
      height: meta.height,
      bbox: { minX, minY, maxX, maxY },
      crop: { left, top, cw, ch },
      preview: PREVIEW,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
