#!/usr/bin/env node
/**
 * Linux PTY smoke for the interactive slash-command path, for both shipped
 * launch forms when the executable exists.
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
const targets = [
  { name: 'node', command: process.execPath, args: [path.join(root, 'dist/cli.js')] },
  { name: 'exe', command: path.join(root, 'dist/bin/cheers'), args: [] },
].filter(target => fs.existsSync(target.name === 'node' ? target.args[0] : target.command));

async function smoke(target) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-project-'));
  fs.mkdirSync(path.join(project, '.git'));
  const child = spawn('script', ['-qec', [target.command, ...target.args].map(part => JSON.stringify(part)).join(' '), '/dev/null'],
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
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${target.name} pty slash command (exit ${code}, ${output.length} bytes)\n`);
    if (!ok) { process.stdout.write(clean.slice(-2000)); process.exitCode = 1; }
  } finally {
    fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true });
  }
}

for (const target of targets) await smoke(target);
if (targets.length === 0) { console.error('Build first: npm run build:ts'); process.exit(2); }
