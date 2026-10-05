import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { verifyPathContainment } from '../security/pathJail.js';

export interface StoredArtifact {
  readonly id: string;
  readonly uri: string;
  readonly path: string;
  readonly toolType: string;
  readonly totalBytes: number;
  readonly totalLines: number;
  readonly createdAt: string;
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
    const id = String(this.counter++);
    const tag = toolType.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'output';
    const filename = `${id}.${tag}.log`;
    const targetPath = path.join(this.artifactsDir, filename);
    const tempPath = path.join(this.artifactsDir, `${filename}.tmp-${crypto.randomUUID()}`);

    const lines = content.split("\n").length;
    const totalBytes = Buffer.byteLength(content, "utf8");

    try {
      if (!fs.existsSync(this.artifactsDir)) {
        const checked = verifyPathContainment(this.artifactsDir, this.workspaceRoot);
        if (!checked.allowed || checked.resolvedPath !== this.artifactsDir) {
          throw new Error('Artifact directory resolves through a symbolic link.');
        }
        fs.mkdirSync(this.artifactsDir, { recursive: true });
      }
      this.verifyDirectory();
      await fs.promises.writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' });
      this.verifyDirectory();
      // Exclusive publication cannot overwrite an artifact from an earlier run.
      await fs.promises.link(tempPath, targetPath);
    } finally {
      await fs.promises.unlink(tempPath).catch(() => {});
    }

    return {
      id,
      uri: `artifact://${id}`,
      path: targetPath,
      toolType,
      totalBytes,
      totalLines: lines,
      createdAt: new Date().toISOString(),
    };
  }

  resolve(uriOrId: string): string | null {
    const id = /^(?:artifact:\/\/)?(\d+)(?::\d+(?:-\d+)?)?$/.exec(uriOrId)?.[1];
    if (!id) return null;

    try {
      if (!fs.existsSync(this.artifactsDir)) return null;
      this.verifyDirectory();
      const entries = fs.readdirSync(this.artifactsDir);
      const matches = entries.filter(entry => entry === id || (entry.startsWith(`${id}.`) && entry.endsWith('.log')));
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
