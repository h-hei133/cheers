import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { contract, digest, extractPinned, repository, sourceSnapshot } from './artifact.mjs';

/** One existing CLI invocation; exit 0 is observation, never a fabricated proof. */
export function runShadow(workspace, output, scratch) {
  const identity = extractPinned(scratch);
  const snapshot = sourceSnapshot(workspace);
  const input = path.join(workspace, '.normproof/judge-input.json');
  const manifestBytes = fs.readFileSync(path.join(workspace, '.normproof/evidence-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  manifest.workspace = path.resolve(path.dirname(input), manifest.workspace);
  manifest.maxFileBytes = Math.min(manifest.maxFileBytes ?? Infinity, contract.limits.sourceFileBytes);
  const projectedManifest = path.join(scratch, 'evidence-manifest.json');
  fs.writeFileSync(projectedManifest, JSON.stringify(manifest));
  // A fresh output owner prevents an earlier successful verdict from surviving a failed invocation.
  fs.mkdirSync(output, { recursive: true });
  const artifacts = fs.mkdtempSync(path.join(output, 'run-'));
  const args = [path.join(scratch, 'package/dist/adapters/cli/normproof.js'), 'judge', input, artifacts,
    '--evidence-manifest', projectedManifest];
  const run = spawnSync(process.execPath, args, { cwd: workspace, encoding: 'utf8', timeout: contract.limits.processTimeoutMs,
    maxBuffer: contract.limits.processOutputBytes });
  const verdictPath = path.join(artifacts, 'verdict.json');
  const verdictBytes = fs.existsSync(verdictPath) ? fs.readFileSync(verdictPath) : null;
  const verdict = verdictBytes ? JSON.parse(verdictBytes) : null;
  const profile = path.join(workspace, '.normproof/norm-packs/software-structure-v0/profile.json');
  const sourceChanged = snapshot.sha256 !== sourceSnapshot(workspace).sha256;
  return { contract: { name: contract.name, version: contract.version }, mode: 'shadow', canBlock: false, hostExitCode: 0,
    observation: sourceChanged ? 'stale' : run.error || run.signal || ![0, 2].includes(run.status) || !verdict ? 'unknown' : 'observed',
    reasonCode: sourceChanged ? 'source_changed' : run.error?.code ?? (run.signal ? 'process_signal' : !verdict ? 'missing_verdict' : ![0, 2].includes(run.status) ? 'process_failed' : 'judge_reported'),
    underlyingExitCode: run.status, signal: run.signal, proofVerdict: verdict?.status ?? 'not_reported',
    verdictSha256: verdictBytes ? digest(verdictBytes) : null,
    identity: { ...identity, inputSha256: digest(fs.readFileSync(input)), sourceManifestSha256: digest(manifestBytes),
      projectedManifestSha256: digest(fs.readFileSync(projectedManifest)), profileSha256: digest(fs.readFileSync(profile)),
      sourceSnapshot: snapshot },
    process: { command: [process.execPath, ...args], cwd: workspace, stdout: run.stdout, stderr: run.stderr },
    artifacts: path.relative(repository, artifacts) };
}
