import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SubagentLoader } from "./subagentLoader.js";
import { AgentMemoryManager } from "./agentMemoryManager.js";
import { createTaskToolDefinition } from "../tools/taskTool.js";

describe("subagent subsystem", () => {
  let tempWorkspace: string;

  beforeEach(() => {
    tempWorkspace = path.join(os.tmpdir(), `subagent-test-${Date.now()}`);
    fs.mkdirSync(tempWorkspace, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempWorkspace)) {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  describe("SubagentLoader", () => {
    it("does not read a project's agent definitions when the project may not supply them", () => {
      // A project definition file becomes the subagent's system prompt verbatim,
      // so text a repository wrote does not get to direct the model just because
      // it was written to a file the harness reads.
      const dir = path.join(tempWorkspace, ".agents", "agents");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "sneaky.md"),
        "---\nname: sneaky\ndescription: from the repository\n---\n\nDo as I say.\n",
        "utf8",
      );

      const loader = new SubagentLoader(tempWorkspace);

      expect(loader.loadAllSubagents().has("sneaky")).toBe(true);
      expect(loader.loadAllSubagents(false).has("sneaky")).toBe(false);
      // Built-ins are this process's own definitions and are unaffected.
      expect(loader.loadAllSubagents(false).has("explore")).toBe(true);
    });

    it("loads built-in subagents by default", () => {
      const loader = new SubagentLoader(tempWorkspace);
      const all = loader.loadAllSubagents();

      expect(all.has("explore")).toBe(true);
      expect(all.has("plan")).toBe(true);
      expect(all.has("general-purpose")).toBe(true);
      expect(all.has("code-reviewer")).toBe(true);

      const explore = loader.getSubagent("Explore");
      expect(explore?.permissionMode).toBe("plan");
      expect(explore?.tools).toContain("read");
      expect(explore?.disallowedTools).toContain("write");
    });

    it("parses custom .agents/agents/*.md YAML frontmatter files", () => {
      const agentsDir = path.join(tempWorkspace, ".agents", "agents");
      fs.mkdirSync(agentsDir, { recursive: true });

      const customAgentMd = [
        "---",
        "name: security-guard",
        "description: Scans code for hardcoded secrets and security flaws.",
        "tools: [read, grep, glob]",
        "disallowedTools: [write, edit, bash]",
        "model: claude-3-5-sonnet",
        "permissionMode: plan",
        "memory: project",
        "isolation: worktree",
        "---",
        "You are Security Guard. Analyze code and flag vulnerabilities.",
      ].join("\n");

      fs.writeFileSync(path.join(agentsDir, "security-guard.md"), customAgentMd, "utf8");

      const loader = new SubagentLoader(tempWorkspace);
      const custom = loader.getSubagent("security-guard");

      expect(custom).toBeDefined();
      expect(custom?.name).toBe("security-guard");
      expect(custom?.description).toContain("hardcoded secrets");
      expect(custom?.tools).toEqual(["read", "grep", "glob"]);
      expect(custom?.disallowedTools).toEqual(["write", "edit", "bash"]);
      expect(custom?.model).toBe("claude-3-5-sonnet");
      expect(custom?.permissionMode).toBe("plan");
      expect(custom?.memory).toBe("project");
      expect(custom?.isolation).toBe("worktree");
      expect(custom?.systemPrompt).toContain("You are Security Guard");
    });
  });

  describe("AgentMemoryManager", () => {
    it("manages and loads MEMORY.md across scopes", () => {
      const memoryMgr = new AgentMemoryManager(tempWorkspace);
      const agentName = "test-auditor";

      const initial = memoryMgr.loadMemory(agentName, "project");
      expect(initial.content).toBe("");

      memoryMgr.saveMemory(agentName, "# Audit Insights\n- Always check authentication gates.", "project");

      const loaded = memoryMgr.loadMemory(agentName, "project");
      expect(loaded.content).toContain("# Audit Insights");
      expect(loaded.content).toContain("Always check authentication gates");
    });
  });

  describe("Task Tool Integration", () => {
    it("prepares the subagent and reports that nothing ran without a model", async () => {
      // No runner is supplied here, so nothing is sent. The tool used to answer
      // "success: true" with "All delegated instructions have been completed" on
      // the strength of an empty response string, which a caller cannot tell from
      // real work.
      const taskTool = createTaskToolDefinition();
      const result = await taskTool.execute(
        {
          description: "Review auth tokens",
          prompt: "Verify that JWT tokens are verified properly.",
          subagent_type: "code-reviewer",
        },
        {
          taskId: "test-task-1",
          workspaceRoot: tempWorkspace,
        },
      );

      expect(result.success).toBe(false);
      // A failed result carries its text in `error`, not `output`.
      const report = result.error ?? "";
      expect(report).toContain("# 🤖 Subagent Task Executed");
      expect(report).toContain("code-reviewer");
      expect(report).toContain("Review auth tokens");
      expect(report).toContain("was not started");
    });
  });
});
