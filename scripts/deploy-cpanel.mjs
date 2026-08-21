/**
 * Build Aypik + .htaccess + ZIP cPanel/o2switch.
 *
 * Usage: npm run deploy
 *
 * Produit à la racine du projet : aypik-deploy.zip
 * (contenu = racine de dist/, à extraire dans public_html)
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
const zipPath = join(root, 'aypik-deploy.zip');

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

if (existsSync(zipPath)) rmSync(zipPath);

console.log('→ Création de aypik-deploy.zip…');
if (process.platform === 'win32') {
  // tar natif Windows 10+ : archive ZIP du contenu de dist/
  run('tar', ['-a', '-c', '-f', zipPath, '-C', dist, '.']);
} else {
  // zip CLI (souvent présent sur macOS/Linux)
  const listing = readdirSync(dist);
  if (listing.length === 0) fail('dist/ est vide.');
  run('zip', ['-r', '-q', zipPath, '.'], { cwd: dist });
}

if (!existsSync(zipPath)) fail('aypik-deploy.zip n’a pas été créé.');

const kb = (statSync(zipPath).size / 1024).toFixed(0);
console.log(`✓ Prêt : aypik-deploy.zip (${kb} Ko)`);
console.log('  → Extraire dans public_html sur o2switch/cPanel, puis Ctrl+F5.');
