import * as fs from "node:fs";
import * as path from "node:path";
import type { SubagentMemoryScope } from "./types.js";
import { resolveUserDataFile } from "../../core/paths/userHome.js"
import { readTextFile } from '../../runtime/execution/read.js';
import { profileWorkspaceDir } from '../paths/profile/workspace.js';
import { currentProfile, profilePath, withProfile, type ProfileContext } from '../paths/profile/context.js';

const MEMORY_BYTES = 64 * 1024;

export interface AgentMemoryContext {
  readonly memoryDir: string;
  readonly memoryFilePath: string;
  readonly content: string;
}

/**
 * AgentMemoryManager
 * Manages persistent agent memory directories (user, project, local) and MEMORY.md files.
 */
export class AgentMemoryManager {
  private readonly workspaceRoot: string;
  private readonly profile: ProfileContext | undefined;

  constructor(workspaceRoot: string = process.cwd(), private readonly sourceAccess?: (absolute: string) => void) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.profile = currentProfile();
  }

  resolveMemoryDir(agentName: string, scope: SubagentMemoryScope = "project"): string {
    const cleanName = agentName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");

    if (scope === "user") {
      // Same rule as the user's agent definitions: keep reading what an older
      // directory already holds.
      const relative = path.join('agent-memory', cleanName);
      return this.profile ? withProfile(this.profile, () => resolveUserDataFile(relative)) : resolveUserDataFile(relative);
    }
    const privateRoot = profileWorkspaceDir(this.workspaceRoot, this.profile);
    if (privateRoot) return path.join(privateRoot, scope === 'local' ? 'memory-local' : 'memory', cleanName);
    if (scope === "local") {
      return path.join(this.workspaceRoot, ".agents", "memory-local", cleanName);
    }
    // Default project scope
    return path.join(this.workspaceRoot, ".agents", "memory", cleanName);
  }

  async loadMemory(agentName: string, scope: SubagentMemoryScope = "project", abortSignal?: AbortSignal): Promise<AgentMemoryContext> {
    const memoryDir = this.resolveMemoryDir(agentName, scope);
    const memoryFilePath = path.join(memoryDir, "MEMORY.md");
    if (this.profile && this.profile.id !== 'default') profilePath(path.relative(this.profile.root, memoryFilePath), this.profile);

    this.sourceAccess?.(memoryFilePath);
    let content = "";
    try {
      content = await readTextFile({
        operationKind: 'file.read', absolutePath: memoryFilePath,
        workspaceRoot: this.profile && this.profile.id !== 'default' ? this.profile.root : scope === 'user' ? path.dirname(memoryDir) : this.workspaceRoot,
        artifactDirectory: memoryDir, maxBytes: MEMORY_BYTES,
        assertFileAccess: this.sourceAccess, abortSignal,
        authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'Read parent-authorized agent memory.' },
        caller: 'subagent:memory', reason: 'Load optional persistent agent memory.',
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    return {
      memoryDir,
      memoryFilePath,
      content,
    };
  }

  saveMemory(agentName: string, newContent: string, scope: SubagentMemoryScope = "project"): void {
    const memoryDir = this.resolveMemoryDir(agentName, scope);
    const memoryFilePath = path.join(memoryDir, "MEMORY.md");
    if (this.profile && this.profile.id !== 'default') profilePath(path.relative(this.profile.root, memoryFilePath), this.profile);

    try {
      if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
      }
      fs.writeFileSync(memoryFilePath, newContent, "utf8");
    } catch {
      // Non-blocking
    }
  }
}
