import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { sha256 } from './identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = path.join(root, 'docs/architecture/hooks/evidence/capabilities');
const matrixFile = path.join(directory, 'matrix.json');
const matrix = JSON.parse(fs.readFileSync(matrixFile));
matrix.rows = matrix.rows.filter(row => !['ci-success', 'ci-failure', 'ci-watch'].includes(row.id));

function gh(id, args) {
  const result = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  const record = { command: ['gh', ...args], exitCode: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify(record, null, 2) + '\n');
  return record;
}

function historical(commit, file) {
  return execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, encoding: 'utf8' });
}

for (const [id, run] of [['ci-success', 42042720323], ['ci-failure', 41998866447], ['ci-watch', 42185837427]]) {
  const record = gh(id, ['run', 'view', String(run), '--json', 'jobs,headSha,conclusion,url']);
  if (record.exitCode !== 0) continue;
  const observed = JSON.parse(record.stdout);
  const snapshot = observed.headSha;
  const bundle = JSON.parse(historical(snapshot, '.normproof/bundle.json'));
  const archive = execFileSync('git', ['show', `${snapshot}:.normproof/normproof-0.1.0.tgz`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  if (sha256(archive) !== bundle.archiveSha256) throw new Error('Historical CI bundle identity mismatch.');
  const artifact = execFileSync('tar', ['-xzO', 'package/dist/adapters/cli/normproof.js'], { input: archive });
  const workflow = id === 'ci-watch' ? '.github/workflows/normproof-watch.yml' : '.github/workflows/ci.yml';
  const job = observed.jobs[0];
  // Retain only this public judge segment, never unrelated installation/provider logs.
  const logs = spawnSync('gh', ['api', `repos/h-hei133/cheers/actions/jobs/${job.databaseId}/logs`], { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  const lines = (logs.stdout ?? '').split('\n');
  const start = lines.findIndex(line => line.includes('##[group]Run npx --package') || line.includes('##[group]Run set +e'));
  const end = start < 0 ? -1 : lines.findIndex((line, index) => index > start + 4 && line.includes('##[group]'));
  const judgeSegment = start < 0 ? 'No judge command segment observed.\n' : lines.slice(start, end < 0 ? lines.length : end).join('\n');
  fs.writeFileSync(path.join(directory, `${id}-judge.txt`), `command: gh api repos/h-hei133/cheers/actions/jobs/${job.databaseId}/logs\nexit: ${logs.status}\n` + judgeSegment);
  matrix.rows.push({ id, status: 'observed', evidenceTier: 'remote-GitHub-Actions', surface: id === 'ci-watch' ? 'CI observation watch' : 'CI job execution', event: 'judge', tool: null,
    identity: { sourceSnapshot: { commit: snapshot, workflowSha256: sha256(historical(snapshot, workflow)) }, profile: { id: 'software-structure-v0', sha256: sha256(historical(snapshot, '.normproof/norm-packs/software-structure-v0/profile.json')) }, bundleDigest: bundle.archiveSha256, artifactSha256: sha256(artifact), artifactMember: 'package/dist/adapters/cli/normproof.js' },
    hostVersion: 'GitHub Actions recorded runner; exact job identity in output', timeoutMs: null, timeoutUnit: 'milliseconds', timeoutScope: 'workflow default; no explicit job timeout', inputFidelity: 'historical checkout; profile/archive from exact commit', failureDirection: id === 'ci-watch' ? 'explicit exit 0 observation' : 'bash -e; job outcome observed, judge-nonzero propagation unavailable',
    denyShape: 'job/step conclusion', reentry: false, canBlock: id === 'ci-watch' ? false : 'judge-nonzero propagation unavailable', output: observed, evidence: `${id}.json`, logEvidence: `${id}-judge.txt` });
}
gh('ci-protection', ['api', 'repos/h-hei133/cheers/branches/main/protection']);
fs.writeFileSync(matrixFile, JSON.stringify(matrix, null, 2) + '\n');
console.log(JSON.stringify({ remoteRows: matrix.rows.filter(row => row.evidenceTier === 'remote-GitHub-Actions').length, nonzeroAuthority: 'unavailable' }));
