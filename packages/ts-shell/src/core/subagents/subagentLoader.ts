import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SubagentDefinition, SubagentIsolationMode, SubagentMemoryScope, SubagentPermissionMode } from "./types.js";

const BUILTIN_SUBAGENTS: SubagentDefinition[] = [
  {
    name: "Explore",
    description: "Fast read-only codebase exploration and file search specialist.",
    systemPrompt: "You are Explore, a fast read-only research agent. Discover files, read code, and search symbols to answer the query.",
    tools: ["read", "grep", "glob", "lsp"],
    disallowedTools: ["write", "edit", "rm", "eval"],
    permissionMode: "plan",
    source: "builtin",
  },
  {
    name: "Plan",
    description: "Architectural research and implementation planning specialist.",
    systemPrompt: "You are Plan, an architectural planning agent. Research the codebase and produce clear, phased execution plans.",
    tools: ["read", "grep", "glob", "lsp", "todo"],
    disallowedTools: ["write", "edit"],
    permissionMode: "plan",
    source: "builtin",
  },
  {
    name: "general-purpose",
    description: "Capable agent for complex multi-step coding, refactoring, and debugging tasks.",
    systemPrompt: "You are a general-purpose autonomous coding subagent. Execute multi-step implementation tasks and report your findings.",
    tools: ["read", "write", "edit", "grep", "glob", "lsp", "bash"],
    permissionMode: "default",
    source: "builtin",
  },
  {
    name: "code-reviewer",
    description: "Expert code review specialist. Proactively reviews code changes for quality, security, and maintainability.",
    systemPrompt: "You are a senior code reviewer. Analyze diffs and source code, flagging bugs, security vulnerabilities, and anti-patterns with actionable recommendations.",
    tools: ["read", "grep", "glob", "lsp", "bash"],
    disallowedTools: ["write", "edit"],
    permissionMode: "plan",
    source: "builtin",
  },
];

export class SubagentLoader {
  private readonly workspaceRoot: string;
  private readonly userAgentsDir: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.userAgentsDir = path.join(os.homedir(), ".claude", "agents");
  }

  loadAllSubagents(): ReadonlyMap<string, SubagentDefinition> {
    const registry = new Map<string, SubagentDefinition>();

    // 1. Built-in defaults (lowest priority)
    for (const agent of BUILTIN_SUBAGENTS) {
      registry.set(agent.name.toLowerCase(), agent);
    }

    // 2. User-level agents (~/.claude/agents/*.md)
    this.scanDirectory(this.userAgentsDir, "user", registry);

    // 3. Project-level agents (.claude/agents/*.md and .agents/*.md) (highest priority)
    this.scanDirectory(path.join(this.workspaceRoot, ".claude", "agents"), "project", registry);
    this.scanDirectory(path.join(this.workspaceRoot, ".agents"), "project", registry);

    return registry;
  }

  getSubagent(name: string): SubagentDefinition | undefined {
    const registry = this.loadAllSubagents();
    return registry.get(name.trim().toLowerCase());
  }

  private scanDirectory(
    dirPath: string,
    source: "project" | "user",
    registry: Map<string, SubagentDefinition>,
  ): void {
    if (!fs.existsSync(dirPath)) return;

    try {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of files) {
        if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".agent.md"))) {
          const fullPath = path.join(dirPath, entry.name);
          const parsed = this.parseSubagentFile(fullPath, source);
          if (parsed) {
            registry.set(parsed.name.toLowerCase(), parsed);
          }
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          // Recursive subfolder discovery
          this.scanDirectory(path.join(dirPath, entry.name), source, registry);
        }
      }
    } catch {
      // Non-blocking
    }
  }

  private parseSubagentFile(
    filePath: string,
    source: "project" | "user",
  ): SubagentDefinition | null {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw.startsWith("---")) {
        return null;
      }

      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!match) return null;

      const frontmatterText = match[1];
      const body = match[2].trim();

      const meta = this.parseSimpleYaml(frontmatterText);
      const name = (meta.name as string)?.trim();
      const description = (meta.description as string)?.trim();

      if (!name || !description) return null;

      const tools = this.parseList(meta.tools);
      const disallowedTools = this.parseList(meta.disallowedTools);
      const skills = this.parseList(meta.skills);

      return {
        name,
        description,
        systemPrompt: body || `You are ${name}, an autonomous subagent for: ${description}`,
        tools: tools.length > 0 ? tools : undefined,
        disallowedTools: disallowedTools.length > 0 ? disallowedTools : undefined,
        model: (meta.model as string)?.trim() || undefined,
        permissionMode: (meta.permissionMode as SubagentPermissionMode) || undefined,
        isolation: (meta.isolation as SubagentIsolationMode) || undefined,
        memory: (meta.memory as SubagentMemoryScope) || undefined,
        maxTurns: typeof meta.maxTurns === "number" ? meta.maxTurns : undefined,
        skills: skills.length > 0 ? skills : undefined,
        background: Boolean(meta.background),
        filePath,
        source,
      };
    } catch {
      return null;
    }
  }

  private parseSimpleYaml(yamlText: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yamlText.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) continue;

      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value.startsWith("[") && value.endsWith("]")) {
        result[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else if (!isNaN(Number(value)) && value !== "") {
        result[key] = Number(value);
      } else if (value === "true" || value === "false") {
        result[key] = value === "true";
      } else {
        result[key] = value.replace(/^["']|["']$/g, "");
      }
    }

    return result;
  }

  private parseList(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") {
      return value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }
}
