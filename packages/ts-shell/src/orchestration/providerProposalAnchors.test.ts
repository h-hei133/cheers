import { describe, expect, it } from "vitest";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

describe("providerProposalAnchors", () => {
  it("extracts exact candidates from exact provider output", () => {
    const rawOutput = {
      operationKind: "exact-fenced-replacement" as const,
      targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
    };
    const validation = validateProviderOutput({
      requestId: "anchors-exact",
      rawOutput,
      explicitTargetLabels: ["src/app.ts"],
    });

    const extraction = extractProviderProposalAnchors({
      requestId: "anchors-exact",
      rawOutput,
      validation,
      sourceProposalId: "provider-edit-1",
      sourceDryRunId: "dry-run-1",
    });

    expect(extraction.status).toBe("exact-candidates");
    expect(extraction.exactCandidateIds).toHaveLength(1);
    expect(extraction.candidates[0]?.mutationAuthority).toBe("not-granted");
    expect(extraction.evidence).toContain("provider-anchor-extraction:mutation-authority:not-granted");
  });

  it("keeps partial, fuzzy, broad, malformed, and unsafe output no-write", () => {
    const partialRaw = {
      operationKind: "generated-replacement" as const,
      targets: [{ path: "src/app.ts", summary: "rename runApp" }],
    };
    const partial = extractProviderProposalAnchors({
      requestId: "anchors-partial",
      rawOutput: partialRaw,
      validation: validateProviderOutput({
        requestId: "anchors-partial",
        rawOutput: partialRaw,
        explicitTargetLabels: ["src/app.ts"],
      }),
    });
    expect(partial.status).toBe("partial-candidates");
    expect(partial.partialCandidateIds).toHaveLength(1);

    for (const [requestId, rawOutput, expected] of [
      ["anchors-fuzzy", { operationKind: "fuzzy-replacement" as const, targets: [{ path: "src/app.ts" }] }, "unsupported-output"],
      ["anchors-broad", { operationKind: "broad-refactor" as const, targets: [{ path: "src/app.ts" }] }, "unsupported-output"],
      ["anchors-malformed", { operationKind: "exact-fenced-replacement" as const, targets: [{ path: "src/other.ts", oldText: "a", newText: "b" }] }, "malformed-output"],
      ["anchors-unsafe", { operationKind: "exact-fenced-replacement" as const, targets: [{ path: "src/app.ts", oldText: "a", newText: "rm -rf /" }] }, "unsafe-output"],
    ] as const) {
      const extraction = extractProviderProposalAnchors({
        requestId,
        rawOutput,
        validation: validateProviderOutput({
          requestId,
          rawOutput,
          explicitTargetLabels: ["src/app.ts"],
        }),
      });
      expect(extraction.status).toBe(expected);
      expect(extraction.mutationAuthority).toBe("not-granted");
    }
  });
});
