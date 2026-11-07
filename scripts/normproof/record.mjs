import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { contract, digest, repository } from '../../.normproof/adapter/artifact.mjs';

export const evidence = path.join(repository, 'docs/validation/evidence/adapter');
export function sourceIdentity() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    'packages', 'scripts', '.normproof', '.github', 'package.json', 'package-lock.json'], { cwd: repository, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  const members = Object.fromEntries(files.filter(file => fs.existsSync(path.join(repository, file)))
    .map(file => [file, digest(fs.readFileSync(path.join(repository, file)))]));
  return { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(), sha256: digest(JSON.stringify(members)), members };
}

/** Capture one serial process; command success and evidence completeness stay separate. */
export function capture(name, executable, args, env = {}) {
  const log = path.join(evidence, `${name}.txt`);
  const descriptor = fs.openSync(log, 'w');
  const start = Date.now();
  let result;
  try {
    result = spawnSync(executable, args, { cwd: repository, env: { ...process.env, ...env },
      stdio: ['ignore', descriptor, descriptor], timeout: 1800000 });
  } finally { fs.closeSync(descriptor); }
  const record = { command: [executable, ...args], cwd: repository, env, exitCode: result.status, signal: result.signal,
    error: result.error?.code ?? null, elapsedMs: Date.now() - start, output: path.relative(repository, log), outputSha256: digest(fs.readFileSync(log)) };
  fs.writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record));
  return record;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  fs.mkdirSync(evidence, { recursive: true });
  const before = sourceIdentity();
  const record = capture('acceptance', 'bash', ['-c', 'npm run verify:import-cycles && npm run check:declarations && npm run check:node-floor && npm run test:ts'],
    { NODE_OPTIONS: '--max-old-space-size=2048', VITEST_MAX_THREADS: '1', VITEST_MIN_THREADS: '1' });
  const after = sourceIdentity();
  const drift = before.sha256 !== after.sha256;
  fs.writeFileSync(path.join(evidence, 'source-members.json'), JSON.stringify(before.members, null, 2) + '\n');
  fs.writeFileSync(path.join(evidence, 'acceptance-identity.json'), JSON.stringify({ contract: contract.version, recordedAt: new Date().toISOString(),
    head: before.head, sourceSha256: before.sha256, sourceDrift: drift, runtime: process.version, platform: process.platform, arch: process.arch,
    archiveSha256: contract.archiveSha256, ...record }, null, 2) + '\n');
  process.exitCode = record.exitCode === 0 && !drift ? 0 : 1;
}
