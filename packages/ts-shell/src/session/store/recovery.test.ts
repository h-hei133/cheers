import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isLockStale, takeOverStaleLock } from './lockStaleness.js';
import { withFileLock } from './sessionFileStore.js';

let root: string;
let lock: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-lock-')); lock = path.join(root, 'config.lock'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(['', '{"pid":', '{}', JSON.stringify({ pid: process.pid, hostname: 'another-host', createdAt: '2000-01-01' })])('never takes over an uncertain old owner: %j', text => {
  fs.writeFileSync(lock, text); fs.utimesSync(lock, new Date(0), new Date(0));
  expect(isLockStale(lock, Date.now(), 'local-dead')).toBeUndefined();
  expect(takeOverStaleLock(lock, 'local-dead')).toBe(false);
  expect(fs.readFileSync(lock, 'utf8')).toBe(text);
});

it('keeps a paused live owner and refuses uncertain liveness', () => {
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: '2000-01-01' }));
  expect(isLockStale(lock, Date.now(), 'local-dead')).toBeUndefined();
  vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
  expect(isLockStale(lock, Date.now(), 'local-dead')).toBeUndefined();
});

it('recovers only confirmed dead local ownership through the shared lock', () => {
  fs.writeFileSync(lock, JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname() }));
  expect(withFileLock(lock, () => 'entered', { recovery: 'local-dead' })).toBe('entered');
  expect(fs.readdirSync(root)).toEqual([]);
});

it('times out without entering while incomplete metadata could belong to a paused process', () => {
  fs.writeFileSync(lock, ''); fs.utimesSync(lock, new Date(0), new Date(0));
  const action = vi.fn();
  expect(() => withFileLock(lock, action, { recovery: 'local-dead' })).toThrow(/lock timeout/);
  expect(action).not.toHaveBeenCalled(); expect(fs.readFileSync(lock, 'utf8')).toBe('');
});
