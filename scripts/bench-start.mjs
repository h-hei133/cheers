#!/usr/bin/env node
/**
 * Process-startup benchmark for the two shipped launch forms.
 *
 * This measures wall time from spawn to exit for `--version`, one fresh process
 * per sample. It does not measure the interactive first frame or key latency:
 * those need a PTY and a ready signal, and this repository has no PTY
 * dependency. Warm and controlled global-cold modes are both reported explicitly;
 * the latter requires passwordless sudo and is intended for an ephemeral runner.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { cacheEvidence, createCacheController } from './bench/cache.mjs';
import { checkBuild } from './start-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = createCacheController();
const runs = Number(process.env.BENCH_RUNS ?? 30);
if (!Number.isSafeInteger(runs) || runs < 2) {
  console.error('BENCH_RUNS must be an integer of at least 2');
  process.exit(2);
}
const minimumRuns = 30;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/ts-shell/package.json'), 'utf8'));
const verified = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: pkg.version, executablePolicy: 'required' });
if (!verified.ok) {
  console.error(`Build first: ${verified.reason}`);
  process.exit(2);
}
const targets = [
  { name: 'node', command: process.execPath, args: [path.join(root, 'dist/cli.js'), '--version'] },
  { name: 'exe', command: path.join(root, verified.executable.path), args: ['--version'] },
];
const executable = path.join(root, verified.executable.path);
const dist = path.join(root, 'packages/ts-shell/dist');
const evidenceFiles = [path.join(root, 'dist/cli.js'), path.join(dist, 'build-manifest.json'), executable,
  verified.entry, fileURLToPath(import.meta.url), path.join(root, 'scripts', 'bench', 'cache.mjs'),
  ...verified.manifest.artifacts.map(artifact => path.join(dist, artifact.path))];
const evidence = () => evidenceFiles.map(file => createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const evidenceBefore = evidence();
const measurementSha256 = createHash('sha256').update(JSON.stringify(evidenceBefore)).digest('hex');

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
function round(value) {
  return Number(value.toFixed(1));
}
function bootstrapInterval(values, quantile, iterations = 1000) {
  const sorted = [...values].sort((left, right) => left - right);
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const resampled = Array.from({ length: sorted.length }, () => sorted[Math.floor(random() * sorted.length)])
      .sort((left, right) => left - right);
    estimates.push(percentile(resampled, quantile));
  }
  estimates.sort((left, right) => left - right);
  return { low: round(percentile(estimates, 2.5)), high: round(percentile(estimates, 97.5)) };
}
async function sample(target) {
  const cachePreparation = cache.prepare();
  const start = performance.now();
  await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { stdio: 'ignore' });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${target.name} exited ${code}`)));
    child.on('error', reject);
  });
  return { elapsedMs: performance.now() - start, cachePreparation };
}

const report = [];
const cachePreparations = [];
for (const target of targets) {
  const observations = [];
  for (let index = 0; index < runs; index++) observations.push(await sample(target));
  const samples = observations.map(observation => observation.elapsedMs);
  cachePreparations.push(...observations.map(observation => observation.cachePreparation));
  const sorted = [...samples].sort((a, b) => a - b);
  report.push({ target: target.name, runs, samples: samples.map(round), firstMs: round(samples[0]),
    p50Ms: round(percentile(sorted, 50)), p95Ms: round(percentile(sorted, 95)),
    minMs: round(sorted[0]), maxMs: round(sorted.at(-1)),
    uncertainty: { p50: bootstrapInterval(sorted, 50), p95: bootstrapInterval(sorted, 95) } });
}
if (JSON.stringify(evidence()) !== JSON.stringify(evidenceBefore)) {
  throw new Error('Build or benchmark inputs changed during measurement');
}
const output = {
  build: {
    buildId: verified.manifest.buildId,
    inputsDigest: verified.manifest.inputsDigest,
    artifactDigest: verified.manifest.artifactDigest,
    executableSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
    measurementSha256,
  },
  fixture: {
    platform: process.platform,
    architecture: process.arch,
    kernel: os.release(),
    node: process.version,
    cpu: os.cpus()[0]?.model,
    runs,
    qualifying: runs >= minimumRuns,
    cacheControl: cache.control,
    cacheEvidence: cacheEvidence(cache.control, cachePreparations, runs * targets.length),
    minimumRuns,
    note: 'One fresh process per sample; wall time from spawn to successful --version exit. global-cold runs sync and drop_caches immediately before every sample.',
  },
  report,
};
const target = process.env.BENCH_OUTPUT?.trim();
if (target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}
if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
else for (const row of report) console.log(`${row.target}: runs=${row.runs} first=${row.firstMs}ms p50=${row.p50Ms}ms p95=${row.p95Ms}ms min=${row.minMs}ms max=${row.maxMs}ms`);
