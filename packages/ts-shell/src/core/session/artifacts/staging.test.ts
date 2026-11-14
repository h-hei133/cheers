import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ArtifactManager } from '../artifactManager.js';
import { createProfileContext, withProfile } from '../../paths/profile/context.js';
import { ArtifactPublicationError } from './publication.js';

describe('manager-owned text staging and streaming publication', () => {
  let workspace: string;
  beforeEach(() => {
    const parent = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(parent, { recursive: true });
    workspace = fs.mkdtempSync(path.join(parent, 'artifact-stream-'));
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(workspace, { recursive: true, force: true }); });

  it('seals, streams and publishes exact text without consuming an artifact ID for capture', async () => {
    const manager = new ArtifactManager(workspace, 'stream');
    const staging = await manager.createTextStaging();
    const content = Buffer.from(`${'one\n'.repeat(40_000)}last`);
    await staging.write(content);
    await staging.close();
    const artifact = await manager.saveStream(staging.read(), 'bash');
    expect(artifact).toMatchObject({ id: '0', totalBytes: content.length, totalLines: 40_001,
      sha256: createHash('sha256').update(content).digest('hex'), publication: 'verified' });
    expect(fs.readFileSync(artifact.path).equals(content)).toBe(true);
    await staging.dispose(); await staging.dispose();
    expect(fs.readdirSync(manager.directory)).toEqual(['0.bash.log']);
  });

  it('preserves empty and trailing-newline text line counts and the binary limit', async () => {
    const manager = new ArtifactManager(workspace, 'counts');
    const empty = { async *[Symbol.asyncIterator]() {} };
    expect(await manager.saveStream(empty)).toMatchObject({ totalBytes: 0, totalLines: 1 });
    const lines = { async *[Symbol.asyncIterator]() { yield Buffer.from('a\n'); yield Buffer.from('b\n'); } };
    expect(await manager.saveStream(lines)).toMatchObject({ totalBytes: 4, totalLines: 3 });
    await expect(manager.saveBinary(Buffer.alloc(8 * 1024 * 1024 + 1))).rejects.toThrow('8 MiB');
    expect(await manager.saveBinary(Buffer.from('\n'))).toMatchObject({ totalLines: 0 });
  });

  it('preserves portable streaming text without claiming descriptor-verified publication', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
    try {
      const manager = new ArtifactManager(workspace, 'portable');
      const staging = await manager.createTextStaging();
      await staging.write(Buffer.from('portable\n')); await staging.close();
      const saved = await manager.saveStream(staging.read());
      expect(saved.publication).toBeUndefined();
      expect(saved).toMatchObject({ totalBytes: 9, totalLines: 2 });
      expect(fs.readFileSync(saved.path, 'utf8')).toBe('portable\n');
      await staging.dispose();
      expect(fs.readdirSync(manager.directory)).toEqual(['0.output.log']);
    } finally { Object.defineProperty(process, 'platform', platform); }
  });

  it('cancels publication while a source next and return remain stalled, removing its owned target staging', async () => {
    const manager = new ArtifactManager(workspace, 'cancel');
    const controller = new AbortController();
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const retire = vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => {}));
    const source = { [Symbol.asyncIterator]: () => ({
      next: () => { started(); return new Promise<IteratorResult<Uint8Array>>(() => {}); }, return: retire,
    }) };
    const saving = manager.saveStream(source, 'bash', controller.signal);
    await entered; controller.abort();
    await expect(saving).rejects.toMatchObject({ publication: 'not-published', cleanup: 'complete' });
    expect(retire).toHaveBeenCalledOnce();
    expect(fs.readdirSync(manager.directory)).toEqual([]);
  });

  it('rejects a tampered sealed source and preserves modified staging bytes with unknown cleanup', async () => {
    const manager = new ArtifactManager(workspace, 'tamper');
    const staging = await manager.createTextStaging();
    await staging.write(Buffer.from('owned')); await staging.close();
    const stage = fs.readdirSync(manager.directory).find(name => name.startsWith('capture.tmp-'))!;
    const target = path.join(manager.directory, stage);
    fs.writeFileSync(target, 'other');
    await expect(manager.saveStream(staging.read())).rejects.toMatchObject({ publication: 'not-published' });
    await expect(staging.dispose()).rejects.toMatchObject({ publication: 'not-published', cleanup: 'unknown', cleanupResource: expect.any(Object) });
    expect(fs.readFileSync(target, 'utf8')).toBe('other');
    fs.unlinkSync(target);
    await staging.dispose();
  });

  it('refuses replaced directory writes and cleans through its captured directory descriptor', async () => {
    const manager = new ArtifactManager(workspace, 'replaced');
    const staging = await manager.createTextStaging();
    await staging.write(Buffer.from('before'));
    const moved = `${manager.directory}-old`;
    fs.renameSync(manager.directory, moved); fs.mkdirSync(manager.directory);
    await expect(staging.write(Buffer.from('after'))).rejects.toMatchObject({ publication: 'not-published', cleanup: 'unknown' });
    expect(fs.readdirSync(manager.directory)).toEqual([]);
    await staging.dispose();
    expect(fs.readdirSync(moved)).toEqual([]);
  });

  it('preserves a foreign same-byte final replacement and refuses to call it verified', async () => {
    const manager = new ArtifactManager(workspace, 'final');
    const link = fs.promises.link.bind(fs.promises);
    vi.spyOn(fs.promises, 'link').mockImplementationOnce(async (source, target) => {
      await link(source, target); await fs.promises.unlink(target); await fs.promises.writeFile(target, 'owned');
    });
    const source = { async *[Symbol.asyncIterator]() { yield Buffer.from('owned'); } };
    await expect(manager.saveStream(source)).rejects.toMatchObject({ publication: 'unverified', cleanup: 'complete' });
    expect(fs.readFileSync(path.join(manager.directory, '0.output.log'), 'utf8')).toBe('owned');
  });

  it('retains retryable cleanup if identity-guarded unlink fails', async () => {
    const manager = new ArtifactManager(workspace, 'cleanup');
    const staging = await manager.createTextStaging();
    await staging.write(Buffer.from('owned')); await staging.close();
    vi.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(new Error('unlink unavailable'));
    const failure = await staging.dispose().then(() => { throw new Error('Expected cleanup failure'); },
      (error: unknown) => error as ArtifactPublicationError);
    expect(failure).toMatchObject({ cleanup: 'unknown', cleanupResource: expect.any(Object) });
    await failure.cleanupResource!.close();
    expect(fs.readdirSync(manager.directory)).toEqual([]);
  });

  it('preserves changed publication staging after a source fails and retains its cleanup owner', async () => {
    const manager = new ArtifactManager(workspace, 'failed-source');
    const source = { async *[Symbol.asyncIterator]() {
      yield Buffer.from('owned');
      const temporary = fs.readdirSync(manager.directory).find(name => name.startsWith('0.output.log.tmp-'))!;
      fs.writeFileSync(path.join(manager.directory, temporary), 'other');
      throw new Error('source failed');
    } };
    const failure = await manager.saveStream(source).then(() => { throw new Error('Expected publication failure'); },
      (error: unknown) => error as ArtifactPublicationError);
    expect(failure).toMatchObject({ publication: 'not-published', cleanup: 'unknown' });
    const temporary = fs.readdirSync(manager.directory)[0]!;
    expect(fs.readFileSync(path.join(manager.directory, temporary), 'utf8')).toBe('other');
    fs.unlinkSync(path.join(manager.directory, temporary));
    await failure.cleanupResource!.close();
    expect(fs.readdirSync(manager.directory)).toEqual([]);
  });

  it('rechecks the captured profile before staging writes and cleans only the original owner', async () => {
    const profile = createProfileContext({ homeDir: workspace, name: 'capture', env: {} });
    const manager = withProfile(profile, () => new ArtifactManager(workspace, 'profile'));
    const staging = await withProfile(profile, () => manager.createTextStaging());
    await staging.write(Buffer.from('before'));
    const directory = manager.directory;
    const moved = `${profile.root}-old`;
    fs.renameSync(profile.root, moved); fs.mkdirSync(profile.root);
    await expect(staging.write(Buffer.from('after'))).rejects.toMatchObject({ publication: 'not-published', cleanup: 'unknown' });
    await staging.dispose();
    expect(fs.readdirSync(directory.replace(profile.root, moved))).toEqual([]);
    expect(fs.readdirSync(profile.root)).toEqual([]);
  });
});
