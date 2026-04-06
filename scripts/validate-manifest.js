/**
 * Validates manifest.json against Chrome Web Store requirements.
 */

import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'manifest.json'), 'utf8'));

let errors = 0;
let warnings = 0;

function err(msg) {
  console.error(`  \x1b[31mERROR:\x1b[0m ${msg}`);
  errors++;
}
function warn(msg) {
  console.warn(`  \x1b[33mWARN:\x1b[0m  ${msg}`);
  warnings++;
}
function ok(msg) {
  console.log(`  \x1b[32mOK:\x1b[0m    ${msg}`);
}

console.log('');
console.log('  Validating manifest.json...');
console.log('');

// Required fields
if (manifest.manifest_version !== 3) err('manifest_version must be 3');
else ok('manifest_version: 3');

if (!manifest.name) err('name is required');
else if (manifest.name.length > 75) err(`name too long (${manifest.name.length}/75)`);
else ok(`name: "${manifest.name}" (${manifest.name.length}/75 chars)`);

if (!manifest.version) err('version is required');
else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) err(`version format invalid: "${manifest.version}" (use X.Y.Z)`);
else ok(`version: ${manifest.version}`);

if (!manifest.description) err('description is required');
else if (manifest.description.length > 132) err(`description too long (${manifest.description.length}/132)`);
else ok(`description: ${manifest.description.length}/132 chars`);

if (!manifest.permissions) warn('no permissions declared');
else ok(`permissions: [${manifest.permissions.join(', ')}]`);

if (!manifest.icons) err('icons are required');
else {
  const sizes = Object.keys(manifest.icons);
  if (!sizes.includes('16') || !sizes.includes('48') || !sizes.includes('128')) {
    err('icons must include 16, 48, and 128');
  } else {
    ok(`icons: ${sizes.join(', ')}px`);
  }
}

if (!manifest.action?.default_popup) warn('no default_popup in action');
else ok(`popup: ${manifest.action.default_popup}`);

if (!manifest.background?.service_worker) warn('no service_worker in background');
else ok(`service_worker: ${manifest.background.service_worker}`);

// Security checks
if (manifest.content_security_policy) {
  warn('custom CSP detected — verify no unsafe-eval or unsafe-inline');
}

if (manifest.host_permissions?.includes('<all_urls>')) {
  warn('host_permissions includes <all_urls> — Chrome review may flag this');
}

console.log('');
if (errors > 0) {
  console.log(`  \x1b[31m${errors} error(s), ${warnings} warning(s)\x1b[0m`);
  process.exit(1);
} else {
  console.log(`  \x1b[32m0 errors, ${warnings} warning(s) — manifest is valid\x1b[0m`);
}
console.log('');
