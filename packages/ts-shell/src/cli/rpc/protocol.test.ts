import { describe, expect, it } from 'vitest';
import { rpcInputFailure, tryParseRpcCommand } from './protocol.js';

describe('RPC command input', () => {
  it.each([
    { type: 'get_messages', field: 'id', frame: { type: 'get_messages', id: 17 } },
    { type: 'prompt', field: 'streamingBehavior', frame: { type: 'prompt', message: 'explicit input', streamingBehavior: 'later' } },
    { type: 'export_html', field: 'outputPath', frame: { type: 'export_html', outputPath: 17 } },
    { type: 'new_session', field: 'parentSession', frame: { type: 'new_session', parentSession: false } },
    { type: 'compact', field: 'customInstructions', frame: { type: 'compact', customInstructions: ['private instructions'] } },
    { type: 'get_entries', field: 'since', frame: { type: 'get_entries', since: { entryId: 'old-entry' } } },
    { type: 'navigate_tree', field: 'expectedVersion', frame: { type: 'navigate_tree', entryId: 'old-entry', expectedVersion: 17 } },
    { type: 'annotate_session', field: 'expectedVersion', frame: { type: 'annotate_session', entryId: 'target', change: { type: 'label', label: null } } },
    { type: 'annotate_session', field: 'change', frame: { type: 'annotate_session', entryId: 'target', expectedVersion: 'saved', change: { type: 'label', label: 'test', extra: true } } },
    { type: 'annotate_session', field: 'label', frame: { type: 'annotate_session', entryId: 'target', expectedVersion: 'saved', change: { type: 'label', label: 'x'.repeat(257) } } },
    { type: 'bash', field: 'excludeFromContext', frame: { type: 'bash', command: 'printf private-output', excludeFromContext: 'true' } },
    { type: 'bash', field: 'excludeFromContext', frame: { type: 'bash', command: 'printf private-output', excludeFromContext: null } },
  ])('rejects malformed optional $field in $type instead of silently choosing defaults', ({ frame }) => {
    expect(tryParseRpcCommand(JSON.stringify(frame))).toBeUndefined();
  });

  it('rejects a non-finite entries cursor instead of silently returning the full history', () => {
    expect(tryParseRpcCommand('{"type":"get_entries","since":1e999}')).toBeUndefined();
  });

  it.each([
    { type: 'prompt', id: 'submit', message: 'explicit input', streamingBehavior: 'followUp' },
    { type: 'bash', id: 'shell', command: 'printf private-output', excludeFromContext: true },
    { type: 'navigate_tree', id: 'navigation', entryId: 'old-entry', expectedVersion: 'captured-version' },
    { type: 'annotate_session', id: 'edit', entryId: 'old-entry', expectedVersion: 'captured-version', change: { type: 'context-edit', edit: { kind: 'replace', text: 'line 1\nline 2' } } },
    { type: 'get_entries', id: 'cursor', since: 0 },
    { type: 'export_html', id: 'export', outputPath: 'approved-output.html' },
    { type: 'compact', id: 'summary', customInstructions: 'retain decisions' },
    { type: 'new_session', id: 'new', parentSession: 'source-session' },
  ])('preserves explicit optional values for $type', frame => {
    expect(tryParseRpcCommand(JSON.stringify(frame))).toEqual(frame);
  });

  it('accepts unknown metadata fields without using them as command parameters', () => {
    const line = JSON.stringify({ type: 'get_messages', id: 'read', metadata: { clientRevision: 2 }, futureOption: true });
    expect(tryParseRpcCommand(line)).toEqual({ type: 'get_messages', id: 'read' });
  });

  it('omits oversized or control-bearing failure metadata while keeping the private payload out of the response', () => {
    const failure = rpcInputFailure(JSON.stringify({ id: 'PRIVATE_RPC_INPUT'.repeat(30),
      type: 'unknown\rPRIVATE_RPC_INPUT', message: 'PRIVATE_RPC_INPUT' }));
    expect(failure).toEqual({ type: 'response', command: 'unknown', success: false, error: 'Invalid RPC command.' });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE_RPC_INPUT');
    expect(rpcInputFailure('{"id":"bad\\nPRIVATE_RPC_INPUT","type":"bash","command":17}').id).toBeUndefined();
  });
});
