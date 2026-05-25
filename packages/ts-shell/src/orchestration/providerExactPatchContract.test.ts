import { describe, expect, it } from "vitest";

import {
  buildProviderExactPatchSystemPrompt,
  parseProviderExactPatchOutput,
} from "./providerExactPatchContract.js";

describe("providerExactPatchContract", () => {
  it("parses the Route214 exact patch object into a raw provider proposal", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: JSON.stringify({
        targetFile: "src/app.ts",
        oldText: "export const name = 'old';",
        newText: "export const name = 'new';",
        reason: "rename label",
        verificationHint: "readback src/app.ts",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("exact-patch");
    expect(result.ok && result.rawProposal).toMatchObject({
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: "src/app.ts",
          oldText: "export const name = 'old';",
          newText: "export const name = 'new';",
        },
      ],
      verificationPlan: ["readback src/app.ts"],
    });
    expect(JSON.stringify(result.evidence)).not.toContain("export const name");
  });

  it("parses explicit review-only without fabricating oldText", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: JSON.stringify({
        status: "review-only",
        targetFile: "src/app.ts",
        reason: "current oldText was not provided",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("review-only");
    expect(result.ok && result.rawProposal.targets?.[0]?.oldText).toBeUndefined();
    expect(result.ok && result.rawProposal.targets?.[0]?.newText).toBeUndefined();
  });

  it("rejects malformed and target-mismatched output precisely", () => {
    expect(parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: "not json",
    })).toMatchObject({ ok: false, status: "invalid-format" });

    expect(parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: JSON.stringify({
        targetFile: "src/other.ts",
        oldText: "old",
        newText: "new",
      }),
    })).toMatchObject({ ok: false, status: "target-mismatch" });
  });

  it("documents exact oldText/newText and review-only fallback in the prompt", () => {
    const prompt = buildProviderExactPatchSystemPrompt();

    expect(prompt).toContain("targetFile");
    expect(prompt).toContain("oldText");
    expect(prompt).toContain("newText");
    expect(prompt).toContain("\"status\":\"review-only\"");
    expect(prompt).toContain("no multi-file edits");
  });
});
