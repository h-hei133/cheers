import { describe, expect, it } from "vitest";
import {
  nextScope,
  PERMISSION_SCOPES,
  scopeAnswer,
  scopeLabel,
  scopeMeaning,
} from "./permissionScope.js";
import type { EscalationPrompt } from "../../core/shell/approval/contract.js";

function prompt(operation: string): EscalationPrompt {
  return {
    id: "p1",
    title: "t",
    message: "m",
    context: { toolName: "bash", operation, target: "/workspace/file.ts" },
    options: [],
    defaultOption: "deny",
    recommendedAction: "",
    severity: "medium",
  };
}

describe("permission scope", () => {
  it("starts at ask and cycles through every scope", () => {
    expect(PERMISSION_SCOPES[0]).toBe("ask");
    expect(nextScope("ask")).toBe("accept-edits");
    expect(nextScope("accept-edits")).toBe("allow-all");
    expect(nextScope("allow-all")).toBe("ask");
  });

  it("answers nothing at all while the scope is ask", () => {
    for (const operation of ["read", "write", "delete", "spawn", "connect"]) {
      expect(scopeAnswer("ask", prompt(operation))).toBeUndefined();
    }
  });

  it("covers edits but not commands or network under accept-edits", () => {
    expect(scopeAnswer("accept-edits", prompt("write"))).toBe("allow-once");
    expect(scopeAnswer("accept-edits", prompt("read"))).toBe("allow-once");
    expect(scopeAnswer("accept-edits", prompt("delete"))).toBe("allow-once");
    // "Accept the edits" is a statement about files; reading it as permission to
    // run commands would be the widest reading of the narrowest words.
    expect(scopeAnswer("accept-edits", prompt("spawn"))).toBeUndefined();
    expect(scopeAnswer("accept-edits", prompt("connect"))).toBeUndefined();
  });

  it("answers everything under allow-all", () => {
    for (const operation of ["read", "write", "delete", "spawn", "connect"]) {
      expect(scopeAnswer("allow-all", prompt(operation))).toBe("allow-once");
    }
  });

  it("never answers with anything persistent", () => {
    for (const scope of PERMISSION_SCOPES) {
      const answer = scopeAnswer(scope, prompt("write"));
      expect(answer === undefined || answer === "allow-once").toBe(true);
    }
  });

  it("describes every scope, so the band and the notice can both name it", () => {
    for (const scope of PERMISSION_SCOPES) {
      expect(scopeLabel(scope).length).toBeGreaterThan(0);
      expect(scopeMeaning(scope).length).toBeGreaterThan(0);
    }
  });
});
