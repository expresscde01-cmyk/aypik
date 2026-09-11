/**
 * Importe GeoNames cities15000 dans public.world_cities.
 * Données : https://download.geonames.org/export/dump/cities15000.zip (CC BY 4.0).
 *
 * Requis : VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (jamais VITE_).
 *
 *   node scripts/seed-geonames.mjs
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const GEONAMES_ZIP =
  'https://download.geonames.org/export/dump/cities15000.zip';
const BATCH = 400;

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
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

loadDotEnv(join(process.cwd(), '.env'));
loadDotEnv(join(process.cwd(), '.env.local'));

const supabaseUrl = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceKey) {
  console.error(
    'Manque VITE_SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY dans .env'
  );
  process.exit(1);
}

function unzipToDir(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' }
    );
    return;
  }
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
}

async function upsertBatch(rows) {
  const res = await fetch(`${supabaseUrl}/rest/v1/world_cities?on_conflict=geoname_id`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upsert ${res.status}: ${body.slice(0, 500)}`);
  }
}

const knownCountries = new Set();

async function loadCountryCodes() {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/world_countries?select=iso2`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`world_countries ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const rows = await res.json();
  for (const row of rows) knownCountries.add(String(row.iso2 || '').toUpperCase());
}

function parseCities(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split('\t');
    const geonameId = Number(cols[0]);
    const name = cols[1];
    const asciiName = cols[2] || name;
    const alternateNames = cols[3] || '';
    const lat = Number(cols[4]);
    const lng = Number(cols[5]);
    const country = String(cols[8] || '').toUpperCase();
    const population = Number(cols[14] || 0);
    if (!Number.isFinite(geonameId) || !name || !knownCountries.has(country)) {
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      geoname_id: geonameId,
      name,
      ascii_name: asciiName,
      alternate_names: alternateNames,
      country_code: country,
      lat,
      lng,
      population: Number.isFinite(population) ? population : 0,
    });
  }
  return out;
}

const work = join(tmpdir(), `aypik-geonames-${Date.now()}`);
mkdirSync(work, { recursive: true });
const zipPath = join(work, 'cities15000.zip');

try {
  await loadCountryCodes();
  if (knownCountries.size === 0) {
    throw new Error('Aucun pays dans world_countries — appliquer d’abord la migration SQL.');
  }
  console.log(`Pays connus : ${knownCountries.size}`);
  console.log('Téléchargement GeoNames cities15000…');
  const zipRes = await fetch(GEONAMES_ZIP);
  if (!zipRes.ok) throw new Error(`Download ${zipRes.status}`);
  writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));
  unzipToDir(zipPath, work);
  const txtPath = join(work, 'cities15000.txt');
  if (!existsSync(txtPath)) {
    throw new Error('cities15000.txt introuvable après unzip');
  }
  const cities = parseCities(readFileSync(txtPath, 'utf8'));
  console.log(`Villes à importer : ${cities.length}`);
  for (let i = 0; i < cities.length; i += BATCH) {
    const slice = cities.slice(i, i + BATCH);
    await upsertBatch(slice);
    console.log(`  ${Math.min(i + BATCH, cities.length)} / ${cities.length}`);
  }
  console.log('Import GeoNames terminé.');
} finally {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* tmp */
  }
}
