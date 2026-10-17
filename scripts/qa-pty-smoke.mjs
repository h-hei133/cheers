#!/usr/bin/env node
/**
 * Linux PTY smoke for the interactive command path, across both shipped launch
 * forms and both screen modes.
 *
 * This is not a platform matrix: Windows/macOS, IME and system copy remain
 * unverified unless run there. It proves the PTY host starts, accepts local
 * commands, and exits cleanly in each mode.
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
const modes = ['regular', 'fullscreen'];

async function smoke(target, mode) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-project-'));
  fs.mkdirSync(path.join(project, '.git'));
  fs.mkdirSync(path.join(home, '.cheers'), { recursive: true });
  fs.writeFileSync(path.join(home, '.cheers', 'config.json'), JSON.stringify({ tuiMode: mode }));
  const child = spawn('script', ['-qec', [target.command, ...target.args].map(part => JSON.stringify(part)).join(' '), '/dev/null'],
    { cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home, CHEERS_PROVIDER_MODE: 'synthetic', GIT_CEILING_DIRECTORIES: os.tmpdir() } });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
  const send = (text, delay) => new Promise(resolve => setTimeout(() => { child.stdin.write(text); resolve(); }, delay));
  try {
    await send('/tools\r', 2500);
    // A report reader owns input until it is closed.
    await send('\x1b', 1000);
    await send('/sessions current\r', 1500);
    await send('/exit\r', 1500);
    const code = await new Promise(resolve => child.on('exit', resolve));
    const clean = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    const ok = code === 0 && clean.includes('bash') && clean.includes('Current session');
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${target.name}/${mode} pty commands (exit ${code}, ${output.length} bytes)\n`);
    if (!ok) { process.stdout.write(clean.slice(-2000)); process.exitCode = 1; }
  } finally {
    fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true });
  }
}

for (const target of targets) for (const mode of modes) await smoke(target, mode);
if (targets.length === 0) { console.error('Build first: npm run build:ts'); process.exit(2); }
