#!/usr/bin/env node
/**
 * Process-startup benchmark for the two shipped launch forms.
 *
 * This measures wall time from spawn to exit for `--version`, one fresh process
 * per sample. It does not measure the interactive first frame or key latency:
 * those need a PTY and a ready signal, and this repository has no PTY
 * dependency. The first sample is reported separately because the OS page cache
 * cannot be dropped without privileges; treat it as "first", not a controlled
 * cold-cache run.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = Math.max(2, Number(process.env.BENCH_RUNS ?? 30));
const targets = [
  { name: 'node', command: process.execPath, args: [path.join(root, 'dist/cli.js'), '--version'] },
  { name: 'exe', command: path.join(root, 'dist/bin/cheers'), args: ['--version'] },
].filter(target => fs.existsSync(target.name === 'node' ? target.args[0] : target.command));

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
async function sample(target) {
  const start = performance.now();
  await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { stdio: 'ignore' });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${target.name} exited ${code}`)));
    child.on('error', reject);
  });
  return performance.now() - start;
}

const report = [];
for (const target of targets) {
  const samples = [];
  for (let index = 0; index < runs; index++) samples.push(await sample(target));
  const sorted = [...samples].sort((a, b) => a - b);
  report.push({ target: target.name, runs, firstMs: Number(samples[0].toFixed(1)), p50Ms: Number(percentile(sorted, 50).toFixed(1)),
    p95Ms: Number(percentile(sorted, 95).toFixed(1)), minMs: Number(sorted[0].toFixed(1)), maxMs: Number(sorted[sorted.length - 1].toFixed(1)) });
}
if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else for (const row of report) console.log(`${row.target}: runs=${row.runs} first=${row.firstMs}ms p50=${row.p50Ms}ms p95=${row.p95Ms}ms min=${row.minMs}ms max=${row.maxMs}ms`);
