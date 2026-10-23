import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupSecurityHarnesses, createSecurityHarness } from '../../test-utils/security.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { securityStore, SECURITY_SESSION_READ_LIMITS } from './store.js';
import { installSecurityRuntime, securityInspectorFor } from '../../cli/runtime/security.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';

afterEach(cleanupSecurityHarnesses);

it.each(['metadata', 'state'] as const)('admits exact %s byte limit and rejects one more before descriptor body reads', name => {
  const h = createSecurityHarness(), file = path.join(h.manager.getSessionDirPath(h.session.id), name + '.json');
  const original = fs.readFileSync(file), limit = name === 'metadata' ? SECURITY_SESSION_READ_LIMITS.metadataBytes : SECURITY_SESSION_READ_LIMITS.stateBytes;
  const store = securityStore(h.manager, () => h.session);
  fs.writeFileSync(file, Buffer.concat([original, Buffer.alloc(limit - original.length, 0x20)]));
  expect(store.read()).toEqual({ version: 1, scans: [], dispositions: [], remediations: [] });
  fs.appendFileSync(file, ' ');
  const actualRead = fs.readSync, target = fs.statSync(file), bodies: string[] = [];
  const read = vi.spyOn(fs, 'readSync').mockImplementation(((fd: number, ...args: unknown[]) => {
    const opened = fs.fstatSync(fd);
    if (opened.dev === target.dev && opened.ino === target.ino) bodies.push(file);
    return Reflect.apply(actualRead, fs, [fd, ...args]);
  }) as typeof fs.readSync), legacy = vi.spyOn(fs, 'readFileSync');
  expect(() => store.read()).toThrow('unavailable');
  expect(bodies).not.toContain(file);
  expect(legacy.mock.calls.some(([target]) => target === file)).toBe(false);
  read.mockRestore(); legacy.mockRestore();
  expect(fs.statSync(file).size).toBe(limit + 1);
  // Other original bound consumers retain their existing complete acquisition.
  expect(readBoundSessionState(h.manager, h.session).state.status).toBe('active');
  fs.writeFileSync(file, original);
  expect(store.read().scans).toEqual([]);
});

it('keeps oversized embedded session input unavailable in the runtime inspector and recovers without writes or tools', () => {
  const h = createSecurityHarness(), id = h.plan(), statePath = path.join(h.manager.getSessionDirPath(h.session.id), 'state.json');
  const original = fs.readFileSync(statePath), file = fs.readFileSync(h.file);
  const gate = vi.fn(h.host.gate), context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, gate);
  const inspector = securityInspectorFor(context)!;
  const over = Buffer.concat([original, Buffer.alloc(SECURITY_SESSION_READ_LIMITS.stateBytes + 1 - original.length, 0x20)]);
  fs.writeFileSync(statePath, over);
  expect(inspector.read()).toEqual({ state: 'unavailable' });
  expect(fs.readFileSync(statePath)).toEqual(over); expect(fs.readFileSync(h.file)).toEqual(file);
  fs.writeFileSync(statePath, original);
  expect(inspector.read()).toMatchObject({ state: 'ready', snapshot: { items: [{ id }] } });
  expect(gate).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
  expect(fs.readFileSync(statePath)).toEqual(original);
});
