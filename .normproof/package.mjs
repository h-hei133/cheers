#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { contract, digest, extractUpstream, readBundleMetadata, repository, requireDigest, requireRuntime } from './adapter/artifact.mjs';

const metadataPath = '.normproof/bundle.json';
const contractPath = '.normproof/adapter/contract.json';
const hooksPath = '.agents/hooks.json';
const gates = {
  write: { event: 'PreToolUse', hook: 'writeGate', directory: 'write-gate' },
  stop: { event: 'Stop', hook: 'completionGate', directory: 'completion-gate' },
};
const sha256 = /^[a-f0-9]{64}$/;
const fullCommit = /^[a-f0-9]{40}$/;
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const shape = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
class RefreshRollbackError extends Error {}

function localFile(file) {
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file) throw new Error('Expected a local regular file.');
  return fs.readFileSync(file);
}

function inputPath(value) {
  return /^(?:src|node_modules)\/[a-zA-Z0-9@._/-]+$/.test(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export function prepareRefresh(directory, commit, extracted, current) {
  const read = name => localFile(path.join(directory, name));
  const record = JSON.parse(read('artifacts.json'));
  const { packageVersion, archive } = record;
  if (!shape(record, ['version', 'package', 'packageVersion', 'sourceCommit', 'nodeFloor', 'packageNodeEngine',
    'parserVersion', 'archive', 'write', 'stop']) || record.version !== 1 || record.package !== 'normproof'
    || !fullCommit.test(commit) || record.sourceCommit !== commit || packageVersion !== current.metadata.packageVersion
    || record.nodeFloor !== contract.nodeFloor || record.packageNodeEngine !== contract.packageNodeEngine
    || record.parserVersion !== contract.parserVersion
    || !shape(archive, ['file', 'sha256', 'members']) || archive.file !== `normproof-${packageVersion}.tgz`
    || !shape(archive.members, Object.keys(current.metadata.members))) {
    throw new Error('The artifact packet does not match the requested source and runtime.');
  }
  const metadata = json({ ...current.metadata, baseCommit: commit, archiveSha256: archive.sha256, members: archive.members });
  const archiveBytes = read(archive.file);
  extractUpstream(archiveBytes, JSON.parse(metadata), extracted, archive.sha256);
  const hooks = structuredClone(current.hooks);
  const replacements = new Map([[current.metadata.sourceArchive, archiveBytes], [metadataPath, metadata]]);
  const bundledGates = {};
  for (const [name, spec] of Object.entries(gates)) {
    const gate = record[name];
    const entry = `src/adapters/${spec.directory}/hook.ts`;
    if (!shape(gate, ['file', 'sha256', 'entry', 'bundler', 'inputs']) || gate.file !== `${name}.mjs`
      || typeof gate.sha256 !== 'string' || !sha256.test(gate.sha256) || gate.entry !== entry
      || typeof gate.bundler !== 'string' || !/^esbuild@\d+\.\d+\.\d+$/.test(gate.bundler)
      || !gate.inputs || !Object.hasOwn(gate.inputs, entry)
      || Object.entries(gate.inputs).some(([file, hash]) => !inputPath(file) || typeof hash !== 'string' || !sha256.test(hash))) {
      throw new Error('Invalid gate artifact provenance.');
    }
    const matches = hooks.hooks[spec.event].flatMap(group => group.hooks).filter(hook => Object.hasOwn(hook, spec.hook));
    const descriptor = matches[0]?.[spec.hook];
    const file = `.normproof/${spec.directory}/cli.mjs`;
    const { provenance: _previousProvenance, ...prior } = current.descriptors[name];
    if (matches.length !== 1 || descriptor?.path !== file || !shape(descriptor, Object.keys(prior))
      || Object.entries(prior).some(([key, value]) => descriptor[key] !== value)) {
      throw new Error('The native gate declaration differs from the current pin.');
    }
    const bytes = read(gate.file);
    requireDigest(bytes, gate.sha256, `${name} CLI`);
    bundledGates[name === 'write' ? 'write' : 'stop'] = {
      sha256: gate.sha256,
      bytes: bytes.length,
      data: brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).toString('base64'),
    };
    descriptor.sha256 = gate.sha256;
    replacements.set(file, bytes);
    const inputs = Object.fromEntries(Object.entries(gate.inputs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    replacements.set(`.normproof/${spec.directory}/artifact.json`, json({ ...descriptor, provenance: {
      package: record.package, commit, entry, bundler: gate.bundler, inputs,
    } }));
  }
  replacements.set(contractPath, json({ ...contract, bundleMetadataSha256: digest(metadata), archiveSha256: archive.sha256,
    writeArtifactSha256: record.write.sha256, completionArtifactSha256: record.stop.sha256 }));
  replacements.set(hooksPath, json(hooks));
  replacements.set('packages/ts-shell/src/core/hooks/assets.json', json({
    version: 1,
    sourceCommit: commit,
    gates: bundledGates,
  }));
  return replacements;
}

function replaceFiles(replacements, temporary) {
  const files = [...replacements].map(([relative, bytes], index) => {
    const target = path.join(repository, relative);
    const original = localFile(target);
    const mode = fs.statSync(target).mode & 0o777;
    const source = path.join(temporary, `new-${index}`);
    const backup = path.join(temporary, `old-${index}`);
    fs.writeFileSync(source, bytes, { flag: 'wx', mode });
    fs.writeFileSync(backup, original, { flag: 'wx', mode });
    fs.chmodSync(source, mode);
    fs.chmodSync(backup, mode);
    return { target, source, backup, original, bytes };
  });
  fs.writeFileSync(path.join(temporary, 'restore.json'), json(files.map(file => ({
    target: path.relative(repository, file.target), backup: path.basename(file.backup),
    originalSha256: digest(file.original), replacementSha256: digest(file.bytes),
  }))), { flag: 'wx', mode: 0o600 });
  const installed = [];
  try {
    for (const file of files) {
      if (!localFile(file.target).equals(file.original)) throw new Error('The current pin changed during refresh.');
      fs.renameSync(file.source, file.target);
      installed.push(file);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const file of installed.reverse()) {
      try {
        if (!localFile(file.target).equals(file.bytes)) throw new Error('The installed file changed.');
        fs.renameSync(file.backup, file.target);
      } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) throw new RefreshRollbackError(`Artifact refresh rollback incomplete. Originals and digests are in ${temporary}.`, { cause: error });
    throw error;
  }
}

function refresh(source, commit) {
  requireRuntime(process.version);
  const scratch = path.join(repository, '.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  if (fs.realpathSync(scratch) !== scratch) throw new Error('The packaging scratch directory must be local.');
  const lock = path.join(scratch, 'normproof-package.lock');
  fs.mkdirSync(lock, { mode: 0o700 });
  let temporary;
  let keepRecovery = false;
  try {
    temporary = fs.mkdtempSync(path.join(scratch, 'normproof-package-'));
    const directory = path.join(temporary, 'artifacts');
    const producer = path.join(source, 'scripts/package-artifacts.mjs');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: source, encoding: 'utf8' });
    if (revision !== commit || status) throw new Error('Use a clean source checkout at the requested commit.');
    execFileSync(process.execPath, [producer, commit, directory], { cwd: source, timeout: 180_000 });
    const extracted = fs.mkdtempSync(path.join(temporary, 'unpack-'));
    const read = relative => JSON.parse(localFile(path.join(repository, relative)));
    const current = { metadata: readBundleMetadata(), hooks: read(hooksPath), descriptors: Object.fromEntries(
      Object.entries(gates).map(([name, { directory }]) => [name, read(`.normproof/${directory}/artifact.json`)])) };
    replaceFiles(prepareRefresh(directory, commit, extracted, current), temporary);
    console.log(JSON.stringify({ sourceCommit: commit, archiveSha256: read(metadataPath).archiveSha256 }));
  } catch (error) {
    keepRecovery = error instanceof RefreshRollbackError;
    throw error;
  } finally {
    if (temporary && !keepRecovery) fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmdirSync(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [checkout, commit, extra] = process.argv.slice(2);
  if (!checkout || !fullCommit.test(commit ?? '') || extra) {
    throw new Error('Usage: node .normproof/package.mjs <clean-source-checkout> <commit>');
  }
  refresh(fs.realpathSync(checkout), commit);
}
