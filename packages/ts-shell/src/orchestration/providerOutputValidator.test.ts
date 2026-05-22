import { describe, expect, it } from "vitest";
import { validateProviderOutput } from "./providerOutputValidator.js";

describe("providerOutputValidator", () => {
  it("classifies exact single target and hunk-set output", () => {
    expect(
      validateProviderOutput({
        requestId: "single",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: {
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
        },
      }).status,
    ).toBe("valid-exact-single-target");

    expect(
      validateProviderOutput({
        requestId: "set",
        explicitTargetLabels: ["src/app.ts", "src/app.test.ts"],
        rawOutput: {
          operationKind: "exact-fenced-replacement",
          targets: [
            { path: "src/app.ts", oldText: "runApp", newText: "startApp" },
            { path: "src/app.test.ts", oldText: "runApp", newText: "startApp" },
          ],
        },
      }).status,
    ).toBe("valid-exact-hunk-set");
  });

  it("classifies partial unanchored fuzzy broad malformed unsafe and over-budget output", () => {
    expect(
      validateProviderOutput({
        requestId: "partial",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: {
          operationKind: "generated-replacement",
          targets: [{ path: "src/app.ts", summary: "rename" }],
        },
      }).status,
    ).toBe("partial-anchor");
    expect(
      validateProviderOutput({
        requestId: "unanchored",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: { operationKind: "generated-replacement" },
      }).status,
    ).toBe("unanchored-generated");
    expect(
      validateProviderOutput({
        requestId: "empty",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: null,
      }).status,
    ).toBe("empty-output");
    expect(
      validateProviderOutput({
        requestId: "fuzzy",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: { operationKind: "fuzzy-replacement", targets: [{ path: "src/app.ts" }] },
      }).status,
    ).toBe("fuzzy-output");
    expect(
      validateProviderOutput({
        requestId: "broad",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: { operationKind: "broad-refactor", targets: [{ path: "src/app.ts" }] },
      }).status,
    ).toBe("broad-refactor-output");
    expect(
      validateProviderOutput({
        requestId: "malformed",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: {
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/other.ts", oldText: "a", newText: "b" }],
        },
      }).status,
    ).toBe("malformed-output");
    expect(
      validateProviderOutput({
        requestId: "unsafe",
        explicitTargetLabels: ["src/app.ts"],
        rawOutput: {
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "a", newText: "rm -rf /" }],
        },
      }).status,
    ).toBe("unsafe-output");
    expect(
      validateProviderOutput({
        requestId: "large",
        explicitTargetLabels: ["src/app.ts"],
        maxOutputBytes: 20,
        rawOutput: {
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "a".repeat(20), newText: "b" }],
        },
      }).status,
    ).toBe("over-budget-output");
  });
});
