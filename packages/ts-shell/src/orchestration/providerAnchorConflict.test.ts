import { describe, expect, it } from "vitest";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

describe("providerAnchorConflict", () => {
  it("passes non-overlapping exact anchors and preserves no-write evidence", () => {
    const rawOutput = {
      operationKind: "exact-fenced-replacement" as const,
      targets: [
        { path: "src/app.ts", oldText: "runApp", newText: "startApp" },
        { path: "src/app.ts", oldText: "stopApp", newText: "finishApp" },
      ],
    };
    const matchResult = matchProviderAnchorCandidates({
      requestId: "conflict-ok",
      candidates: extractProviderProposalAnchors({
        requestId: "conflict-ok",
        rawOutput,
        validation: validateProviderOutput({
          requestId: "conflict-ok",
          rawOutput,
          explicitTargetLabels: ["src/app.ts"],
        }),
      }).candidates,
      explicitTargetLabels: ["src/app.ts"],
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\nstopApp\n"]]),
    });
    const conflict = detectProviderAnchorConflicts({
      requestId: "conflict-ok",
      matchResult,
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\nstopApp\n"]]),
    });

    expect(conflict.ok).toBe(true);
    expect(conflict.kind).toBe("none");
    expect(conflict.evidence).toContain("provider-anchor-conflict:mutation-authority:not-granted");
  });

  it("stops overlapping and conflicting anchors before apply", () => {
    const rawOutput = {
      operationKind: "exact-fenced-replacement" as const,
      targets: [
        { path: "src/app.ts", oldText: "runApp\nstopApp", newText: "startApp\nstopApp" },
        { path: "src/app.ts", oldText: "stopApp", newText: "finishApp" },
      ],
    };
    const current = new Map([["src/app.ts", "runApp\nstopApp\n"]]);
    const matchResult = matchProviderAnchorCandidates({
      requestId: "conflict-overlap",
      candidates: extractProviderProposalAnchors({
        requestId: "conflict-overlap",
        rawOutput,
        validation: validateProviderOutput({
          requestId: "conflict-overlap",
          rawOutput,
          explicitTargetLabels: ["src/app.ts"],
        }),
      }).candidates,
      explicitTargetLabels: ["src/app.ts"],
      currentContentByTargetLabel: current,
    });
    const conflict = detectProviderAnchorConflicts({
      requestId: "conflict-overlap",
      matchResult,
      currentContentByTargetLabel: current,
    });

    expect(conflict.ok).toBe(false);
    expect(conflict.kind).toBe("overlapping-hunks");
    expect(conflict.mutationAuthority).toBe("not-granted");
  });
});
