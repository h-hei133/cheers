import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import type { TranscriptEvent } from '../../session/sessionEventCodec.js';

const run = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
type Profile = 'alpha' | 'beta';
type Mode = 'line' | 'pipe';
type Body = { model: string; messages: Array<{ role: string }> };

function environment(home: string, tmp: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    CHEERS_TEST_ROOT: tmp, CHEERS_SYNTHETIC_HOME: home, CHEERS_REAL_HOME: '',
    CHEERS_PROVIDER_MODE: 'real', NO_COLOR: '1' };
}

async function records(profile: string): Promise<Record<string, TranscriptEvent[]>> {
  const sessions = path.join(profile, 'sessions');
  return Object.fromEntries(await Promise.all((await fs.readdir(sessions)).map(async name => {
    const source = await fs.readFile(path.join(sessions, name, 'transcript.jsonl'), 'utf8');
    return [name, source.trim().split('\n').map(line => JSON.parse(line) as TranscriptEvent)];
  })));
}

it.each<Mode>(['line', 'pipe'])('%s isolates profile connections and one-time approval across fresh CLI processes', async mode => {
  const scratch = path.join(os.tmpdir(), 'cheers-test');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'profile-cli-'));
  const home = path.join(root, 'home');
  const workspace = path.join(root, 'workspace');
  const tmp = path.join(root, 'tmp');
  const roots = { alpha: path.join(home, '.cheers/profiles/alpha'), beta: path.join(home, '.cheers/profiles/beta') };
  const configBytes = new Map<Profile, string>();
  const requests: Array<{ profile: Profile; model: string; credentialMatches: boolean }> = [];
  const errors: unknown[] = [];
  const destination = path.join(workspace, 'write.txt');
  const content = 'approved fixture bytes\r\n';
  const server = createServer((request, response) => {
    void (async () => {
      response.setHeader('content-type', 'application/json');
      const profile = request.url?.split('/')[1];
      if (profile !== 'alpha' && profile !== 'beta') throw new Error('Unexpected fixture profile');
      if (request.method === 'GET' && request.url === `/${profile}/v1/models`) {
        response.end(JSON.stringify({ data: [{ id: `fixture-${profile}` }] })); return;
      }
      if (request.method !== 'POST' || request.url !== `/${profile}/v1/chat/completions`) throw new Error('Unexpected fixture route');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Body;
      requests.push({ profile, model: body.model, credentialMatches: request.headers.authorization === `Bearer local-fixture-${profile}` });
      const roles = body.messages.map(message => message.role);
      const done = roles.lastIndexOf('tool') > roles.lastIndexOf('user');
      const message = done ? { role: 'assistant', content: 'MODEL_CLAIMS_SUCCESS' } : {
        role: 'assistant', content: null, tool_calls: [{ id: 'fixture-write', type: 'function', function: {
          name: 'write', arguments: JSON.stringify({ path: destination, content }),
        } }],
      };
      response.end(JSON.stringify({ id: 'fixture', model: `fixture-${profile}`, object: 'chat.completion',
        choices: [{ index: 0, message, finish_reason: done ? 'stop' : 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
    })().catch(error => { errors.push(error); response.statusCode = 500; response.end('fixture failed'); });
  });
  try {
    for (const directory of [roots.alpha, roots.beta, workspace, tmp]) await fs.mkdir(directory, { recursive: true });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    for (const profile of ['alpha', 'beta'] as const) {
      const bytes = JSON.stringify({ provider: 'openai', agentMode: 'build',
        providerCredentials: { openai: { apiKey: `local-fixture-${profile}`,
          baseUrl: `http://127.0.0.1:${address.port}/${profile}/v1`, model: `fixture-${profile}` } } });
      configBytes.set(profile, bytes);
      await fs.writeFile(path.join(roots[profile], 'config.json'), bytes);
    }
    // Only the first and last processes receive an explicit one-time grant.
    for (const [index, profile, allowed] of [[0, 'alpha', true], [1, 'alpha', false], [2, 'beta', false], [3, 'beta', true]] as const) {
      // Grants bind the exact target. Reset the same fixture to make any leaked
      // grant observable on disk in the next process and in the other profile.
      await fs.rm(destination, { force: true });
      const other: Profile = profile === 'alpha' ? 'beta' : 'alpha';
      const before = await records(roots[profile]).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return {}; throw error;
      });
      const firstRequest = requests.length;
      const child = run(process.execPath, ['--max-old-space-size=512', path.join(repo, 'node_modules/tsx/dist/cli.mjs'),
        path.join(repo, 'packages/ts-shell/src/entrypoints/cli.tsx'), '--profile', profile, '--project', workspace,
        ...(mode === 'pipe' ? ['--print'] : []), ...(allowed ? ['--non-interactive-approval', 'allow-once'] : []),
      ], { cwd: workspace, env: environment(home, tmp), timeout: 30000, maxBuffer: 1024 * 1024 });
      child.child.stdin?.end([
        '/profile status', `/profile switch ${other}`, `/profile switch ${other} --confirm ${'0'.repeat(64)}`,
        '/profile status', `Write the requested fixture to ${destination}.`, '/exit', '',
      ].join('\n'));
      const { stdout, stderr } = await child;
      const output = stdout + stderr;
      expect(output.match(new RegExp(`Active profile: ${profile}\\.`, 'g'))).toHaveLength(2);
      expect(output.match(/A profile switch requires an interactive terminal\./g)).toHaveLength(2);
      expect(output).not.toContain('Profile switch requested:');
      expect(output).not.toContain('Target startup verified');
      expect(requests.slice(firstRequest)).toEqual([
        { profile, model: `fixture-${profile}`, credentialMatches: true },
        { profile, model: `fixture-${profile}`, credentialMatches: true },
      ]);
      const after = await records(roots[profile]);
      const appended = Object.entries(after).flatMap(([session, entries]) => {
        const previous = before[session] ?? [];
        expect(entries.slice(0, previous.length)).toEqual(previous);
        return entries.slice(previous.length);
      });
      const events = appended.flatMap(entry => entry.type === 'query-event' ? [entry.event] : []);
      expect(events.filter(event => event.type === 'approval.resolved')).toMatchObject([{ outcome: allowed ? 'approved' : 'denied' }]);
      expect(events.filter(event => event.type === 'tool.result')).toMatchObject([{ toolName: 'write', success: allowed }]);
      expect(events.filter(event => event.type === 'query.completed')).toMatchObject([{
        result: { status: allowed ? 'completed' : 'stopped_error', terminalClassification: allowed ? 'success' : 'stopped' },
      }]);
      if (allowed) expect(await fs.readFile(destination, 'utf8')).toBe(content);
      else {
        await expect(fs.stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(output).not.toContain('Outcome: success');
      }
      for (const name of ['alpha', 'beta'] as const) {
        expect(await fs.readFile(path.join(roots[name], 'config.json'), 'utf8')).toBe(configBytes.get(name));
        await expect(fs.stat(path.join(roots[name], '.handoffs'))).rejects.toMatchObject({ code: 'ENOENT' });
        const policy = await fs.readFile(path.join(roots[name], 'approval-policy.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return '{"grants":[]}'; throw error;
        });
        expect(JSON.parse(policy).grants).toEqual([]);
      }
      if (index < 2) expect(await fs.readdir(roots.beta)).toEqual(['config.json']);
    }
    expect(errors).toEqual([]);
    await expect(fs.stat(path.join(home, '.cheers/sessions'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  }
}, 120000);
