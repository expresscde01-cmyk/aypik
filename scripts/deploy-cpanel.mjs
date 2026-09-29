/**
 * Build Aypik + .htaccess + ZIP cPanel/o2switch.
 *
 * Usage: npm run deploy
 *
 * Produit à la racine du projet un zip daté :
 * aypik-deploy-YYYY-MM-DD-HHmm.zip
 * (contenu = racine de dist/, à extraire dans public_html).
 * Les zips précédents ne sont pas effacés.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const htaccessSrc = join(root, 'public', '.htaccess');
const htaccessDest = join(dist, '.htaccess');
function zipStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function fail(message, code = 1) {
  console.error(`✗ ${message}`);
  process.exit(code);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    fail(`Commande échouée: ${command} ${args.join(' ')}`, result.status ?? 1);
  }
}

console.log('→ Build (vite)…');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) fail('Vite introuvable (npm install ?).');
run(process.execPath, [viteBin, 'build']);

if (!existsSync(dist)) fail('Le dossier dist/ est introuvable après le build.');
if (!existsSync(htaccessSrc)) fail('public/.htaccess introuvable.');

mkdirSync(dist, { recursive: true });
copyFileSync(htaccessSrc, htaccessDest);
console.log('→ .htaccess copié dans dist/');

if (!existsSync(htaccessDest)) fail('Échec de la copie de .htaccess vers dist/.');

const zipName = `aypik-deploy-${zipStamp(new Date())}.zip`;
const zipPath = join(root, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

console.log(`→ Création de ${zipName}…`);
if (process.platform === 'win32') {
  // tar natif Windows 10+ : archive ZIP du contenu de dist/
  run('tar', ['-a', '-c', '-f', zipPath, '-C', dist, '.']);
} else {
  // zip CLI (souvent présent sur macOS/Linux)
  const listing = readdirSync(dist);
  if (listing.length === 0) fail('dist/ est vide.');
  run('zip', ['-r', '-q', zipPath, '.'], { cwd: dist });
}

if (!existsSync(zipPath)) fail(`${zipName} n’a pas été créé.`);

const kb = (statSync(zipPath).size / 1024).toFixed(0);
const assetsDir = join(dist, 'assets');
const entryAssets = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((name) => /^index-.*\.(js|css)$/.test(name))
  : [];
console.log(`✓ Prêt : ${zipName} (${kb} Ko)`);
if (entryAssets.length) {
  console.log(`  Entrée JS/CSS : ${entryAssets.join(', ')}`);
}
console.log(
  '  → Extraire TOUT le zip dans public_html (index.php + dossier assets/), sans vider assets/ avant.'
);
