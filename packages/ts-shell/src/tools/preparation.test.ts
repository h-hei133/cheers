import { describe, expect, it } from 'vitest';
import { authorizeToolCall, bindPreparedToolCall, consumeToolCall, discardToolCall, preparedSelection, preparedWriteCandidate,
  preparedWriteInspection, prepareToolCall, setPreparedSelection } from './preparation.js';
import type { ToolDefinition } from './types.js';
import { translateWriteInput } from '../core/hooks/translation.js';

const candidate = { path: '/workspace/note.txt', content: 'full candidate\n', before: { state: 'exists' as const, sha256: 'a'.repeat(64) } };
const tool: ToolDefinition = { name: 'edit', description: 'fixture', argsSchema: {},
  prepare: () => ({ targets: [], preview: 'edit', writeCandidate: candidate, execute: async () => ({ success: true }) }),
  execute: async () => { throw new Error('direct execution must not run'); } };
const context = { workspaceRoot: '/workspace', taskId: 'prepare' };

describe('prepared candidate identity', () => {
  it('is unavailable before host binding, after disposal, and under cloned args or another call', async () => {
    const owner = {}, args = await prepareToolCall(tool, { path: 'note.txt', oldText: 'old', newText: 'new' }, context, owner);
    expect(preparedWriteCandidate(args, 'edit', 'call')).toBeUndefined();
    expect(() => bindPreparedToolCall(args, {}, 'edit', 'call')).toThrow('identity does not match');
    bindPreparedToolCall(args, owner, 'edit', 'call');
    expect(preparedWriteCandidate(args, 'edit', 'call')).toEqual(candidate);
    expect(preparedWriteCandidate({ ...args }, 'edit', 'call')).toBeUndefined();
    expect(preparedWriteCandidate(args, 'write', 'call')).toBeUndefined();
    expect(preparedWriteCandidate(args, 'edit', 'other')).toBeUndefined();
    expect(() => bindPreparedToolCall(args, owner, 'edit', 'other')).toThrow('identity does not match');
    discardToolCall(args); expect(preparedWriteCandidate(args, 'edit', 'call')).toBeUndefined();
  });

  it('does not expose a candidate supplied in model args', () => {
    const result = translateWriteInput({ eventName: 'PreToolUse', workspaceRoot: '/workspace', sessionId: 'session', timestamp: '',
      toolName: 'edit', toolCallId: 'call', args: { path: 'note.txt', oldText: 'old', newText: 'new', writeCandidate: candidate } }, 15000);
    expect(result).toMatchObject({ decision: 'unsupported', reasonCode: 'ambiguous_content' });
  });

  it('can only be consumed once by the approving owner, tool and call', async () => {
    const owner = {}, args = await prepareToolCall(tool, { path: 'note.txt', content: 'full candidate\n' }, context, owner);
    bindPreparedToolCall(args, owner, 'edit', 'call'); authorizeToolCall(args, owner, 'edit', 'call');
    expect(consumeToolCall(args, owner, tool, 'call')?.writeCandidate).toEqual(candidate);
    expect(preparedWriteCandidate(args, 'edit', 'call')).toBeUndefined();
    expect(() => consumeToolCall(args, owner, tool, 'call')).toThrow('prepared and approved tool call');
  });

  it.each(['owner', 'tool', 'call'] as const)('refuses a different %s at execution', async mismatch => {
    const owner = {}, args = await prepareToolCall(tool, { path: 'note.txt', content: 'full candidate\n' }, context, owner);
    bindPreparedToolCall(args, owner, 'edit', 'call'); authorizeToolCall(args, owner, 'edit', 'call');
    expect(() => consumeToolCall(args, mismatch === 'owner' ? {} : owner, mismatch === 'tool' ? { ...tool } : tool,
      mismatch === 'call' ? 'other' : 'call')).toThrow('not approved for this execution');
  });

  it('reports mutated nested inputs as unknown and cannot approve or consume them', async () => {
    const owner = {}, edits = [{ oldText: 'old', newText: 'new' }];
    const args = await prepareToolCall(tool, { path: 'note.txt', edits }, context, owner);
    bindPreparedToolCall(args, owner, 'edit', 'call'); edits[0]!.newText = 'different';
    const result = translateWriteInput({ eventName: 'PreToolUse', workspaceRoot: '/workspace', sessionId: 'session', timestamp: '',
      toolName: 'edit', toolCallId: 'call', args }, 15000);
    expect(result).toMatchObject({ decision: 'block', reasonCode: 'prepared_input_changed' });
    expect(() => authorizeToolCall(args, owner, 'edit', 'call')).toThrow('approval changed after capture');
  });

  it('refuses nested argument changes while asynchronous edit preparation yields', async () => {
    const edits = [{ oldText: 'old', newText: 'new' }];
    const yielding: ToolDefinition = { ...tool, prepare: async () => {
      await Promise.resolve(); edits[0]!.newText = 'changed during read';
      return { targets: [], preview: 'edit', writeCandidate: candidate, execute: async () => ({ success: true }) };
    } };
    await expect(prepareToolCall(yielding, { path: 'note.txt', edits }, context, {})).rejects.toThrow('arguments changed during capture');
  });

  it('leaves other preparations free of candidate serialization and hook binding', async () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    const ordinary: ToolDefinition = { ...tool, name: 'browser', prepare: () => ({ targets: [], preview: 'ordinary', execute: async () => ({ success: true }) }) };
    const owner = {}, args = await prepareToolCall(ordinary, circular, context, owner);
    bindPreparedToolCall(args, owner, 'browser', 'call'); bindPreparedToolCall(args, owner, 'browser', 'call');
    authorizeToolCall(args, owner, 'browser', 'call');
    expect(consumeToolCall(args, owner, ordinary, 'call')?.preview).toBe('ordinary');
  });

  it('keeps the captured candidate immutable and separate from model arguments', async () => {
    const owner = {}, args = await prepareToolCall(tool, { path: 'note.txt', oldText: 'old', newText: 'new' }, context, owner);
    bindPreparedToolCall(args, owner, 'edit', 'call');
    const captured = preparedWriteCandidate(args, 'edit', 'call')!;
    expect(Object.isFrozen(captured)).toBe(true); expect(Object.isFrozen(captured.before)).toBe(true);
    expect(JSON.stringify(args)).not.toContain('full candidate');
    expect(() => { (captured as { content: string }).content = 'changed'; }).toThrow();
  });

  it('refuses mutation after approval at consumption', async () => {
    const owner = {}, edits = [{ oldText: 'old', newText: 'new' }];
    const args = await prepareToolCall(tool, { path: 'note.txt', edits }, context, owner);
    bindPreparedToolCall(args, owner, 'edit', 'call'); authorizeToolCall(args, owner, 'edit', 'call');
    edits[0]!.newText = 'changed after approval';
    expect(() => consumeToolCall(args, owner, tool, 'call')).toThrow('arguments changed after capture');
  });

  it('captures exhaustive patch effects independently of mutable preparation objects', async () => {
    const target = { path: '/workspace/note.txt', operation: 'delete' as const };
    const patchTool: ToolDefinition = { ...tool, name: 'apply_patch', prepare: () => ({
      targets: [target], preview: 'delete', execute: async () => ({ success: true }),
    }) };
    const owner = {}, args = await prepareToolCall(patchTool, { input: 'delete' }, context, owner);
    expect(preparedWriteInspection(args, 'apply_patch', 'call')).toBeUndefined();
    target.path = '/workspace/foreign.txt';
    bindPreparedToolCall(args, owner, 'apply_patch', 'call');
    const inspection = preparedWriteInspection(args, 'apply_patch', 'call')!;
    expect(inspection.targets).toEqual([{ path: '/workspace/note.txt', operation: 'delete' }]);
    expect(inspection.writeCandidates).toEqual([]);
    expect(Object.isFrozen(inspection)).toBe(true);
    expect(Object.isFrozen(inspection.targets[0])).toBe(true);
    expect(preparedWriteInspection({ ...args }, 'apply_patch', 'call')).toBeUndefined();
    expect(preparedWriteInspection(args, 'apply_patch', 'other')).toBeUndefined();
    discardToolCall(args);
    expect(preparedWriteInspection(args, 'apply_patch', 'call')).toBeUndefined();
  });

  it('keeps the recorded selection after a refused second set, including after approval', async () => {
    const target = { path: '/workspace/note.txt', operation: 'write' as const };
    const patchTool: ToolDefinition = { ...tool, name: 'apply_patch', prepare: () => ({
      targets: [target], preview: 'patch', selections: [{ id: 'one', label: 'one' }, { id: 'two', label: 'two' }],
      selectionInspection: () => ({ targets: [target], writeCandidates: [candidate], revision: 'selected' }),
      execute: async () => ({ success: true }),
    }) };
    const owner = {}, args = await prepareToolCall(patchTool, { input: 'patch' }, context, owner);
    setPreparedSelection(args, ['one'], 'selected');
    expect(() => setPreparedSelection(args, ['two'], 'other')).toThrow('cannot be replaced');
    bindPreparedToolCall(args, owner, 'apply_patch', 'call');
    expect(() => setPreparedSelection(args, ['one', 'two'], 'full')).toThrow('cannot be replaced');
    expect(preparedSelection(args)).toEqual(['one']);
    authorizeToolCall(args, owner, 'apply_patch', 'call');
    expect(() => setPreparedSelection(args, ['two'], 'other')).toThrow('cannot be replaced');
    expect(preparedSelection(args)).toEqual(['one']);
    consumeToolCall(args, owner, patchTool, 'call');
  });

  it('protects delete-only arguments while asynchronous preparation yields', async () => {
    const expectedHashes = { '/workspace/note.txt': 'a'.repeat(64) };
    const patchTool: ToolDefinition = { ...tool, name: 'apply_patch', prepare: async () => {
      await Promise.resolve(); expectedHashes['/workspace/note.txt'] = 'b'.repeat(64);
      return { targets: [{ path: '/workspace/note.txt', operation: 'delete' as const }], preview: 'delete',
        execute: async () => ({ success: true }) };
    } };
    await expect(prepareToolCall(patchTool, { input: 'delete', expectedHashes }, context, {}))
      .rejects.toThrow('arguments changed during capture');
  });

  it('rejects delete-only mutations both after binding and after approval', async () => {
    const patchTool: ToolDefinition = { ...tool, name: 'apply_patch', prepare: () => ({
      targets: [{ path: '/workspace/note.txt', operation: 'delete' }], preview: 'delete',
      execute: async () => ({ success: true }),
    }) };
    const expectedHashes = { '/workspace/note.txt': 'a'.repeat(64) };
    const owner = {}, args = await prepareToolCall(patchTool, { input: 'delete', expectedHashes }, context, owner);
    bindPreparedToolCall(args, owner, 'apply_patch', 'call');
    expectedHashes['/workspace/note.txt'] = 'b'.repeat(64);
    expect(() => authorizeToolCall(args, owner, 'apply_patch', 'call')).toThrow('approval changed after capture');
    expectedHashes['/workspace/note.txt'] = 'a'.repeat(64);
    authorizeToolCall(args, owner, 'apply_patch', 'call');
    expectedHashes['/workspace/note.txt'] = 'b'.repeat(64);
    expect(() => consumeToolCall(args, owner, patchTool, 'call')).toThrow('arguments changed after capture');
  });
});
