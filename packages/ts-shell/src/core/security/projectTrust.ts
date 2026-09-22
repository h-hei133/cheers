import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type ProjectTrustLevel = "trusted" | "untrusted" | "session-only";

export interface ProjectTrustRecord {
  readonly trustLevel: ProjectTrustLevel;
  readonly decidedAt: string;
}

export interface TrustStoreFile {
  readonly version: 1;
  readonly projects: Record<string, ProjectTrustRecord>;
}

/**
 * Project Trust Store & Security Sandbox Gate
 *
 * Enforces security boundaries before executing workspace-local extensions,
 * hooks, or instructions from untrusted repositories.
 */
export class ProjectTrustStore {
  private static instance?: ProjectTrustStore;
  private readonly storePath: string;
  private sessionTrusts = new Set<string>();

  constructor(customPath?: string) {
    this.storePath =
      customPath ??
      path.join(os.homedir(), ".coding-agents", "trust.json");
    this.ensureStoreExists();
  }

  static getShared(): ProjectTrustStore {
    if (!ProjectTrustStore.instance) {
      ProjectTrustStore.instance = new ProjectTrustStore();
    }
    return ProjectTrustStore.instance;
  }

  isProjectTrusted(workspaceRoot: string): boolean {
    const normalized = path.resolve(workspaceRoot);
    if (this.sessionTrusts.has(normalized)) {
      return true;
    }

    const data = this.readStore();
    // Direct match
    if (data.projects[normalized]?.trustLevel === "trusted") {
      return true;
    }

    // Parent path inheritance check
    for (const [savedPath, record] of Object.entries(data.projects)) {
      if (record.trustLevel === "trusted") {
        const rel = path.relative(savedPath, normalized);
        if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Whether the project was explicitly marked untrusted.
   *
   * Deliberately not the inverse of `isProjectTrusted`. A project with no record
   * is one nobody has ruled on, and treating that as untrusted would switch off
   * every resource that consults this — silently, because the caller would simply
   * find nothing to load. Only an explicit refusal should suppress anything, and
   * that is the rule the gate is meant to express.
   */
  isProjectUntrusted(workspaceRoot: string): boolean {
    const normalized = path.resolve(workspaceRoot);
    if (this.readStore().projects[normalized]?.trustLevel === "untrusted") {
      return true;
    }
    // A parent marked untrusted covers everything beneath it, mirroring how a
    // parent marked trusted does.
    for (const [savedPath, record] of Object.entries(this.readStore().projects)) {
      if (record.trustLevel !== "untrusted") continue;
      const rel = path.relative(savedPath, normalized);
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
        return true;
      }
    }
    return false;
  }

  setProjectTrust(workspaceRoot: string, level: ProjectTrustLevel): void {
    const normalized = path.resolve(workspaceRoot);
    if (level === "session-only") {
      this.sessionTrusts.add(normalized);
      return;
    }

    const data = this.readStore();
    data.projects[normalized] = {
      trustLevel: level,
      decidedAt: new Date().toISOString(),
    };
    this.writeStore(data);
  }

  hasSensitiveProjectResources(workspaceRoot: string): boolean {
    const normalized = path.resolve(workspaceRoot);
    // Named indicators are the ones with no shape to match on. Everything else
    // is "some tool keeps runnable definitions in a dot-directory here", which is
    // checked as a shape so a tool nobody has heard of yet still counts.
    const sensitiveIndicators = ["SYSTEM.md"];
    const sensitiveSubdirectories = ["extensions", "agents", "skills", "hooks"];

    for (const indicator of sensitiveIndicators) {
      if (fs.existsSync(path.join(normalized, indicator))) {
        return true;
      }
    }
    if (this.hasToolDefinitions(normalized, sensitiveSubdirectories)) {
      return true;
    }
    return false;
  }

  /**
   * Whether any dot-directory here holds one of `subdirectories` — the shape every
   * tool uses for definitions it will later run.
   */
  private hasToolDefinitions(root: string, subdirectories: readonly string[]): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(".")) continue;
      for (const subdirectory of subdirectories) {
        if (fs.existsSync(path.join(root, entry.name, subdirectory))) return true;
      }
    }
    return false;
  }

  private ensureStoreExists(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.storePath)) {
        const initData: TrustStoreFile = { version: 1, projects: {} };
        fs.writeFileSync(this.storePath, JSON.stringify(initData, null, 2), "utf8");
      }
    } catch {
      // Best-effort initialization
    }
  }

  private readStore(): TrustStoreFile {
    try {
      if (fs.existsSync(this.storePath)) {
        return JSON.parse(fs.readFileSync(this.storePath, "utf8")) as TrustStoreFile;
      }
    } catch {
      // Fallback on corrupt file
    }
    return { version: 1, projects: {} };
  }

  private writeStore(data: TrustStoreFile): void {
    try {
      const temp = `${this.storePath}.tmp-${Date.now()}`;
      fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
      fs.renameSync(temp, this.storePath);
    } catch {
      // Fallback direct write
      try {
        fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf8");
      } catch {
        // Best-effort
      }
    }
  }
}

export const projectTrust = ProjectTrustStore.getShared();
