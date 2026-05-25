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

  it("recovers markdown-wrapped exact JSON with safe diagnostics", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: [
        "```json",
        JSON.stringify({
          targetFile: "./src/app.ts",
          oldText: "const value = 1;",
          newText: "const value = 2;",
        }),
        "```",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("recovered-exact-patch");
    expect(result.diagnostics).toMatchObject({
      wrapperKind: "markdown-json",
      outputShapeKind: "exact-json",
      targetMatched: true,
      oldTextPresent: true,
      newTextPresent: true,
      oldTextLength: "const value = 1;".length,
      newTextLength: "const value = 2;".length,
    });
    expect(result.ok && result.rawProposal.targets?.[0]?.path).toBe("src/app.ts");
    expect(JSON.stringify(result.evidence)).not.toContain("const value");
  });

  it("recovers existing provider proposal JSON with unambiguous basename target", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: JSON.stringify({
        operationKind: "exact-fenced-replacement",
        targets: [{
          path: "app.ts",
          oldText: "export const mode = 'old';",
          newText: "export const mode = 'new';",
        }],
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("recovered-exact-patch");
    expect(result.diagnostics.outputShapeKind).toBe("provider-proposal-json");
    expect(result.ok && result.rawProposal.targets?.[0]?.path).toBe("src/app.ts");
    expect(JSON.stringify(result.evidence)).not.toContain("export const mode");
  });

  it("recovers simple single-file unified diff without printing patch text", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1,3 +1,3 @@",
        " export function run() {",
        "-  return 'old';",
        "+  return 'new';",
        " }",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("recovered-exact-patch");
    expect(result.diagnostics).toMatchObject({
      wrapperKind: "diff",
      outputShapeKind: "diff",
      targetMatched: true,
      oldTextPresent: true,
      newTextPresent: true,
    });
    expect(result.ok && result.rawProposal.targets?.[0]?.oldText).toBe([
      "export function run() {",
      "  return 'old';",
      "}",
    ].join("\n"));
    expect(JSON.stringify(result.evidence)).not.toContain("return 'old'");
    expect(JSON.stringify(result.evidence)).not.toContain("return 'new'");
  });

  it("keeps ambiguous target path variants review-blocked", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts", "test/app.ts"],
      text: JSON.stringify({
        targetFile: "app.ts",
        oldText: "old",
        newText: "new",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("target-mismatch");
    expect(result.diagnostics.targetCandidateCount).toBe(2);
  });

  it("rejects unsafe or uncertain diff shapes", () => {
    const result = parseProviderExactPatchOutput({
      explicitTargetLabels: ["src/app.ts"],
      text: [
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "@@ -3 +3 @@",
        "-old2",
        "+new2",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("invalid-format");
    expect(result.diagnostics.outputShapeKind).toBe("diff");
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
