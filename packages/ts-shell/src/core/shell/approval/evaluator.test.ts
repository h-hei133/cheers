import { describe, it, expect } from "vitest";
import {
  evaluatePermission,
  isReadOnlyBashCommand,
} from "./evaluator.js";

describe("Approval Evaluator & Read-Only Command Classifier", () => {
  describe("isReadOnlyBashCommand", () => {
    it("identifies read-only git commands correctly", () => {
      expect(isReadOnlyBashCommand("git status")).toBe(true);
      expect(isReadOnlyBashCommand("git status --short")).toBe(true);
      expect(isReadOnlyBashCommand("git diff")).toBe(true);
      expect(isReadOnlyBashCommand("git diff HEAD~1")).toBe(true);
      expect(isReadOnlyBashCommand("git log -n 5")).toBe(true);
      expect(isReadOnlyBashCommand("git show HEAD")).toBe(true);
      expect(isReadOnlyBashCommand("git branch -a")).toBe(true);
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
      const statusEval = evaluatePermission({
        scope: "/project",
        toolName: "bash",
        selector: "git status -s",
        grants: [],
        agentMode: "plan",
      });
      expect(statusEval.behavior).toBe("allow");
      expect(statusEval.granted).toBe(true);

      const diffEval = evaluatePermission({
        scope: "/project",
        toolName: "bash",
        selector: "git diff src/",
        grants: [],
        agentMode: "plan",
      });
      expect(diffEval.behavior).toBe("allow");
      expect(diffEval.granted).toBe(true);
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
