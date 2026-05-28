import { describe, expect, it } from "vitest";

import { extractInlineContinuityContext } from "./inlineContinuityContext.js";

describe("inlineContinuityContext", () => {
  it("strips inline continuity block while preserving guarded read and verification facts", () => {
    const prompt = [
      "Continue.",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "recent-target-files: ./src/a.ts, src/b.ts",
      "last-read-delivered-lines: 5",
      "last-read-window-size: 0",
      "last-read-fragment-line-indexes: 3, 1, bad, 3",
      "last-verification-command: npm test",
      "last-verification-resume-eligible: false",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const { cleanPrompt, inlineState } = extractInlineContinuityContext(prompt);

    expect(cleanPrompt).toBe("Continue.");
    expect(inlineState.recentTargetFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(inlineState.lastReadDeliveredLines).toBe(5);
    expect(inlineState.lastReadWindowSize).toBeUndefined();
    expect(inlineState.lastReadFragmentLineIndexes).toEqual([1, 3]);
    expect(inlineState.lastVerificationCommand).toBe("npm test");
    expect(inlineState.lastVerificationResumeEligible).toBe(false);
  });

  it("keeps approval and permission fields as facts only", () => {
    const prompt = [
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "last-approval-decision: allow-always",
      "last-approval-persistent: yes",
      "last-permission-request-tool: Bash",
      "last-permission-request-operation: Execute",
      "last-request-scope-source: verification-command",
      "[END CONTINUITY CONTEXT]",
      "why was permission requested?",
    ].join("\n");

    const { cleanPrompt, inlineState } = extractInlineContinuityContext(prompt);

    expect(cleanPrompt).toBe("why was permission requested?");
    expect(inlineState.lastApprovalDecision).toBe("allow-always");
    expect(inlineState.lastApprovalPersistent).toBe(true);
    expect(inlineState.lastPermissionRequestToolName).toBe("bash");
    expect(inlineState.lastPermissionRequestOperation).toBe("execute");
    expect(inlineState.lastRequestScopeSource).toBe("verification-command");
  });
});
