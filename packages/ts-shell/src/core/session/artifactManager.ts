import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
  private static instance?: ArtifactManager;
  private readonly artifactsDir: string;
  private counter: number = 0;

  constructor(workspaceRoot: string = process.cwd(), sessionId: string = "default") {
    this.artifactsDir = path.join(
      workspaceRoot,
      ".ts-shell",
      "sessions",
      sessionId,
      "artifacts",
    );
    try {
      if (!fs.existsSync(this.artifactsDir)) {
        fs.mkdirSync(this.artifactsDir, { recursive: true });
      }
    } catch {
      // Best-effort directory initialization
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
    if (!ArtifactManager.instance) {
      ArtifactManager.instance = new ArtifactManager(workspaceRoot, sessionId);
    }
    return ArtifactManager.instance;
  }

  async save(content: string, toolType: string = "output"): Promise<StoredArtifact> {
    const id = String(this.counter++);
    const filename = `${id}.${toolType}.log`;
    const targetPath = path.join(this.artifactsDir, filename);
    const tempPath = path.join(this.artifactsDir, `${filename}.tmp-${crypto.randomUUID()}`);

    const lines = content.split("\n").length;
    const totalBytes = Buffer.byteLength(content, "utf8");

    try {
      if (!fs.existsSync(this.artifactsDir)) {
        fs.mkdirSync(this.artifactsDir, { recursive: true });
      }
      await fs.promises.writeFile(tempPath, content, "utf8");
      await fs.promises.rename(tempPath, targetPath);
    } catch (err) {
      // If temp write/rename fails, fallback to direct write
      try {
        await fs.promises.writeFile(targetPath, content, "utf8");
      } catch {
        // Best-effort write
      }
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
    const id = uriOrId.startsWith("artifact://")
      ? uriOrId.replace(/^artifact:\/\//, "").split(":")[0]
      : uriOrId.split(":")[0];

    try {
      if (!fs.existsSync(this.artifactsDir)) return null;
      const entries = fs.readdirSync(this.artifactsDir);
      for (const entry of entries) {
        if (entry === id || entry.startsWith(`${id}.`)) {
          return path.join(this.artifactsDir, entry);
        }
      }
    } catch {
      return null;
    }
    return null;
  }
}
