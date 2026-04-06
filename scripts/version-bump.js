/**
 * Bumps version in both package.json and src/manifest.json.
 * Usage: node scripts/version-bump.js [major|minor|patch]
 * Default: patch
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const bumpType = process.argv[2] || 'patch';

function bump(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      console.error(`Unknown bump type: ${type}. Use major, minor, or patch.`);
      process.exit(1);
  }
}

// Bump package.json
const pkgPath = join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
pkg.version = bump(oldVersion, bumpType);
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Bump manifest.json
const manifestPath = join(ROOT, 'src', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = pkg.version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log('');
console.log(`  \x1b[32mVersion bumped: ${oldVersion} → ${pkg.version}\x1b[0m`);
console.log('  Updated: package.json + src/manifest.json');
console.log('');
