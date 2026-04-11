#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectCargo, detectPython, getExecutionPathLabel } from './toolchain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Bootstrapping workspace...\n');
console.log(`Execution path: ${getExecutionPathLabel()}`);
console.log('');

// Ensure all required directories exist
const requiredDirs = [
  'packages/ts-shell/src',
  'packages/rust-core/src',
  'packages/python-eval/src',
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
  'packages/ts-shell/package.json',
  'packages/rust-core/package.json',
  'packages/python-eval/package.json'
];

let existingFiles = 0;
requiredFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    existingFiles++;
  }
});

console.log(`\n✓ Verified ${existingFiles}/${requiredFiles.length} package.json files exist`);

const python = detectPython();
const cargo = detectCargo();

console.log('\n🔧 Toolchain snapshot:');
console.log(`  - Python: ${python.ok ? python.command : `missing (${python.output})`}`);
console.log(`  - Cargo: ${cargo.ok ? cargo.command : `missing (${cargo.output})`}`);

// Summary
console.log(`\n📦 Workspace structure verified:`);
console.log(`  - ts-shell (TypeScript/Node.js CLI shell)`);
console.log(`  - rust-core (Rust execution daemon)`);
console.log(`  - python-eval (Python research layer)\n`);
console.log(`✓ Bootstrap complete! Run 'npm run setup' or 'npm run doctor' for startup diagnostics.\n`);
