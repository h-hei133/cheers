import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SubagentMemoryScope } from "./types.js";
import { resolveUserDataFile } from "../../core/paths/userHome.js"
import { readTextFile } from '../../runtime/execution/read.js';

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

  constructor(workspaceRoot: string = process.cwd(), private readonly sourceAccess?: (absolute: string) => void) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  resolveMemoryDir(agentName: string, scope: SubagentMemoryScope = "project"): string {
    const cleanName = agentName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");

    if (scope === "user") {
      // Same rule as the user's agent definitions: keep reading what an older
      // directory already holds.
      return resolveUserDataFile(path.join("agent-memory", cleanName));
    }
    if (scope === "local") {
      return path.join(this.workspaceRoot, ".agents", "memory-local", cleanName);
    }
    // Default project scope
    return path.join(this.workspaceRoot, ".agents", "memory", cleanName);
  }

  async loadMemory(agentName: string, scope: SubagentMemoryScope = "project", abortSignal?: AbortSignal): Promise<AgentMemoryContext> {
    const memoryDir = this.resolveMemoryDir(agentName, scope);
    const memoryFilePath = path.join(memoryDir, "MEMORY.md");

    this.sourceAccess?.(memoryFilePath);
    let content = "";
    try {
      content = await readTextFile({
        operationKind: 'file.read', absolutePath: memoryFilePath,
        workspaceRoot: scope === 'user' ? path.dirname(memoryDir) : this.workspaceRoot,
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
