import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { installCommandGate, sourceReaderFor } from '../data/access.js';
import { ruleCommandsFor } from './rules.js';
import { contextAttachments } from './attachments.js';
import { contextEntryStillAuthorized } from '../../context/attachment/entry.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { approveAllGroups } from '../../test-utils/approval.js';
import { createProfileContext, withProfile } from '../../core/paths/profile/context.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { registerDeclaredHooks } from '../../core/hooks/registration.js';
import { parseConfigText } from '../../config/syntax.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-native-')); vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function runtime(overrides: Partial<ToolGateOptions> = {}) {
  const manager = new SessionManager();
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session: manager.createNew(root) });
  let denies: ToolGateOptions['denyRules'] = [];
  installCommandGate(context, () => ({ sessionId: context.session.id, workspaceRoot: root, permissionScope: 'ask', agentMode: 'build', emit: () => {}, denyRules: denies,
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never,
    escalationPromptHandler: async prompt => approveAllGroups(prompt), ...overrides }));
  const rules = ruleCommandsFor(context, () => false);
  return { context, manager, rules, deny: () => { denies = [{ tool: 'read', pattern: 'notes.md' }]; } };
}
function proposalId(result: Awaited<ReturnType<ReturnType<typeof ruleCommandsFor>>>) {
  if (result.kind !== 'local') throw new Error('Expected a local proposal.');
  return result.state!.proposalId as string;
}
it('writes an exact retained BOM/CRLF proposal through native approval and refuses replay', async () => {
  const { rules } = runtime();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '\uFEFFKeep exact user rules.  \r\n');
  const preview = await rules('init', []);
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('\uFEFFKeep exact user rules.  \r\n');
  const id = proposalId(preview);
  const result = await rules('init', ['apply', id]);
  expect(result).toMatchObject({ kind: 'local', state: { status: 'committed', verified: true, operationId: expect.any(String) } });
  const bytes = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  expect(bytes.startsWith('\uFEFFKeep exact user rules.  \r\n')).toBe(true);
  expect(bytes.replace(/\r\n/g, '').includes('\n')).toBe(false);
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { status: 'blocked' } });
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(bytes);
});
it('separates denial, stale refusal and post-write uncertainty', async () => {
  const denied = runtime({ escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: 1 }) });
  const id = proposalId(await denied.rules('init', []));
  expect(await denied.rules('init', ['apply', id])).toMatchObject({ state: { status: 'denied' } });
  expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'before\n');
  const approved = runtime();
  const stale = proposalId(await approved.rules('init', []));
  fs.appendFileSync(path.join(root, 'AGENTS.md'), 'external change\n');
  expect(await approved.rules('init', ['apply', stale])).toMatchObject({ state: { status: 'blocked' } });
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('before\nexternal change\n');
  const uncertain = runtime({ hooks: { dispatch: async event => { if (event.eventName === 'PostToolUse') throw new Error('publication failed'); return { decision: 'allow' }; } } as never });
  const retained = proposalId(await uncertain.rules('rules', ['propose', 'Keep checks focused']));
  expect(await uncertain.rules('rules', ['apply', retained])).toMatchObject({ state: { status: 'unknown' } });
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('Keep checks focused');
  expect(await uncertain.rules('rules', ['apply', retained])).toMatchObject({ state: { status: 'blocked' } });
});
function addSources(directory = 'src'): void {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
  fs.writeFileSync(path.join(root, directory, 'a.ts'), 'export const answer = 42;\n');
  fs.writeFileSync(path.join(root, directory, 'b.ts'), 'export { answer } from "./a.js";\n');
}

it('previews and applies architecture setup through native approval while preserving guidance and hook declarations', async () => {
  const { rules } = runtime();
  addSources();
  const guidancePath = path.join(root, 'AGENTS.md');
  const guidance = '\uFEFF# User guidance  \r\n\r\nKeep this line.';
  fs.writeFileSync(guidancePath, guidance);
  fs.mkdirSync(path.join(root, '.agents'));
  const hooksPath = path.join(root, '.agents', 'hooks.json');
  const oldHooks = '\uFEFF{\r\n  // project hooks\r\n  "hooks": { "Stop": [\r\n    // existing handler\r\n    { "hooks": [{ "command": "true" }] },\r\n  ] },\r\n}';
  fs.writeFileSync(hooksPath, oldHooks);
  const preview = await rules('init', ['architecture']);
  expect(preview).toMatchObject({ state: { status: 'proposal', proofVerdict: 'not_reported' } });
  expect(fs.existsSync(path.join(root, '.normproof'))).toBe(false);
  expect(fs.readFileSync(guidancePath, 'utf8')).toBe(guidance);
  expect(fs.readFileSync(hooksPath, 'utf8')).toBe(oldHooks);

  expect(await rules('init', ['apply', proposalId(preview)])).toMatchObject({ state: {
    status: 'committed', verified: true, proofVerdict: 'not_reported', operationId: expect.any(String),
  } });
  expect(fs.existsSync(path.join(root, '.normproof', 'baseline.json'))).toBe(true);
  const bytes = fs.readFileSync(guidancePath, 'utf8');
  expect(bytes.startsWith(guidance)).toBe(true);
  expect(bytes.replaceAll('\r\n', '')).not.toContain('\n');
  const hooks = fs.readFileSync(hooksPath, 'utf8');
  expect(hooks.startsWith('\uFEFF')).toBe(true);
  for (const text of ['// project hooks', '// existing handler', '"command": "true"', 'bundled:write', 'bundled:stop']) {
    expect(hooks).toContain(text);
  }
  expect(await rules('init', ['architecture'])).toMatchObject({ state: { status: 'blocked' } });
  const profile = createProfileContext({ homeDir: root });
  const dispatcher = new HookDispatcher();
  await withProfile(profile, async () => {
    registerDeclaredHooks(dispatcher, root, { homeDir: root, requestApproval: async () => 'allow-once' });
    const payload = { eventName: 'Stop' as const, workspaceRoot: root, sessionId: 'architecture-test',
      timestamp: '2026-01-01T00:00:00Z', turnsExecuted: 1, finalOutput: 'Done.', attemptId: 'first',
      reentryCount: 0, stop_hook_active: false };
    const result = await dispatcher.dispatch(payload);
    // The preserved hook returns empty output and stops escalation. Remove just
    // that fixture to exercise the packaged check as an independent approval.
    expect(result).toMatchObject({ decision: 'unknown', reasonCode: 'empty_output' });
    const configured = parseConfigText(hooks) as { hooks: { Stop: unknown[] } };
    configured.hooks.Stop = configured.hooks.Stop.slice(1);
    fs.writeFileSync(hooksPath, JSON.stringify(configured));
    registerDeclaredHooks(dispatcher, root, { homeDir: root, requestApproval: async () => 'allow-once' });
    expect(await dispatcher.dispatch({ ...payload, attemptId: 'second' })).toMatchObject({ decision: 'allow',
      stopChecks: [expect.objectContaining({ reasonCode: 'advisory_only', proofVerdict: 'partial',
        architecture: expect.objectContaining({ sessionId: 'architecture-test', verdict: 'partial' }) })] });
  });
}, 40_000);

it('rejects denied, partial and stale architecture approvals before writing configuration', async () => {
  addSources();
  let outcome: 'denied' | 'partial' | 'stale' = 'denied';
  const { rules } = runtime({ escalationPromptHandler: async prompt => {
    if (outcome === 'denied') return { promptId: prompt.id, decision: 'deny', respondedAt: 1 };
    if (outcome === 'partial') {
      const selected = prompt.context.selections!.slice(0, 1).map(group => group.id);
      const preview = prompt.context.selectionPreview!(selected);
      return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1, selected, selectionRevision: preview.revision };
    }
    fs.appendFileSync(path.join(root, 'src', 'a.ts'), 'export const other = 1;\n');
    return approveAllGroups(prompt);
  } });
  const id = proposalId(await rules('init', ['architecture']));
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { status: 'denied' } });
  outcome = 'partial';
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { verified: false } });
  outcome = 'stale';
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { verified: false } });
  expect(fs.existsSync(path.join(root, '.normproof'))).toBe(false);
  expect(fs.existsSync(path.join(root, '.agents'))).toBe(false);
});

it('derives an architecture baseline for workspace packages declared outside src', async () => {
  const { rules } = runtime();
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"workspace","workspaces":["modules/*"]}\n');
  for (const name of ['one', 'two']) {
    const directory = path.join('modules', name);
    addSources(path.join(directory, 'src'));
    fs.writeFileSync(path.join(root, directory, 'package.json'), JSON.stringify({ name, exports: './src/a.ts' }));
  }
  const id = proposalId(await rules('init', ['architecture']));
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { status: 'committed', verified: true } });
  const manifest = fs.readFileSync(path.join(root, '.normproof', 'evidence-manifest.json'), 'utf8');
  expect(manifest).toContain('modules/**/*.{ts,tsx}');
  expect(manifest).toContain('"workspacePackages": true');
});

it('ignores a package-install directory symlink while capturing declared sources', async () => {
  const { rules } = runtime();
  addSources();
  fs.symlinkSync(path.join(root, 'src'), path.join(root, 'node_modules'), 'dir');
  expect(await rules('init', ['architecture'])).toMatchObject({
    kind: 'local', state: { status: 'proposal', proofVerdict: 'not_reported' },
  });
  expect(fs.existsSync(path.join(root, '.normproof'))).toBe(false);
});

it('does not replace architecture settings created while approval was waiting', async () => {
  addSources();
  const destination = path.join(root, '.normproof', 'baseline.json');
  const { rules } = runtime({ escalationPromptHandler: async prompt => {
    const response = approveAllGroups(prompt);
    fs.mkdirSync(path.dirname(destination));
    fs.writeFileSync(destination, 'existing settings\n');
    return response;
  } });
  const id = proposalId(await rules('init', ['architecture']));
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { verified: false } });
  expect(fs.readFileSync(destination, 'utf8')).toBe('existing settings\n');
  expect(fs.readdirSync(path.dirname(destination))).toEqual(['baseline.json']);
  expect(fs.existsSync(path.join(root, '.agents'))).toBe(false);
});

it('rejects source revocation, aggregate overflow and retired sessions on the public attachment path', async () => {
  const { context, manager, deny } = runtime();
  fs.writeFileSync(path.join(root, 'notes.md'), 'exact authorized fixture');
  context.ruleControlsCommand = async (_name, args) => contextAttachments(args, { runtimeContext: context, sessionManager: manager });
  const commandContext = { cwd: root, sessionId: context.session.id, ruleControlsCommand: context.ruleControlsCommand };
  expect(await routeSlashCommand('/context add notes.md --persist session', commandContext)).toMatchObject({ state: { status: 'ok' } });
  const entry = context.contextAttachments![0]!;
  expect(contextEntryStillAuthorized(root, entry, sourceReaderFor(context))).toBe(true);
  for (let index = 0; index < 3; index += 1) {
    fs.writeFileSync(path.join(root, `large-${index}.txt`), 'x'.repeat(128 * 1024));
    expect(await routeSlashCommand(`/context add large-${index}.txt`, commandContext)).toMatchObject({ state: { status: 'ok' } });
  }
  fs.writeFileSync(path.join(root, 'overflow.txt'), 'x'.repeat(128 * 1024));
  expect(await routeSlashCommand('/context add overflow.txt', commandContext)).toMatchObject({ state: { status: 'blocked' } });
  expect(context.transientContextAttachments).toHaveLength(3);
  const read = sourceReaderFor(context);
  deny();
  expect(contextEntryStillAuthorized(root, entry, sourceReaderFor(context))).toBe(false);
  expect(await routeSlashCommand('/context add notes.md', commandContext)).toMatchObject({ state: { status: 'blocked' } });
  switchActiveSession(context, manager.createNew(root));
  expect(() => read('notes.md', 100)).toThrow(/changed/);
  expect(context.transientContextAttachments).toBeUndefined();
});
