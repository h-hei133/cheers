import { describe, it, expect } from "vitest";
import {
  evaluatePermission,
  isReadOnlyBashCommand,
} from "./evaluator.js";

describe("Approval Evaluator & Read-Only Command Classifier", () => {
  describe("isReadOnlyBashCommand", () => {
    it.each([
      "git branch new-branch", "git branch -l new-branch", "git branch --set-upstream-to=main topic",
      "git branch --unset-upstream", "git branch --edit-description", "git branch -Dold", "git branch --del old", "git branch new -- --list",
      "git diff --output=written.patch", "git diff --output written.patch", "git show --output=written.patch",
      "git log --output=written.patch", "git diff --ext-diff", "git show --textconv", "git diff --output-indicator-new=X",
      "git diff '--output=written.patch'", "git diff --outp\\ut=written.patch", "git status\rwhoami", "GIT status", "git constructor", "git __proto__",
    ])("requires approval for mutating or unclassified syntax: %s", command => {
      expect(isReadOnlyBashCommand(command)).toBe(false);
      expect(evaluatePermission({ scope: "/project", toolName: "bash", selector: command, grants: [], agentMode: "plan" }).behavior).toBe("deny");
    });

    it.each(["git branch", "git branch --list topic", "git branch --show-current", "git rev-parse --show-toplevel"])(
      "preserves explicit inspection forms: %s", command => expect(isReadOnlyBashCommand(command)).toBe(true));

    it.each([
      "git status", "git status --short", "git diff", "git diff HEAD~1",
      "git diff --no-ext-diff --no-textconv", "git diff --cached",
      "git -c core.fsmonitor=false status --short",
      "git -c core.fsmonitor=false diff --no-ext-diff --no-textconv",
      "git log -n 5", "git show HEAD",
    ])("requires approval for commands with implicit helpers: %s", command => {
      expect(isReadOnlyBashCommand(command)).toBe(false);
    });

    it("identifies standard inspection commands", () => {
      expect(isReadOnlyBashCommand("cat package.json")).toBe(true);
      expect(isReadOnlyBashCommand("ls -la")).toBe(true);
      expect(isReadOnlyBashCommand("pwd")).toBe(true);
      expect(isReadOnlyBashCommand("which node")).toBe(true);
    });

    it("rejects destructive or state-modifying bash commands", () => {
      expect(isReadOnlyBashCommand("git commit -m 'feat'")).toBe(false);
      expect(isReadOnlyBashCommand("git push origin main")).toBe(false);
      expect(isReadOnlyBashCommand("git reset --hard")).toBe(false);
      expect(isReadOnlyBashCommand("rm -rf node_modules")).toBe(false);
      expect(isReadOnlyBashCommand("npm install")).toBe(false);
    });
  });

  describe("evaluatePermission in Plan Mode", () => {
    it("allows standard read-only inspection tools in plan mode", () => {
      const readEval = evaluatePermission({
        scope: "/project",
        toolName: "read",
        selector: "src/index.ts",
        grants: [],
        agentMode: "plan",
      });
      expect(readEval.behavior).toBe("allow");
      expect(readEval.granted).toBe(true);
    });

    it("allows safe read-only git commands via bash in plan mode", () => {
      const branchEval = evaluatePermission({
        scope: "/project",
        toolName: "bash",
        selector: "git branch --show-current",
        grants: [],
        agentMode: "plan",
      });
      expect(branchEval.behavior).toBe("allow");
      expect(branchEval.granted).toBe(true);

      const rootEval = evaluatePermission({
        scope: "/project",
        toolName: "bash",
        selector: "git rev-parse --show-toplevel",
        grants: [],
        agentMode: "plan",
      });
      expect(rootEval.behavior).toBe("allow");
      expect(rootEval.granted).toBe(true);
    });

    it("denies mutating bash commands in plan mode", () => {
      const rmEval = evaluatePermission({
        scope: "/project",
        toolName: "bash",
        selector: "rm file.txt",
        grants: [],
        agentMode: "plan",
      });
      expect(rmEval.behavior).toBe("deny");
      expect(rmEval.granted).toBe(false);
      expect(rmEval.reason).toContain("Plan mode is active");
    });
  });
});
