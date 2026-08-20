/**
 * npm run deploy
 * 1. vite build (lit .env.production → VITE_SUPABASE_*)
 * 2. aypik-deploy.zip + copie vers C:\Users\expre\Videos\Site
 * 3. Si O2SWITCH_FTP_* est dans .env : upload dist/ vers cPanel
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { Client } from 'basic-ftp';

const root = process.cwd();
const dist = join(root, 'dist');
const zipPath = join(root, 'aypik-deploy.zip');
const DIST_FILES = ['index.html', 'assets', '.htaccess', 'favicon.svg', 'crown.svg'];

const SITE_DIRS = [
  String.raw`C:\Users\expre\Videos\Site`,
  '/mnt/c/Users/expre/Videos/Site',
];
const parent = join(root, '..');
if (basename(parent).toLowerCase() === 'site') SITE_DIRS.push(parent);

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(join(root, '.env.production'));
loadDotEnv(join(root, '.env'));

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    cwd: root,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function makeZip() {
  if (!existsSync(dist)) {
    console.error('dist/ introuvable.');
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
}

function copyToSiteFolder() {
  const copied = [];
  for (const dir of SITE_DIRS) {
    if (!existsSync(dir)) continue;
    mkdirSync(dir, { recursive: true });
    copyFileSync(zipPath, join(dir, 'aypik-deploy.zip'));
    for (const name of DIST_FILES) {
      const from = join(dist, name);
      if (!existsSync(from)) continue;
      cpSync(from, join(dir, name), { recursive: true });
    }
    copied.push(dir);
  }
  return copied;
}

async function uploadFtp() {
  const host = (process.env.O2SWITCH_FTP_HOST || '').trim();
  const user = (process.env.O2SWITCH_FTP_USER || '').trim();
  const password = process.env.O2SWITCH_FTP_PASSWORD || '';
  const remoteDir = (process.env.O2SWITCH_FTP_DIR || '/').trim() || '/';
  if (!host || !user || !password) {
    console.log(
      'FTP cPanel non configuré. Ajoute O2SWITCH_FTP_HOST / USER / PASSWORD dans .env puis relance npm run deploy.',
    );
    return false;
  }

  const client = new Client();
  const secure = process.env.O2SWITCH_FTP_SECURE !== 'false';
  try {
    try {
      await client.access({ host, user, password, secure });
    } catch (err) {
      if (!secure) throw err;
      console.log('FTPS refusé, nouvel essai en FTP.');
      await client.access({ host, user, password, secure: false });
    }
    await client.ensureDir(remoteDir);
    await client.cd(remoteDir);
    for (const name of DIST_FILES) {
      const from = join(dist, name);
      if (!existsSync(from)) continue;
      if (name === 'assets') {
        try {
          await client.removeDir('assets');
        } catch {
          /* dossier absent */
        }
        await client.uploadFromDir(from, 'assets');
      } else {
        await client.uploadFrom(from, name);
      }
    }
    console.log('FTP OK', host, remoteDir);
    return true;
  } finally {
    client.close();
  }
}

const zipOnly = process.argv.includes('--zip-only');
if (!zipOnly) run('npm', ['run', 'build']);
makeZip();
const copied = copyToSiteFolder();
console.log('zip', zipPath);
for (const dir of copied) console.log('copie locale', dir);
if (!copied.length) {
  console.log('C:\\Users\\expre\\Videos\\Site absent : zip seulement dans project.');
}
if (!zipOnly) {
  await uploadFtp();
}
