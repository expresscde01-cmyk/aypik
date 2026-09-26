import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const functionsDir = join(root, 'supabase/functions');

function walkTs(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '_shared') continue;
      files.push(...walkTs(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function importedBindings(clause: string): string[] {
  const names: string[] = [];
  const brace = clause.match(/\{([\s\S]*)\}/);
  if (brace) {
    for (const part of brace[1].split(',')) {
      const cleaned = part.replace(/\btype\b/g, '').trim();
      if (!cleaned) continue;
      names.push(cleaned.split(/\s+as\s+/)[0].trim());
    }
  }
  const before = clause
    .replace(/\{[\s\S]*\}/, '')
    .replace(/\btype\b/g, '')
    .replace(/,/g, '')
    .trim();
  if (before && !before.startsWith('*')) {
    names.push(before.split(/\s+as\s+/)[0].trim());
  }
  return names.filter(Boolean);
}

function exportedNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const cleaned = part.replace(/\btype\b/g, '').trim();
      if (!cleaned) continue;
      const pieces = cleaned.split(/\s+as\s+/);
      names.add((pieces[1] ?? pieces[0]).trim());
    }
  }
  return names;
}

test('chaque fonction Supabase n’importe que des exports présents dans _shared', () => {
  const missing: string[] = [];
  const exportCache = new Map<string, Set<string>>();

  for (const file of walkTs(functionsDir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /import\s+(?:type\s+)?((?:(?!\bimport\b)[\s\S])*?)\s+from\s+['"]([^'"]*_shared\/[^'"]+)['"]/g,
    )) {
      const names = importedBindings(match[1]);
      const target = resolve(dirname(file), match[2]);
      const normalized = normalize(target);
      if (!exportCache.has(normalized)) {
        exportCache.set(normalized, exportedNames(readFileSync(target, 'utf8')));
      }
      const exports = exportCache.get(normalized)!;
      const rel = file.slice(functionsDir.length + 1).replaceAll('\\', '/');
      for (const name of names) {
        if (!exports.has(name)) {
          missing.push(`${rel} importe ${name} depuis ${match[2]}`);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
});
