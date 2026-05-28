import { describe, expect, it } from "vitest";

import { buildCommandIntentPlan } from "./commandIntentPlanning.js";

describe("commandIntentPlanning", () => {
  it("keeps unsupported command intent blocked without execution", () => {
    const plan = buildCommandIntentPlan({
      normalizedPrompt: "please publish",
      hasExecutionIntent: true,
      unsupportedCommand: "npm publish",
      usedRestoredState: false,
    });

    expect(plan).toMatchObject({
      taskKind: "run-command",
      reason: "execution intent outside allowlist",
      directCommand: "npm publish",
    });
    expect(plan?.blockedReason).toContain(
      "Run-command intent is not allowed in the MVP allowlist: npm publish",
    );
  });

  it("preserves allowlisted explicit command planning without claiming success", () => {
    expect(
      buildCommandIntentPlan({
        normalizedPrompt: "run node version",
        hasExecutionIntent: true,
        usedRestoredState: true,
      }),
    ).toMatchObject({
      taskKind: "run-command",
      reason: "explicit run-command intent",
      directCommand: "node --version",
      verifyAfterEdit: false,
      usedRestoredState: true,
    });
  });

  it("uses the conservative default command for generic execution prompts", () => {
    const plan = buildCommandIntentPlan({
      normalizedPrompt: "please run something",
      hasExecutionIntent: true,
      usedRestoredState: false,
    });

    expect(plan).toMatchObject({
      taskKind: "run-command",
      directCommand: "node --version",
    });
    expect(plan).not.toHaveProperty("blockedReason");
  });

  it("does not plan a command without execution intent", () => {
    expect(
      buildCommandIntentPlan({
        normalizedPrompt: "just chat",
        hasExecutionIntent: false,
        usedRestoredState: false,
      }),
    ).toBeUndefined();
  });
});
