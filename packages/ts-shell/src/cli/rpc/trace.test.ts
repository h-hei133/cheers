import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { RotatingFileSink } from '../../observability/rotatingFileSink.js';
import { JsonlTraceStore } from '../../observability/tracing/jsonlStore.js';
import { InMemoryTraceStore } from '../../observability/tracing/span.js';
import { sourceTsxArgs } from '../../test-utils/cli/process.js';

it('continues a client trace on one RPC prompt in an independent CLI process', async () => {
  const temporary = '/tmp/cheers-test';
  fs.mkdirSync(temporary, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporary, 'rpc-trace-'));
  const home = path.join(directory, 'home');
  const workspace = path.join(directory, 'work');
  fs.mkdirSync(home);
  fs.mkdirSync(workspace);
  const sender = new InMemoryTraceStore();
  await sender.startSpan({ name: 'rpc.client' }, () => {});
  const parent = sender.snapshot()[0]!;
  const traceParent = ['00', parent.traceId, parent.id, '01'].join('-');
  const malformed = `${traceParent}-invalid`;
  const cli = fileURLToPath(new URL('../../entrypoints/cli.tsx', import.meta.url));
  const child = spawn(process.execPath, [...sourceTsxArgs, cli, '--rpc', '--offline', '--project', workspace,
    '--no-context-files', '--no-skills', '--no-tools'], {
    cwd: workspace, env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home,
      TMPDIR: directory, CHEERS_TEST_ROOT: directory, GIT_CEILING_DIRECTORIES: directory,
      CHEERS_PROVIDER_MODE: 'synthetic', TSX_DISABLE_CACHE: '1' },
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const lines = createInterface({ input: child.stdout, terminal: false });
  const statuses: unknown[] = [];
  const starts: Array<{ readonly prompt: string; readonly sessionId: string }> = [];
  const accepted = new Map<string, boolean>();
  const completion = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  void completion.catch(() => {});
  child.stdin.on('error', () => {});
  const terminate = () => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch { /* The process may have already closed. */ }
  };
  const timeout = setTimeout(terminate, 15_000);
  try {
    child.stdin.write([
      { id: 'malformed', type: 'prompt', message: 'unaccepted input', traceParent: malformed },
      { id: 'traced', type: 'prompt', message: 'first accepted input', traceParent,
        workspaceRoot: 'untrusted-workspace', sessionId: 'untrusted-session' },
      { id: 'ordinary', type: 'prompt', message: 'second accepted input' },
    ].map(frame => JSON.stringify(frame) + '\n').join(''));
    for await (const line of lines) {
      expect(line.includes(traceParent)).toBe(false);
      const frame = JSON.parse(line);
      if (frame.type === 'response') accepted.set(frame.id, frame.success);
      if (frame.type === 'agent_start') starts.push({ prompt: frame.prompt, sessionId: frame.sessionId });
      if (frame.type === 'agent_end') {
        statuses.push(frame.status);
        if (statuses.length === 2) child.stdin.end();
      }
    }
    expect(await completion).toBe(0);
    expect(accepted).toEqual(new Map([['malformed', false], ['traced', true], ['ordinary', true]]));
    expect(statuses).toEqual(['completed', 'completed']);
    expect(starts.map(start => start.prompt)).toEqual(['first accepted input', 'second accepted input']);
    expect(starts[0]?.sessionId).toEqual(expect.any(String));
    expect(starts[0]?.sessionId).not.toBe('untrusted-session');
    expect(starts[1]?.sessionId).toBe(starts[0]?.sessionId);
    const sink = new RotatingFileSink({ logDir: path.join(home, '.cheers', 'logs') });
    const spans = new JsonlTraceStore({ sink, sessionId: starts[0]?.sessionId, workspaceRoot: workspace }).readAllSpans();
    const runs = spans.filter(span => span.name === 'session.run');
    expect(runs).toHaveLength(2);
    const traced = runs.find(span => span.traceId === parent.traceId);
    const ordinary = runs.find(span => span.traceId !== parent.traceId);
    expect(traced?.parentId).toBe(parent.id);
    expect(ordinary).toBeDefined();
    expect(ordinary?.parentId).toBeUndefined();
    expect(traced?.attributes.sessionId).toBe(ordinary?.attributes.sessionId);
    expect(sink.getRecentLines(200).join('\n').includes(traceParent)).toBe(false);
  } finally {
    clearTimeout(timeout);
    lines.close();
    if (child.exitCode === null) terminate();
    await completion.catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
