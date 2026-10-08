import fs from "node:fs";
import path from "node:path";
import { ArtifactPublicationError, publishArtifact, publishTextArtifact } from './artifacts/publication.js';
import { verifyPathContainment } from '../security/pathJail.js';

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
  private readonly workspaceRoot: string;
  private readonly artifactsDir: string;
  private counter: number = 0;

  constructor(workspaceRoot: string = process.cwd(), sessionId: string = "default") {
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) throw new Error('Invalid artifact session identity.');
    this.workspaceRoot = fs.realpathSync(workspaceRoot);
    this.artifactsDir = path.join(
      this.workspaceRoot,
      ".ts-shell",
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
    return this.artifactsDir;
  }

  static getShared(workspaceRoot: string = process.cwd(), sessionId: string = "default"): ArtifactManager {
    const root = fs.realpathSync(workspaceRoot);
    const key = JSON.stringify([root, sessionId]);
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
      const checked = verifyPathContainment(this.artifactsDir, this.workspaceRoot);
      if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) throw new Error();
      if (fs.existsSync(this.artifactsDir)) this.verifyDirectory();
    } catch { throw new ArtifactPublicationError('not-published', 'complete', this.artifactsDir); }
  }

  private async publish(content: Buffer, toolType: string, format: string, lines: number, signal?: AbortSignal): Promise<StoredArtifact> {
    const id = String(this.counter++);
    const tag = toolType.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'output';
    const filename = `${id}.${tag}.${format}`;
    const targetPath = path.join(this.artifactsDir, filename);
    const checked = verifyPathContainment(this.artifactsDir, this.workspaceRoot);
    if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) throw new Error('Artifact directory resolves through a symbolic link.');
    const sha256 = format === 'log' ? await publishTextArtifact(this.workspaceRoot, this.artifactsDir, filename, content)
      : await publishArtifact(this.workspaceRoot, this.artifactsDir, filename, content, signal);

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
    if (fs.realpathSync(this.artifactsDir) !== this.artifactsDir) {
      throw new Error('Artifact directory changed or resolves through a symbolic link.');
    }
  }
}
