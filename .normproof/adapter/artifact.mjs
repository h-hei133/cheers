import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const contract = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/adapter/contract.json')));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function requireDigest(bytes, expected, label) {
  if (digest(bytes) !== expected) throw new Error(`stale_artifact: ${label}`);
}

export function requireRuntime(version) {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 20 || major === 20 && minor < 3) {
    throw new Error('unsupported_runtime: adapter requires Node >=20.3.0');
  }
}

export function readBundleMetadata() {
  const bytes = fs.readFileSync(path.join(repository, '.normproof/bundle.json'));
  requireDigest(bytes, contract.bundleMetadataSha256, 'bundle metadata');
  const metadata = JSON.parse(bytes);
  if (metadata?.version === 1 && contract.version === '1.0.0') return metadata;
  validateUpstreamMetadata(metadata);
  return metadata;
}

const requiredMembers = [
  'package/package.json',
  'package/dist/adapters/cli/normproof.js',
  'package/dist/adapters/sidecar-file/module-graph.js',
  'package/dist/contracts/sidecar/graph-budget.js',
  'package/dist/engine/proof/expression/evidence-readers.js'
];

const sha256 = /^[a-f0-9]{64}$/;
const isPackageMember = value => /^package(?:\/[a-zA-Z0-9@._-]+)+\/?$/.test(value)
  && !value.split('/').some(segment => segment === '.' || segment === '..');

function validateUpstreamMetadata(metadata) {
  const keys = ['version', 'package', 'packageVersion', 'baseCommit', 'sourceArchive', 'archiveSha256', 'members'];
  if (!metadata || typeof metadata !== 'object' || metadata.version !== 2 || Object.keys(metadata).length !== keys.length
    || contract.version !== '2.0.0' || contract.mode !== 'shadow'
    || keys.some(key => !Object.hasOwn(metadata, key)) || metadata.package !== 'normproof'
    || typeof metadata.packageVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.packageVersion)
    || metadata.sourceArchive !== `.normproof/normproof-${metadata.packageVersion}.tgz`
    || typeof metadata.baseCommit !== 'string' || !/^[a-f0-9]{40}$/.test(metadata.baseCommit)
    || !sha256.test(metadata.archiveSha256) || metadata.archiveSha256 !== contract.archiveSha256
    || !metadata.members || Array.isArray(metadata.members) || typeof metadata.members !== 'object'
    || requiredMembers.some(member => !Object.hasOwn(metadata.members, member))
    || Object.entries(metadata.members).some(([member, hash]) => !isPackageMember(member) || typeof hash !== 'string' || !sha256.test(hash))) {
    throw new Error('invalid_contract: upstream archive metadata');
  }
}

export function extractUpstream(bytes, metadata, destination) {
  validateUpstreamMetadata(metadata);
  requireDigest(bytes, metadata.archiveSha256, 'archive');
  const options = { input: bytes, encoding: 'utf8', maxBuffer: contract.limits.processOutputBytes };
  const entries = execFileSync('tar', ['-tzf', '-'], options).trimEnd().split('\n');
  const descriptions = execFileSync('tar', ['-tvzf', '-'], options).trimEnd().split('\n');
  const unique = new Set(entries.map(member => member.replace(/\/$/, '')));
  if (unique.size !== entries.length || entries.length !== descriptions.length
    || entries.some(entry => !isPackageMember(entry)) || descriptions.some(description => !/^[d-]/.test(description))
    || Object.keys(metadata.members).some(member => !unique.has(member))) {
    throw new Error('invalid_archive: unexpected package members');
  }
  execFileSync('tar', ['-xzf', '-', '--no-same-owner', '--no-same-permissions', '-C', destination], options);
  for (const [member, hash] of Object.entries(metadata.members)) {
    requireDigest(fs.readFileSync(path.join(destination, member)), hash, member);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(destination, 'package/package.json')));
  if (pkg.name !== metadata.package || pkg.version !== metadata.packageVersion
    || pkg.engines?.node !== contract.packageNodeEngine || pkg.dependencies?.typescript !== contract.parserVersion) {
    throw new Error('invalid_contract: package identity, runtime or parser dependency');
  }
  return { archiveSha256: metadata.archiveSha256, sourceCommit: metadata.baseCommit, members: metadata.members,
    parserVersion: contract.parserVersion, packageNodeEngine: pkg.engines.node, node: process.version };
}

/** Byte identity only: this walk makes no claim about dependencies or proof. */
export function sourceSnapshot(workspace) {
  const members = {};
  const pending = [path.join(workspace, 'packages')];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !['node_modules', 'dist', '.git', '.tmp'].includes(entry.name)) pending.push(file);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) members[path.relative(workspace, file)] = digest(fs.readFileSync(file));
    }
  }
  const sorted = Object.fromEntries(Object.entries(members).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return { sha256: digest(JSON.stringify(sorted)), files: Object.keys(sorted).length };
}

/** Verify deployment bytes, never import the independent producer's source tree. */
function extractPatched(metadata, destination) {
  const archive = path.join(repository, metadata.sourceArchive);
  requireDigest(fs.readFileSync(archive), contract.archiveSha256, 'archive');
  const patch = fs.readFileSync(path.join(repository, metadata.patch));
  requireDigest(patch, metadata.patchSha256, 'patch');
  const headers = patch.toString().split('\n').filter(line => line.startsWith('@@'));
  if (contract.mode !== 'shadow' || headers.length !== contract.hunks.length
    || headers.some((header, index) => header !== contract.hunks[index].header)
    || contract.hunks.some(hunk => !hunk.owner || !hunk.refresh || !hunk.returnDate || !hunk.conformance?.length)) {
    throw new Error('invalid_contract: every hunk needs an owner, conformance and dated refresh path; mode must be shadow');
  }
  for (const [limit, value] of Object.entries(metadata.limits)) {
    if (contract.limits[limit] !== value) throw new Error(`invalid_contract: ${limit}`);
  }
  if (metadata.vendor.version !== contract.parserVersion) throw new Error('invalid_contract: parser version');
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: contract.limits.processOutputBytes }).trim().split('\n');
  if (entries.some(entry => !entry.startsWith('package/') || entry.split('/').includes('..'))) {
    throw new Error('invalid_archive: member outside package');
  }
  execFileSync('tar', ['-xzf', archive, '-C', destination]);
  for (const [member, hashes] of Object.entries(metadata.members)) {
    requireDigest(fs.readFileSync(path.join(destination, member)), hashes.after, member);
  }
  for (const vendor of metadata.vendor.files) {
    requireDigest(fs.readFileSync(path.join(destination, vendor.target)), vendor.sha256, vendor.target);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(destination, 'package/package.json')));
  if (pkg.engines.node !== contract.packageNodeEngine) throw new Error('invalid_contract: package Node engine');
  return { archiveSha256: digest(fs.readFileSync(archive)), patchSha256: digest(patch),
    members: Object.fromEntries(Object.keys(metadata.members).map(member => [member, digest(fs.readFileSync(path.join(destination, member)))])),
    parserVersion: contract.parserVersion, packageNodeEngine: pkg.engines.node, node: process.version, hunks: headers.length };
}

export function extractPinned(destination) {
  requireRuntime(process.version);
  const metadata = readBundleMetadata();
  const identity = metadata.version === 1 && contract.version === '1.0.0'
    ? extractPatched(metadata, destination)
    : extractUpstream(fs.readFileSync(path.join(repository, metadata.sourceArchive)), metadata, destination);
  const artifact = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/write-gate/artifact.json')));
  if (artifact.sha256 !== contract.writeArtifactSha256 || artifact.nodeFloor !== contract.nodeFloor) {
    throw new Error('stale_artifact: write provenance');
  }
  requireDigest(fs.readFileSync(path.join(repository, artifact.path)), contract.writeArtifactSha256, 'write CLI');
  return { ...identity, writeArtifactSha256: artifact.sha256, writeProvenance: artifact.provenance };
}
