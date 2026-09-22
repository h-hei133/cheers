import { describe, expect, it } from "vitest";
import { evaluateToolPermissionScope, buildToolEscalationPrompt } from "./toolPolicy.js";

describe("toolPolicy", () => {
  it("allows read-only tools without escalation across all modes", () => {
    for (const tool of ["read", "glob", "grep", "lsp", "web_search", "web_fetch", "todo", "ask"]) {
      for (const scope of ["ask", "accept-edits", "allow-all"] as const) {
        const result = evaluateToolPermissionScope(tool, { path: "foo.txt" }, scope);
        expect(result.requiresEscalation).toBe(false);
        expect(result.operation).toBe("read");
      }
    }
  });

  it("allows read-only bash commands without escalation", () => {
    for (const cmd of ["git status", "git diff", "ls -la", "pwd", "cat file.txt"]) {
      const result = evaluateToolPermissionScope("bash", { command: cmd }, "ask");
      expect(result.requiresEscalation).toBe(false);
      expect(result.operation).toBe("read");
    }
  });

  it("requires escalation for write and edit in ask mode", () => {
    const writeResult = evaluateToolPermissionScope("write", { path: "src/new.ts" }, "ask");
    expect(writeResult.requiresEscalation).toBe(true);
    expect(writeResult.operation).toBe("write");
    expect(writeResult.target).toBe("src/new.ts");

    const editResult = evaluateToolPermissionScope("edit", { path: "src/old.ts" }, "ask");
    expect(editResult.requiresEscalation).toBe(true);
    expect(editResult.operation).toBe("write");
  });

  it("requires escalation for modifying bash commands in ask mode", () => {
    const rmResult = evaluateToolPermissionScope("bash", { command: "rm -rf dist" }, "ask");
    expect(rmResult.requiresEscalation).toBe(true);
    expect(rmResult.operation).toBe("delete");

    const buildResult = evaluateToolPermissionScope("bash", { command: "npm run build" }, "ask");
    expect(buildResult.requiresEscalation).toBe(true);
    expect(buildResult.operation).toBe("execute");
  });

  it("allows workspace write and edit without escalation in accept-edits mode", () => {
    const workspace = "/repo";
    const writeResult = evaluateToolPermissionScope("write", { path: "src/app.ts" }, "accept-edits", workspace);
    expect(writeResult.requiresEscalation).toBe(false);

    const editResult = evaluateToolPermissionScope("edit", { path: "/repo/src/app.ts" }, "accept-edits", workspace);
    expect(editResult.requiresEscalation).toBe(false);
  });

  it("still requires escalation for modifying commands in accept-edits mode", () => {
    const buildResult = evaluateToolPermissionScope("bash", { command: "npm test" }, "accept-edits", "/repo");
    expect(buildResult.requiresEscalation).toBe(true);
    expect(buildResult.operation).toBe("execute");

    // Destructive shell commands (rm) must NEVER be auto-approved in accept-edits mode
    const rmResult = evaluateToolPermissionScope("bash", { command: "rm -rf build" }, "accept-edits", "/repo");
    expect(rmResult.requiresEscalation).toBe(true);
    expect(rmResult.operation).toBe("delete");
  });

  it("allows read-only browser inspection actions without escalation in accept-edits mode", () => {
    for (const action of ["observe", "extract", "url", "title", "screenshot", "ariaSnapshot"]) {
      const result = evaluateToolPermissionScope("browser", { action }, "accept-edits", "/repo");
      expect(result.requiresEscalation).toBe(false);
      expect(result.operation).toBe("read");
    }
  });
  it("requires escalation for out-of-workspace writes even in accept-edits mode", () => {
    const outsideResult = evaluateToolPermissionScope("write", { path: "/etc/passwd" }, "accept-edits", "/repo");
    expect(outsideResult.requiresEscalation).toBe(true);
  });
  it("requires escalation when write or edit has missing, empty, or root path in accept-edits mode", () => {
    expect(evaluateToolPermissionScope("write", {}, "accept-edits", "/repo").requiresEscalation).toBe(true);
    expect(evaluateToolPermissionScope("write", { path: "" }, "accept-edits", "/repo").requiresEscalation).toBe(true);
    expect(evaluateToolPermissionScope("write", { path: "   " }, "accept-edits", "/repo").requiresEscalation).toBe(true);
    expect(evaluateToolPermissionScope("edit", { path: "." }, "accept-edits", "/repo").requiresEscalation).toBe(true);
  });

  it("derives clear target for task tool from description or prompt", () => {
    const withDesc = evaluateToolPermissionScope("task", { description: "Analyze performance" }, "ask");
    expect(withDesc.target).toBe("Analyze performance");
    const withPrompt = evaluateToolPermissionScope("task", { prompt: "Find all unused exports" }, "ask");
    expect(withPrompt.target).toBe("Find all unused exports");
  });


  it("allows all tools in allow-all mode", () => {
    expect(evaluateToolPermissionScope("write", { path: "foo.txt" }, "allow-all").requiresEscalation).toBe(false);
    expect(evaluateToolPermissionScope("bash", { command: "rm -rf /" }, "allow-all").requiresEscalation).toBe(false);
    expect(evaluateToolPermissionScope("task", { task: "do something" }, "allow-all").requiresEscalation).toBe(false);
  });

  it("builds clean escalation prompts", () => {
    const prompt = buildToolEscalationPrompt("write", "write", "foo.txt", "Required in ask mode");
    expect(prompt.id).toMatch(/^esc_/);
    expect(prompt.context.toolName).toBe("write");
    expect(prompt.context.operation).toBe("write");
    expect(prompt.context.target).toBe("foo.txt");
    expect(prompt.options.length).toBe(3);
    expect(prompt.defaultOption).toBe("deny");
  });
});
