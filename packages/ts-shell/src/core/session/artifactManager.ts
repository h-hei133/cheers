import fs from "node:fs";
import path from "node:path";
import { ArtifactPublicationError, publishArtifact, publishTextArtifact } from './artifacts/publication.js';
import { verifyPathContainment } from '../security/pathJail.js';
import { assertProfileStorage, currentProfile, type ProfileIdentity } from '../paths/profile/context.js';
import { profileScope } from '../paths/profile/scope.js';
import { profileWorkspaceDir } from '../paths/profile/workspace.js';

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
  private readonly profile = currentProfile();
  private counter: number = 0;

  constructor(workspaceRoot: string = process.cwd(), sessionId: string = "default") {
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

  /**
   * Remove this session's artifacts.
   *
   * They live in the workspace, not beside the session file, so deleting the
   * session record does not reach them — the two roots are different trees. Left
   * alone they accumulate for the life of the workspace, with no bound and no
   * command to clear them, and every ordinary tool that truncates its output
   * writes one.
   *
   * Removes the session directory rather than only `artifacts`, so nothing this
   * class created is orphaned. The path is rebuilt from the session id under a
   * fresh canonical workspace, so a workspace that has since moved is left alone
   * rather than resolved through a stale path.
   */
  /**
   * Remove a session's artifacts without requiring the workspace to still exist.
   *
   * `getShared` canonicalises the workspace first, which throws when the
   * directory has been moved or deleted — the case where the artifacts are most
   * likely to be orphaned. The layout is a pure function of the workspace path
   * and the session id, so it can be computed directly; the removal re-checks
   * the two path segments before deleting anything.
   */
  static removeSessionArtifactsAt(workspaceRoot: string, sessionId: string, profile: ProfileIdentity | undefined = currentProfile()): void {
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return;
    // `profileWorkspaceDir` canonicalises too, so a missing workspace throws here
    // as well. A named profile keeps its artifacts under the profile root, and
    // that path cannot be derived from a workspace that no longer exists — so
    // there is nothing to address and nothing to remove.
    let privateWorkspace: string | undefined;
    try { privateWorkspace = profileWorkspaceDir(workspaceRoot, profile); }
    catch { return; }
    const artifactsDir = path.join(privateWorkspace ?? path.join(path.resolve(workspaceRoot), '.ts-shell'),
      "sessions", sessionId, "artifacts");
    const sessionDir = path.dirname(artifactsDir);
    const sessionsRoot = path.dirname(sessionDir);
    try {
      if (profile) assertProfileStorage(sessionDir, profile);
      if (path.basename(artifactsDir) !== "artifacts" || path.basename(sessionsRoot) !== "sessions"
        || sessionDir === sessionsRoot) return;
      if (!fs.existsSync(sessionDir)) return;
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {
      // Best-effort: the session record is already gone, and a cleanup failure
      // must not surface as an error the user has to act on.
    }
  }

  removeSessionArtifacts(): void {
    const sessionDir = path.dirname(this.artifactsDir);
    // `<root>/sessions/<id>/artifacts` — the directory we remove is `<id>`, and
    // the one that must not be crossed is `sessions`.
    const sessionsRoot = path.dirname(sessionDir);
    try {
      assertProfileStorage(sessionDir, this.profile);
      if (path.basename(this.artifactsDir) !== "artifacts" || path.basename(sessionsRoot) !== "sessions"
        || path.basename(sessionDir) === "" || sessionDir === sessionsRoot) return;
      if (!fs.existsSync(sessionDir)) return;
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {
      // Cleanup is best-effort: a session that was deleted stays deleted, and a
      // failure here must not turn that into an error the user has to act on.
    }
    ArtifactManager.instances.delete(profileScope(JSON.stringify([this.storageRoot, path.basename(sessionDir)])));
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

  async save(content: string, toolType: string = "output"): Promise<StoredArtifact> {
    return this.publish(Buffer.from(content, 'utf8'), toolType, 'log', content.split('\n').length);
  }

  async saveBinary(content: Uint8Array, toolType = 'binary', format = 'bin', signal?: AbortSignal): Promise<StoredArtifact> {
    if (!['bin', 'png', 'jpg', 'jpeg', 'webp', 'pdf'].includes(format)) throw new Error('Unsupported binary artifact format.');
    if (content.byteLength > 8 * 1024 * 1024) throw new Error('Binary artifact exceeds the 8 MiB limit.');
    this.assertBinaryStorage();
    return this.publish(Buffer.from(content), toolType, format, 0, signal);
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

  private async publish(content: Buffer, toolType: string, format: string, lines: number, signal?: AbortSignal): Promise<StoredArtifact> {
    assertProfileStorage(this.artifactsDir, this.profile);
    const id = String(this.counter++);
    const tag = toolType.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'output';
    const filename = `${id}.${tag}.${format}`;
    const targetPath = path.join(this.artifactsDir, filename);
    const checked = verifyPathContainment(this.artifactsDir, this.storageRoot);
    if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) throw new Error('Artifact directory resolves through a symbolic link.');
    const sha256 = format === 'log' ? await publishTextArtifact(this.storageRoot, this.artifactsDir, filename, content)
      : await publishArtifact(this.storageRoot, this.artifactsDir, filename, content, signal);
    assertProfileStorage(targetPath, this.profile);

    return {
      id,
      uri: `artifact://${id}`,
      path: targetPath,
      toolType,
      totalBytes: content.length,
      totalLines: lines,
      createdAt: new Date().toISOString(),
      sha256, format, ...(process.platform === 'linux' ? { publication: 'verified' as const } : {}),
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
