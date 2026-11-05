import { describe, expect, it } from 'vitest';
import { applyWriteHookPolicy, CANONICAL_WRITE_MATCHER, canonicalToolName, normalizeHookVeto, translateWriteInput, translateWriteResult } from './translation.js';
import type { PreToolUsePayload } from './types.js';

const payload: PreToolUsePayload = { eventName: 'PreToolUse', workspaceRoot: '/workspace', sessionId: 'session',
  timestamp: '2026-11-05T00:00:00Z', agentId: 'worker', toolName: 'write', toolCallId: 'call', args: { path: 'a.ts', content: '' } };

describe('canonical write translation', () => {
  it.each(['write', 'edit'])('preserves the full call and budget for %s without changing its args', toolName => {
    const input = { ...payload, toolName };
    const translated = translateWriteInput(input, 4321);
    expect(translated).toEqual({ version: 1, event: 'PreToolUse', workspaceRoot: '/workspace', sessionId: 'session',
      timestamp: payload.timestamp, agentId: 'worker', toolName, toolCallId: 'call', args: payload.args,
      timeoutMs: 4321, reentry: { supported: false, active: false }, hook_event_name: 'PreToolUse', cwd: '/workspace',
      tool_name: toolName === 'write' ? 'Write' : 'Edit', tool_input: { file_path: 'a.ts', content: '' } });
    expect(input.args).toEqual({ path: 'a.ts', content: '' });
  });
  it('uses only anchored canonical names after the host mapping', () => {
    const matcher = new RegExp(CANONICAL_WRITE_MATCHER);
    for (const name of ['write', 'edit', 'multiedit', 'notebookedit']) expect(matcher.test(canonicalToolName(name))).toBe(true);
    for (const name of ['prefixWrite', 'WriteSuffix', 'apply_patch', 'mcp__write']) expect(matcher.test(canonicalToolName(name))).toBe(false);
  });
  it.each([
    ['apply_patch', { input: '*** Begin Patch' }, 'patch_targets'],
    ['bash', { command: 'echo content' }, 'shell_effects'],
    ['mcp__files__write', { path: 'a', content: 'x' }, 'tool_semantics'],
    ['browser', { action: 'click' }, 'external_effects'],
    ['desktop', { action: 'type' }, 'external_effects'],
    ['MultiEdit', { path: 'a', edits: [{ oldText: 'x', newText: 'y' }] }, 'multiple_edits'],
    ['multiedit', { files: ['a', 'b'] }, 'multiple_edits'],
    ['NotebookEdit', { notebook_path: 'a', new_source: 'x' }, 'notebook_cells'],
    ['notebookedit', { cells: ['a', 'b'] }, 'notebook_cells'],
    ['edit', { path: 'a', oldText: 'x', newText: 'y' }, 'full_content_required'],
    ['edit', { path: 'a', content: 'decoy', edits: [] }, 'ambiguous_content'],
  ])('reports %s shape as unsupported (%s)', (toolName, args, reasonCode) => {
    const result = translateWriteInput({ ...payload, toolName: toolName as string, args: args as Record<string, unknown> }, 15000);
    expect(result).toMatchObject({ decision: 'unsupported', reason: expect.any(String), hookVerdict: { status: 'unsupported', reasonCode } });
    expect('reason' in result && result.reason!.length).toBeGreaterThan(30);
  });
  it('rejects invalid metadata without exposing it', () => {
    expect(translateWriteInput({ ...payload, args: null } as never, 0)).toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'invalid_input' } });
  });
});

describe('hook output authority', () => {
  it.each(['block', 'retry'] as const)('preserves native flat %s verbatim', decision => {
    const flat = { decision, reason: 'policy', feedback: 'repair', hookSpecificOutput: { retained: true } };
    expect(normalizeHookVeto(flat)).toBe(flat);
    expect(translateWriteResult(JSON.stringify(flat))).toEqual(flat);
  });
  it('normalizes a nested deny before considering a conflicting allow', () => {
    expect(translateWriteResult(JSON.stringify({ decision: 'allow', hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'rule denied' } })))
      .toEqual({ decision: 'block', reason: 'rule denied' });
  });
  it.each(['no_violation', 'not_configured'])('keeps explicit allow reason %s distinct', reasonCode => {
    expect(translateWriteResult(JSON.stringify({ decision: 'allow', reasonCode }))).toMatchObject({ decision: 'allow', hookVerdict: { status: 'allow', reasonCode } });
  });
  it('keeps could_not_decide unknown until the explicit Cheers block policy', () => {
    const result = translateWriteResult('{"decision":"allow","reasonCode":"could_not_decide"}');
    expect(result).toMatchObject({ decision: 'unknown', hookVerdict: { status: 'unknown', source: 'hook' } });
    expect(applyWriteHookPolicy(result)).toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', source: 'hook', policy: 'block' } });
    expect(result.decision).toBe('unknown');
  });
  it.each(['', 'payload-secret\n at private.stack', '{}', 'null', '{"decision":"allow"}', '{"decision":"allow","reasonCode":"future_version"}'])('blocks malformed or versionless output safely: %s', stdout => {
    const result = translateWriteResult(stdout);
    expect(result.decision).toBe('block');
    expect(result.hookVerdict).toMatchObject({ status: 'unknown', source: 'adapter', reasonCode: expect.any(String) });
    expect(JSON.stringify(result)).not.toMatch(/payload-secret|private\.stack|\n at /);
  });
});
