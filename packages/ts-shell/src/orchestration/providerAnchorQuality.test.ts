import { describe, expect, it } from "vitest";
import { classifyProviderAnchorQuality } from "./providerAnchorQuality.js";
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
});
