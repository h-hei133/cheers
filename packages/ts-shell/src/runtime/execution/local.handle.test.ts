import { expect, it } from 'vitest';
import { startStreamed } from './local.js';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

it('detaches without killing the child or respawning it', async () => {
  const started = startStreamed({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => { console.log("late"); process.exit(0) }, 100)'],
    cwd: process.cwd(),
    onOutput: () => {},
  });
  const pid = started.handle.pid;
  expect(typeof pid).toBe('number');
  await delay(20);
  started.handle.detach();
  const result = await started.handle.result;
  expect(result.stdout).toContain('late');
  expect(started.handle.pid).toBe(pid);
});

it('keeps the lifecycle deadline after detaching', async () => {
  const started = startStreamed({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 5000)'],
    cwd: process.cwd(),
    timeoutMs: 50,
    onOutput: () => {},
  });
  await delay(10);
  started.handle.detach();
  await expect(started.handle.result).rejects.toMatchObject({ timedOut: true });
});

it('still enforces the deadline when nobody detaches', async () => {
  const started = startStreamed({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 5000)'],
    cwd: process.cwd(),
    timeoutMs: 50,
    onOutput: () => {},
  });
  await expect(started.handle.result).rejects.toMatchObject({ timedOut: true });
});

it('kills the process tree on request', async () => {
  const started = startStreamed({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 5000)'],
    cwd: process.cwd(),
    onOutput: () => {},
  });
  await delay(50);
  await started.handle.kill();
  await expect(started.handle.result).rejects.toBeDefined();
});
