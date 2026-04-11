#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectCargo, detectPython } from './toolchain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🔍 Validating workspace structure...\n');

const errors = [];
const warnings = [];

// Check required directories
const requiredDirs = [
  { path: 'packages/ts-shell', name: 'TS Shell Layer' },
  { path: 'packages/rust-core', name: 'Rust Core Layer' },
  { path: 'packages/python-eval', name: 'Python Eval Layer' },
  { path: 'contracts', name: 'Boundary Contracts' }
];

requiredDirs.forEach(({ path: dirPath, name }) => {
  const fullPath = path.join(rootDir, dirPath);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ ${name} exists (${dirPath})`);
  } else {
    errors.push(`Missing required directory: ${dirPath} (${name})`);
  }
});

// Check required files
const requiredFiles = [
  { path: 'package.json', name: 'Root package.json' },
  { path: 'packages/ts-shell/package.json', name: 'TS Shell package.json' },
  { path: 'packages/rust-core/package.json', name: 'Rust Core package.json' },
  { path: 'packages/python-eval/package.json', name: 'Python Eval package.json' },
  { path: 'packages/ts-shell/src/index.ts', name: 'TS Shell entry point', optional: true },
  { path: 'packages/rust-core/Cargo.toml', name: 'Rust Cargo.toml', optional: true },
  { path: 'packages/python-eval/pyproject.toml', name: 'Python pyproject.toml', optional: true }
];

requiredFiles.forEach(({ path: filePath, name, optional }) => {
  const fullPath = path.join(rootDir, filePath);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ ${name}`);
  } else if (!optional) {
    errors.push(`Missing required file: ${filePath} (${name})`);
  } else {
    warnings.push(`Missing optional file: ${filePath} (${name})`);
  }
});

// Print results
console.log(`\n${'═'.repeat(50)}`);

const python = detectPython();
const cargo = detectCargo();

if (!python.ok) {
  warnings.push(`Python toolchain not detected: ${python.output}`);
}

if (!cargo.ok) {
  warnings.push(`Cargo toolchain not detected: ${cargo.output}`);
}

if (errors.length === 0 && warnings.length === 0) {
  console.log(`✅ PASS: Workspace structure is valid\n`);
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (${errors.length}):`);
    errors.forEach(e => {
      console.log(`  - ${e}`);
    });
  }
  if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
    warnings.forEach(w => {
      console.log(`  - ${w}`);
    });
  }
  console.log();
  process.exit(errors.length > 0 ? 1 : 0);
}
