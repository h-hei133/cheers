import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { StopCheck } from '../../core/hooks/stop/model.js';
import type { QueryEvent } from '../../core/query/runtime/events.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { readableLifecycleRecord } from '../../session/transcript/lifecycle.js';
import { ArchitectureStatus } from './architecture.js';

it('projects a completed local check and drops it on unproven completion or a replaced workspace', () => {
  const scratch = fileURLToPath(new URL('../../../../../.tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(path.join(scratch, 'architecture-view-'));
  try {
    const cwd = path.join(root, 'workspace');
    mkdirSync(cwd);
    const workspaceIdentity = captureWorkspaceRoot(cwd, cwd, 'read').identity;
    const sessionId = 'session';
    const binding = { cwd, workspaceRevision: 0, configuration: { current: { revision: 1 } }, session: { id: sessionId } };
    const current = binding as Parameters<ArchitectureStatus['read']>[0];
    const status = new ArchitectureStatus();
    const check = (result: StopCheck): QueryEvent => ({ type: 'lifecycle.record', kind: 'hook_result', result,
      attemptId: 'check', sequence: 1, reentryCount: 0, stop_hook_active: false, progressFingerprint: { version: 1, checks: [] } });
    const settled = { type: 'query.completed', result: { status: 'completed' } } as QueryEvent;
    const result = { command: 'a'.repeat(64), decision: 'allow', reasonCode: 'proven', proofVerdict: 'proven', durationMs: 1,
      evidenceIdentity: ['graph'] } as const;
    expect(readableLifecycleRecord({ ...check(result), kind: 'hook_result', result: { ...result,
      architecture: { sessionId, workspaceIdentity, verdict: 'proven' } } } as never)).toBe(true);
    expect(readableLifecycleRecord({ ...check(result), kind: 'hook_result', result: { ...result,
      architecture: { sessionId, workspaceIdentity: '/project', verdict: 'proven' } } } as never)).toBe(false);
    status.observe(check(result), current);
    status.observe(settled, current);
    expect(status.read(current)).toBeUndefined();

    const proven = { ...result, architecture: { sessionId, workspaceIdentity, verdict: 'proven' } } as const;
    status.observe(check(proven), current);
    expect(status.read(current)).toBeUndefined();
    expect(status.observe(settled, current)).toBe(true);
    expect(status.read(current)).toBe('proven');

    status.observe({ type: 'query.started', sessionId, prompt: 'check' }, current);
    status.observe(check({ ...result, reasonCode: 'advisory_only', proofVerdict: 'partial',
      architecture: { sessionId, workspaceIdentity, verdict: 'partial' } }), current);
    status.observe(check(proven), current);
    status.observe(settled, current);
    expect(status.read(current)).toBe('partial');

    status.observe({ type: 'query.failed', error: 'unavailable' }, current);
    expect(status.read(current)).toBeUndefined();
    status.observe(check(proven), current);
    status.observe(settled, current);
    binding.workspaceRevision++;
    expect(status.read(current)).toBeUndefined();

    status.observe(check(proven), current);
    status.observe(settled, current);
    renameSync(cwd, path.join(root, 'old'));
    mkdirSync(cwd);
    expect(status.read(current)).toBeUndefined();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
