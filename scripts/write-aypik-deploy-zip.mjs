/**
 * Recrée aypik-deploy.zip (contenu de dist/) et le copie vers le dossier
 * de déploiement local historique : C:\Users\expre\Videos\Site
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { basename, join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const zipPath = join(root, 'aypik-deploy.zip');

const SITE_DIRS = [
  String.raw`C:\Users\expre\Videos\Site`,
  '/mnt/c/Users/expre/Videos/Site',
];

const parent = join(root, '..');
if (basename(parent).toLowerCase() === 'site') {
  SITE_DIRS.push(parent);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(dist)) {
  console.error('dist/ introuvable. Lance d’abord npm run build.');
  process.exit(1);
}

rmSync(zipPath, { force: true });

const zipCli = spawnSync('zip', ['-r', zipPath, '.'], {
  cwd: dist,
  stdio: 'inherit',
});
if (zipCli.status !== 0) {
  run('tar', ['-a', '-cf', zipPath, '-C', dist, '.']);
}

const copiedTo = [];
for (const dir of SITE_DIRS) {
  if (!existsSync(dir)) continue;
  mkdirSync(dir, { recursive: true });
  const destZip = join(dir, 'aypik-deploy.zip');
  copyFileSync(zipPath, destZip);
  for (const name of ['index.html', 'assets', '.htaccess', 'favicon.svg', 'crown.svg']) {
    const from = join(dist, name);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, name), { recursive: true });
  }
  copiedTo.push(dir);
}

console.log('zip', zipPath);
if (copiedTo.length) {
  for (const dir of copiedTo) console.log('deploy', dir);
} else {
  console.log(
    'Dossier C:\\Users\\expre\\Videos\\Site absent ici : zip seulement à la racine du projet.',
  );
}
