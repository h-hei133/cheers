#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Bootstrapping workspace...\n');

// Ensure all required directories exist
const requiredDirs = [
  'packages/ts-shell/src',
  'scripts',
  '.sisyphus/evidence'
];

let createdDirs = 0;
requiredDirs.forEach(dir => {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    createdDirs++;
    console.log(`  ✓ Created ${dir}`);
  }
});

// Check that package.json files exist
const requiredFiles = [
  'package.json',
  'packages/ts-shell/package.json'
];

let existingFiles = 0;
requiredFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    existingFiles++;
  }
});

console.log(`\n✓ Verified ${existingFiles}/${requiredFiles.length} package.json files exist`);

console.log(`\n📦 Workspace structure verified:`);
console.log(`  - ts-shell (TypeScript/Node.js CLI shell)\n`);
console.log(`✓ Bootstrap complete! Run 'npm run setup' or 'npm run doctor' for startup diagnostics.\n`);
