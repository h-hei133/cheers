import fs from "node:fs";
import path from "node:path";
import { ArtifactPublicationError, publishArtifact, publishTextArtifact } from './artifacts/publication.js';
import { createTextStaging, type TextStaging } from './artifacts/staging.js';
import type { ArtifactSource } from './artifacts/stream.js';
import { ArtifactCleanup, waitArtifactPublication } from './artifacts/cleanup.js';
import { retainTextStaging } from './artifacts/lifetime.js';
import { verifyPathContainment } from '../security/pathJail.js';
import { assertProfileStorage, currentProfile, type ProfileContext } from '../paths/profile/context.js';
import { profileScope } from '../paths/profile/scope.js';
import { profileWorkspaceDir, profileWorkspaceDirForCanonicalRoot } from '../paths/profile/workspace.js';

export interface StoredArtifact {
  readonly id: string;
  readonly uri: string;
  readonly path: string;
  readonly toolType: string;
  readonly totalBytes: number;
  readonly totalLines: number;
  readonly createdAt: string;
  readonly sha256?: string;
  readonly format?: string;
  readonly publication?: 'verified';
}

export class ArtifactManager {
  private static readonly instances = new Map<string, ArtifactManager>();
  private readonly storageRoot: string;
  private readonly artifactsDir: string;
  private readonly profile: ProfileContext | undefined;
  private readonly cleanup: ArtifactCleanup;
  private counter: number = 0;

  constructor(workspaceRoot: string = process.cwd(), sessionId: string = "default", owner = { profile: currentProfile() }) {
    this.profile = owner.profile;
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) throw new Error('Invalid artifact session identity.');
    const canonicalWorkspace = fs.realpathSync(workspaceRoot);
    const privateWorkspace = profileWorkspaceDir(canonicalWorkspace, this.profile);
    this.storageRoot = privateWorkspace ? this.profile!.root : canonicalWorkspace;
    this.artifactsDir = path.join(
      privateWorkspace ?? path.join(canonicalWorkspace, '.ts-shell'),
      "sessions",
      sessionId,
      "artifacts",
    );
    this.cleanup = new ArtifactCleanup(this.artifactsDir);
    try {
      if (!fs.existsSync(this.artifactsDir)) return;
      this.verifyDirectory();
      for (const entry of fs.readdirSync(this.artifactsDir)) {
        const id = /^(\d+)\./.exec(entry)?.[1];
        if (id && Number.isSafeInteger(Number(id))) this.counter = Math.max(this.counter, Number(id) + 1);
      }
    } catch {
      // Reads stay unavailable until a valid store exists; construction never writes.
    }
  }

  /**
   * The directory this session's artifacts live in.
   *
   * Exposed so a writer that is not this class puts its files beside these
   * rather than reconstructing the path: the layout is this class's business, and
   * a second copy of it would drift the first time the layout changed.
   */
  get directory(): string {
    assertProfileStorage(this.artifactsDir, this.profile);
    return this.artifactsDir;
  }

  static getShared(workspaceRoot: string = process.cwd(), sessionId: string = "default"): ArtifactManager {
    const root = fs.realpathSync(workspaceRoot);
    const key = profileScope(JSON.stringify([root, sessionId]));
    let instance = ArtifactManager.instances.get(key);
    if (!instance) {
      instance = new ArtifactManager(root, sessionId);
      ArtifactManager.instances.set(key, instance);
    }
    return instance;
  }

  /** Remove this session's private artifact directories under the supplied roots. */
  static cleanupSessionArtifacts(sessionId: string, workspaceRoots: readonly string[], owner = { profile: currentProfile() }): void {
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return;
    for (const workspaceRoot of new Set(workspaceRoots)) {
      try {
        const profile = owner.profile;
        const privateWorkspace = profile && profile.id !== 'default'
          ? fs.existsSync(workspaceRoot) ? profileWorkspaceDir(workspaceRoot, profile)
            : profileWorkspaceDirForCanonicalRoot(workspaceRoot, profile) : undefined;
        if (!privateWorkspace && !fs.existsSync(workspaceRoot)) continue;
        const manager = privateWorkspace ? undefined : new ArtifactManager(workspaceRoot, sessionId, owner);
        const directory = privateWorkspace ? path.join(privateWorkspace, 'sessions', sessionId, 'artifacts') : manager!.directory;
        const storageRoot = privateWorkspace ? profile!.root : manager!.storageRoot;
        assertProfileStorage(directory, profile);
        if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) continue;
        const checked = verifyPathContainment(directory, storageRoot);
        if (!checked.allowed || checked.resolvedPath !== directory) continue;
        if (fs.realpathSync(directory) !== directory) continue;
        fs.rmSync(directory, { recursive: true, force: true });
        const container = path.dirname(directory);
        assertProfileStorage(container, profile);
        const containerCheck = verifyPathContainment(container, storageRoot);
        if (!containerCheck.allowed || containerCheck.resolvedPath !== container || fs.realpathSync(container) !== container) continue;
        // Only retire an empty artifact session container. Other owners' files
        // must never become collateral of recursive artifact removal.
        fs.rmdirSync(container);
      } catch {
        // Session deletion must remain successful when artifact cleanup is unavailable.
      }
    }
  }

  async save(content: string, toolType: string = "output"): Promise<StoredArtifact> {
    return this.publish(Buffer.from(content, 'utf8'), toolType, 'log');
  }

  /** The source owns its resources and must yield bounded chunks promptly. */
  async saveStream(source: AsyncIterable<Uint8Array>, toolType = 'output', signal?: AbortSignal): Promise<StoredArtifact> {
    return this.publish(source, toolType, 'log', signal);
  }

  /** Allocate only on overflow; close seals the source and dispose releases it. */
  async createTextStaging(signal?: AbortSignal): Promise<TextStaging> {
    await this.cleanup.admit();
    assertProfileStorage(this.artifactsDir, this.profile);
    const checked = verifyPathContainment(this.artifactsDir, this.storageRoot);
    if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) throw new ArtifactPublicationError('not-published', 'complete', this.artifactsDir);
    const reservation = this.cleanup.reserve();
    const stage = await this.cleanup.operation(reservation,
      () => createTextStaging(this.storageRoot, this.artifactsDir, signal, () => assertProfileStorage(this.artifactsDir, this.profile)),
      value => this.cleanup.bind(reservation, { close: () => value.dispose() }));
    return retainTextStaging(this.cleanup, reservation, stage);
  }

  retryCleanup(): Promise<'complete' | 'unknown'> {
    return this.cleanup.retry();
  }

  async saveBinary(content: Uint8Array, toolType = 'binary', format = 'bin', signal?: AbortSignal): Promise<StoredArtifact> {
    if (!['bin', 'png', 'jpg', 'jpeg', 'webp', 'pdf'].includes(format)) throw new Error('Unsupported binary artifact format.');
    if (content.byteLength > 8 * 1024 * 1024) throw new Error('Binary artifact exceeds the 8 MiB limit.');
    this.assertBinaryStorage();
    return this.publish(Buffer.from(content), toolType, format, signal);
  }

  assertBinaryStorage(): void {
    try {
      if (process.platform !== 'linux') throw new Error();
      assertProfileStorage(this.artifactsDir, this.profile);
      const checked = verifyPathContainment(this.artifactsDir, this.storageRoot);
      if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) throw new Error();
      if (fs.existsSync(this.artifactsDir)) this.verifyDirectory();
    } catch { throw new ArtifactPublicationError('not-published', 'complete', this.artifactsDir); }
  }

  private async publish(content: ArtifactSource, toolType: string, format: string, signal?: AbortSignal): Promise<StoredArtifact> {
    await this.cleanup.admit();
    assertProfileStorage(this.artifactsDir, this.profile);
    const id = String(this.counter++);
    const tag = toolType.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'output';
    const filename = `${id}.${tag}.${format}`;
    const targetPath = path.join(this.artifactsDir, filename);
    const checked = verifyPathContainment(this.artifactsDir, this.storageRoot);
    if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) throw new Error('Artifact directory resolves through a symbolic link.');
    const admit = (): void => assertProfileStorage(this.artifactsDir, this.profile);
    const reservation = this.cleanup.reserve();
    const receipt = await this.cleanup.operation(reservation,
      () => format === 'log' ? publishTextArtifact(this.storageRoot, this.artifactsDir, filename, content, signal, admit)
        : publishArtifact(this.storageRoot, this.artifactsDir, filename, content, signal, admit),
      () => this.cleanup.release(reservation), pending => waitArtifactPublication(pending, signal), 'unverified');
    assertProfileStorage(targetPath, this.profile);

    return {
      id,
      uri: `artifact://${id}`,
      path: targetPath,
      toolType,
      totalBytes: receipt.totalBytes,
      totalLines: format === 'log' ? receipt.totalLines : 0,
      createdAt: new Date().toISOString(),
      sha256: receipt.sha256, format, ...(process.platform === 'linux' ? { publication: 'verified' as const } : {}),
    };
  }

  resolve(uriOrId: string): string | null {
    const id = /^(?:artifact:\/\/)?(\d+)(?::\d+(?:-\d+)?)?$/.exec(uriOrId)?.[1];
    if (!id) return null;

    try {
      if (!fs.existsSync(this.artifactsDir)) return null;
      this.verifyDirectory();
      const entries = fs.readdirSync(this.artifactsDir);
      const matches = entries.filter(entry => entry === id || (entry.startsWith(`${id}.`) && /\.(log|bin|png|jpg|jpeg|webp|pdf)$/.test(entry)));
      if (matches.length !== 1) return null;
      const checked = verifyPathContainment(path.join(this.artifactsDir, matches[0]), this.artifactsDir);
      if (checked.allowed && fs.statSync(checked.resolvedPath).isFile()) return checked.resolvedPath;
    } catch {
      return null;
    }
    return null;
  }

  private verifyDirectory(): void {
    assertProfileStorage(this.artifactsDir, this.profile);
    if (fs.realpathSync(this.artifactsDir) !== this.artifactsDir) {
      throw new Error('Artifact directory changed or resolves through a symbolic link.');
    }
  }
}
