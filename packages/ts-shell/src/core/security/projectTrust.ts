import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveUserDataFile, userDataDir } from "../../core/paths/userHome.js"

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
      resolveUserDataFile("trust.json");
    this.ensureStoreExists();
  }

  static getShared(): ProjectTrustStore {
    if (!ProjectTrustStore.instance) {
      ProjectTrustStore.instance = new ProjectTrustStore();
    }
    return ProjectTrustStore.instance;
  }

  isProjectTrusted(workspaceRoot: string): boolean {
    const normalized = identifyProject(workspaceRoot);
    if (this.sessionTrusts.has(normalized)) {
      return true;
    }

    const data = this.readStore();
    // Direct match
    if (data.projects[normalized]?.trustLevel === "trusted") {
      return true;
    }

    // Parent path inheritance check
    return Object.entries(data.projects).some(
      ([savedPath, record]) =>
        record.trustLevel === "trusted" && covers(savedPath, normalized),
    );
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
    const normalized = identifyProject(workspaceRoot);
    const data = this.readStore();
    if (data.projects[normalized]?.trustLevel === "untrusted") {
      return true;
    }
    // A parent marked untrusted covers everything beneath it, mirroring how a
    // parent marked trusted does.
    return Object.entries(data.projects).some(
      ([savedPath, record]) =>
        record.trustLevel === "untrusted" && covers(savedPath, normalized),
    );
  }

  setProjectTrust(workspaceRoot: string, level: ProjectTrustLevel): void {
    const normalized = identifyProject(workspaceRoot);
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

    // Named files first. These are the ones whose presence is the whole signal:
    // each holds a command, a rule about what may run, or instructions that reach
    // the model. A path here must be checked individually because it sits bare in
    // the workspace root, where the shape rule below cannot see it.
    const sensitiveFiles = [
      "SYSTEM.md",
      "AGENTS.md",
      "AGENTS.override.md",
      ".private-agents.mcp.json",
      path.join(".agents", "hooks.json"),
      path.join(".agents", "sandbox.json"),
    ];
    for (const indicator of sensitiveFiles) {
      if (fs.existsSync(path.join(normalized, indicator))) {
        return true;
      }
    }

    // Then the shape rule, so a tool nobody has heard of yet still counts.
    const sensitiveSubdirectories = ["extensions", "agents", "skills", "hooks", "workflows"];
    return this.hasToolDefinitions(normalized, sensitiveSubdirectories);
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
      if (!entry.name.startsWith(".")) continue;
      // A symlink to a directory is not `isDirectory()`, so a project could hide
      // its tool definitions behind one and go unreported. `existsSync` on the
      // joined path resolves the link for the check below either way, so the
      // directory test here only needs to exclude things that are plainly files.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
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

/**
 * The identity of a project, for matching against stored decisions.
 *
 * Resolved through symlinks before use. A decision is about the project, not
 * about the string that reached it, and the two differ whenever a repository is
 * opened through a link: comparing literal paths lets an untrusted repository be
 * reached by a second name and quietly regain everything the user refused. Falls
 * back to the lexical path when the target does not exist yet, so a decision can
 * still be recorded for a directory before it is created.
 */
function identifyProject(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/** Whether a decision recorded at `savedPath` applies to `candidate`. */
function covers(savedPath: string, candidate: string): boolean {
  const relative = path.relative(savedPath, candidate);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export const projectTrust = ProjectTrustStore.getShared();
