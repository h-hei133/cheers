import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { create, Header } from 'tar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonical, digest, manifest as parseManifest } from './registry/validation.js';
import { changeSources, selectedSource, trustAnchor } from './registry/sources.js';
import { details, exact, registryBytes, search } from './registry/client.js';
import { validateArchive, FILE_BYTES } from './archive/validation.js';
import { extractArchive } from './archive/storage.js';
import { ExtensionStore, readState, versionPath } from './store/state.js';
import { prepareInstallPlan, removeOperation, rollbackOperation } from './lifecycle/install.js';
import { activationOperation, migrationOperation, rootSignature } from './lifecycle/grants.js';
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
import { extensionManager } from './view/manager.js';
import { projectExtensions } from './view/projection.js';
import { packageActions } from './view/actions.js';
import type { ExtensionManager, ExtensionSnapshot } from './view/model.js';
import { ShellCommandRuntime } from '../core/shell/command.js';


let root: string; let workspace: string; let server: Server; let base: string; let service: ExtensionService;
let allow: boolean; let requests: string[]; let approvals: string[]; let denyRules: DenyRule[]; let releases: Release[];
let bodies: Map<string, Buffer>; let redirects: Map<string, string>; let hooks: HookDispatcher; let tampered: boolean; let malformed: boolean;
let holdPath: string | undefined; let onHeld: (() => void) | undefined; let held: Array<{ response: ServerResponse; body: Buffer | string }>;
let approvalWait: Promise<void> | undefined;
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const manifest = (version = '1.0.0', permissions: 'read' | 'write' = 'read'): ExtensionManifest => ({ schema: 1, name: 'sample', version, description: 'Synthetic fixture',
  permissions: { workspace: permissions, network: 'none' }, skills: [{ path: 'skills/shared/SKILL.md' }], scripts: [{ name: 'echo', path: 'scripts/echo.sh' }, { name: 'wait', path: 'scripts/wait.sh' }],
  commands: [{ name: 'sample-echo', aliases: ['sample-alias'], description: 'Fixture echo', script: 'echo' }], tools: [{ name: 'echo', description: 'Fixture tool', script: 'echo' }] });

function localPackage(name: string, version = '1.0.0', parent = workspace): string {
  const directory = path.join(parent, name);
  const declared = manifest(version);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'extension.json'), JSON.stringify(declared));
  for (const file of [...declared.scripts, ...declared.skills]) {
    const target = path.join(directory, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fixture contents');
  }
  return directory;
}

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

async function npmArchive(pinned = '2.0.0', options: {
  readonly unscoped?: boolean; readonly envelope?: string; readonly packageName?: string;
  readonly packageVersion?: string; readonly manifestVersion?: string;
} = {}) {
  const staging = path.join(root, `npm-${pinned}`);
  const envelope = options.envelope ?? 'package';
  const name = options.unscoped ? 'sample' : '@scope/sample';
  fs.mkdirSync(staging);
  const directory = localPackage(envelope, options.manifestVersion ?? pinned, staging);
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
    name: options.packageName ?? name,
    version: options.packageVersion ?? pinned,
    scripts: { preinstall: 'exit 17' },
  }));
  const file = path.join(staging, 'archive.tgz');
  await create({ gzip: true, portable: true, cwd: staging, file }, [envelope]);
  const bytes = fs.readFileSync(file);
  const tarball = `${base}/${name}/-/sample-${pinned}.tgz`;
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const metadata = { name, version: pinned, dist: { integrity, tarball } };
  const metadataUrl = `${base}/${options.unscoped ? 'sample' : '@scope%2Fsample'}/${pinned}`;
  bodies.set(metadataUrl, Buffer.from(JSON.stringify(metadata)));
  bodies.set(tarball, bytes);
  return { selector: `npm:${name}@${pinned}`, bytes, metadata, metadataUrl };
}

function gitPackage(): string {
  const repository = localPackage('archive-repo', '2.0.0', root);
  execFileSync('git', ['init', '-q', repository]);
  return repository;
}

function gitArchive(repository: string, content: string, options: { envelope?: string; version?: string } = {}) {
  fs.writeFileSync(path.join(repository, 'extension.json'), JSON.stringify(manifest(options.version ?? '2.0.0')));
  fs.writeFileSync(path.join(repository, 'scripts/echo.sh'), content);
  fs.writeFileSync(path.join(repository, 'package.json'), JSON.stringify({ scripts: { preinstall: 'exit 17' } }));
  execFileSync('git', ['-C', repository, 'add', '--', 'extension.json', 'package.json', 'scripts', 'skills']);
  execFileSync('git', ['-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
  const commit = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const bytes = execFileSync('git', ['-C', repository, 'archive', '--format=tar.gz',
    `--prefix=${options.envelope ?? `archive-repo-${commit}`}/`, commit]);
  const url = `${base}/owner/archive-repo/tar.gz/${commit}`;
  bodies.set(url, bytes);
  return { commit, bytes, url, selector: `git:https://github.com/owner/archive-repo#${commit}` };
}

function newService(store?: ExtensionStore, sessionId = 'test', check = () => {}, execution?: ExecutionService): ExtensionService {
  return new ExtensionService({ root: workspace, store, check, execution, offline: () => false, denyRules: () => denyRules,
    assertWorkspace: () => {}, npmRegistry: base, gitArchiveBase: base,
    assertSourceAccess: absolute => assertSourceAccess(absolute, workspace, [], undefined, denyRules),
    gate: tool => ({ sessionId, workspaceRoot: workspace, permissionScope: 'ask', hooks, denyRules, emit: () => {},
      escalationPromptHandler: async prompt => { approvals.push(prompt.context.toolName!); await approvalWait; return { decision: allow ? 'allow-once' : 'deny' }; } }) });
}
function holdResponse(selected: string): Promise<void> { holdPath = selected; return new Promise(resolve => { onHeld = resolve; }); }
function resumeResponses(): void { holdPath = undefined; for (const { response, body } of held.splice(0)) response.end(body); }
async function installOperation(host: ExtensionService, selector: string, replacing?: string) {
  const plan = await prepareInstallPlan(host, selector, replacing);
  expect(plan.acquisition).toBeUndefined();
  return plan.complete();
}
async function install(pinned = '1.0.0'): Promise<void> { await service.approve(await installOperation(service, `fixture:sample@${pinned}`)); }
async function grant(value: string): Promise<void> { await service.approve(activationOperation(service, workspace, 'grant', 'sample', value), 'extension_grant'); }
async function enable(): Promise<void> { await service.approve(activationOperation(service, workspace, 'enable', 'sample'), 'extension_grant'); }
async function ready(): Promise<void> { await install(); await enable(); for (const value of ['prompt', 'script:echo', 'command:sample-echo', 'tool:echo', 'script:wait']) await grant(value); await service.invalidate(); }

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'extensions-')); workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  execFileSync('git', ['init', '-q', workspace]);
  vi.stubEnv('HOME', path.join(root, 'home')); vi.stubEnv('USERPROFILE', path.join(root, 'home')); vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(root, 'sources.json'));
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(root, 'owned/registry.json')); vi.stubEnv('CHEERS_PLUGINS_FILE', path.join(root, 'legacy.json')); vi.stubEnv('CHEERS_OFFLINE', '0');
  vi.stubEnv('FAKE_PROVIDER_KEY', 'must-not-inherit'); allow = true; requests = []; approvals = []; denyRules = []; releases = []; bodies = new Map(); redirects = new Map(); hooks = new HookDispatcher(); tampered = false; malformed = false; holdPath = undefined; onHeld = undefined; held = []; approvalWait = undefined;
  server = createServer((request, response) => {
    requests.push(request.url!); const url = new URL(request.url!, base);
    const location = redirects.get(url.toString());
    if (location) { response.writeHead(302, { location }); response.end(); return; }
    const body = bodies.get(url.toString()); if (body) { if (holdPath === url.pathname) { held.push({ response, body }); onHeld?.(); } else response.end(body); return; }
    if (malformed) { response.end('{'); return; }
    const payload = url.pathname.endsWith('/v1/search') ? { protocol: 'extension-registry/v1', packages: [{ name: 'sample', versions: releases.map(entry => entry.manifest.version) }], nextCursor: url.searchParams.has('cursor') ? null : 'page2' }
      : { protocol: 'extension-registry/v1', name: 'sample', versions: releases };
    const signed = JSON.stringify({ payload, keyId: 'publisher', signature: tampered ? Buffer.alloc(64).toString('base64') : sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString('base64') });
    if (holdPath === url.pathname) { held.push({ response, body: signed }); onHeld?.(); } else response.end(signed);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/registry`;
  redirects.set(`${base}/redirect`, 'http://127.0.0.1:1/elsewhere');
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

describe('exact npm package installation', () => {
  it('publishes the approved scoped archive and enables or rolls back retained versions offline', async () => {
    const first = await npmArchive();
    const plan = await prepareInstallPlan(service, first.selector);
    expect(plan.acquisition?.preview).toContain('Npm package @scope/sample@2.0.0');
    expect(plan.acquisition?.preview).toContain(`Registry ${base}`);
    expect(requests).toEqual([]);
    expect(approvals).toEqual([]);
    expect((await service.approveResult(plan.acquisition!)).isError).toBe(false);
    const pending = plan.complete();
    expect(pending.preview).toContain(`Manifest ${canonical(manifest('2.0.0'))}`);
    expect(pending.preview).toContain(`SHA256 ${digest(first.bytes)}`);
    expect(approvals).toEqual(['extension_manage']);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
    bodies.set(first.metadata.dist.tarball, Buffer.from('changed after review'));
    expect(await service.approve(pending)).toContain('durability: confirmed');
    expect(requests).toEqual(['/registry/@scope%2Fsample/2.0.0', '/registry/@scope/sample/-/sample-2.0.0.tgz']);
    expect(approvals).toEqual(['extension_manage', 'extension_manage']);

    const installed = service.store.read().packages[0]!;
    expect(installed).toMatchObject({ active: { origin: 'npm', source: 'npm', registry: base, packageName: '@scope/sample',
      integrity: first.metadata.dist.integrity, url: first.metadata.dist.tarball, digest: digest(first.bytes), manifest: manifest('2.0.0') }, activation: {} });
    expect(installed.active).not.toHaveProperty('trustFingerprint');
    expect(fs.readFileSync(path.join(versionPath(installed.active), 'scripts/echo.sh'), 'utf8')).toBe('fixture contents');

    const next = await npmArchive('3.0.0');
    expect((await pluginCommand(['update', 'sample', next.selector], service)).output).toContain('durability: confirmed');
    const onlineRequests = [...requests];
    vi.stubEnv('CHEERS_OFFLINE', '1');
    await enable();
    await grant('script:echo');
    expect(service.store.read().packages[0]!.activation[workspace]).toMatchObject({ enabled: true, grants: ['script:echo'] });
    expect((await pluginCommand(['rollback', 'sample', '2.0.0'], service)).output).toContain('durability: confirmed');
    expect(service.store.read().packages[0]).toMatchObject({ active: installed.active, activation: {} });
    await enable();
    expect(service.store.read().packages[0]!.activation[workspace]).toMatchObject({ enabled: true, grants: [] });
    expect(requests).toEqual(onlineRequests);
  });

  it('requires ordinary approval for an unscoped release and publishes only after authorization', async () => {
    const fixture = await npmArchive('2.0.0', { unscoped: true });
    allow = false;
    expect((await pluginCommand(['install', fixture.selector], service)).output).toMatch(/refused/i);
    expect(approvals).toEqual(['extension_manage']);
    expect(requests).toEqual([]);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
    allow = true;
    expect((await pluginCommand(['install', fixture.selector], service)).output).toContain('durability: confirmed');
    expect(service.store.read().packages[0]).toMatchObject({ active: { origin: 'npm', packageName: 'sample' }, activation: {} });
  });

  it('keeps an existing marketplace named npm on its signed route', async () => {
    changeSources(current => [...current, { ...current[0]!, name: 'npm' }]);
    const fixture = await npmArchive('1.0.0', { unscoped: true });
    expect((await pluginCommand(['install', fixture.selector], service)).output).toContain('durability: confirmed');
    expect(service.store.read().packages[0]!.active).toMatchObject({ source: 'npm', trustFingerprint: selectedSource('npm').trust!.fingerprint });
    expect(requests).toEqual(['/registry/v1/packages/sample', '/registry/archives/1.0.0.tgz']);
  });

  it.each(['latest', '^2.0.0'])('refuses npm selector %s before network or approval', async version => {
    expect((await pluginCommand(['install', `npm:@scope/sample@${version}`], service)).output).toContain('exact extension version');
    expect(requests).toEqual([]);
    expect(approvals).toEqual([]);
  });

  it.each(['metadata identity', 'cross-origin archive', 'metadata redirect', 'archive redirect', 'integrity'] as const)(
    'refuses npm %s before publication review', async failure => {
      const fixture = await npmArchive();
      const { metadata, metadataUrl } = fixture;
      const tarball = metadata.dist.tarball;
      let error: string;
      if (failure === 'metadata identity') {
        bodies.set(metadataUrl, Buffer.from(JSON.stringify({ ...metadata, version: '2.0.1' })));
        error = 'does not match the exact requested package and version';
      } else if (failure === 'cross-origin archive') {
        const dist = { ...metadata.dist, tarball: 'http://127.0.0.1:1/other.tgz' };
        bodies.set(metadataUrl, Buffer.from(JSON.stringify({ ...metadata, dist })));
        error = 'destination differs';
      } else if (failure === 'metadata redirect' || failure === 'archive redirect') {
        redirects.set(failure === 'metadata redirect' ? metadataUrl : tarball, `${base}/elsewhere.tgz`);
        error = 'redirect refused';
      } else {
        bodies.set(tarball, Buffer.from('invalid archive bytes'));
        error = 'archive integrity mismatch';
      }
      const result = await pluginCommand(['install', fixture.selector], service);
      expect(result.output).toContain(error);
      expect(requests).toEqual(failure === 'archive redirect' || failure === 'integrity'
        ? [new URL(metadataUrl).pathname, new URL(tarball).pathname] : [new URL(metadataUrl).pathname]);
      expect(approvals).toEqual(['extension_manage']);
      expect(service.store.read().packages).toEqual([]);
      expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
    },
  );

  it.each([
    ['root', { envelope: 'different' }, 'must be inside the expected package directory'],
    ['package name', { packageName: '@other/sample' }, 'archive package identity differs'],
    ['package version', { packageVersion: '2.0.1' }, 'archive package identity differs'],
    ['manifest version', { manifestVersion: '2.0.1' }, 'extension manifest version differs'],
  ] as const)('rejects an npm archive with a mismatched %s', async (_kind, options, error) => {
    const fixture = await npmArchive('2.0.0', options);
    expect((await pluginCommand(['install', fixture.selector], service)).output).toContain(error);
    expect(approvals).toEqual(['extension_manage']);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
  });
});

describe('exact Git commit installation', () => {
  it('publishes the approved archive and recovers the exact retained commit offline', async () => {
    const repository = gitPackage();
    const first = gitArchive(repository, 'first snapshot');
    const plan = await prepareInstallPlan(service, first.selector.replace('#', '.git#'));
    expect(plan.acquisition?.preview).toContain('Git repository https://github.com/owner/archive-repo');
    expect(plan.acquisition?.preview).toContain(`Commit ${first.commit}`);
    expect(requests).toEqual([]);
    expect(approvals).toEqual([]);
    expect((await service.approveResult(plan.acquisition!)).isError).toBe(false);
    const operation = plan.complete();
    expect(operation.preview).toContain(`SHA256 ${digest(first.bytes)}`);
    expect(operation.preview).toContain(`Manifest ${canonical(manifest('2.0.0'))}`);
    expect(approvals).toEqual(['extension_manage']);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);

    bodies.set(first.url, Buffer.from('changed after review'));
    expect(await service.approve(operation)).toContain('durability: confirmed');
    expect(requests).toEqual([new URL(first.url).pathname]);
    const installed = service.store.read().packages[0]!;
    expect(installed).toMatchObject({ active: { origin: 'git', source: 'git', repository: 'https://github.com/owner/archive-repo',
      commit: first.commit, digest: digest(first.bytes), url: first.url, manifest: manifest('2.0.0') }, activation: {} });
    expect(fs.readFileSync(path.join(versionPath(installed.active), 'scripts/echo.sh'), 'utf8')).toBe('first snapshot');

    const second = gitArchive(repository, 'second snapshot');
    const third = gitArchive(repository, 'third snapshot');
    for (const fixture of [second, third]) {
      expect((await pluginCommand(['update', 'sample', fixture.selector], service)).output).toContain('durability: confirmed');
    }
    const current = service.store.read().packages[0]!;
    const actions = packageActions(current, workspace, rootSignature(workspace));
    expect(actions.filter(action => action.args[0] === 'rollback').map(action => action.args[2])).toEqual([digest(second.bytes), installed.active.digest]);
    expect(current.active).toMatchObject({ commit: third.commit });

    const onlineRequests = [...requests];
    vi.stubEnv('CHEERS_OFFLINE', '1');
    expect((await pluginCommand(['rollback', 'sample', installed.active.digest], service)).output).toContain('durability: confirmed');
    expect(service.store.read().packages[0]).toMatchObject({ active: installed.active, activation: {} });
    await enable();
    expect(service.store.read().packages[0]!.activation[workspace]).toMatchObject({ enabled: true, grants: [] });
    expect(requests).toEqual(onlineRequests);
  });

  it('preserves approval refusal and the signed marketplace named git', async () => {
    const fixture = gitArchive(gitPackage(), 'denied snapshot');
    allow = false;
    expect((await pluginCommand(['install', fixture.selector], service)).output).toMatch(/refused/i);
    expect(approvals).toEqual(['extension_manage']);
    expect(requests).toEqual([]);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);

    allow = true;
    changeSources(current => [...current, { ...current[0]!, name: 'git' }]);
    expect((await pluginCommand(['install', 'git:sample@1.0.0'], service)).output).toContain('durability: confirmed');
    expect(service.store.read().packages[0]!.active).toMatchObject({ source: 'git', trustFingerprint: selectedSource('git').trust!.fingerprint });
    expect(requests).toEqual(['/registry/v1/packages/sample', '/registry/archives/1.0.0.tgz']);
  });

  it.each([
    ['git:https://github.com/owner/archive-repo', 'full Git commit ID'],
    ['git:https://github.com/owner/archive-repo#main', 'full Git commit ID'],
    ['git:https://github.com/owner/archive-repo#1234567', 'full Git commit ID'],
    [`git:https://user@github.com/owner/archive-repo#${'1'.repeat(40)}`, 'credential-free HTTPS repository URL'],
    [`git:https://example.invalid/owner/archive-repo#${'1'.repeat(40)}`, 'credential-free HTTPS repository URL'],
    [`git:http://github.com/owner/archive-repo#${'1'.repeat(40)}`, 'credential-free HTTPS repository URL'],
  ])('rejects %s before requesting an archive or approval', async (selector, reason) => {
    expect((await pluginCommand(['install', selector], service)).output).toContain(reason);
    expect(requests).toEqual([]);
    expect(approvals).toEqual([]);
  });

  it.each(['commit', 'directory', 'manifest', 'redirect'] as const)('rejects invalid Git archive %s before publication review', async failure => {
    const fixture = gitArchive(gitPackage(), 'fixture', {
      ...(failure === 'directory' ? { envelope: 'different' } : {}),
      ...(failure === 'manifest' ? { version: 'latest' } : {}),
    });
    const wrong = 'f'.repeat(40);
    const selector = failure === 'commit' ? fixture.selector.replace(fixture.commit, wrong) : fixture.selector;
    const url = failure === 'commit' ? fixture.url.replace(fixture.commit, wrong) : fixture.url;
    bodies.set(url, fixture.bytes);
    if (failure === 'redirect') redirects.set(url, `${base}/elsewhere`);
    const errors = { commit: 'does not identify the complete requested commit', directory: 'inside the expected package directory',
      manifest: 'exact extension version', redirect: 'redirect refused' };
    expect((await pluginCommand(['install', selector], service)).output).toContain(errors[failure]);
    expect(requests).toEqual([new URL(url).pathname]);
    expect(approvals).toEqual(['extension_manage']);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
  });

  it('cancels in-flight Git archive acquisition without leaving a publication', async () => {
    const fixture = gitArchive(gitPackage(), 'interrupted snapshot');
    const controller = new AbortController();
    const received = holdResponse(new URL(fixture.url).pathname);
    const pending = pluginCommand(['install', fixture.selector], service, { signal: controller.signal });
    await received;
    controller.abort();
    expect((await pending).installConfirmed).toBe(false);
    expect(approvals).toEqual(['extension_manage']);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
  });
});

describe('guarded lifecycle and ordinary approval', () => {
  it('refuses publication when lifecycle admission changes during the approved archive download', async () => {
    const gate = service.options.gate;
    let current = true;
    vi.spyOn(service.options, 'gate').mockImplementation(tool => ({ ...gate(tool),
      admission: () => current ? undefined : 'Extension installation authority changed.' }));
    const downloaded = holdResponse('/registry/archives/1.0.0.tgz');
    const pending = pluginCommand(['install', 'fixture:sample@1.0.0'], service);
    await downloaded;
    current = false;
    resumeResponses();
    expect((await pending).installConfirmed).toBe(false);
    expect(approvals).toEqual(['extension_manage']);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
  });

  it.each(['npm', 'git'] as const)('keeps %s acquisition and publication approvals separate in the standalone command', async source => {
    const fixture = source === 'npm' ? await npmArchive() : gitArchive(gitPackage(), 'fixture snapshot');
    const gate = service.options.gate;
    const observations: { requests: number; owned: boolean }[] = [];
    const handler = vi.fn<NonNullable<ReturnType<typeof gate>['escalationPromptHandler']>>().mockImplementation(async () => {
      observations.push({ requests: requests.length, owned: fs.existsSync(path.join(root, 'owned')) });
      return { decision: observations.length === 1 ? 'allow-once' : 'deny' };
    });
    vi.spyOn(service.options, 'gate').mockImplementation(tool => ({ ...gate(tool), escalationPromptHandler: handler }));
    const result = await pluginCommand(['install', fixture.selector], service, { explicitApproval: true });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(observations).toEqual([{ requests: 0, owned: false }, { requests: source === 'npm' ? 2 : 1, owned: false }]);
    const [download, publication] = handler.mock.calls.map(([prompt]) => prompt.context);
    expect(download?.preview).toContain('Download and validate');
    expect(publication?.preview).toContain(`SHA256 ${digest(fixture.bytes)}`);
    expect(publication?.preview).toContain(`Manifest ${canonical(manifest('2.0.0'))}`);
    expect(handler.mock.calls.every(([prompt]) => prompt.context.explicitApproval === true
      && !prompt.options.some(option => option.value === 'allow-always'))).toBe(true);
    expect(result.installConfirmed).toBe(false);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
  });

  it('refuses changing the archive endpoint after the download preview', async () => {
    const fixture = gitArchive(gitPackage(), 'fixture snapshot');
    const gate = service.options.gate;
    const handler = vi.fn<NonNullable<ReturnType<typeof gate>['escalationPromptHandler']>>().mockImplementation(async () => {
      Object.defineProperty(service, 'gitArchiveBase', { value: `${base}/changed` });
      return { decision: 'allow-once' };
    });
    vi.spyOn(service.options, 'gate').mockImplementation(tool => ({ ...gate(tool), escalationPromptHandler: handler }));
    const result = await pluginCommand(['install', fixture.selector], service);
    expect(result.output).toContain('Approved Git archive endpoint changed');
    expect(result.installConfirmed).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    expect(requests).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(false);
  });

  it.each(['allow-always', 'allow-once'] as const)('requires the standalone installation to receive one-time approval (%s)', async decision => {
    localPackage('package');
    const gate = service.options.gate;
    const handler = vi.fn<NonNullable<ReturnType<typeof gate>['escalationPromptHandler']>>().mockResolvedValue({ decision });
    vi.spyOn(service.options, 'gate').mockImplementation(tool => ({ ...gate(tool), escalationPromptHandler: handler }));
    const result = await pluginCommand(['install', './package'], service, { explicitApproval: true });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ explicitApproval: true,
      preview: expect.stringContaining('Install sample@1.0.0') }) }));
    expect(handler.mock.calls[0]?.[0].options.map(option => option.value)).not.toContain('allow-always');
    expect(result.installConfirmed).toBe(decision === 'allow-once');
    expect(fs.existsSync(path.join(root, 'owned'))).toBe(decision === 'allow-once');
  });

  it('installs an approved local snapshot and preserves separate grants through an exact downgrade and rollback', async () => {
    const newer = localPackage('newer', '2.0.0');
    const older = localPackage('older');
    const binary = Buffer.from([0, 255, 97]);
    fs.writeFileSync(path.join(newer, 'fixture.bin'), binary);
    expect((await pluginCommand(['install', './newer'], service)).output).toContain('durability: confirmed');
    const first = service.store.read().packages[0]!;
    expect(first).toMatchObject({ active: { origin: 'local', source: 'local', manifest: { version: '2.0.0' } }, activation: {} });
    expect(first.active).not.toHaveProperty('trustFingerprint');
    expect(fs.readFileSync(path.join(versionPath(first.active), 'fixture.bin'))).toEqual(binary);
    expect(approvals).toEqual(['extension_manage']);
    fs.rmSync(newer, { recursive: true });
    await enable(); await grant('script:echo');
    expect(service.store.read().packages[0]!.activation[workspace]?.grants).toEqual(['script:echo']);
    const downgrade = await installOperation(service, './older', 'sample');
    expect(downgrade.preview).toContain('Replace sample@2.0.0 with sample@1.0.0');
    expect(await service.approve(downgrade)).toContain('durability: confirmed');
    const replaced = service.store.read().packages[0]!;
    expect(replaced).toMatchObject({ active: { manifest: { version: '1.0.0' } }, activation: {} });
    expect(replaced.history).toEqual([first.active]);
    expect((await pluginCommand(['rollback', 'sample', '2.0.0'], service)).output).toContain('durability: confirmed');
    expect(service.store.read().packages[0]).toMatchObject({ active: first.active, activation: {} });
    expect(fs.existsSync(path.join(older, 'extension.json'))).toBe(true);
    expect(requests).toEqual([]);
  });

  it.each(['approval denial', 'digest', 'directory identity'] as const)('keeps local installation unpublished after %s', async mode => {
    const directory = localPackage('package');
    const operation = await installOperation(service, './package');
    if (mode === 'approval denial') allow = false;
    if (mode === 'digest') fs.writeFileSync(path.join(directory, 'scripts/echo.sh'), 'changed after preview');
    if (mode === 'directory identity') { fs.renameSync(directory, `${directory}-original`); fs.cpSync(`${directory}-original`, directory, { recursive: true }); }
    expect(await service.approve(operation)).toMatch(/refused|changed/);
    expect(service.store.read().packages).toEqual([]);
    expect(fs.existsSync(path.join(root, 'owned/packages'))).toBe(false);
    expect(requests).toEqual([]);
  });

  it.each(['outside', 'deny', 'symlink', 'hardlink', 'undeclared-format', 'missing-file'] as const)('refuses an unsafe local package before approval (%s)', async mode => {
    const directory = localPackage('package');
    const file = path.join(directory, 'scripts/echo.sh');
    if (mode === 'deny') denyRules.push({ tool: 'read', pattern: file });
    if (mode === 'symlink') fs.symlinkSync(file, path.join(directory, 'linked.sh'));
    if (mode === 'hardlink') fs.linkSync(file, path.join(directory, 'linked.sh'));
    if (mode === 'undeclared-format') fs.writeFileSync(path.join(directory, 'extension.json'), JSON.stringify({ ...manifest(), install: 'run' }));
    if (mode === 'missing-file') fs.rmSync(file);
    const selected = mode === 'outside' ? path.join(root, 'source-1.0.0') : './package';
    expect((await pluginCommand(['install', selected], service)).output).toContain('Extension refused');
    expect(approvals).toEqual([]);
    expect(service.store.read().packages).toEqual([]);
    expect(requests).toEqual([]);
  });

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
  it('retains unknown publication in a journal across a fresh store instance', async () => {
    await service.close();
    service = newService(new ExtensionStore(undefined, () => { throw new Error('synthetic save failure'); }));
    await service.approve(await installOperation(service, 'fixture:sample@1.0.0'));

    const restarted = new ExtensionStore();
    expect(restarted.outcomes).toContainEqual(expect.objectContaining({
      effect: 'published',
      durability: 'unknown',
    }));
    let applied = false;
    expect(() => restarted.locked(restarted.read(), () => { applied = true; }))
      .toThrow('publication is uncertain');
    expect(applied).toBe(false);

    restarted.resolveUnknown();
    expect(restarted.outcomes).toEqual([]);
    expect(() => restarted.locked(restarted.read(), () => { applied = true; })).not.toThrow();
    expect(applied).toBe(true);
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
    await ready(); const record = service.store.read().packages[0]!; const parent = path.dirname(versionPath(record.active)); const captured = (await resolveSkillCatalog({ workspaceRoot: workspace })).skills.get('shared')!;
    fs.renameSync(parent, `${parent}-retained`); fs.cpSync(`${parent}-retained`, parent, { recursive: true }); expect(captured.isCurrent!()).toBe(false);
    await service.close(); service = newService(); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false); expect(service.errors.join('\n')).toContain('registration withheld');
    const result = await routeSlashCommand('/plugin disable sample', { cwd: workspace, interactive: false, sessionId: 'test', extensionCommand: async (_, args) => pluginCommand(args, service) });
    expect((result as { output: string }).output).toContain('disable saved'); expect(service.store.read().packages[0]!.activation[workspace]!.enabled).toBe(false);
  });
  it('withholds a dirty prompt without blocking builtin recovery or local skill discovery', async () => {
    await ready(); const selected = path.join(versionPath(service.store.read().packages[0]!.active), 'skills/shared/SKILL.md'); fs.appendFileSync(selected, '\nuser bytes');
    const local = path.join(workspace, '.agents/skills/local'); fs.mkdirSync(local, { recursive: true }); fs.writeFileSync(path.join(local, 'SKILL.md'), '---\nname: local\ndescription: owned local\n---\nlocal bytes');
    const catalog = (await resolveSkillCatalog({ workspaceRoot: workspace })); expect(catalog.skills.has('shared')).toBe(false); expect(catalog.skills.has('local')).toBe(true); expect(service.errors.join('\n')).toContain('prompt contribution withheld');
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
      secondCurrent = false; expect((await resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'second' })).skills.has('shared')).toBe(false); expect((await resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'test' })).skills.has('shared')).toBe(true);
      const refused = await routeSlashCommand('/sample-alias other', { cwd: workspace, sessionId: 'second', interactive: false }); expect((refused as { output: string }).output).toContain('could not be confirmed');
      secondCurrent = true; await second.close(); expect((await loadToolCatalog({ workspaceRoot: workspace, sessionId: 'test' })).tools.get('ext_sample_echo')).toBe(firstTool); expect((await loadToolCatalog({ workspaceRoot: workspace, sessionId: 'second' })).tools.has('ext_sample_echo')).toBe(false);
      expect((await runPreparedTool(firstTool, { args: ['owner'] }, service.options.gate(firstTool.name))).output).toContain('fixture:owner:');
    } finally { await second.close(); }
  });
  it('keeps install, enable, prompt and script/tool/command grants distinct', async () => {
    await install(); expect((await resolveSkillCatalog({ workspaceRoot: workspace })).skills.has('shared')).toBe(false);
    await enable(); expect((await loadToolCatalog({ workspaceRoot: workspace })).tools.has('ext_sample_echo')).toBe(false);
    await grant('prompt'); expect((await resolveSkillCatalog({ workspaceRoot: workspace })).skills.has('shared')).toBe(true);
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
    const capturedSkill = (await resolveSkillCatalog({ workspaceRoot: workspace })).skills.get('shared')!;
    const directory = path.join(workspace, '.agents/skills/shared'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: shared\ndescription: local wins\n---\nlocal instructions');
    expect((await resolveSkillCatalog({ workspaceRoot: workspace })).skills.get('shared')!.description).toBe('local wins');
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
    try {
      await expect(service.close()).rejects.toThrow('cleanup remains unknown');
      const restarted = new ExtensionStore();
      expect(restarted.outcomes).toContainEqual(expect.objectContaining({
        effect: 'executed',
        durability: 'unknown',
      }));
      expect(() => restarted.locked(restarted.read(), () => {})).toThrow('publication is uncertain');
    }
    finally { release(); await outcome; }
    await expect(service.close()).resolves.toBeUndefined();
  });
  it('uninstalls intact owned versions and preserves data outside them', async () => {
    await ready(); const data = path.join(root, 'owned/data/sample'); fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(data, 'keep'), 'user data');
    expect(await service.approve(removeOperation(service, 'sample'))).toContain('uninstalled'); expect(service.store.read().packages).toEqual([]); expect(fs.readFileSync(path.join(data, 'keep'), 'utf8')).toBe('user data');
    expect(listSlashCommands().some(entry => entry.name === 'sample-echo')).toBe(false);
  });
});


describe('bound extension management views', () => {
  function manager(admission = () => undefined as string | undefined, commands = new ShellCommandRuntime()): ExtensionManager {
    return extensionManager(service, admission, operation => commands.run(operation));
  }
  function snapshot(view: ExtensionManager): ExtensionSnapshot {
    const inspection = view.read(); expect(inspection.state).toBe('ready');
    if (inspection.state !== 'ready') throw new Error('Fixture inspection unavailable');
    return inspection.snapshot;
  }
  async function prepare(view: ExtensionManager, action: string, input?: string) {
    const current = snapshot(view); const item = current.items[0]!;
    const selected = item.actions.find(entry => entry.label.startsWith(action))!;
    expect(selected).toBeDefined();
    return view.prepare(current.version, { item: item.id, action: selected.id, ...(input ? { input } : {}) });
  }

  it('reads original packages, provenance, scoped grants and safe details without approvals or requests', async () => {
    await ready(); approvals.length = 0; requests.length = 0;
    const before = fs.readFileSync(service.store.file);
    const current = snapshot(manager());
    expect(current.items[0]!.detail.join(' ')).toContain('trust current');
    expect(current.items[0]!.status).toContain('enabled');
    expect(current.items[0]!.detail.join(' ')).toContain('script:echo');
    expect(current.items[0]!.actions.some(entry => entry.label === 'revoke sample prompt')).toBe(true);
    expect(current.items[0]!.actions.some(entry => entry.label === 'uninstall sample')).toBe(true);
    expect(Object.isFrozen(current.items[0])).toBe(true);
    expect(fs.readFileSync(service.store.file)).toEqual(before);
    expect(approvals).toEqual([]); expect(requests).toEqual([]);
    const state = service.store.read();
    fs.writeFileSync(service.store.file, JSON.stringify({ ...state, packages: state.packages.map(entry => ({ ...entry,
      active: { ...entry.active, manifest: { ...entry.active.manifest, description: 'token=synthetic-secret \u009b31m' } } })) }));
    const safe = JSON.stringify(snapshot(manager()));
    expect(safe).not.toContain('synthetic-secret'); expect(safe).not.toContain('\u009b');
  });

  it('bounds package detail projection and reports omitted rows explicitly', async () => {
    await install();
    const state = service.store.read();
    const record = state.packages[0]!;
    const commands = Array.from({ length: 100 }, (_, index) => ({
      name: `command-${index}`,
      description: `Synthetic command ${index}`,
      script: record.active.manifest.scripts[0]!.name,
    }));
    const inflated = {
      ...state,
      packages: [{
        ...record,
        active: { ...record.active, manifest: { ...record.active.manifest, commands } },
      }],
    };
    const projected = projectExtensions(inflated, undefined, service.root, rootSignature(service.root),
      'bounded-version', [], [], false);
    expect(projected).toMatchObject({
      partial: true,
      omitted: { detailLines: expect.any(Number) },
    });
    expect(projected.omitted.detailLines).toBeGreaterThan(0);
    expect(projected.items[0]!.detail.length).toBeLessThanOrEqual(33);
    expect(projected.items[0]!.detail.at(-1)).toBe('[additional detail omitted]');
  });

  it('bounds notices and reports their omitted count', async () => {
    await install();
    const state = service.store.read();
    const errors = Array.from({ length: 100 }, (_, index) => `synthetic error ${index}`);
    const projected = projectExtensions(state, undefined, service.root, rootSignature(service.root),
      'bounded-notices', errors, [], false);
    expect(projected).toMatchObject({ partial: true, omitted: { notices: expect.any(Number) } });
    expect(projected.omitted.notices).toBeGreaterThan(0);
    expect(projected.notices.length).toBeLessThanOrEqual(65);
    expect(projected.notices.at(-1)).toBe('[additional detail omitted]');
  });

  it('bounds the cumulative projection bytes across every package', async () => {
    await install();
    const state = service.store.read();
    const record = state.packages[0]!;
    const commands = Array.from({ length: 32 }, (_, index) => ({
      name: `command-${index}`,
      description: 'x'.repeat(2_048),
      script: record.active.manifest.scripts[0]!.name,
    }));
    const packages = Array.from({ length: 12 }, (_, index) => ({
      ...record,
      name: `sample-${index}`,
      active: { ...record.active, manifest: { ...record.active.manifest, commands } },
    }));
    const projected = projectExtensions({ ...state, packages }, undefined, service.root, rootSignature(service.root),
      'bounded-bytes', [], [], false);
    const bytes = [
      projected.install.id, projected.install.label, projected.install.detail,
      ...projected.notices,
      ...projected.items.flatMap(item => [item.id, item.label, item.description, item.status, ...item.detail,
        ...item.actions.flatMap(action => [action.id, action.label, action.detail, action.input ?? ''])]),
    ]
      .reduce((total, line) => total + Buffer.byteLength(line, 'utf8'), 0);
    expect(projected.partial).toBe(true);
    expect(projected.omitted.detailLines).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(512 * 1024);
  });

  it('bounds action projection across the legal package maximum and reports omissions', async () => {
    await install();
    const state = service.store.read();
    const record = state.packages[0]!;
    const commands = Array.from({ length: 32 }, (_, index) => ({
      name: `command-${index}`,
      description: `Synthetic command ${index}`,
      script: record.active.manifest.scripts[0]!.name,
    }));
    const tools = Array.from({ length: 32 }, (_, index) => ({
      name: `tool-${index}`,
      description: `Synthetic tool ${index}`,
      script: record.active.manifest.scripts[0]!.name,
    }));
    const packages = Array.from({ length: 64 }, (_, index) => ({
      ...record,
      name: `sample-${index}`,
      active: { ...record.active, manifest: { ...record.active.manifest, commands, tools } },
    }));
    const projected = projectExtensions({ ...state, packages }, undefined, service.root, rootSignature(service.root),
      'bounded-actions', [], [], false);
    expect(projected.partial).toBe(true);
    expect(projected.omitted.actions).toBeGreaterThan(0);
    const bytes = [
      projected.install.id, projected.install.label, projected.install.detail,
      ...projected.notices,
      ...projected.items.flatMap(item => [item.id, item.label, item.description, item.status, ...item.detail,
        ...item.actions.flatMap(action => [action.id, action.label, action.detail, action.input ?? ''])]),
    ].reduce((total, line) => total + Buffer.byteLength(line, 'utf8'), 0);
    expect(bytes).toBeLessThanOrEqual(512 * 1024);
  });

  it('prepares one exact change without writes, uses ordinary approval and consumes once', async () => {
    await ready(); const view = manager(); const before = fs.readFileSync(service.store.file); approvals.length = 0;
    const prepared = await prepare(view, 'disable');
    expect(prepared.preview.join(' ')).toContain(releases[0]!.digest);
    expect(prepared.preview.some(line => line.startsWith('Source fixture; version 1.0.0; SHA256 '))).toBe(true);
    expect(prepared.preview.some(line => line.startsWith('Workspace '))).toBe(true);
    expect(fs.readFileSync(service.store.file)).toEqual(before); expect(approvals).toEqual([]);
    expect(await prepared.apply()).toContain('durability: confirmed');
    expect(service.store.read().packages[0]!.activation[workspace]!.enabled).toBe(false);
    expect(approvals).toEqual(['extension_grant']);
    expect(await prepared.apply()).toContain('consumed'); expect(approvals).toHaveLength(1);
  });

  it('keeps the manager preview read-only and publishes npm bytes after both approvals', async () => {
    const fixture = await npmArchive();
    const view = manager();
    const current = snapshot(view);
    const prepared = await view.prepare(current.version, { action: current.install.id, input: fixture.selector });
    expect(prepared.preview.join('\n')).toContain('Download and validate');
    expect(requests).toEqual([]);
    expect(approvals).toEqual([]);
    expect(await prepared.apply()).toContain('durability: confirmed');
    expect(approvals).toEqual(['extension_manage', 'extension_manage']);
    expect(await prepared.apply()).toContain('consumed');
    expect(requests).toEqual([new URL(fixture.metadataUrl).pathname, new URL(fixture.metadata.dist.tarball).pathname]);
    expect(service.store.read().packages[0]?.active.digest).toBe(digest(fixture.bytes));
  });

  it('preserves ordinary denial and refuses unknown publication without replay', async () => {
    await install(); const view = manager(); const before = fs.readFileSync(service.store.file);
    const denied = await prepare(view, 'enable'); allow = false;
    expect(await denied.apply()).toBe('Extension operation refused by its ordinary permission or hook gate.'); expect(fs.readFileSync(service.store.file)).toEqual(before);
    allow = true;
    const pending = await prepare(view, 'enable');
    service.store.outcomes.push({ effect: 'saved', durability: 'unknown', detail: 'Synthetic uncertain publication' });
    expect(snapshot(view).mutationBlocked).toBe(true);
    await expect(pending.apply()).rejects.toThrow('changed');
    expect(await pending.apply()).toContain('consumed'); expect(fs.readFileSync(service.store.file)).toEqual(before);
  });

  it('retains actual uninstall cleanup uncertainty on reopen and blocks a fresh mutation', async () => {
    await install(); const view = manager(); const record = service.store.read().packages[0]!;
    const owned = versionPath(record.active, service.store.file); const remove = fs.rmSync;
    const failed = vi.spyOn(fs, 'rmSync').mockImplementation((selected, options) => {
      if (selected === owned) throw new Error('Synthetic removal failure');
      return remove(selected, options);
    });
    try {
      const plan = await prepare(view, 'uninstall');
      expect(await plan.apply()).toContain('durability: unknown');
      expect(service.store.read().packages).toEqual([]); expect(fs.existsSync(owned)).toBe(true);
      expect(service.store.outcomes.some(entry => entry.durability === 'unknown' && entry.effect === 'removed')).toBe(true);
      const restarted = new ExtensionStore();
      expect(restarted.outcomes).toContainEqual(expect.objectContaining({
        effect: 'removed',
        durability: 'unknown',
      }));
      const reopened = snapshot(manager());
      expect(reopened.mutationBlocked).toBe(true); expect(reopened.notices.join(' ')).toContain('cleanup of remaining versions is unknown');
      expect((await pluginCommand(['list'], service)).output).toContain('durability unknown');
      await expect(view.prepare(reopened.version, { action: reopened.install.id, input: 'fixture:sample@1.0.0' })).rejects.toThrow('changed');
    } finally { failed.mockRestore(); }
  });

  it('rechecks the offered state and trust before preparation, confirmation and the approved writer', async () => {
    await ready(); const view = manager(); const before = fs.readFileSync(service.store.file);
    const old = snapshot(view); const item = old.items[0]!; const action = item.actions.find(entry => entry.label.startsWith('disable'))!;
    const first = await prepare(view, 'disable');
    changeSources(sources => sources.map(source => ({ ...source, description: 'Changed source identity' })));
    await expect(first.apply()).rejects.toThrow('changed');
    await expect(view.prepare(old.version, { item: item.id, action: action.id })).rejects.toThrow('changed');
    expect(fs.readFileSync(service.store.file)).toEqual(before);
    const latest = await prepare(view, 'disable');
    let release!: () => void; let entered!: () => void;
    approvalWait = new Promise<void>(resolve => { release = resolve; });
    const requested = new Promise<void>(resolve => { entered = resolve; });
    hooks.registerInProcessHook({ name: 'observe-approval', event: 'PermissionRequest', handler: () => { entered(); return { decision: 'allow' }; } });
    const applying = latest.apply(); await requested;
    changeSources(sources => sources.map(source => ({ ...source, description: 'Source changed during ordinary approval' })));
    release();
    expect(await applying).toContain('changed');
    expect(service.store.read().packages[0]!.activation[workspace]!.enabled).toBe(true);
    expect(fs.readFileSync(service.store.file)).toEqual(before);
  });

  it('rejects fabricated identities and update package substitution before network access', async () => {
    await install(); const view = manager(); const current = snapshot(view); requests.length = 0;
    await expect(view.prepare(current.version, { item: 'not-offered', action: current.install.id, input: 'fixture:sample@1.0.0' })).rejects.toThrow('offered');
    await expect(prepare(view, 'update', 'fixture:other@2.0.0')).rejects.toThrow('selected package');
    const local = localPackage('other', '2.0.0');
    fs.writeFileSync(path.join(local, 'extension.json'), JSON.stringify({ ...manifest('2.0.0'), name: 'other' }));
    await expect(prepare(view, 'update', './other')).rejects.toThrow('selected package');
    expect(approvals).toEqual(['extension_manage']);
    expect(requests).toEqual([]);
  });

  it.each(['malformed', 'oversized'])('observes external changes and %s unavailable storage while subscribed and releases idempotently', async kind => {
    await install(); const view = manager(); const listener = vi.fn();
    vi.useFakeTimers();
    const release = view.subscribe(listener);
    try {
      const before = fs.readFileSync(service.store.file); const current = service.store.read();
      fs.writeFileSync(service.store.file, JSON.stringify({ ...current, revision: current.revision + 1 }));
      vi.advanceTimersByTime(1000);
      expect(listener.mock.lastCall![0].snapshot.version).not.toBe(listener.mock.calls[0]![0].snapshot.version);
      if (kind === 'malformed') fs.writeFileSync(service.store.file, '{');
      else fs.truncateSync(service.store.file, 8 * 1024 * 1024 + 1);
      vi.advanceTimersByTime(1000);
      expect(listener.mock.lastCall![0]).toEqual({ state: 'unavailable' });
      fs.writeFileSync(service.store.file, before); vi.advanceTimersByTime(1000);
      expect(listener.mock.lastCall![0].state).toBe('ready');
      release(); release(); expect(vi.getTimerCount()).toBe(0); const count = listener.mock.calls.length;
      vi.advanceTimersByTime(2000); expect(listener).toHaveBeenCalledTimes(count);
    } finally { release(); vi.useRealTimers(); }
  });

  it.each(['malformed', 'oversized'])('retains package facts when sources are %s and labels stale workspace activation', async kind => {
    await ready(); const sourceFile = path.join(root, 'sources.json'); const original = fs.readFileSync(sourceFile);
    if (kind === 'malformed') fs.writeFileSync(sourceFile, '{');
    else fs.truncateSync(sourceFile, 1024 * 1024 + 1);
    const unavailable = snapshot(manager());
    expect(unavailable.items).toHaveLength(1); expect(unavailable.notices.join(' ')).toContain('trust is unknown');
    expect(unavailable.items[0]!.detail.join(' ')).toContain('trust unknown');
    fs.writeFileSync(sourceFile, original);
    await service.close(); fs.renameSync(workspace, workspace + '-old'); fs.mkdirSync(workspace); service = newService();
    expect(snapshot(manager()).items[0]!.status).toContain('stale workspace');
    expect(snapshot(manager()).items[0]!.detail.join(' ')).toContain('none current');
  });

  it('binds the original admission and never refreshes it for a saved confirmation', async () => {
    await install(); let blocked = false; const view = manager(() => blocked ? 'changed binding' : undefined);
    const before = fs.readFileSync(service.store.file); const prepared = await prepare(view, 'enable'); blocked = true;
    expect(view.read()).toEqual({ state: 'stale' });
    await expect(prepared.apply()).rejects.toThrow('changed');
    expect(fs.readFileSync(service.store.file)).toEqual(before);
  });

  it('installs, updates, rolls back and uninstalls through original signed lifecycle owners', async () => {
    const view = manager(); let current = snapshot(view);
    const installPlan = await view.prepare(current.version, { action: current.install.id, input: 'fixture:sample@1.0.0' });
    expect(service.store.read().packages).toEqual([]);
    expect(await installPlan.apply()).toContain('published');
    await archive('2.0.0');
    expect(await (await prepare(view, 'update', 'fixture:sample@2.0.0')).apply()).toContain('published');
    expect(service.store.read().packages[0]!.active.manifest.version).toBe('2.0.0');
    expect(await (await prepare(view, 'rollback')).apply()).toContain('rolled back');
    expect(service.store.read().packages[0]!.active.manifest.version).toBe('1.0.0');
    expect(await (await prepare(view, 'grant sample prompt')).apply()).toContain('saved');
    expect(await (await prepare(view, 'revoke sample prompt')).apply()).toContain('saved');
    expect(await (await prepare(view, 'uninstall')).apply()).toContain('uninstalled');
    expect(snapshot(view).items).toEqual([]);
  });

  it('cancels preparation in the original command boundary without a writer or fake success', async () => {
    const commands = new ShellCommandRuntime(); const view = manager(() => undefined, commands); const current = snapshot(view);
    const held = holdResponse('/registry/v1/packages/sample');
    const pending = view.prepare(current.version, { action: current.install.id, input: 'fixture:sample@1.0.0' });
    await held; commands.current!.controller.abort();
    await expect(pending).rejects.toThrow();
    resumeResponses(); expect(service.store.read().packages).toEqual([]); expect(approvals).toEqual([]);
  });

  it('cancels an ordinary approval through the original command signal without applying', async () => {
    await install(); const commands = new ShellCommandRuntime(); const view = manager(() => undefined, commands);
    const plan = await prepare(view, 'enable'); const before = fs.readFileSync(service.store.file);
    let release!: () => void, entered!: () => void;
    approvalWait = new Promise<void>(resolve => { release = resolve; });
    const requested = new Promise<void>(resolve => { entered = resolve; });
    hooks.registerInProcessHook({ name: 'observe-cancel', event: 'PermissionRequest', handler: () => { entered(); return { decision: 'allow' }; } });
    const applying = plan.apply(); await requested;
    commands.current!.controller.abort(); release();
    expect(await applying).toContain('refused');
    expect(fs.readFileSync(service.store.file)).toEqual(before);
    expect(await plan.apply()).toContain('consumed');
  });
});
