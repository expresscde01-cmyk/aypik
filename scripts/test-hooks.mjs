import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

function existingFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.json`,
    path.join(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const file = existingFile(path.join(SRC, specifier.slice(2)));
    if (file) {
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  if (specifier.startsWith('.') && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const file = existingFile(path.resolve(parentDir, specifier));
    if (file) {
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
