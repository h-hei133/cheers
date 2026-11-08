import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HookDispatcher } from './hookDispatcher.js';
import { CANONICAL_WRITE_MATCHER } from './translation.js';
import { createToolHooks, adaptTools } from '../../turn/tools.js';
import { executeToolBatch } from '../agent/tools.js';
import { createCoreToolRegistry } from '../tools/registry.js';
import { registerDeclaredHooks } from './registration.js';
import { hookFingerprint, HookTrustStore } from './trust.js';
import { projectTrust } from '../security/projectTrust.js';
import type { HookDecision, PreToolUsePayload } from './types.js';
import { setFilePersistenceEnabled, setStructuredLogSink } from '../../observability/structuredLogger.js';

let root: string;
const logs: unknown[] = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'write-hook-'));
  setFilePersistenceEnabled(false); setStructuredLogSink(entry => logs.push(entry)); logs.length = 0;
  vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(false);
});
afterEach(() => { vi.restoreAllMocks(); setStructuredLogSink(null); fs.rmSync(root, { recursive: true, force: true }); });
const payload = (): PreToolUsePayload => ({ eventName: 'PreToolUse', sessionId: 'hook-test', workspaceRoot: root,
  timestamp: '2026-11-05T00:00:00Z', toolName: 'write', toolCallId: 'write-call', args: { path: 'target.txt', content: 'payload-secret' } });
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function artifact(script: string) {
  const file = path.join(root, 'gate.mjs'); fs.writeFileSync(file, script);
  return { version: 1, path: file, sha256: digest(script), nodeFloor: '20.3.0' };
}
function dispatcher(script: string, timeoutMs = 15000) {
  const hooks = new HookDispatcher();
  hooks.registerCommandHook({ event: 'PreToolUse', matcher: CANONICAL_WRITE_MATCHER, command: 'unused', writeGate: artifact(script), timeoutMs });
  return hooks;
}
const reply = (value: unknown) => `process.stdout.write(${JSON.stringify(JSON.stringify(value))});`;

describe('write hook through the native tool gate', () => {
  it.each(['nested', 'flat'] as const)('%s deny prevents the actual native write', async form => {
    const hooks = dispatcher(reply(form === 'nested'
      ? { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'fixture rule' } }
      : { decision: 'block', reason: 'fixture rule' }));
    const tools = createCoreToolRegistry();
    const options = { sessionId: 'hook-test', workspaceRoot: root, hooks, permissionScope: 'allow-all' as const, emit() {} };
    const input = payload();
    const result = await executeToolBatch(adaptTools(tools, options), { role: 'assistant', content: '' },
      [{ id: input.toolCallId, name: 'write', args: input.args }], createToolHooks(options, tools), 'sequential', undefined, () => {});
    expect(result.messages[0]!.content).toContain('fixture rule');
    expect(fs.existsSync(path.join(root, 'target.txt'))).toBe(false);
    console.log(JSON.stringify({ probe: `${form}-deny-native-write`, targetExists: false, result: result.messages[0]!.content }));
  });
  it.each(['explicit allow', 'native silent'])('%s returns allow and calls askPermission exactly once first', async mode => {
    const hooks = mode === 'explicit allow' ? dispatcher(reply({ decision: 'allow', reasonCode: 'no_violation' })) : new HookDispatcher();
    if (mode === 'native silent') hooks.registerCommandHook({ event: 'PreToolUse', command: 'true' });
    const askPermission = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'allow-once' as const, respondedAt: 1 }));
    const observed: HookDecision[] = [];
    const dispatch = hooks.dispatch.bind(hooks);
    vi.spyOn(hooks, 'dispatch').mockImplementation(async input => {
      if (input.eventName === 'PreToolUse') expect(askPermission).toHaveBeenCalledOnce();
      const result = await dispatch(input); if (input.eventName === 'PreToolUse') observed.push(result); return result;
    });
    const input = payload();
    const gate = createToolHooks({ sessionId: input.sessionId, workspaceRoot: root, hooks, permissionScope: 'ask', escalationPromptHandler: askPermission, emit() {} });
    const result = await gate.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { id: input.toolCallId, name: 'write', args: input.args }, args: input.args });
    expect(result?.block).not.toBe(true);
    expect(askPermission).toHaveBeenCalledOnce();
    expect(observed[0]!.decision).toBe('allow');
    if (mode === 'explicit allow') expect(observed[0]!.hookVerdict?.reasonCode).toBe('no_violation');
  });
  it.each(['malformed', 'timeout', 'version', 'empty', 'nonzero'])('%s blocks with an unknown code and no payload or stack in reason or diagnostics', async mode => {
    const hooks = dispatcher(mode === 'timeout' ? 'setInterval(() => {}, 1000);'
      : mode === 'empty' ? '' : mode === 'nonzero' ? "console.error('payload-secret\\n at private.stack');process.exit(7);"
        : "process.stdout.write('payload-secret\\n at private.stack');", mode === 'timeout' ? 80 : 15000);
    if (mode === 'version') fs.appendFileSync(path.join(root, 'gate.mjs'), '\n// changed');
    const result = await hooks.dispatch(payload());
    expect(result.decision).toBe('block');
    expect(result.hookVerdict).toMatchObject({ status: 'unknown', reasonCode: mode === 'malformed' ? 'invalid_output'
      : mode === 'version' ? 'version_mismatch' : mode === 'empty' ? 'empty_output' : mode === 'nonzero' ? 'process_failed' : 'timeout' });
    expect(JSON.stringify([result, logs])).not.toMatch(/payload-secret|private\.stack|\n at /);
    console.log(JSON.stringify({ probe: mode, result }));
  });
  it('applies Cheers policy to a real could_not_decide response', async () => {
    expect(await dispatcher(reply({ decision: 'allow', reasonCode: 'could_not_decide' })).dispatch(payload()))
      .toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'could_not_decide', policy: 'block' } });
  });
  it('blocks a partial edit before the older artifact can call it clean', async () => {
    const result = await dispatcher(reply({ decision: 'allow', reasonCode: 'no_violation' })).dispatch({
      ...payload(), toolName: 'edit', args: { path: 'target.ts' },
    });
    expect(result).toMatchObject({ decision: 'block', reasonCode: 'input_incomplete', hookVerdict: { status: 'unknown', policy: 'block' } });
  });
  it.each([
    ['legacy allow', { decision: 'allow' }, 'allow', 'explicit_allow', 'permission'],
    ['versioned allow', { decision: 'allow', reasonCode: 'no_violation' }, 'allow', 'no_violation', 'permission'],
    ['versioned block', { decision: 'block', reasonCode: 'violation', reason: 'fixture rule' }, 'block', 'violation', 'block'],
    ['not configured observe-only', { decision: 'allow', reasonCode: 'not_configured' }, 'allow', 'not_configured', 'observe-only'],
    ['not judged observe-only', { decision: 'allow', reasonCode: 'not_a_judged_write' }, 'unsupported', 'not_a_judged_write', 'observe-only'],
    ['future reason blocks', { decision: 'allow', reasonCode: 'future_reason' }, 'block', 'version_mismatch', 'block'],
  ] as const)('%s remains an explicit C3b outcome', async (_label, wire, decision, reasonCode, policy) => {
    const result = await dispatcher(reply(wire)).dispatch(payload());
    expect(result).toMatchObject({ decision, hookVerdict: { reasonCode, policy } });
  });
  it('preserves nonzero flat vetoes but never trusts a nonzero allow', async () => {
    expect(await dispatcher(reply({ decision: 'retry', reason: 'repair' }) + 'process.exitCode=2;').dispatch(payload())).toEqual({ decision: 'retry', reason: 'repair' });
    expect(await dispatcher(reply({ decision: 'allow', reasonCode: 'no_violation' }) + 'process.exitCode=2;').dispatch(payload()))
      .toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown' } });
  });
  it('loads canonical configuration, binds trust identity and sends complete metadata', async () => {
    const capture = path.join(root, 'captured.json');
    const writeGate = artifact(`import fs from 'node:fs'; let text=''; for await (const c of process.stdin) text+=c;
      fs.writeFileSync(${JSON.stringify(capture)},text); ${reply({ decision: 'allow', reasonCode: 'no_violation' })}`);
    fs.mkdirSync(path.join(root, '.agents'));
    fs.writeFileSync(path.join(root, '.agents/hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: CANONICAL_WRITE_MATCHER, hooks: [{ writeGate, timeoutMs: 4321 }] }] } }));
    const hooks = new HookDispatcher();
    registerDeclaredHooks(hooks, root, { homeDir: root, trustStore: new HookTrustStore(path.join(root, 'trust.json')), requestApproval: async () => 'allow-once' });
    expect((await hooks.dispatch(payload())).decision).toBe('allow');
    expect(JSON.parse(fs.readFileSync(capture, 'utf8'))).toMatchObject({ version: 1, event: 'PreToolUse', sessionId: 'hook-test',
      toolName: 'write', toolCallId: 'write-call', args: payload().args, workspaceRoot: root, cwd: root,
      tool_name: 'Write', tool_input: { file_path: 'target.txt', content: 'payload-secret' }, timeoutMs: 4321, reentry: { supported: false, active: false } });
    const identity = { event: 'PreToolUse', command: 'same', sourcePath: capture, writeGate };
    expect(hookFingerprint(identity)).not.toBe(hookFingerprint({ ...identity, writeGate: { ...writeGate, sha256: '0'.repeat(64) } }));
    expect(hookFingerprint(identity)).not.toBe(hookFingerprint({ ...identity, timeoutMs: 42 }));
    for (const toolName of ['apply_patch', 'bash', 'mcp__write', 'browser', 'MultiEdit', 'NotebookEdit']) {
      const result = await hooks.dispatch({ ...payload(), toolName });
      expect(result.decision).toBe('unsupported');
      console.log(JSON.stringify({ probe: 'unsupported', toolName, result }));
    }
  });
  it.each(['write', 'edit'])('runs the pinned artifact for %s to allow and block without changing ordinary permission', async toolName => {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const metadata = JSON.parse(fs.readFileSync(path.join(repo, '.normproof/write-gate/artifact.json'), 'utf8'));
    const { provenance: _provenance, ...writeGate } = metadata;
    writeGate.path = path.join(repo, writeGate.path);
    fs.mkdirSync(path.join(root, '.normproof'));
    fs.writeFileSync(path.join(root, '.normproof/write-rules.json'), JSON.stringify({ version: '0.1.0', rules: [
      { id: 'no-import', kind: 'forbiddenImport', from: '**', to: 'private/**', message: 'Keep private imports out.' },
    ] }));
    const hooks = new HookDispatcher({ commandHooks: [{ event: 'PreToolUse', matcher: CANONICAL_WRITE_MATCHER, command: 'unused', writeGate }] });
    const allowed = await hooks.dispatch({ ...payload(), toolName, args: { path: 'target.ts', content: 'export const safe = 1;' } });
    const blocked = await hooks.dispatch({ ...payload(), toolName, args: { path: 'target.ts', content: 'import x from "./private/x.js";' } });
    expect(allowed).toMatchObject({ decision: 'allow', hookVerdict: { reasonCode: 'no_violation' } });
    expect(blocked.decision).toBe('block');
    console.log(JSON.stringify({ probe: 'pinned-artifact', node: process.version, toolName, allowed, blocked }));
  });
  it('records the pinned artifact states for filename, layering, fidelity, root and configuration cases', async () => {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const metadata = JSON.parse(fs.readFileSync(path.join(repo, '.normproof/write-gate/artifact.json'), 'utf8'));
    const { provenance: _provenance, ...writeGate } = metadata;
    writeGate.path = path.join(repo, writeGate.path);
    fs.mkdirSync(path.join(root, '.normproof'));
    fs.mkdirSync(path.join(root, 'src/runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/runtime/legacy-temp.ts'), 'export const oldValue = 1;');
    fs.writeFileSync(path.join(root, '.normproof/write-rules.json'), JSON.stringify({ version: '0.1.0', rules: [
      { id: 'no-temp', kind: 'filenameTokens', tokens: ['-temp', '-new'], pattern: 'src/runtime/**', message: 'Use a responsibility-based filename.' },
      { id: 'no-adapter-import', kind: 'forbiddenImport', from: 'src/runtime/**', to: 'src/adapters/**', message: 'Keep the adapter behind a runtime boundary.' },
    ] }));
    const hooks = new HookDispatcher({ commandHooks: [{ event: 'PreToolUse', matcher: CANONICAL_WRITE_MATCHER, command: 'unused', writeGate }] });
    const run = (toolName: string, target: string, content: string) => hooks.dispatch({ ...payload(), toolName, args: { path: target, content } });
    const newFilename = await run('write', 'src/runtime/new-temp.ts', 'export const value = 1;');
    const existingFilename = await run('edit', 'src/runtime/legacy-temp.ts', 'export const value = 2;');
    const legalAlias = await run('write', 'src/runtime/alias.ts', 'import { value } from "@/adapters/value.js";');
    const empty = await run('write', 'src/runtime/empty.ts', '');
    const invalid = await run('write', 'src/runtime/broken.ts', 'function broken( {');
    const wrongRoot = await run('write', '../outside.ts', 'export const value = 1;');
    expect(newFilename).toMatchObject({ decision: 'block', reasonCode: 'violation' });
    expect(existingFilename).toMatchObject({ decision: 'allow', reasonCode: 'no_violation' });
    expect(legalAlias).toMatchObject({ decision: 'allow', reasonCode: 'no_violation' });
    expect(empty).toMatchObject({ decision: 'allow', reasonCode: 'no_violation' });
    // The pinned artifact predates C3a's invalid-content fix; retain this observed gap for C5a.
    expect(invalid).toMatchObject({ decision: 'allow', reasonCode: 'no_violation' });
    expect(wrongRoot).toMatchObject({ decision: 'block', reasonCode: 'could_not_decide', hookVerdict: { status: 'unknown', policy: 'block' } });
    fs.unlinkSync(path.join(root, '.normproof/write-rules.json'));
    const missingConfig = await run('write', 'src/runtime/config.ts', 'export const value = 1;');
    expect(missingConfig).toMatchObject({ decision: 'allow', reasonCode: 'not_configured', hookVerdict: { status: 'unknown', policy: 'observe-only' } });
    console.log(JSON.stringify({ probe: 'pinned-artifact-contract-cases', node: process.version,
      cases: { newFilename, existingFilename, legalAlias, empty, invalid, wrongRoot, missingConfig } }));
  });
  it('does not replace unsupported with later native feedback or adapter allow', async () => {
    const second = artifact(reply({ decision: 'allow', reasonCode: 'no_violation' }));
    // Separate file so the first pinned script is not replaced.
    const first = reply({ decision: 'allow', reasonCode: 'not_a_judged_write' });
    fs.writeFileSync(path.join(root, 'first.mjs'), first);
    const firstHooks = new HookDispatcher({ commandHooks: [{ event: 'PreToolUse', command: 'unused',
      writeGate: { ...second, path: path.join(root, 'first.mjs'), sha256: digest(first) } },
      { event: 'PreToolUse', command: 'unused', writeGate: second },
      { event: 'PreToolUse', command: `exec '${process.execPath}' -e 'console.log(JSON.stringify({decision:"allow",feedback:"note"}))'` }] });
    expect((await firstHooks.dispatch(payload())).decision).toBe('unsupported');
    expect((await firstHooks.dispatch({ ...payload(), toolName: 'bash' })).decision).toBe('unsupported');
  });
  it('does not replace not_configured with later native feedback', async () => {
    const first = reply({ decision: 'allow', reasonCode: 'not_configured' });
    const firstPath = path.join(root, 'first-not-configured.mjs');
    fs.writeFileSync(firstPath, first);
    const hooks = new HookDispatcher({ commandHooks: [
      { event: 'PreToolUse', command: 'unused', writeGate: { ...artifact(first), path: firstPath } },
      { event: 'PreToolUse', command: `exec '${process.execPath}' -e 'console.log(JSON.stringify({decision:"allow",feedback:"note"}))'` },
    ] });
    expect(await hooks.dispatch(payload())).toMatchObject({ decision: 'allow', reasonCode: 'not_configured',
      hookVerdict: { status: 'unknown', policy: 'observe-only' } });
  });
});
