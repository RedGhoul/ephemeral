/**
 * Ephemerality guard (phase 5).
 *
 * Asserts that our own source never touches a client-side persistence API, so
 * the "nothing is ever stored" promise can't quietly regress. Scans `src/` and
 * fails the build (non-zero exit) on any hit. Comments are stripped first so the
 * prose in this codebase doesn't trip the check.
 *
 * Run directly (`node scripts/check-no-persistence.mjs`) or via `npm run build`,
 * which invokes it as a prebuild step.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

// Persistence / storage APIs that would break the ephemeral guarantee.
const FORBIDDEN = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'openDatabase',
  'document.cookie',
  'caches', // CacheStorage
];

/** Crudely strip // line comments and block comments before scanning. */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(jsx?|tsx?)$/.test(entry)) files.push(full);
  }
  return files;
}

const violations = [];
for (const file of walk(SRC)) {
  const code = stripComments(readFileSync(file, 'utf8'));
  code.split('\n').forEach((line, i) => {
    for (const api of FORBIDDEN) {
      if (line.includes(api)) {
        violations.push(`${file}:${i + 1}  uses "${api}"`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('✗ Ephemerality guard failed — persistence API used in src/:');
  for (const v of violations) console.error('  ' + v);
  console.error('\nMessages must live in memory only. Remove the usage above.');
  process.exit(1);
}

console.log('✓ Ephemerality guard: no persistence APIs used in src/.');
