#!/usr/bin/env node
/**
 * Interactive first-frame and exit-latency benchmark.
 *
 * A pseudo-terminal is required because the interactive host paints only when
 * it owns a screen. `script` supplies one on Linux; the harness sends `/exit`
 * after a fixed settle window and reports two separate numbers: time to the
 * first painted byte, and time from that command to process exit. They are not
 * the same measurement and are not averaged together.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = Math.max(2, Number(process.env.BENCH_RUNS ?? 30));
const modes = ['regular', 'fullscreen'];
const cli = path.join(root, 'dist/cli.js');
if (!fs.existsSync(cli)) { console.error('Build first: npm run build:ts'); process.exit(2); }

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
function sample(mode) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `bench-home-${mode}-`));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), `bench-project-${mode}-`));
  fs.mkdirSync(path.join(project, '.git'));
  fs.mkdirSync(path.join(home, '.cheers'), { recursive: true });
  fs.writeFileSync(path.join(home, '.cheers', 'config.json'), JSON.stringify({ tuiMode: mode }));
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn('script', ['-qec', `${process.execPath} ${JSON.stringify(cli)}`, '/dev/null'],
      { cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home, GIT_CEILING_DIRECTORIES: os.tmpdir() } });
    let firstByte;
    child.stdout.once('data', () => { firstByte = performance.now() - started; });
    child.stdout.resume();
    child.stderr.resume();
    const exitTimer = setTimeout(() => child.stdin.write('/exit\r'), 1200);
    const hardStop = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('interactive run did not exit')); }, 15_000);
    child.on('exit', code => {
      clearTimeout(exitTimer); clearTimeout(hardStop);
      fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true });
      if (code !== 0 || firstByte === undefined) reject(new Error(`interactive run exited ${code} without a frame`));
      else resolve({ firstByte, exit: performance.now() - started });
    });
    child.on('error', reject);
  });
}

const report = [];
for (const mode of modes) {
  const samples = [];
  for (let index = 0; index < runs; index++) samples.push(await sample(mode));
  const first = samples.map(sample => sample.firstByte).sort((a, b) => a - b);
  const exit = samples.map(sample => sample.exit).sort((a, b) => a - b);
  report.push({ mode, runs, first: { first: Number(samples[0].firstByte.toFixed(1)), p50: Number(percentile(first, 50).toFixed(1)), p95: Number(percentile(first, 95).toFixed(1)) },
    exitAfterCommand: { p50: Number(percentile(exit, 50).toFixed(1)), p95: Number(percentile(exit, 95).toFixed(1)) } });
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
