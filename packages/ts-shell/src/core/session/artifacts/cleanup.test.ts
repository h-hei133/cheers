import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ArtifactManager } from '../artifactManager.js';
import * as stagingOwner from './staging.js';
import * as publicationOwner from './publication.js';
import { ArtifactPublicationError } from './publication.js';
import type { TextStaging } from './staging.js';

describe('artifact manager cleanup lifetime', () => {
  let workspace: string;
  beforeEach(() => {
    const parent = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(parent, { recursive: true });
    workspace = fs.mkdtempSync(path.join(parent, 'artifact-cleanup-'));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); fs.rmSync(workspace, { recursive: true, force: true }); });

  it('retains failed disposal for manager retry and permits writes after confirmed cleanup', async () => {
    const manager = new ArtifactManager(workspace, 'recover');
    const stage = await manager.createTextStaging();
    await stage.write(Buffer.from('owned')); await stage.close();
    vi.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(new Error('unlink failed'));
    await expect(stage.dispose()).rejects.toMatchObject({ cleanup: 'unknown' });
    expect(await manager.retryCleanup()).toBe('complete');
    expect(fs.readdirSync(manager.directory)).toEqual([]);
    await expect(manager.save('new')).resolves.toMatchObject({ id: '0' });
  });

  it('bounds stalled disposal, blocks new acquisition and observes its later close once', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const dispose = vi.fn(() => held);
    const stage: TextStaging = { write: async () => {}, close: async () => {},
      async *read() {}, dispose };
    const opening = vi.spyOn(stagingOwner, 'createTextStaging').mockResolvedValue(stage);
    const publish = vi.spyOn(publicationOwner, 'publishTextArtifact');
    const manager = new ArtifactManager(workspace, 'stall');
    const owned = await manager.createTextStaging();
    const disposing = expect(owned.dispose()).rejects.toMatchObject({ cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await disposing;
    const saving = expect(manager.save('blocked')).rejects.toMatchObject({ publication: 'not-published', cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await saving;
    expect(publish).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledOnce();
    release();
    expect(await manager.retryCleanup()).toBe('complete');
    const successor = await manager.createTextStaging();
    expect(opening).toHaveBeenCalledTimes(2);
    await successor.dispose();
  });

  it('retains publication cleanup after its caller releases the failure object', async () => {
    let available = false;
    const close = vi.fn(async () => { if (!available) throw new Error('close failed'); });
    const publish = vi.spyOn(publicationOwner, 'publishTextArtifact').mockRejectedValueOnce(
      new ArtifactPublicationError('unverified', 'unknown', workspace, { close }));
    const manager = new ArtifactManager(workspace, 'publication');
    await expect(manager.save('failed')).rejects.toMatchObject({ publication: 'unverified', cleanup: 'unknown' });
    await expect(manager.createTextStaging()).rejects.toMatchObject({ publication: 'not-published', cleanup: 'unknown' });
    expect(publish).toHaveBeenCalledOnce();
    available = true;
    expect(await manager.retryCleanup()).toBe('complete');
    await expect(manager.save('next')).resolves.toMatchObject({ id: '1' });
  });

  it('keeps a timed-out write owned and waits for it before disposing the stage', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const write = new Promise<void>(resolve => { release = resolve; });
    const dispose = vi.fn(async () => {});
    vi.spyOn(stagingOwner, 'createTextStaging').mockResolvedValue({ write: () => write, close: async () => {},
      async *read() {}, dispose });
    const manager = new ArtifactManager(workspace, 'write');
    const stage = await manager.createTextStaging();
    const writing = expect(stage.write(Buffer.from('owned'))).rejects.toMatchObject({ cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await writing;
    const disposing = expect(stage.dispose()).rejects.toMatchObject({ cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await disposing;
    expect(dispose).not.toHaveBeenCalled();
    release();
    expect(await manager.retryCleanup()).toBe('complete');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('keeps a suspended source owned until its reader retires after disposal is requested', async () => {
    vi.useFakeTimers();
    const dispose = vi.fn(async () => {});
    vi.spyOn(stagingOwner, 'createTextStaging').mockResolvedValue({ write: async () => {}, close: async () => {},
      async *read() { yield Buffer.from('first'); yield Buffer.from('second'); }, dispose });
    const manager = new ArtifactManager(workspace, 'reader');
    const stage = await manager.createTextStaging();
    const iterator = stage.read()[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.toString()).toBe('first');
    const disposing = expect(stage.dispose()).rejects.toMatchObject({ cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await disposing;
    expect(dispose).not.toHaveBeenCalled();
    await iterator.return?.();
    expect(await manager.retryCleanup()).toBe('complete');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('caps live ownership without evicting active stages and allows publication from its own sources', async () => {
    const manager = new ArtifactManager(workspace, 'capacity');
    const stages: TextStaging[] = [];
    for (let index = 0; index < 15; index++) stages.push(await manager.createTextStaging());
    await stages[0]!.write(Buffer.from('source')); await stages[0]!.close();
    await expect(manager.saveStream(stages[0]!.read())).resolves.toMatchObject({ id: '0', totalBytes: 6 });
    stages.push(await manager.createTextStaging());
    await expect(manager.createTextStaging()).rejects.toMatchObject({ publication: 'not-published', cleanup: 'complete' });
    for (const stage of stages) await stage.dispose();
    expect(await manager.retryCleanup()).toBe('complete');
    const next = await manager.createTextStaging(); await next.dispose();
  });

  it('retains a timed-out acquisition and disposes its late source before accepting another', async () => {
    vi.useFakeTimers();
    let release!: (stage: TextStaging) => void;
    const pending = new Promise<TextStaging>(resolve => { release = resolve; });
    const dispose = vi.fn(async () => {});
    vi.spyOn(stagingOwner, 'createTextStaging').mockReturnValueOnce(pending);
    const manager = new ArtifactManager(workspace, 'late');
    const opening = expect(manager.createTextStaging()).rejects.toMatchObject({ cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await opening;
    const refused = expect(manager.save('blocked')).rejects.toMatchObject({ cleanup: 'unknown' });
    await vi.advanceTimersByTimeAsync(2000); await refused;
    release({ write: async () => {}, close: async () => {}, async *read() {}, dispose });
    expect(await manager.retryCleanup()).toBe('complete');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
