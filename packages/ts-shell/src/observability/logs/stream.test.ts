import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile } from '../../core/paths/profile/context.js';
import { streamTracer } from './stream.js';

let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-stream-')); vi.stubEnv('CHEERS_STREAM_TRACE', '1'); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it('captures stream diagnostics in the selected profile and refuses a replaced owner', () => {
  const a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  const b = createProfileContext({ name: 'b', homeDir: home, env: {} });
  const first = withProfile(a, streamTracer); const second = withProfile(b, streamTracer);
  withProfile(b, () => first('A frame')); second('B frame');
  const targetA = path.join(a.root, 'logs', 'stream-trace.log'); const targetB = path.join(b.root, 'logs', 'stream-trace.log');
  expect(fs.readFileSync(targetA, 'utf8')).toBe('[stream] A frame\n');
  const before = fs.readFileSync(targetB, 'utf8');
  fs.renameSync(a.root, `${a.root}-retired`); fs.symlinkSync(b.root, a.root, 'dir');
  first('late frame'); expect(fs.readFileSync(targetB, 'utf8')).toBe(before);
});

it('does not create a log when stream tracing is disabled', () => {
  vi.stubEnv('CHEERS_STREAM_TRACE', '0');
  const profile = createProfileContext({ name: 'a', homeDir: home, env: {} });
  const trace = withProfile(profile, streamTracer); trace('disabled');
  expect(fs.readdirSync(profile.root)).toEqual([]);
});
