import { describe, expect, it } from "vitest";
import { classifyProviderAnchorQuality } from "./providerAnchorQuality.js";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

describe("providerAnchorQuality", () => {
  it("marks exact output as exact-ready without granting mutation", () => {
    const validation = validateProviderOutput({
      requestId: "req-exact",
      explicitTargetLabels: ["src/app.ts"],
      rawOutput: {
        operationKind: "exact-fenced-replacement",
        targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
      },
    });
    const quality = classifyProviderAnchorQuality({
      requestId: "req-exact",
      validation,
      verificationPlan: ["npm test -- app"],
    });

    expect(quality.level).toBe("exact-ready");
    expect(quality.reviewReadiness).toBe("ready-for-review");
    expect(quality.mutationAuthority).toBe("not-granted");
  });

  it("downgrades partial and unsafe output", () => {
    const partial = classifyProviderAnchorQuality({
      requestId: "req-partial",
      validation: validateProviderOutput({
        requestId: "req-partial",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: {
          operationKind: "generated-replacement",
          targets: [{ path: "src/app.ts", summary: "rename" }],
        },
      }),
    });
    const unsafe = classifyProviderAnchorQuality({
      requestId: "req-unsafe",
      validation: validateProviderOutput({
        requestId: "req-unsafe",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: {
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "a", newText: "rm -rf /" }],
        },
      }),
    });

    expect(partial.level).toBe("needs-anchoring");
    expect(unsafe.level).toBe("unsafe");
    expect(unsafe.reviewReadiness).toBe("blocked");
  });

  it("uses anchoring match and conflict results after extraction", () => {
    const rawOutput = {
      operationKind: "exact-fenced-replacement" as const,
      targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
    };
    const validation = validateProviderOutput({
      requestId: "req-anchored-quality",
      explicitTargetLabels: ["src/app.ts"],
      rawOutput,
    });
    const extraction = extractProviderProposalAnchors({
      requestId: "req-anchored-quality",
      rawOutput,
      validation,
    });
    const exactMatch = matchProviderAnchorCandidates({
      requestId: "req-anchored-quality",
      candidates: extraction.candidates,
      explicitTargetLabels: ["src/app.ts"],
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const exactConflict = detectProviderAnchorConflicts({
      requestId: "req-anchored-quality",
      matchResult: exactMatch,
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const exactQuality = classifyProviderAnchorQuality({
      requestId: "req-anchored-quality",
      validation,
      extraction,
      matchResult: exactMatch,
      conflict: exactConflict,
    });

    const staleMatch = matchProviderAnchorCandidates({
      requestId: "req-anchored-stale",
      candidates: extraction.candidates,
      explicitTargetLabels: ["src/app.ts"],
      staleTargetLabels: ["src/app.ts"],
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const staleQuality = classifyProviderAnchorQuality({
      requestId: "req-anchored-stale",
      validation,
      extraction,
      matchResult: staleMatch,
      conflict: detectProviderAnchorConflicts({
        requestId: "req-anchored-stale",
        matchResult: staleMatch,
      }),
    });

    expect(exactQuality.level).toBe("exact-ready");
    expect(staleQuality.level).toBe("stale");
    expect(staleQuality.reviewReadiness).toBe("blocked");
  });
});
