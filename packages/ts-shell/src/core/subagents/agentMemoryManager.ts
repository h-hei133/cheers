import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SubagentMemoryScope } from "./types.js";

export interface AgentMemoryContext {
  readonly memoryDir: string;
  readonly memoryFilePath: string;
  readonly content: string;
}

/**
 * AgentMemoryManager (Claude Code 2026 Aligned)
 * Manages persistent agent memory directories (user, project, local) and MEMORY.md files.
 */
export class AgentMemoryManager {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  resolveMemoryDir(agentName: string, scope: SubagentMemoryScope = "project"): string {
    const cleanName = agentName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");

    if (scope === "user") {
      return path.join(os.homedir(), ".claude", "agent-memory", cleanName);
    }
    if (scope === "local") {
      return path.join(this.workspaceRoot, ".claude", "agent-memory-local", cleanName);
    }
    // Default project scope
    return path.join(this.workspaceRoot, ".claude", "agent-memory", cleanName);
  }

  loadMemory(agentName: string, scope: SubagentMemoryScope = "project"): AgentMemoryContext {
    const memoryDir = this.resolveMemoryDir(agentName, scope);
    const memoryFilePath = path.join(memoryDir, "MEMORY.md");

    let content = "";
    try {
      if (fs.existsSync(memoryFilePath)) {
        content = fs.readFileSync(memoryFilePath, "utf8");
      }
    } catch {
      content = "";
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
