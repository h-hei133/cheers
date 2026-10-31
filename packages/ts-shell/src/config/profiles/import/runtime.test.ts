import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from '../../../core/paths/profile/context.js';
import { createProfile, openProfile } from '../context.js';
import { importRequest, planImport } from './plan.js';
import { applyImport, recoverImport } from './runtime.js';
import { historyFiles } from '../../../session/history/files.js';
import { loadSessionRecord } from '../../../session/store/sessionStore.js';
import { projectSessionFileLayout } from '../../../session/store/sessionFileLayout.js';
import { IMPORT_LIMITS } from './model.js';
import { TemplateLoader } from '../../../core/prompts/templateLoader.js';

let home: string; let workspace: string; let source: ProfileContext; let target: ProfileContext;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-import-'));
  workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  source = createProfileContext({ name: 'source', homeDir: home, env: {} });
  target = createProfile('target', source).profile;
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });
function write(relative: string, content: string, profile = source): void {
  const file = path.join(profile.root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
}
function preview(categories?: Parameters<typeof importRequest>[0]['categories']) {
  return planImport(importRequest({ source: source.id, target: target.id, homeDir: home, workspace, categories }));
}

it('opens existing profiles without creating missing roots or changing the active owner', () => {
  withProfile(source, () => {
    expect(openProfile('target', home).root).toBe(target.root);
    expect(() => openProfile('missing', home)).toThrow();
    expect(createProfile('target', source).created).toBe(false);
    for (const name of ['', ' ', '../bad', 'con']) expect(() => createProfile(name, source)).toThrow();
  });
  expect(fs.existsSync(path.join(home, '.cheers/profiles/missing'))).toBe(false);
});

it('previews without writes, excludes live credentials and imports inactive native conversation graphs', () => {
  const auth = { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: 9000000000000 } };
  write('config.json', JSON.stringify({ provider: 'openai', providerCredentials: { openai: { apiKey: 'synthetic-legacy', accountAuth: auth } },
    providerConnections: [{ id: 'same-id', provider: 'openai', authType: 'account-auth', status: 'connected', apiKey: 'synthetic-key', accountAuth: auth, model: 'test-model' }],
    activeProviderConnectionId: 'same-id', maxTurns: 17, unknown: { token: 'do-not-import' } }));
  write('models.json', JSON.stringify({ providers: { openai: { models: [{ id: 'test-model', contextWindow: 8192,
    compat: { reasoningSummary: false }, apiKey: 'do-not-import' }], accountAuth: auth } } }));
  write('skills/test/SKILL.md', '# Test definition\n'); write('skills/test/run.sh', 'do not copy');
  write('trust.json', '{"grants":["all"]}'); write('mcp-auth.json', '{"token":"synthetic-mcp"}');
  const document = { kind: 'session-history' as const, version: 1 as const, sourceId: 'original', title: 'Conversation', leafId: 'reply',
    nodes: [{ id: 'root', kind: 'session-root' as const }, { id: 'question', parentId: 'root', kind: 'turn-message' as const }, { id: 'reply', parentId: 'question', kind: 'turn-message' as const }],
    entries: [{ id: 'question', role: 'user' as const, content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'reply', role: 'assistant' as const, content: 'answer', timestamp: '2026-01-01T00:00:01.000Z' }] };
  for (const file of historyFiles(document, 'original', workspace, document.entries[0]!.timestamp)) write(file.relative, file.content);
  write('sessions/original/state.json', JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(source.root, 'sessions/original/state.json'), 'utf8')),
    jobs: { pending: true }, requestLedger: { pending: true }, workspaceRoots: [{ mode: 'write' }] }));
  const before = fs.readFileSync(path.join(source.root, 'config.json'));
  const plan = preview();
  expect(fs.readdirSync(target.root)).toEqual([]);
  expect(planImport(plan.request).digest).toBe(plan.digest);
  expect(applyImport(plan, 'wrong').status).toBe('rejected');
  expect(fs.readdirSync(target.root)).toEqual([]);
  expect(applyImport(plan, plan.digest).status).toBe('complete');
  const configText = fs.readFileSync(path.join(target.root, 'auth.json'), 'utf8');
  const config = JSON.parse(configText);
  expect(config.providerConnections[0]).toMatchObject({ id: 'same-id', status: 'pending', model: 'test-model' });
  for (const secret of ['synthetic-access', 'synthetic-refresh', 'synthetic-key', 'synthetic-legacy', 'do-not-import']) expect(configText).not.toContain(secret);
  expect(fs.readFileSync(path.join(target.root, 'models.json'), 'utf8')).not.toContain('do-not-import');
  expect(JSON.parse(fs.readFileSync(path.join(target.root, 'models.json'), 'utf8')).providers.openai.models[0].compat.reasoningSummary).toBe(false);
  expect(fs.existsSync(path.join(target.root, 'trust.json'))).toBe(false);
  expect(fs.existsSync(path.join(target.root, 'mcp-auth.json'))).toBe(false);
  expect(fs.existsSync(path.join(target.root, 'skills/test/run.sh'))).toBe(false);
  expect(fs.existsSync(path.join(target.root, 'current-session.json'))).toBe(false);
  const id = fs.readdirSync(path.join(target.root, 'sessions'))[0]!;
  expect(id).not.toBe('original');
  const restored = loadSessionRecord({ sessionId: id, layout: projectSessionFileLayout({ sessionsDir: path.join(target.root, 'sessions'), sessionId: id }), cwd: workspace });
  expect(restored.status).toBe('interrupted'); expect(restored.turns.map(turn => turn.content)).toEqual(['hello', 'answer']);
  expect(restored.hasPlanningState).toBeUndefined(); expect(restored.workspaceRoots).toBeUndefined();
  expect(fs.readFileSync(path.join(target.root, `sessions/${id}/state.json`), 'utf8')).not.toContain('requestLedger');
  expect(fs.readFileSync(path.join(source.root, 'config.json'))).toEqual(before);
  expect(recoverImport(target, plan.digest, plan.digest).status).toBe('complete');
});

it('projects legacy credential slots into pending references without resolving environment values', () => {
  write('config.json', JSON.stringify({ provider: 'openai', providerCredentials: { openai: { apiKey: '${SOURCE_SECRET}', model: 'test-model' } } }));
  const plan = preview(['config']); expect(applyImport(plan, plan.digest).status).toBe('complete');
  const config = JSON.parse(fs.readFileSync(path.join(target.root, 'auth.json'), 'utf8'));
  expect(config.providerConnections).toEqual([{ id: 'import-openai', provider: 'openai', authType: 'api-key', status: 'pending', model: 'test-model' }]);
  expect(config.providerCredentials).toBeUndefined();
});

it('imports split auth connection metadata without secrets and preserves its selected authority', () => {
  write('config.json', JSON.stringify({ maxTurns: 17, provider: 'google',
    providerConnections: [{ id: 'legacy', provider: 'google', apiKey: 'synthetic-old-secret' }] }));
  write('auth.json', JSON.stringify({ provider: 'openai', activeProviderConnectionId: 'relay',
    providerConnections: [{ id: 'relay', provider: 'openai', baseUrl: 'https://relay.invalid/v1', apiKey: 'synthetic-new-secret', model: 'owned-model' }],
    providerCredentials: { openai: { apiKey: 'synthetic-mirror-secret' } }, unknown: { token: 'synthetic-unknown-secret' } }));
  const beforeSettings = fs.readFileSync(path.join(source.root, 'config.json'));
  const beforeAuth = fs.readFileSync(path.join(source.root, 'auth.json'));
  const plan = preview(['config']);
  expect(plan.sources.map(file => path.basename(file.path))).toEqual(['auth.json', 'config.json']);
  expect(fs.readdirSync(target.root)).toEqual([]);
  expect(applyImport(plan, plan.digest).status).toBe('complete');
  expect(JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'))).toEqual({ maxTurns: 17 });
  const stored = fs.readFileSync(path.join(target.root, 'auth.json'), 'utf8');
  expect(JSON.parse(stored)).toEqual({ provider: 'openai', activeProviderConnectionId: 'relay', providerConnections: [{
    id: 'relay', provider: 'openai', baseUrl: 'https://relay.invalid/v1', model: 'owned-model', authType: 'api-key', status: 'pending',
  }] });
  expect(stored).not.toContain('synthetic-');
  expect(fs.readFileSync(path.join(source.root, 'config.json'))).toEqual(beforeSettings);
  expect(fs.readFileSync(path.join(source.root, 'auth.json'))).toEqual(beforeAuth);
  if (process.platform !== 'win32') expect(fs.statSync(path.join(target.root, 'auth.json')).mode & 0o777).toBe(0o600);
});

it('imports an auth-only profile and fences an auth edit after preview', () => {
  write('auth.json', JSON.stringify({ provider: 'openai', providerConnections: [{ id: 'relay', provider: 'openai', apiKey: 'synthetic-secret' }] }));
  const plan = preview(['config']);
  write('auth.json', JSON.stringify({ provider: 'openai', providerConnections: [{ id: 'other', provider: 'openai', apiKey: 'synthetic-secret' }] }));
  expect(applyImport(plan, plan.digest).status).toBe('rejected');
  expect(fs.existsSync(path.join(target.root, 'auth.json'))).toBe(false);
  const fresh = preview(['config']);
  expect(applyImport(fresh, fresh.digest).status).toBe('complete');
  expect(fs.existsSync(path.join(target.root, 'config.json'))).toBe(false);
  expect(JSON.parse(fs.readFileSync(path.join(target.root, 'auth.json'), 'utf8')).providerConnections[0]).toMatchObject({ id: 'other', status: 'pending' });
});

it('refuses malformed legacy fields even when the auth document shadows them', () => {
  write('config.json', '{"providerCredentials":"malformed"}');
  write('auth.json', '{"providerCredentials":{"openai":{"apiKey":"synthetic-secret"}}}');
  expect(() => preview(['config'])).toThrow('invalid declared field');
  expect(fs.readdirSync(target.root)).toEqual([]);
});

it('rejects secret-bearing pool endpoints before they enter an import journal', () => {
  write('auth.json', JSON.stringify({ accountPool: { openai: { connections: ['relay'], baseUrl: 'https://relay.invalid/v1?token=synthetic-secret' } } }));
  expect(() => preview(['config'])).toThrow('secret-bearing URL');
  expect(fs.readdirSync(target.root)).toEqual([]);
});

it('anchors an auth-owned path rule to its actual source directory', () => {
  source = createProfileContext({ name: 'default', homeDir: home, env: {} });
  write('config.json', '{"maxTurns":17}');
  const legacy = path.join(home, '.cheer'); fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'auth.json'), JSON.stringify({ pathRules: [{ path: '../workspace', settings: { allowedTools: [] } }] }));
  const plan = preview(['config']);
  expect(applyImport(plan, plan.digest).status).toBe('complete');
  const imported = JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'));
  expect(imported.pathRules[0].path).toBe(path.resolve(legacy, '../workspace'));
});

it('imports prompt definitions into their actual consumer directory', () => {
  write('prompts/review.MD', 'Review the selected module.');
  write('templates/unused.md', 'This is not a user prompt directory.');
  const plan = preview(['definitions']);
  expect(applyImport(plan, plan.digest).status).toBe('complete');
  withProfile(target, () => expect(new TemplateLoader(workspace).load().get('review')?.content).toBe('Review the selected module.'));
  expect(fs.existsSync(path.join(target.root, 'templates'))).toBe(false);
});

it('resumes after interrupted publication without duplication and publishes metadata only after native payloads', () => {
  write('config.json', '{"maxTurns":13}'); write('models.json', '{"providers":{}}'); write('AGENTS.md', '# User rules\n');
  const plan = preview(); const link = fs.linkSync; let calls = 0;
  const fault = vi.spyOn(fs, 'linkSync').mockImplementation((...args) => { if (++calls === 2) throw new Error('injected interruption'); return link(...args); });
  expect(applyImport(plan, plan.digest).status).toBe('unknown'); fault.mockRestore();
  expect(fs.existsSync(path.join(target.root, plan.files[0]!.relative))).toBe(true);
  expect(recoverImport(target, plan.digest).status).toBe('preview');
  expect(recoverImport(target, plan.digest, plan.digest).status).toBe('complete');
  expect(plan.files.every(file => fs.readFileSync(path.join(target.root, file.relative), 'utf8') === file.content)).toBe(true);
  expect(fs.readFileSync(path.join(source.root, 'config.json'), 'utf8')).toBe('{"maxTurns":13}');
});

it('keeps interrupted history undiscoverable until all state and transcript payloads have been published', () => {
  const document = { kind: 'session-history' as const, version: 1 as const, sourceId: 'history', title: 'Retained', leafId: 'message',
    nodes: [{ id: 'root', kind: 'session-root' as const }, { id: 'message', parentId: 'root', kind: 'turn-message' as const }],
    entries: [{ id: 'message', role: 'user' as const, content: 'retained-history', timestamp: '2026-01-01T00:00:00.000Z' }] };
  for (const file of historyFiles(document, 'history', workspace, document.entries[0]!.timestamp)) write(file.relative, file.content);
  const plan = preview(['history']); const link = fs.linkSync;
  const fault = vi.spyOn(fs, 'linkSync').mockImplementation((from, to) => {
    if (String(to).endsWith('metadata.json')) throw new Error('metadata publication interrupted');
    link(from, to);
  });
  expect(applyImport(plan, plan.digest).status).toBe('unknown'); fault.mockRestore();
  for (const file of plan.files) expect(fs.existsSync(path.join(target.root, file.relative))).toBe(!file.metadata);
  expect(recoverImport(target, plan.digest, plan.digest).status).toBe('complete');
  for (const file of plan.files) expect(fs.readFileSync(path.join(target.root, file.relative), 'utf8')).toBe(file.content);
});

it.each(['before', 'partial', 'complete'])('never overwrites conflicts %s publication', phase => {
  write('config.json', '{"maxTurns":13}'); write('models.json', '{"providers":{}}');
  const plan = preview();
  if (phase === 'partial') {
    const link = fs.linkSync; let calls = 0;
    const fault = vi.spyOn(fs, 'linkSync').mockImplementation((...args) => { if (++calls === 2) throw new Error('interrupt'); return link(...args); });
    expect(applyImport(plan, plan.digest).status).toBe('unknown'); fault.mockRestore();
  }
  if (phase === 'complete') expect(applyImport(plan, plan.digest).status).toBe('complete');
  write('config.json', 'retain target bytes', target);
  expect(applyImport(plan, plan.digest).status).toBe('conflict');
  expect(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).toBe('retain target bytes');
  expect(fs.readFileSync(path.join(source.root, 'config.json'), 'utf8')).toBe('{"maxTurns":13}');
});

it('preserves a competing destination created between inspection and exclusive publication', () => {
  write('config.json', '{"maxTurns":13}'); const plan = preview(['config']); const mkdir = fs.mkdirSync;
  vi.spyOn(fs, 'mkdirSync').mockImplementation((...args) => {
    const result = mkdir(...args);
    if (String(args[0]) === target.root) fs.writeFileSync(path.join(target.root, 'config.json'), 'concurrent target owner');
    return result;
  });
  expect(applyImport(plan, plan.digest).status).toBe('conflict');
  expect(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).toBe('concurrent target owner');
});

it('rejects stale source revisions and replaced roots before consumer effects', () => {
  write('config.json', '{"maxTurns":13}'); let plan = preview();
  write('config.json', '{"maxTurns":14}'); expect(applyImport(plan, plan.digest).status).toBe('rejected');
  expect(fs.existsSync(path.join(target.root, 'config.json'))).toBe(false);
  plan = preview(); fs.renameSync(target.root, `${target.root}-old`); fs.mkdirSync(target.root);
  expect(applyImport(plan, plan.digest).status).toBe('rejected'); expect(fs.readdirSync(target.root)).toEqual([]);
});

it('rejects source and destination links and bounded acquisition failures', () => {
  const external = path.join(home, 'external'); fs.writeFileSync(external, '{"maxTurns":12}');
  fs.symlinkSync(external, path.join(source.root, 'config.json'));
  expect(() => preview(['config'])).toThrow('symbolic'); fs.unlinkSync(path.join(source.root, 'config.json'));
  write('config.json', '{"maxTurns":13}'); const plan = preview(['config']);
  fs.symlinkSync(external, path.join(target.root, 'config.json'));
  expect(applyImport(plan, plan.digest).status).toBe('unknown'); expect(fs.readFileSync(external, 'utf8')).toBe('{"maxTurns":12}');
  fs.unlinkSync(path.join(source.root, 'config.json')); write('config.json', 'x'.repeat(IMPORT_LIMITS.fileBytes + 1));
  expect(() => preview(['config'])).toThrow('size limit');
});

it('retains unknown on lock release failure and refuses cancelled admission without storage effects', () => {
  write('config.json', '{"maxTurns":13}'); const plan = preview(['config']);
  expect(applyImport(plan, plan.digest, () => 'cancelled').status).toBe('rejected'); expect(fs.readdirSync(target.root)).toEqual([]);
  const link = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementation((...args) => { link(...args); fs.unlinkSync(path.join(target.root, '.profile-import.lock')); });
  expect(applyImport(plan, plan.digest).status).toBe('unknown');
  expect(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).toContain('13');
});
