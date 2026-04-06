/**
 * Build script — copies src/ to dist/ with validation.
 * Chrome extensions don't need bundling (no imports between files).
 * This script validates + copies + reports size.
 */

import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// Clean dist
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
}

// Copy src → dist
cpSync(SRC, DIST, { recursive: true });

// Validate manifest.json
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const required = ['manifest_version', 'name', 'version', 'description', 'permissions', 'action', 'background', 'icons'];
const missing = required.filter((k) => !manifest[k]);
if (missing.length > 0) {
  console.error(`\x1b[31mManifest missing required fields: ${missing.join(', ')}\x1b[0m`);
  process.exit(1);
}

// Report build size
function getDirSize(dir) {
  let size = 0;
  const files = readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const fp = join(dir, f.name);
    if (f.isDirectory()) {
      size += getDirSize(fp);
    } else {
      size += statSync(fp).size;
    }
  }
  return size;
}

const totalSize = getDirSize(DIST);
const fileCount = readdirSync(DIST, { recursive: true }).length;

console.log('');
console.log('\x1b[32m  Build successful\x1b[0m');
console.log(`  Version:  ${manifest.version}`);
console.log(`  Name:     ${manifest.name}`);
console.log(`  Files:    ${fileCount}`);
console.log(`  Size:     ${(totalSize / 1024).toFixed(1)} KB`);
console.log(`  Output:   dist/`);
console.log('');

// Warn if over Chrome Web Store limits
if (totalSize > 10 * 1024 * 1024) {
  console.warn('\x1b[33m  Warning: Build exceeds 10MB Chrome Web Store limit\x1b[0m');
}
if (manifest.name.length > 75) {
  console.warn(`\x1b[33m  Warning: Name exceeds 75 char limit (${manifest.name.length})\x1b[0m`);
}
if (manifest.description.length > 132) {
  console.warn(`\x1b[33m  Warning: Description exceeds 132 char limit (${manifest.description.length})\x1b[0m`);
}
