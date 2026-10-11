import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { create, Header } from 'tar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonical, digest, manifest as parseManifest } from './registry/validation.js';
import { changeSources, selectedSource, trustAnchor } from './registry/sources.js';
import { details, exact, registryBytes, search } from './registry/client.js';
import { validateArchive, FILE_BYTES } from './archive/validation.js';
import { extractArchive } from './archive/storage.js';
import { ExtensionStore, readState, versionPath } from './store/state.js';
import { installOperation, removeOperation, rollbackOperation } from './lifecycle/install.js';
import { activationOperation, migrationOperation } from './lifecycle/grants.js';
import { ExtensionService } from './service.js';
import { marketplaceCommand } from './command/marketplace.js';
import { pluginCommand } from './command/plugin.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { loadToolCatalog } from '../core/tools/catalog.js';
import { resolveSkillCatalog } from '../core/skills/skillCatalog.js';
import { routeSlashCommand } from '../core/commands/slashRouter.js';
import { listSlashCommands } from '../entrypoints/slashCommandRegistry.js';
import { runPreparedTool } from '../turn/invoke.js';
import type { ExtensionManifest, Release } from './model.js';
import type { DenyRule } from '../core/shell/approval/deny.js';
import { assertSourceAccess } from '../core/query/sourcePolicy.js';
import { slashSuggestions } from '../cli/interactive/slashSuggestions.js';
import { createDefaultExecutionService, type ExecutionService } from '../runtime/execution/service.js';

let root: string; let workspace: string; let server: Server; let base: string; let service: ExtensionService;
let allow: boolean; let requests: string[]; let approvals: string[]; let denyRules: DenyRule[]; let releases: Release[];
let bodies: Map<string, Buffer>; let hooks: HookDispatcher; let tampered: boolean; let malformed: boolean;
let holdPath: string | undefined; let onHeld: (() => void) | undefined; let held: Array<{ response: ServerResponse; body: Buffer | string }>;
let approvalWait: Promise<void> | undefined;
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const manifest = (version = '1.0.0', permissions: 'read' | 'write' = 'read'): ExtensionManifest => ({ schema: 1, name: 'sample', version, description: 'Synthetic fixture',
  permissions: { workspace: permissions, network: 'none' }, skills: [{ path: 'skills/shared/SKILL.md' }], scripts: [{ name: 'echo', path: 'scripts/echo.sh' }, { name: 'wait', path: 'scripts/wait.sh' }],
  commands: [{ name: 'sample-echo', aliases: ['sample-alias'], description: 'Fixture echo', script: 'echo' }], tools: [{ name: 'echo', description: 'Fixture tool', script: 'echo' }] });

async function archive(pinned = '1.0.0', permissions: 'read' | 'write' = 'read'): Promise<Release> {
  const source = path.join(root, `source-${pinned}`); fs.mkdirSync(path.join(source, 'skills/shared'), { recursive: true }); fs.mkdirSync(path.join(source, 'scripts'), { recursive: true });
  const declared = manifest(pinned, permissions); fs.writeFileSync(path.join(source, 'extension.json'), JSON.stringify(declared));
  fs.writeFileSync(path.join(source, 'skills/shared/SKILL.md'), '---\nname: shared\ndescription: package shared skill\n---\nPackage text </skill> cannot approve writes.');
  fs.writeFileSync(path.join(source, 'scripts/echo.sh'), 'printf "fixture:%s:%s:%s\\n" "$1" "$EXTENSION_WORKSPACE" "${FAKE_PROVIDER_KEY-absent}"\nif [ "$1" = write ]; then printf touched > "$EXTENSION_WORKSPACE/touched"; fi\n');
  fs.writeFileSync(path.join(source, 'scripts/wait.sh'), 'printf started\nsleep 25\n');
  const file = path.join(root, `archive-${pinned}.tgz`);
  await create({ gzip: true, portable: true, cwd: source, file }, ['extension.json', 'skills', 'scripts']);
  const bytes = fs.readFileSync(file); const url = `${base}/archives/${pinned}.tgz`; bodies.set(url, bytes);
  const release = { manifest: declared, digest: digest(bytes), url }; releases.push(release); return release;
}
function newService(store?: ExtensionStore, sessionId = 'test', check = () => {}, execution?: ExecutionService): ExtensionService {
  return new ExtensionService({ root: workspace, store, check, execution, offline: () => false, denyRules: () => denyRules, assertWorkspace: () => {},
    assertSourceAccess: absolute => assertSourceAccess(absolute, workspace, [], undefined, denyRules),
    gate: tool => ({ sessionId, workspaceRoot: workspace, permissionScope: 'ask', hooks, denyRules, emit: () => {},
      escalationPromptHandler: async prompt => { approvals.push(prompt.context.toolName!); await approvalWait; return { decision: allow ? 'allow-once' : 'deny' }; } }) });
}
function holdResponse(selected: string): Promise<void> { holdPath = selected; return new Promise(resolve => { onHeld = resolve; }); }
function resumeResponses(): void { holdPath = undefined; for (const { response, body } of held.splice(0)) response.end(body); }
async function install(pinned = '1.0.0'): Promise<void> { await service.approve(await installOperation(service, `fixture:sample@${pinned}`)); }
async function grant(value: string): Promise<void> { await service.approve(activationOperation(service, workspace, 'grant', 'sample', value), 'extension_grant'); }
async function enable(): Promise<void> { await service.approve(activationOperation(service, workspace, 'enable', 'sample'), 'extension_grant'); }
async function ready(): Promise<void> { await install(); await enable(); for (const value of ['prompt', 'script:echo', 'command:sample-echo', 'tool:echo', 'script:wait']) await grant(value); await service.invalidate(); }

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'extensions-')); workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  vi.stubEnv('HOME', path.join(root, 'home')); vi.stubEnv('USERPROFILE', path.join(root, 'home')); vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(root, 'sources.json'));
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(root, 'owned/registry.json')); vi.stubEnv('CHEERS_PLUGINS_FILE', path.join(root, 'legacy.json')); vi.stubEnv('CHEERS_OFFLINE', '0');
  vi.stubEnv('FAKE_PROVIDER_KEY', 'must-not-inherit'); allow = true; requests = []; approvals = []; denyRules = []; releases = []; bodies = new Map(); hooks = new HookDispatcher(); tampered = false; malformed = false; holdPath = undefined; onHeld = undefined; held = []; approvalWait = undefined;
  server = createServer((request, response) => {
    requests.push(request.url!); const url = new URL(request.url!, base);
    if (url.pathname === '/registry/redirect') { response.writeHead(302, { location: 'http://127.0.0.1:1/elsewhere' }); response.end(); return; }
    const body = bodies.get(url.toString()); if (body) { if (holdPath === url.pathname) { held.push({ response, body }); onHeld?.(); } else response.end(body); return; }
    if (malformed) { response.end('{'); return; }
    const payload = url.pathname.endsWith('/v1/search') ? { protocol: 'extension-registry/v1', packages: [{ name: 'sample', versions: releases.map(entry => entry.manifest.version) }], nextCursor: url.searchParams.has('cursor') ? null : 'page2' }
      : { protocol: 'extension-registry/v1', name: 'sample', versions: releases };
    const signed = JSON.stringify({ payload, keyId: 'publisher', signature: tampered ? Buffer.alloc(64).toString('base64') : sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString('base64') });
    if (holdPath === url.pathname) { held.push({ response, body: signed }); onHeld?.(); } else response.end(signed);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/registry`;
  changeSources(() => [{ name: 'fixture', url: base, trust: trustAnchor('publisher', publicKey, 'explicit synthetic fixture key') }]); await archive(); service = newService();
});
afterEach(async () => { await service?.close(); resumeResponses(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

describe('signed marketplace protocol and bounded archive ownership', () => {
  it('performs selected HTTP search/pagination/details/exact version with independently chosen provenance', async () => {
    const source = selectedSource('fixture'); const first = await search(source, 'sample'); expect(first.nextCursor).toBe('page2');
    expect((await search(source, 'sample', first.nextCursor!)).nextCursor).toBeNull(); expect((await details(source, 'sample'))[0]!.manifest.version).toBe('1.0.0');
    expect((await exact(source, 'sample', '1.0.0')).digest).toBe(releases[0]!.digest); await expect(exact(source, 'sample', 'latest')).rejects.toThrow('exact');
    expect(requests).toHaveLength(4); expect(source.trust!.provenance).toBe('explicit synthetic fixture key');
  });
  it('keeps offline, malformed, untrusted and redirected responses explicit with no silent alternate destination', async () => {
    const source = selectedSource('fixture'); vi.stubEnv('CHEERS_OFFLINE', '1'); await expect(search(source, 'sample')).rejects.toThrow('offline'); expect(requests).toEqual([]);
    vi.stubEnv('CHEERS_OFFLINE', '0'); await expect(search({ ...source, trust: undefined }, 'sample')).rejects.toThrow('untrusted'); expect(requests).toEqual([]);
    tampered = true; await expect(search(source, 'sample')).rejects.toThrow('signature'); tampered = false; malformed = true; await expect(search(source, 'sample')).rejects.toThrow('Malformed'); malformed = false;
    await expect(registryBytes(source, `${base}/redirect`, 1000)).rejects.toThrow('redirect'); expect(requests.some(value => value.includes('elsewhere'))).toBe(false);
    await expect(registryBytes(source, 'http://127.0.0.1:1/other', 1000)).rejects.toThrow('destination');
  });
  it('checks compressed digest before any extraction and binds archive extension.json to its signed manifest', async () => {
    const release = releases[0]!; const body = bodies.get(release.url)!;
    await expect(validateArchive(body, { ...release, digest: '0'.repeat(64) })).rejects.toThrow('integrity'); expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
    await expect(validateArchive(body, { ...release, manifest: { ...release.manifest, version: '2.0.0' } })).rejects.toThrow('differs');
    const validated = await validateArchive(body, release); const stage = path.join(root, 'extracted'); fs.mkdirSync(stage); extractArchive(validated, stage);
    expect(fs.readFileSync(path.join(stage, 'scripts/echo.sh'), 'utf8')).toContain('fixture:');
  });
  it.each(['../escape', '/absolute', 'scripts/link', 'device', 'duplicate', 'case', 'oversize', 'inflate', 'truncated'])('rejects hostile %s archives before publication', async kind => {
    const pinned = releases[0]!; let raw: Buffer;
    if (kind === 'inflate') raw = Buffer.alloc(2 * 1024 * 1024);
    else if (kind === 'truncated') raw = gunzipSync(bodies.get(pinned.url)!).subarray(0, 900);
    else {
      const selected = kind === 'duplicate' ? 'same' : kind === 'case' ? 'Case/a' : kind === 'oversize' ? 'large' : kind;
      const header = new Header({ path: selected, type: kind === 'scripts/link' ? 'SymbolicLink' : kind === 'device' ? 'CharacterDevice' : 'File', linkpath: kind === 'scripts/link' ? '../../escape' : '', size: kind === 'oversize' ? FILE_BYTES + 1 : 0, mode: 0o644 }); header.encode();
      const second = kind === 'duplicate' || kind === 'case' ? new Header({ path: kind === 'duplicate' ? selected : 'case/b', type: 'File', size: 0, mode: 0o644 }) : undefined; second?.encode();
      raw = Buffer.concat([header.block!, ...(second ? [second.block!] : []), Buffer.alloc(1024)]);
    }
    const bytes = gzipSync(raw); await expect(validateArchive(bytes, { ...pinned, digest: digest(bytes) })).rejects.toThrow(); expect(readState().packages).toEqual([]);
  });
  it('rejects unsupported or undeclared permissions instead of silently broadening runtime authority', () => {
    expect(() => parseManifest({ ...manifest(), permissions: { workspace: 'read', network: 'any' } })).toThrow('Unsupported');
    expect(() => parseManifest({ ...manifest(), lifecycle: { install: 'bad' } })).toThrow('Unknown');
    expect(() => parseManifest({ ...manifest(), scripts: [{ name: 'echo', path: '../escape.sh' }] })).toThrow('Unsafe');
  });
});

describe('guarded lifecycle and ordinary approval', () => {
  it.each(['symbolic link', 'regular copy'])('preserves reviewed registration and copied user release after late %s ancestor substitution', async kind => {
    await install(); const record = service.store.read().packages[0]!; const parent = path.dirname(versionPath(record.active));
    const user = path.join(root, 'user-copy'); fs.cpSync(parent, user, { recursive: true }); fs.writeFileSync(path.join(user, 'KEEP'), 'user bytes');
    const operation = removeOperation(service, 'sample');
    hooks.registerInProcessHook({ name: 'replace-owner', event: 'PreToolUse', matcher: 'extension_manage', handler: () => {
      fs.renameSync(parent, `${parent}-retained`); if (kind === 'symbolic link') fs.symlinkSync(user, parent); else fs.cpSync(user, parent, { recursive: true }); return { decision: 'allow' };
    } });
    expect(await service.approve(operation)).toMatch(/symbolic link|changed identity/);
    expect(service.store.read().packages).toHaveLength(1); expect(fs.existsSync(path.join(user, record.active.digest))).toBe(true);
    expect(fs.readFileSync(path.join(user, 'KEEP'), 'utf8')).toBe('user bytes'); expect(fs.existsSync(path.join(`${parent}-retained`, record.active.digest))).toBe(true);
  });
  it.each(['rollback', 'enable', 'grant'])('rejects changed directory ownership after %s approval', async action => {
    await install(); await archive('2.0.0'); await service.approve(await installOperation(service, 'fixture:sample@2.0.0', 'sample'));
    const operation = action === 'rollback' ? rollbackOperation(service, 'sample', '1.0.0') : activationOperation(service, workspace, action as 'enable' | 'grant', 'sample', action === 'grant' ? 'prompt' : undefined);
    const before = service.store.read(); const parent = path.dirname(versionPath(before.packages[0]!.active));
    hooks.registerInProcessHook({ name: 'replace-owner', event: 'PreToolUse', matcher: action === 'rollback' ? 'extension_manage' : 'extension_grant', handler: () => {
      fs.renameSync(parent, `${parent}-retained`); fs.cpSync(`${parent}-retained`, parent, { recursive: true }); return { decision: 'allow' };
    } });
    expect(await service.approve(operation, action === 'rollback' ? 'extension_manage' : 'extension_grant')).toContain('changed identity'); expect(service.store.read()).toEqual(before);
  });
  it.each(['archive', 'metadata', 'details'])('cancels a held %s request and cannot admit its late response', async kind => {
    const operation = kind === 'archive' ? await installOperation(service, 'fixture:sample@1.0.0') : undefined;
    const requested = holdResponse(kind === 'archive' ? '/registry/archives/1.0.0.tgz' : '/registry/v1/packages/sample');
    const running = operation ? service.approve(operation) : kind === 'metadata' ? pluginCommand(['install', 'fixture:sample@1.0.0'], service).then(result => result.output) : marketplaceCommand(['details', 'fixture', 'sample'], service).then(result => result.output);
    await requested; const started = performance.now(); await service.cancel(); expect(performance.now() - started).toBeLessThan(4000);
    expect(service.store.read().packages).toEqual([]); resumeResponses(); expect(await running).toMatch(/cancelled|refused|aborted/); expect(service.store.read().packages).toEqual([]);
  });
  it('withholds a late ordinary approval after bounded cancellation without writing source state', async () => {
    let release!: () => void; approvalWait = new Promise(resolve => { release = resolve; }); const before = fs.readFileSync(path.join(root, 'sources.json'));
    const running = marketplaceCommand(['add', 'other', 'https://example.invalid'], service);
    await vi.waitFor(() => expect(approvals).toContain('extension_manage')); await service.cancel(); release();
    expect((await running).output).toContain('refused'); expect(fs.readFileSync(path.join(root, 'sources.json'))).toEqual(before); expect(service.errors.join('\n')).toContain('did not drain');
  });
  it('enforces read-source policy and current public-key bytes before a trust save', async () => {
    const outside = path.join(root, 'outside-key.pem'); fs.writeFileSync(outside, publicKey);
    expect((await marketplaceCommand(['trust', 'fixture', 'other', outside], service)).output).toContain('refused'); expect(approvals).toEqual([]);
    const file = path.join(workspace, 'publisher.pem'); fs.writeFileSync(file, publicKey); denyRules.push({ tool: 'read', pattern: file });
    expect((await marketplaceCommand(['trust', 'fixture', 'other', file], service)).output).toContain('refused'); expect(approvals).toEqual([]); denyRules.length = 0;
    hooks.registerInProcessHook({ name: 'replace-key', event: 'PreToolUse', matcher: 'extension_manage', handler: () => { fs.renameSync(file, `${file}-retained`); fs.writeFileSync(file, publicKey); return { decision: 'allow' }; } });
    expect((await marketplaceCommand(['trust', 'fixture', 'other', file], service)).output).toContain('public-key source changed'); expect(selectedSource('fixture').trust!.keyId).toBe('publisher');
  });
  it('denied install/source/trust decisions write nothing and execute nothing', async () => {
    allow = false; const preview = await installOperation(service, 'fixture:sample@1.0.0'); const before = fs.readFileSync(path.join(root, 'sources.json'));
    expect(await service.approve(preview)).toContain('refused'); expect(fs.existsSync(path.join(root, 'owned'))).toBe(false); expect(requests.some(value => value.includes('/archives/'))).toBe(false);
    expect((await marketplaceCommand(['add', 'other', 'https://example.invalid'], service)).output).toContain('refused'); expect(fs.readFileSync(path.join(root, 'sources.json'))).toEqual(before);
    expect(approvals).toEqual(['extension_manage', 'extension_manage']);
  });
  it('installs actual files without activation and resets grants on permission-changing update and rollback', async () => {
    await ready(); await archive('2.0.0', 'write'); await service.approve(await installOperation(service, 'fixture:sample@2.0.0', 'sample'));
    let record = service.store.read().packages[0]!; expect(record.active.manifest.permissions.workspace).toBe('write'); expect(record.activation).toEqual({}); expect(record.history).toHaveLength(1);
    await service.approve(rollbackOperation(service, 'sample', '1.0.0')); record = service.store.read().packages[0]!;
    expect(record.active.manifest.version).toBe('1.0.0'); expect(record.activation).toEqual({}); expect(fs.existsSync(versionPath(record.active))).toBe(true);
    expect(approvals.every(value => ['extension_manage', 'extension_grant'].includes(value))).toBe(true);
  });
  it('refuses stale approval and dirty update/uninstall/rollback while preserving user content', async () => {
    await install(); await archive('2.0.0'); const approval = await installOperation(service, 'fixture:sample@2.0.0', 'sample'); await enable();
    expect(await service.approve(approval)).toContain('Approved extension state changed'); expect(service.store.read().packages[0]!.active.manifest.version).toBe('1.0.0');
    await service.approve(await installOperation(service, 'fixture:sample@2.0.0', 'sample'));
    const active = service.store.read().packages[0]!.active; fs.writeFileSync(path.join(versionPath(active), 'user-data.txt'), 'keep me');
    await expect(installOperation(service, 'fixture:sample@2.0.0', 'sample')).rejects.toThrow('dirty'); expect(() => removeOperation(service, 'sample')).toThrow('dirty');
    expect(() => rollbackOperation(service, 'sample', '1.0.0')).toThrow('dirty');
    expect(fs.readFileSync(path.join(versionPath(active), 'user-data.txt'), 'utf8')).toBe('keep me');
  });
  it('keeps actual published files and unknown durability visible after the registry save fails', async () => {
    await service.close(); service = newService(new ExtensionStore(undefined, () => { throw new Error('synthetic save failure'); }));
    const output = await service.approve(await installOperation(service, 'fixture:sample@1.0.0'));
    expect(output).toContain('files published'); expect(output).toContain('durability: unknown'); expect(service.store.outcomes[0]!.effect).toBe('published');
    expect(readState().packages).toEqual([]); expect(fs.existsSync(path.join(root, 'owned/packages/sample', releases[0]!.digest, 'extension.json'))).toBe(true);
    expect((await pluginCommand(['list'], service)).output).toContain('durability unknown');
  });
  it('imports legacy registrations explicitly as unresolved without carrying old enabled flags', async () => {
    const legacy = [{ name: 'old', version: '1.2.3', source: 'path', spec: '/synthetic/legacy', resolved: true, enabled: true }]; const raw = JSON.stringify(legacy); fs.writeFileSync(path.join(root, 'legacy.json'), raw);
    await service.approve(migrationOperation(service)); expect(service.store.read().imports).toEqual([{ name: 'old', version: '1.2.3', spec: '/synthetic/legacy', status: 'unresolved' }]);
    expect(service.store.read().packages).toEqual([]); expect(fs.readFileSync(path.join(root, 'legacy.json'), 'utf8')).toBe(raw);
  });
  it('binds the approved source and cancels interrupted downloads without publishing an installed record', async () => {
    const approval = await installOperation(service, 'fixture:sample@1.0.0');
    hooks.registerInProcessHook({ name: 'change-source', event: 'PreToolUse', matcher: 'extension_manage', handler: () => { changeSources(sources => sources.map(source => ({ ...source, description: 'changed' }))); return { decision: 'allow' }; } });
    expect(await service.approve(approval)).toContain('source or trust anchor changed'); expect(readState().packages).toEqual([]); expect(fs.existsSync(path.join(root, 'owned/packages'))).toBe(false);
    hooks.clear(); const next = await installOperation(service, 'fixture:sample@1.0.0'); const controller = new AbortController(); controller.abort();
    await expect(next.apply({ taskId: 'interrupted', workspaceRoot: workspace, abortSignal: controller.signal })).rejects.toThrow(); expect(readState().packages).toEqual([]);
  });
  it('refuses existing and late substituted package ancestors without overwriting outside user content', async () => {
    const owned = path.join(root, 'owned/packages'); const outside = path.join(root, 'user-content'); fs.mkdirSync(owned, { recursive: true }); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'keep'), 'preserve');
    fs.symlinkSync(outside, path.join(owned, 'sample')); await expect(installOperation(service, 'fixture:sample@1.0.0')).rejects.toThrow('symbolic link'); fs.unlinkSync(path.join(owned, 'sample'));
    const approval = await installOperation(service, 'fixture:sample@1.0.0');
    hooks.registerInProcessHook({ name: 'substitute-package-parent', event: 'PreToolUse', matcher: 'extension_manage', handler: () => { fs.symlinkSync(outside, path.join(owned, 'sample')); return { decision: 'allow' }; } });
    expect(await service.approve(approval)).toContain('symbolic link'); expect(fs.readdirSync(outside)).toEqual(['keep']); expect(fs.readFileSync(path.join(outside, 'keep'), 'utf8')).toBe('preserve'); expect(readState().packages).toEqual([]);
  });
});

describe('actual capability grants, precedence and bounded unload', () => {
  it('cancels a dynamic alias awaiting ordinary approval and refuses its late dispatch', async () => {
    const execution = createDefaultExecutionService(); const dispatched = vi.spyOn(execution, 'runCommand');
    await service.close(); service = newService(undefined, 'test', () => {}, execution); await ready();
    let release!: () => void; approvalWait = new Promise(resolve => { release = resolve; });
    const running = routeSlashCommand('/sample-alias late', { cwd: workspace, sessionId: 'test', interactive: false });
    try {
      await vi.waitFor(() => expect(approvals).toContain('extension_run'));
      const started = performance.now(); const cancelled = await pluginCommand(['cancel'], service);
      expect(performance.now() - started).toBeLessThan(4000); expect(cancelled.output).toContain('did not drain'); expect(dispatched).not.toHaveBeenCalled();
      release(); const result = await running;
      expect((result as { output: string }).output).toContain('refused'); expect((result as { output: string }).output).not.toContain('receipt'); expect(dispatched).not.toHaveBeenCalled();
    } finally { release(); await running; }
  });
  it('withholds a replaced storage owner across restart and still allows builtin disable', async () => {
    await ready(); const record = service.store.read().packages[0]!; const parent = path.dirname(versionPath(record.active)); const captured = resolveSkillCatalog({ workspaceRoot: workspace }).skills.get('shared')!;
    fs.renameSync(parent, `${parent}-retained`); fs.cpSync(`${parent}-retained`, parent, { recursive: true }); expect(captured.isCurrent!()).toBe(false);
    await service.close(); service = newService(); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false); expect(service.errors.join('\n')).toContain('registration withheld');
    const result = await routeSlashCommand('/plugin disable sample', { cwd: workspace, interactive: false, sessionId: 'test', extensionCommand: async (_, args) => pluginCommand(args, service) });
    expect((result as { output: string }).output).toContain('disable saved'); expect(service.store.read().packages[0]!.activation[workspace]!.enabled).toBe(false);
  });
  it('withholds a dirty prompt without blocking builtin recovery or local skill discovery', async () => {
    await ready(); const selected = path.join(versionPath(service.store.read().packages[0]!.active), 'skills/shared/SKILL.md'); fs.appendFileSync(selected, '\nuser bytes');
    const local = path.join(workspace, '.agents/skills/local'); fs.mkdirSync(local, { recursive: true }); fs.writeFileSync(path.join(local, 'SKILL.md'), '---\nname: local\ndescription: owned local\n---\nlocal bytes');
    const catalog = resolveSkillCatalog({ workspaceRoot: workspace }); expect(catalog.skills.has('shared')).toBe(false); expect(catalog.skills.has('local')).toBe(true); expect(service.errors.join('\n')).toContain('prompt contribution withheld');
    const result = await routeSlashCommand('/plugin disable sample', { cwd: workspace, interactive: false, sessionId: 'test', extensionCommand: async (_, args) => pluginCommand(args, service) });
    expect((result as { output: string }).output).toContain('disable saved'); expect(service.store.read().packages[0]!.activation[workspace]!.enabled).toBe(false); expect(fs.readFileSync(selected, 'utf8')).toContain('user bytes');
  });
  it('binds same-workspace catalogs and captured wrappers to their own session and cancellation owner', async () => {
    await ready(); let secondCurrent = true; const second = newService(undefined, 'second', () => { if (!secondCurrent) throw new Error('second revoked'); });
    try {
      const firstTool = (await loadToolCatalog({ workspaceRoot: workspace, sessionId: 'test' })).tools.get('ext_sample_echo')!;
      const secondTool = (await loadToolCatalog({ workspaceRoot: workspace, sessionId: 'second' })).tools.get('ext_sample_echo')!;
      expect(firstTool).not.toBe(secondTool); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false);
      expect(listSlashCommands({ root: workspace, sessionId: 'second' }).some(entry => entry.name === 'sample-echo')).toBe(true); expect(listSlashCommands({ root: root }).some(entry => entry.name === 'sample-echo')).toBe(false);
      expect(slashSuggestions('/sample', undefined, { root: workspace, sessionId: 'second' })?.some(entry => entry.value === '/sample-echo')).toBe(true); expect(slashSuggestions('/sample', undefined, { root })).toBeNull();
      expect((await runPreparedTool(firstTool, { args: [] }, second.options.gate(firstTool.name))).isError).toBe(true);
      secondCurrent = false; expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'second' }).skills.has('shared')).toBe(false); expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'test' }).skills.has('shared')).toBe(true);
      const refused = await routeSlashCommand('/sample-alias other', { cwd: workspace, sessionId: 'second', interactive: false }); expect((refused as { output: string }).output).toContain('could not be confirmed');
      secondCurrent = true; await second.close(); expect((await loadToolCatalog({ workspaceRoot: workspace, sessionId: 'test' })).tools.get('ext_sample_echo')).toBe(firstTool); expect((await loadToolCatalog({ workspaceRoot: workspace, sessionId: 'second' })).tools.has('ext_sample_echo')).toBe(false);
      expect((await runPreparedTool(firstTool, { args: ['owner'] }, service.options.gate(firstTool.name))).output).toContain('fixture:owner:');
    } finally { await second.close(); }
  });
  it('keeps install, enable, prompt and script/tool/command grants distinct', async () => {
    await install(); expect(resolveSkillCatalog({ workspaceRoot: workspace }).skills.has('shared')).toBe(false);
    await enable(); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false);
    await grant('prompt'); expect(resolveSkillCatalog({ workspaceRoot: workspace }).skills.has('shared')).toBe(true);
    expect(await service.run('sample', 'echo', ['ungranted'])).toContain('could not be confirmed');
    await grant('tool:echo'); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false);
    await grant('script:echo'); await service.invalidate(); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(true);
    expect(listSlashCommands().some(entry => entry.name === 'sample-echo')).toBe(false);
  });
  it('runs real dynamic command aliases and model tools through ordinary isolation/receipts without inherited credentials', async () => {
    await ready(); const result = await routeSlashCommand('/sample-alias "hello world"', { cwd: workspace, interactive: false });
    expect(result?.kind).toBe('local'); expect((result as { output: string }).output).toContain('fixture:hello world:'); expect((result as { output: string }).output).toContain(':absent'); expect((result as { output: string }).output).toContain('receipt');
    const tool = (await loadToolCatalog({ workspaceRoot: workspace })).tools.get('ext_sample_echo')!;
    const invoked = await runPreparedTool(tool, { args: ['model'] }, service.options.gate(tool.name)); expect(invoked.isError).toBe(false); expect(invoked.output).toContain('fixture:model:');
    expect(approvals).toContain('extension_run'); expect(approvals).toContain('ext_sample_echo');
    const write = await service.run('sample', 'echo', ['write']); expect(write).toContain('failed'); expect(fs.existsSync(path.join(workspace, 'touched'))).toBe(false);
  });
  it('preserves local skill override and revokes captured tool/skill objects on disable and restart', async () => {
    await ready(); const capturedTool = (await loadToolCatalog({ workspaceRoot: workspace })).tools.get('ext_sample_echo')!;
    const capturedSkill = resolveSkillCatalog({ workspaceRoot: workspace }).skills.get('shared')!;
    const directory = path.join(workspace, '.agents/skills/shared'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: shared\ndescription: local wins\n---\nlocal instructions');
    expect(resolveSkillCatalog({ workspaceRoot: workspace }).skills.get('shared')!.description).toBe('local wins');
    await service.approve(activationOperation(service, workspace, 'disable', 'sample'), 'extension_grant'); await service.invalidate();
    expect(capturedSkill.isCurrent!()).toBe(false); expect((await runPreparedTool(capturedTool, { args: [] }, service.options.gate(capturedTool.name))).isError).toBe(true);
    expect(listSlashCommands().some(entry => entry.name === 'sample-echo')).toBe(false); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false);
    await service.close(); service = newService(); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false);
  });
  it('withholds old activation after the workspace directory is replaced at the same path', async () => {
    await ready(); await service.close(); fs.renameSync(workspace, `${workspace}-old`); fs.mkdirSync(workspace); service = newService();
    expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false); expect(listSlashCommands().some(entry => entry.name === 'sample-echo')).toBe(false);
    expect(service.errors.join('\n')).toContain('registration withheld');
  });
  it('rechecks source trust and file denial before execution, including after ordinary hooks', async () => {
    await ready(); denyRules.push({ tool: 'read', pattern: 'private' }); expect(await service.run('sample', 'echo', ['denied'])).toContain('file deny rules'); expect(fs.existsSync(path.join(workspace, 'touched'))).toBe(false); denyRules.length = 0;
    hooks.registerInProcessHook({ name: 'revoke-after', event: 'PostToolUse', matcher: 'extension_run', handler: () => { changeSources(sources => sources.map(source => ({ ...source, trust: undefined }))); return { decision: 'allow' }; } });
    const result = await service.run('sample', 'echo', ['after']); expect(result).toContain('fixture:after:'); expect(result).toContain('authority changed after ordinary hooks'); expect(result).toContain('receipt');
  });
  it('cancels live script calls during disable and deterministically unregisters before cleanup', async () => {
    await ready(); const running = service.run('sample', 'wait', []); await new Promise(resolve => setTimeout(resolve, 100));
    const cancellationStarted = performance.now();
    await service.approve(activationOperation(service, workspace, 'disable', 'sample'), 'extension_grant');
    expect(await running).toContain('cancelled'); expect(performance.now() - cancellationStarted).toBeLessThan(4000);
    expect(listSlashCommands().some(entry => entry.name === 'sample-echo')).toBe(false); expect(fs.readdirSync(path.join(root, 'owned')).some(entry => entry.startsWith('.run-'))).toBe(false);
  });
  it('rejects shutdown while a live operation ignores cancellation and confirms cleanup only after it settles', async () => {
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const operation = service.request(() => { started(); return new Promise<void>(resolve => { release = resolve; }); });
    const outcome = operation.catch(error => error);
    await entered;
    try { await expect(service.close()).rejects.toThrow('cleanup remains unknown'); }
    finally { release(); await outcome; }
    await expect(service.close()).resolves.toBeUndefined();
  });
  it('uninstalls intact owned versions and preserves data outside them', async () => {
    await ready(); const data = path.join(root, 'owned/data/sample'); fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(data, 'keep'), 'user data');
    expect(await service.approve(removeOperation(service, 'sample'))).toContain('uninstalled'); expect(service.store.read().packages).toEqual([]); expect(fs.readFileSync(path.join(data, 'keep'), 'utf8')).toBe('user data');
    expect(listSlashCommands().some(entry => entry.name === 'sample-echo')).toBe(false);
  });
});
