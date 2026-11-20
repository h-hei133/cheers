import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { WriteHookWorker } from './writeWorker.js';

const args = ['--input-type=module', '-e', `
  import { writeFileSync } from 'node:fs';
  import { createInterface } from 'node:readline';
  let eofFile;
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    if (request.params.mode === 'close') break;
    if (request.params.mode === 'stall') continue;
    const id = request.params.mode === 'foreign' ? request.id + 1 : request.id;
    eofFile = request.params.eofFile;
    process.stdout.write(JSON.stringify({jsonrpc:'2.0', id, result:{pid:process.pid, params:request.params}}) + '\\n');
  }
  if (eofFile) writeFileSync(eofFile, 'closed');
`];

describe('write hook worker', () => {
  it('lets the host process exit with an idle connection', async () => {
    const workerModule = new URL('./writeWorker.ts', import.meta.url).href;
    const source = `
      import { WriteHookWorker } from ${JSON.stringify(workerModule)};
      const worker = new WriteHookWorker();
      const result = await worker.request({
        program: process.execPath, args: ${JSON.stringify(args)}, cwd: process.cwd(), key: 'idle'
      }, '{}', 2000);
      process.stdout.write(result ?? '');
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { timeout: 4000 });
    expect(JSON.parse(stdout).params).toEqual({});
  });

  it('closes stdin so a retiring worker can finish at EOF', async () => {
    const root = join(tmpdir(), 'cheers-test');
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, 'write-worker-'));
    const eofFile = join(directory, 'eof');
    const worker = new WriteHookWorker();
    try {
      const target = { program: process.execPath, args, cwd: process.cwd(), key: 'graceful' };
      expect(await worker.request(target, JSON.stringify({ eofFile }), 2000)).toBeDefined();
      worker.close();
      await vi.waitFor(async () => expect(await readFile(eofFile, 'utf8')).toBe('closed'));
    } finally {
      worker.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reuses one process for the same binding and retires it when the binding changes', async () => {
    const worker = new WriteHookWorker();
    const target = { program: process.execPath, args, cwd: process.cwd(), key: 'session-a' };
    try {
      const first = JSON.parse((await worker.request(target, '{"content":"a"}', 2_000))!);
      const second = JSON.parse((await worker.request(target, '{"content":"b"}', 2_000))!);
      expect(second).toEqual({ pid: first.pid, params: { content: 'b' } });
      const next = JSON.parse((await worker.request({ ...target, key: 'session-b' }, '{}', 2_000))!);
      expect(next.pid).not.toBe(first.pid);
    } finally { worker.close(); }
  });

  it.each(['foreign', 'close', 'stall'])('retires on a %s response and permits an independent retry', async mode => {
    const worker = new WriteHookWorker();
    const target = { program: process.execPath, args, cwd: process.cwd(), key: 'session' };
    try {
      expect(await worker.request(target, JSON.stringify({ mode }), 300)).toBeUndefined();
      expect(JSON.parse((await worker.request(target, '{}', 2_000))!).params).toEqual({});
    } finally { worker.close(); }
  });
});
