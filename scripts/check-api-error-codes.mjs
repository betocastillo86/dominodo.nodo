#!/usr/bin/env node
// Lists the error codes dominodo.api can return that have no Spanish entry in
// src/app/core/http/api-error-messages.ts (and catalog entries the API no longer
// returns). Run after any change that consumes a new or changed API endpoint:
//
//   npm run check:error-codes                 # API checked out next to this repo
//   npm run check:error-codes -- <api-src>    # or point at its src/ folder
//
// Exits 1 when a code is missing, so it can gate a change. It is an audit, not a test.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiSrc = resolve(process.argv[2] ?? join(root, '..', 'dominodo.api', 'src'));
const catalogPath = join(root, 'src/app/core/http/api-error-messages.ts');

// `Error.Conflict("Reservation.SlotTaken", …)`, `new Error("X.Y", …)`, the codes
// kept in `const string …Code = "X.Y"` and the middleware's `Title = "X.Y"`.
const CODE_PATTERNS = [
  /Error\.(?:Validation|NotFound|Conflict|Forbidden|Unauthorized|Failure)\(\s*(?:code:\s*)?"([A-Za-z]+\.[A-Za-z]+)"/g,
  /new\s+Error\(\s*"([A-Za-z]+\.[A-Za-z]+)"/g,
  /const\s+string\s+\w*Code\w*\s*=\s*"([A-Za-z]+\.[A-Za-z]+)"/g,
  /Title\s*=\s*"([A-Za-z]+\.[A-Za-z]+)"/g,
];

function* csFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'bin' || name === 'obj') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* csFiles(path);
    else if (name.endsWith('.cs')) yield path;
  }
}

const apiCodes = new Map();
for (const file of csFiles(apiSrc)) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of CODE_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (!apiCodes.has(match[1])) apiCodes.set(match[1], file.slice(apiSrc.length + 1));
    }
  }
}

// Plain keys ('X.Y': …) plus the prefixes expanded by importMessages()/attachmentMessages().
const catalog = readFileSync(catalogPath, 'utf8');
const mapped = new Set([...catalog.matchAll(/^\s*'([A-Za-z]+\.[A-Za-z]+)':/gm)].map((m) => m[1]));
for (const [, helper, prefix] of catalog.matchAll(/\.\.\.(\w+)\('([A-Za-z]+)'\)/g)) {
  const body = new RegExp(`function ${helper}\\([\\s\\S]*?\\n}`).exec(catalog)?.[0] ?? '';
  for (const [, suffix] of body.matchAll(/\[`\$\{prefix\}\.([A-Za-z]+)`\]/g)) {
    mapped.add(`${prefix}.${suffix}`);
  }
}

const missing = [...apiCodes].filter(([code]) => !mapped.has(code)).sort();
const stale = [...mapped].filter((code) => !apiCodes.has(code)).sort();

console.log(`API codes: ${apiCodes.size} · mapped: ${mapped.size} · source: ${apiSrc}`);
if (stale.length) {
  console.log(`\nIn the catalog but no longer in the API (review, maybe remove):`);
  for (const code of stale) console.log(`  ${code}`);
}
if (missing.length) {
  console.log(`\nMissing from api-error-messages.ts:`);
  for (const [code, file] of missing) console.log(`  ${code}  (${file})`);
  process.exit(1);
}
console.log('\nEvery API error code has a Spanish message.');
