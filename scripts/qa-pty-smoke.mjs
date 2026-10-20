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
import { createQaPtyEnvironment } from './qa-pty-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetCandidates = [
  { name: 'node', command: process.execPath, args: [path.join(root, 'dist/cli.js')] },
  { name: 'exe', command: path.join(root, 'dist/bin/cheers'), args: [] },
];
const missing = targetCandidates.filter(target => !fs.existsSync(target.name === 'node' ? target.args[0] : target.command));
if (missing.length > 0) {
  console.error(`Build first: missing ${missing.map(target => target.name).join(', ')} target`);
  process.exit(2);
}
const targets = targetCandidates.filter(target => !process.env.QA_PTY_TARGET || target.name === process.env.QA_PTY_TARGET);
const modes = process.env.QA_PTY_MODE ? [process.env.QA_PTY_MODE] : ['regular', 'fullscreen'];
if (targets.length === 0) {
  console.error(`Unknown QA_PTY_TARGET: ${process.env.QA_PTY_TARGET}`);
  process.exit(2);
}
if (modes.some(mode => mode !== 'regular' && mode !== 'fullscreen')) {
  console.error(`Unknown QA_PTY_MODE: ${process.env.QA_PTY_MODE}`);
  process.exit(2);
}

const plain = value => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const normalized = value => plain(value)
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
  .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

function waitForOutput(read, predicate, label, timeoutMs = 15_000, diagnostic) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate(read())) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        const detail = diagnostic?.();
        reject(new Error(`timed out waiting for ${label}${detail ? ` (${detail})` : ''}`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error('timed out waiting for process exit'));
    }, timeoutMs);
    const onExit = code => {
      clearTimeout(timer);
      resolve(code);
    };
    child.once('exit', onExit);
  });
}

function seedRecoverySession(home, project) {
  const sessionId = `sess_recovery_probe_${Date.now()}`;
  const sessionDir = path.join(home, '.cheers', 'sessions', sessionId);
  const timestamp = new Date().toISOString();
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'metadata.json'), JSON.stringify({
    id: sessionId,
    projectRoot: project,
    title: 'Recovery probe',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify({
    status: 'interrupted',
    projectRoot: project,
    pendingPrompt: 'Recover the interrupted probe',
    runPhase: 'idle',
    interruptedKind: 'prompt',
    pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
    thread: {
      schemaVersion: 1,
      entries: [
        { id: `${sessionId}:root`, kind: 'session-root', order: 0, timestamp },
        { id: 'turn_recovery_probe', parentId: `${sessionId}:root`, kind: 'turn-message', role: 'user', order: 1, timestamp },
      ],
      activeLeafId: 'turn_recovery_probe',
      branches: [],
      compactions: [],
    },
  }));
  fs.writeFileSync(path.join(sessionDir, 'transcript.jsonl'), [
    JSON.stringify({ type: 'session', version: 1, id: sessionId, timestamp, cwd: project }),
    JSON.stringify({ type: 'message', id: 'turn_recovery_probe', role: 'user', content: 'Recover the interrupted probe', timestamp }),
    JSON.stringify({ type: 'lifecycle', id: 'evt_recovery_probe', event: 'run-interrupted', timestamp, detail: 'Recover the interrupted probe' }),
  ].join('\n') + '\n');
  return sessionId;
}

async function smoke(target, mode) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pty-project-'));
  fs.mkdirSync(path.join(project, '.git'));
  fs.mkdirSync(path.join(home, '.cheers'), { recursive: true });
  fs.writeFileSync(path.join(home, '.cheers', 'config.json'), JSON.stringify({ tuiMode: mode }));
  const sessionId = seedRecoverySession(home, project);
  const command = `stty rows 60 cols 120; ${[target.command, ...target.args].map(part => JSON.stringify(part)).join(' ')}`;
  const child = spawn('script', ['-qec', command, '/dev/null'],
    { cwd: project, env: createQaPtyEnvironment(home, project) });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
  const read = () => plain(output);
  const send = text => child.stdin.write(text);
  const hardTimeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
  try {
    await waitForOutput(read, value => value.includes('Cheers') && value.includes(sessionId) && value.includes('Recovery hint'),
      'first frame and recovery hint', 15_000);
    const initial = read();
    const firstFrame = initial.indexOf('Cheers');
    const recoveryHint = initial.indexOf('Recovery hint');
    const hintLine = initial.split('\n').find(line => line.includes('Recovery hint'));
    if (!hintLine?.includes(sessionId) || recoveryHint <= firstFrame) {
      throw new Error('recovery hint did not follow the first frame with the seeded session');
    }
    const startupIds = [...initial.matchAll(/sess_[A-Za-z0-9_]+/g)]
      .map(match => match[0]);
    const currentSessionId = startupIds.find(id => id !== sessionId);
    if (!currentSessionId) {
      throw new Error(`startup output did not expose the current session id (${startupIds.join(', ')})`);
    }

    send('/sessions current\r');
    await waitForOutput(() => normalized(output), value =>
      /Session\s+command\s+map/.test(value), 'current session command map', 15_000, () => {
      const value = normalized(output);
      return JSON.stringify({
        map: value.indexOf('Session command map'),
        ids: [...value.matchAll(/sess_[A-Za-z0-9_]+/g)].map(match => match[0]).slice(-8),
        tail: value.slice(-800),
      });
    });
    const sessions = normalized(output);
    const commandSessionId = /(?:• ID:|- ID:)\s*(sess_[A-Za-z0-9_]+)/.exec(sessions)?.[1];
    if (commandSessionId !== currentSessionId) {
      throw new Error(`current session output id ${commandSessionId ?? 'missing'} did not match startup id ${currentSessionId}`);
    }
    send('/tools\r');
    await waitForOutput(() => normalized(output), value => value.includes('Tools')
      && value.includes('bash')
      && /Esc\s+to\s+close/i.test(value), 'tools report reader');
    const tools = normalized(output);

    // Let the picker process Escape as its own key event, then send the next
    // command. A failed close leaves `/exit` with the picker and the final exit
    // wait fails, so exit 0 also proves the close transition completed.
    const closeStart = output.length;
    send('\x1b');
    await waitForOutput(() => String(output.length), value =>
      Number(value) > closeStart, 'tools report close');
    send('/exit\r');
    const code = await waitForExit(child, 10_000);
    const clean = read();
    const ok = code === 0
      && currentSessionId !== sessionId
      && initial.includes(currentSessionId)
      && tools.includes('Tools')
      && clean.includes('Session command map');
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${target.name}/${mode} pty commands (exit ${code}, ${output.length} bytes)\n`);
    if (!ok) { process.stdout.write(clean.slice(-2000)); process.exitCode = 1; }
  } catch (error) {
    const clean = read();
    process.stdout.write(`FAIL ${target.name}/${mode} pty commands (${error instanceof Error ? error.message : String(error)})\n`);
    process.stdout.write(clean.slice(-2000));
    process.exitCode = 1;
    child.kill('SIGKILL');
    await waitForExit(child, 2_000).catch(() => undefined);
  } finally {
    clearTimeout(hardTimeout);
    fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true });
  }
}

for (const target of targets) for (const mode of modes) await smoke(target, mode);
