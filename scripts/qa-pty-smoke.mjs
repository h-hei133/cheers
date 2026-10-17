#!/usr/bin/env node
/**
 * Linux PTY smoke for the interactive slash-command path.
 *
 * This is not a platform matrix: it proves that a real pseudo-terminal can start
 * the host, accept a command line and exit cleanly. Windows/macOS remain
 * unverified unless run there.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-home-'));
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-project-'));
fs.mkdirSync(path.join(project, '.git'));
const child = spawn('script', ['-qec', `${process.execPath} ${JSON.stringify(path.join(root, 'dist/cli.js'))}`, '/dev/null'],
  { cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home, CHEERS_PROVIDER_MODE: 'synthetic', GIT_CEILING_DIRECTORIES: os.tmpdir() } });
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
const send = (text, delay) => new Promise(resolve => setTimeout(() => { child.stdin.write(text); resolve(); }, delay));
try {
  await send('/sessions current\r', 2000);
  await send('/exit\r', 2000);
  const code = await new Promise(resolve => child.on('exit', resolve));
  const clean = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  const ok = code === 0 && clean.includes('Current session');
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} pty slash command (exit ${code}, ${output.length} bytes)\n`);
  if (!ok) { process.stdout.write(clean.slice(-2000)); process.exitCode = 1; }
} finally {
  fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true });
}
