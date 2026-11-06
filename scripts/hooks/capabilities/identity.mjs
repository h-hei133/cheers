import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fileHash = file => sha256(fs.readFileSync(file));

export function treeIdentity(root, files) {
  const members = Object.fromEntries([...files].sort().map(file => [file, fileHash(path.join(root, file))]));
  return { sha256: sha256(JSON.stringify(members)), members };
}

export function sourceIdentity(root) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'packages', 'scripts', '.github/workflows', '.normproof/judge-input.json', '.normproof/evidence-manifest.json', '.normproof/write-rules.json', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  return { commit, ...treeIdentity(root, files) };
}

export function pinnedIdentity(root) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, '.normproof/write-gate/artifact.json')));
  const bundle = JSON.parse(fs.readFileSync(path.join(root, '.normproof/bundle.json')));
  const actualArtifact = fileHash(path.join(root, artifact.path));
  const actualBundle = fileHash(path.join(root, bundle.sourceArchive));
  if (actualArtifact !== artifact.sha256 || actualBundle !== bundle.archiveSha256) throw new Error('Pinned artifact or bundle identity mismatch; evidence is stale.');
  return {
    sourceSnapshot: sourceIdentity(root),
    profile: { id: 'software-structure-v0', sha256: fileHash(path.join(root, '.normproof/norm-packs/software-structure-v0/profile.json')) },
    bundleDigest: actualBundle, bundleMetadataDigest: fileHash(path.join(root, '.normproof/bundle.json')),
    artifactSha256: actualArtifact, artifactMetadataDigest: fileHash(path.join(root, '.normproof/write-gate/artifact.json')),
    artifactProvenance: artifact.provenance,
  };
}

/** Mismatched or missing identity can never preserve an observed capability. */
export function boundStatus(row, expected) {
  for (const key of ['sourceSnapshot', 'profile', 'bundleDigest', 'artifactSha256']) {
    if (row.identity?.[key] === undefined || expected[key] === undefined) return 'unknown';
    if (JSON.stringify(row.identity[key]) !== JSON.stringify(expected[key])) return 'stale';
  }
  return row.status;
}
