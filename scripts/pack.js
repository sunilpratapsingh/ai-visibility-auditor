/**
 * Pack script — creates a .zip from dist/ for Chrome Web Store upload.
 * Run after `npm run build`.
 */

import { createWriteStream, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import archiver from 'archiver';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const zipName = `ai-visibility-auditor-v${manifest.version}.zip`;
const zipPath = join(ROOT, 'build', zipName);

if (!existsSync(DIST)) {
  console.error('\x1b[31m  dist/ not found. Run `npm run build` first.\x1b[0m');
  process.exit(1);
}

// Ensure build/ directory exists
import { mkdirSync } from 'fs';
mkdirSync(join(ROOT, 'build'), { recursive: true });

const output = createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeKB = (archive.pointer() / 1024).toFixed(1);
  console.log('');
  console.log('\x1b[32m  Pack successful\x1b[0m');
  console.log(`  File:     ${zipName}`);
  console.log(`  Size:     ${sizeKB} KB`);
  console.log(`  Output:   build/${zipName}`);
  console.log('');
  console.log('  Upload to: https://chrome.google.com/webstore/devconsole');
  console.log('');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(DIST, false);
archive.finalize();
