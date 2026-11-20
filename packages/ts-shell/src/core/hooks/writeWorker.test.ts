import { describe, expect, it } from 'vitest';
import { WriteHookWorker } from './writeWorker.js';

const args = ['--input-type=module', '-e', `
  import { createInterface } from 'node:readline';
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    if (request.params.mode === 'close') break;
    if (request.params.mode === 'stall') continue;
    const id = request.params.mode === 'foreign' ? request.id + 1 : request.id;
    process.stdout.write(JSON.stringify({jsonrpc:'2.0', id, result:{pid:process.pid, params:request.params}}) + '\\n');
  }
`];

describe('write hook worker', () => {
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
