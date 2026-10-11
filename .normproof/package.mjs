#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, '.normproof/bundle.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function contained(value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Archive paths must remain inside this repository.');
  return resolved;
}

const [source, output, extra] = process.argv.slice(2);
if (!source || !output || extra) throw new Error('Usage: node .normproof/package.mjs <original-archive> <output-archive>');
const sourcePath = contained(source);
const outputPath = contained(output);
if (sourcePath === outputPath) throw new Error('The original archive and output must be distinct.');
if (hash(await readFile(sourcePath)) !== metadata.sourceSha256) throw new Error('Original archive SHA-256 does not match the declared baseline.');
const patchPath = contained(metadata.patch);
if (hash(await readFile(patchPath)) !== metadata.patchSha256) throw new Error('Patch SHA-256 does not match the declared adaptation.');

const temporary = await mkdtemp(path.join(root, '.normproof/.package-'));
try {
  execFileSync('tar', ['-xzf', sourcePath, '-C', temporary]);
  for (const [file, digest] of Object.entries(metadata.members)) {
    if (hash(await readFile(path.join(temporary, file))) !== digest.before) throw new Error(`Baseline member mismatch: ${file}`);
  }
  execFileSync('patch', ['--batch', '--fuzz=0', '-p1', '-d', temporary, '-i', patchPath]);
  for (const [file, digest] of Object.entries(metadata.members)) {
    if (hash(await readFile(path.join(temporary, file))) !== digest.after) throw new Error(`Adapted member mismatch: ${file}`);
  }
  for (const vendor of metadata.vendor.files) {
    const bytes = await readFile(contained(vendor.source));
    if (hash(bytes) !== vendor.sha256) throw new Error(`Pinned parser input mismatch: ${vendor.source}`);
    const target = path.resolve(temporary, vendor.target);
    if (!target.startsWith(path.join(temporary, 'package') + path.sep)) throw new Error('Vendor targets must remain inside the package.');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o644 });
    await chmod(target, 0o644);
  }
  const archive = path.join(temporary, 'adapted.tgz');
  execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', archive, '-C', temporary, 'package']);
  const sha256 = hash(await readFile(archive));
  if (metadata.archiveSha256 && sha256 !== metadata.archiveSha256) throw new Error('Rebuilt archive differs from the recorded release artifact.');
  await rename(archive, outputPath);
  console.log(JSON.stringify({ sha256, adaptedMembers: Object.keys(metadata.members).length }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
