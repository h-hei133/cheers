import { describe, expect, it } from "vitest";
import { evaluateToolPermissionScope, buildToolEscalationPrompt } from "./toolPolicy.js";

describe("toolPolicy", () => {
  it("allows read-only tools without escalation across all modes", () => {
    for (const tool of ["read", "glob", "grep", "web_search", "web_fetch", "todo", "ask"]) {
      for (const scope of ["ask", "accept-edits", "allow-all"] as const) {
        const result = evaluateToolPermissionScope(tool, { path: "foo.txt" }, scope);
        expect(result.requiresEscalation).toBe(false);
        expect(result.operation).toBe("read");
      }
    }
  });

  it("allows read-only bash commands without escalation", () => {
    for (const cmd of ["git branch --show-current", "git rev-parse --show-toplevel", "ls -la", "pwd", "cat file.txt"]) {
      const result = evaluateToolPermissionScope("bash", { command: cmd }, "ask");
      expect(result.requiresEscalation).toBe(false);
      expect(result.operation).toBe("read");
    }
  });

  it.each(["write", "edit"])("preserves exact %s target bytes", tool => {
    for (const target of ["File.txt", "file.txt", "File.txt ", " File.txt"]) {
      expect(evaluateToolPermissionScope(tool, { path: target }, "ask").target).toBe(target);
      expect(evaluateToolPermissionScope(tool, { path: target }, "accept-edits", "/repo").target).toBe(target);
    }
  });

  it("preserves exact shell command bytes", () => {
    expect(evaluateToolPermissionScope("bash", { command: " npm test " }, "ask").target).toBe(" npm test ");
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

describe("a refusal nothing overrides", () => {
  const rules = [{ tool: "bash", pattern: "rm -rf" }];

  it.each(["ask", "accept-edits", "allow-all"] as const)("keeps command padding from bypassing a refusal in %s", scope => {
    const target = " \t touch denied-marker \n";
    const result = evaluateToolPermissionScope("bash", { command: target }, scope, "/workspace", [
      { tool: "bash", pattern: "touch " },
    ]);
    expect(result.denied).toBe(true);
    expect(result.requiresEscalation).toBe(false);
    expect(result.target).toBe(target);
    const relative = " ./danger-helper ";
    const relativeResult = evaluateToolPermissionScope("bash", { command: relative }, scope, "/workspace", [
      { tool: "bash", pattern: "danger-helper" },
    ]);
    expect(relativeResult.denied).toBe(true);
    expect(relativeResult.target).toBe(relative);
  });

  it("refuses the call in every scope", () => {
    // The point of the rule. `allow-all` allows what approval governs; a rule the
    // user wrote is not something a scope can answer away, or the rule would be
    // a suggestion and the user would have no way to say never.
    for (const scope of ["ask", "allow-all", "accept-edits"] as const) {
      const result = evaluateToolPermissionScope(
        "bash",
        { command: "rm -rf /" },
        scope,
        "/workspace",
        rules,
      );

      expect(result.denied).toBe(true);
      expect(result.reason).toContain("rm -rf");
    }
  });

  it("does not ask, because a refusal is an answer and not a question", () => {
    // Asking would offer the user a chance to override their own rule, and
    // answering "allow" would make the tool usable again.
    const result = evaluateToolPermissionScope(
      "bash",
      { command: "rm -rf /" },
      "ask",
      "/workspace",
      rules,
    );

    expect(result.denied).toBe(true);
    expect(result.requiresEscalation).toBe(false);
  });

  it("leaves calls the rule does not name alone", () => {
    const result = evaluateToolPermissionScope(
      "bash",
      { command: "ls -la" },
      "allow-all",
      "/workspace",
      rules,
    );

    expect(result.denied).toBeUndefined();
    expect(result.requiresEscalation).toBe(false);
  });

  it("refuses nothing when no rules are given", () => {
    const result = evaluateToolPermissionScope("bash", { command: "rm -rf /" }, "allow-all");

    expect(result.denied).toBeUndefined();
  });

  it("names the tool it refused, so the reason is actionable", () => {
    const result = evaluateToolPermissionScope("write", { path: "secrets/key" }, "ask", "/w", [
      { tool: "write" },
    ]);

    expect(result.denied).toBe(true);
    expect(result.reason).toContain("write");
  });
  it("refuses the same file however the path is spelled", () => {
    // A prefix rule is only as good as the spelling it is compared to. These are
    // all the same file, and each costs a caller nothing to write — so a rule
    // that only caught the first would be defeated by typing the path a
    // different way, which is not something a user would think to defend against.
    const rules = [{ tool: "read", pattern: "src/secrets" }];
    const denied = (p: string) =>
      evaluateToolPermissionScope("read", { path: p }, "allow-all", "/proj", rules).denied;

    expect(denied("src/secrets/key.ts")).toBe(true);
    expect(denied("./src/secrets/key.ts")).toBe(true);
    expect(denied("src/other/../secrets/key.ts")).toBe(true);
    expect(denied("src/public/key.ts")).toBeFalsy();
  });

  it.each(["read", "write", "edit"])("normalizes known %s paths for refusal without losing target bytes", tool => {
    for (const target of ["./protected/file ", "protected/other/../file ", "./protected/my file"]) {
      const result = evaluateToolPermissionScope(tool, { path: target }, "allow-all", "/workspace", [
        { tool, pattern: "protected/" },
      ]);
      expect(result.denied).toBe(true);
      expect(result.target).toBe(target);
    }
  });

  it("still compares a bash command as written", () => {
    // A command is not a path and is not resolved against the workspace, so
    // rewriting it would compare the rule against something never run.
    const rules = [{ tool: "bash", pattern: "curl" }];
    const denied = (c: string) =>
      evaluateToolPermissionScope("bash", { command: c }, "allow-all", "/proj", rules).denied;

    expect(denied("curl http://x")).toBe(true);
    expect(denied("echo hi")).toBeFalsy();
  });

});

describe('read-only classification uses declared names only', () => {
  it.each(['constructor', '__proto__', 'toString'])('requires approval for an undeclared %s tool', name => {
    for (const scope of ['ask', 'accept-edits'] as const) {
      expect(evaluateToolPermissionScope(name, {}, scope, '/workspace')).toMatchObject({
        operation: 'execute', requiresEscalation: true,
      });
    }
  });

  it.each(['constructor', '__proto__', 'toString'])('requires approval for an undeclared browser action %s', action => {
    for (const scope of ['ask', 'accept-edits'] as const) {
      expect(evaluateToolPermissionScope('browser', { action }, scope, '/workspace')).toMatchObject({
        operation: 'execute', requiresEscalation: true,
      });
    }
  });
});
