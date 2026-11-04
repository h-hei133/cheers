import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ArtifactManager } from "./artifactManager.js";
import { createCoreToolRegistry } from '../tools/registry.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { createProfileContext, withProfile } from '../paths/profile/context.js';

describe("ArtifactManager In-Session Spilling", () => {
  let tempWorkspace: string;

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  it("saves large tool output to disk and resolves via artifact:// URI", async () => {
    const manager = new ArtifactManager(tempWorkspace, "test-session");
    const content = "Large bash log output\nLine 2\nLine 3";

    const saved = await manager.save(content, "bash");
    expect(saved.id).toBe("0");
    expect(saved.uri).toBe("artifact://0");
    expect(saved.totalLines).toBe(3);
    expect(fs.existsSync(saved.path)).toBe(true);

    const resolved = manager.resolve("artifact://0");
    expect(resolved).not.toBeNull();
    expect(resolved).toBe(saved.path);

    const readBack = fs.readFileSync(resolved!, "utf8");
    expect(readBack).toBe(content);
  });

  it('keeps identical IDs isolated by workspace and session and wires reads to the calling session', async () => {
    const otherRoot = path.join(tempWorkspace, 'other');
    fs.mkdirSync(otherRoot);
    const first = ArtifactManager.getShared(tempWorkspace, 'first');
    const second = ArtifactManager.getShared(tempWorkspace, 'second');
    const other = ArtifactManager.getShared(otherRoot, 'first');
    const a = await first.save('first content');
    const b = await second.save('second content');
    const c = await other.save('other workspace');
    expect([a.uri, b.uri, c.uri]).toEqual(['artifact://0', 'artifact://0', 'artifact://0']);
    expect(ArtifactManager.getShared(tempWorkspace, 'first')).toBe(first);
    const read = createCoreToolRegistry().get('read')!;
    for (const [workspaceRoot, sessionId, expected] of [[tempWorkspace, 'first', 'first content'],
      [tempWorkspace, 'second', 'second content'], [otherRoot, 'first', 'other workspace']]) {
      const result = await read.execute({ path: 'artifact://0' }, { workspaceRoot, sessionId, taskId: 'artifact' });
      expect(result.success).toBe(true);
      expect(result.output).toContain(expected);
    }
    await expect(read.execute({ path: 'artifact://0' }, { workspaceRoot: tempWorkspace, sessionId: 'empty', taskId: 'artifact' }))
      .rejects.toThrow('not found');
  });

  it('rejects arbitrary names, staged files, ambiguous IDs and symlink escapes', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'test');
    fs.mkdirSync(manager.directory, { recursive: true });
    fs.writeFileSync(path.join(manager.directory, '0.output.log.tmp-partial'), 'partial');
    expect(manager.resolve('artifact://0')).toBeNull();
    const saved = await manager.save('valid');
    for (const id of ['', 'artifact://', '../', saved.path, 'artifact://1.output.log']) expect(manager.resolve(id)).toBeNull();
    fs.writeFileSync(path.join(manager.directory, `${saved.id}.duplicate.log`), 'ambiguous');
    expect(manager.resolve(saved.uri)).toBeNull();
    const outside = path.join(tempWorkspace, 'outside.txt');
    fs.writeFileSync(outside, 'outside artifact scope');
    fs.symlinkSync(outside, path.join(manager.directory, '42.output.log'));
    expect(manager.resolve('artifact://42')).toBeNull();
  });

  it('does not resolve or write through a replaced session artifact directory', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'first');
    await manager.save('first');
    const other = new ArtifactManager(tempWorkspace, 'second');
    await other.save('second');
    fs.rmSync(manager.directory, { recursive: true });
    fs.symlinkSync(other.directory, manager.directory, 'dir');
    expect(manager.resolve('artifact://0')).toBeNull();
    await expect(manager.save('must not write')).rejects.toThrow('symbolic link');
    expect(fs.readdirSync(other.directory)).toEqual(['0.output.log']);
  });

  it('preserves prior artifacts on restart and does not report failed publication as saved', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'test');
    const original = await manager.save('original');
    const restarted = new ArtifactManager(tempWorkspace, 'test');
    const next = await restarted.save('new');
    expect(next.id).not.toBe(original.id);
    expect(fs.readFileSync(original.path, 'utf8')).toBe('original');
    vi.spyOn(fs.promises, 'link').mockRejectedValueOnce(new Error('publication failed'));
    await expect(restarted.save('never published')).rejects.toMatchObject({ publication: 'not-published', cleanup: 'complete' });
    expect(fs.readdirSync(manager.directory).sort()).toEqual(['0.output.log', '1.output.log']);
  });

  it('preserves an external replacement when binary publication verification fails', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'test');
    const link = fs.promises.link.bind(fs.promises);
    vi.spyOn(fs.promises, 'link').mockImplementationOnce(async (source, target) => {
      await link(source, target);
      await fs.promises.unlink(target);
      await fs.promises.writeFile(target, 'external replacement');
    });
    await expect(manager.saveBinary(Buffer.from('owned'), 'browser-download')).rejects.toMatchObject({ publication: 'unverified', cleanup: 'complete' });
    expect(fs.readFileSync(path.join(manager.directory, '0.browser-download.bin'), 'utf8')).toBe('external replacement');
  });

  it('keeps arbitrary tool labels inside the artifact filename and rejects invalid session identities', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'test');
    const saved = await manager.save('safe content', '../arbitrary/tool');
    expect(path.dirname(saved.path)).toBe(manager.directory);
    expect(manager.resolve(saved.uri)).toBe(saved.path);
    for (const session of ['../escape', '.', '..', 'nested/session']) expect(() => new ArtifactManager(tempWorkspace, session)).toThrow('identity');
  });

  it('cleans only the requested session artifacts and tolerates invalid roots', async () => {
    const current = new ArtifactManager(tempWorkspace, 'remove-me');
    const retained = new ArtifactManager(tempWorkspace, 'keep-me');
    await current.save('remove');
    await retained.save('retain');

    ArtifactManager.cleanupSessionArtifacts('remove-me', [tempWorkspace, path.join(tempWorkspace, 'missing')]);

    expect(fs.existsSync(current.directory)).toBe(false);
    expect(fs.existsSync(path.dirname(current.directory))).toBe(false);
    expect(fs.existsSync(retained.directory)).toBe(true);
  });

  it('retains other contents in an artifact session container', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'shared-container');
    await manager.save('remove');
    const other = path.join(path.dirname(manager.directory), 'other-owner.txt');
    fs.writeFileSync(other, 'retain');

    ArtifactManager.cleanupSessionArtifacts('shared-container', [tempWorkspace]);

    expect(fs.existsSync(manager.directory)).toBe(false);
    expect(fs.readFileSync(other, 'utf8')).toBe('retain');
  });

  it('does not remove an artifact directory replaced by a symlink', async () => {
    const manager = new ArtifactManager(tempWorkspace, 'symlinked');
    const outside = path.join(tempWorkspace, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
    fs.mkdirSync(path.dirname(manager.directory), { recursive: true });
    fs.rmSync(manager.directory, { recursive: true, force: true });
    fs.symlinkSync(outside, manager.directory, 'dir');

    ArtifactManager.cleanupSessionArtifacts('symlinked', [tempWorkspace]);

    expect(fs.existsSync(path.join(outside, 'keep.txt'))).toBe(true);
    expect(fs.lstatSync(manager.directory).isSymbolicLink()).toBe(true);
  });

  it('refuses missing-workspace cleanup when the persisted canonical identity is not established', async () => {
    const workspace = path.join(tempWorkspace, 'project'); fs.mkdirSync(workspace);
    const profile = createProfileContext({ homeDir: tempWorkspace, name: 'identity', env: {} });
    const artifacts = withProfile(profile, () => new ArtifactManager(workspace, 'retain'));
    const saved = await withProfile(profile, () => artifacts.save('retain'));
    fs.rmSync(workspace, { recursive: true });

    for (const unknown of [path.relative(process.cwd(), workspace), `${workspace}${path.sep}..${path.sep}project`]) {
      ArtifactManager.cleanupSessionArtifacts('retain', [unknown], { profile });
      expect(fs.readFileSync(saved.path, 'utf8')).toBe('retain');
    }
  });

  it('refuses missing-workspace cleanup through a replaced ancestor', async () => {
    const parent = path.join(tempWorkspace, 'projects'), workspace = path.join(parent, 'project');
    fs.mkdirSync(workspace, { recursive: true });
    const profile = createProfileContext({ homeDir: tempWorkspace, name: 'linked', env: {} });
    const artifacts = withProfile(profile, () => new ArtifactManager(workspace, 'retain'));
    const saved = await withProfile(profile, () => artifacts.save('retain'));
    fs.renameSync(parent, `${parent}-moved`);
    const replacement = path.join(tempWorkspace, 'replacement'); fs.mkdirSync(replacement);
    fs.symlinkSync(replacement, parent, 'dir');

    ArtifactManager.cleanupSessionArtifacts('retain', [workspace], { profile });

    expect(fs.readFileSync(saved.path, 'utf8')).toBe('retain');
  });

  it('refuses missing-workspace cleanup after captured profile storage changes identity', async () => {
    const workspace = path.join(tempWorkspace, 'project'); fs.mkdirSync(workspace);
    const profile = createProfileContext({ homeDir: tempWorkspace, name: 'changed', env: {} });
    const artifacts = withProfile(profile, () => new ArtifactManager(workspace, 'retain'));
    const saved = await withProfile(profile, () => artifacts.save('retain'));
    fs.rmSync(workspace, { recursive: true });
    fs.renameSync(profile.root, `${profile.root}-retained`);
    fs.mkdirSync(profile.root);
    const retained = saved.path.replace(profile.root, `${profile.root}-retained`);

    ArtifactManager.cleanupSessionArtifacts('retain', [workspace], { profile });

    expect(fs.readFileSync(retained, 'utf8')).toBe('retain');
    expect(fs.readdirSync(profile.root)).toEqual([]);
  });

  it('does not create a store or publish through an escaped parent directory', async () => {
    const outside = path.join(tempWorkspace, 'other-storage');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(tempWorkspace, '.ts-shell'), 'dir');
    const manager = new ArtifactManager(tempWorkspace, 'test');
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(manager.resolve('artifact://0')).toBeNull();
    await expect(manager.save('must not write')).rejects.toThrow('symbolic link');
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('reads a spilled tool result in its producing session without exposing it to another session', async () => {
    const service = createDefaultExecutionService();
    const paths = Array.from({ length: 800 }, (_, index) => `source/${'long'.repeat(45)}-${index}.ts`);
    vi.spyOn(service, 'listFilesRecursive').mockResolvedValue(paths);
    const tools = createCoreToolRegistry({ executionService: service });
    const context = { workspaceRoot: tempWorkspace, sessionId: 'producer', taskId: 'glob' };
    const listed = await tools.get('glob')!.execute({ pattern: '**/*.ts', limit: 1000 }, context);
    const uri = /artifact:\/\/\d+/.exec(listed.output ?? '')?.[0];
    expect(uri).toBeDefined();
    const read = await tools.get('read')!.execute({ path: uri, offset: 800, limit: 1 }, context);
    expect(read.success).toBe(true);
    expect(read.output).toContain(paths[799]);
    await expect(tools.get('read')!.execute({ path: uri }, { ...context, sessionId: 'other' })).rejects.toThrow('not found');
  });
});
