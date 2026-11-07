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
export function extractPinned(destination) {
  requireRuntime(process.version);
  const metadataBytes = fs.readFileSync(path.join(repository, '.normproof/bundle.json'));
  requireDigest(metadataBytes, contract.bundleMetadataSha256, 'bundle metadata');
  const metadata = JSON.parse(metadataBytes);
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
  const artifact = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/write-gate/artifact.json')));
  if (artifact.sha256 !== contract.writeArtifactSha256 || artifact.nodeFloor !== contract.nodeFloor) {
    throw new Error('stale_artifact: write provenance');
  }
  requireDigest(fs.readFileSync(path.join(repository, artifact.path)), contract.writeArtifactSha256, 'write CLI');
  const pkg = JSON.parse(fs.readFileSync(path.join(destination, 'package/package.json')));
  if (pkg.engines.node !== contract.packageNodeEngine) throw new Error('invalid_contract: package Node engine');
  return { archiveSha256: digest(fs.readFileSync(archive)), patchSha256: digest(patch),
    members: Object.fromEntries(Object.keys(metadata.members).map(member => [member, digest(fs.readFileSync(path.join(destination, member)))])),
    parserVersion: contract.parserVersion, packageNodeEngine: pkg.engines.node, node: process.version,
    writeArtifactSha256: artifact.sha256, writeProvenance: artifact.provenance, hunks: headers.length };
}
