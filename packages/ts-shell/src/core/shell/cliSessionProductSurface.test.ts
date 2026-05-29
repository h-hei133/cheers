import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../orchestration/types.js";
import { projectRuntimeEvents } from "../../runtime/events/runtimeEventProjection.js";
import { projectStaticResourceRegistry } from "../../runtime/resources/staticResourceProjection.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { createRuntimeEventDigest } from "./sessionEventSurface.js";
import {
  applyTerminalQueryEvent,
  createSessionTerminalState,
  renderSessionTerminalSurface,
} from "./sessionTerminalState.js";
import { projectCliSessionProductSurface } from "./cliSessionProductSurface.js";

describe("CLI session product surface", () => {
  it("renders the required phase sections in order without implying authority success", () => {
    const result = codingResult({
      evidence: [
        "proposal-source:deterministic-review",
        "proposal-state:review-ready",
        "anchor-quality:exact",
        "authority:required",
      ],
      verification: {
        status: "blocked",
        blockerKind: "approval-denied",
        command: "npm test -w packages/ts-shell -- focused.test.ts",
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
        reason: "verification command authority was not granted",
        nextAction: "Grant explicit verification authority or keep the task stopped.",
      },
      taskSatisfaction: {
        verdict: "insufficient-evidence",
        reasons: ["Review-ready proposal is not apply-ready."],
        requiredEvidence: ["explicit authority", "relevant verification"],
        observedEvidence: ["proposal review"],
      },
    });

    const surface = projectCliSessionProductSurface({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      stopReason: "authority required",
      codingResult: result,
    });

    expect(surface?.lines.map((line) => line.replace(/:.*/, ""))).toEqual([
      "Product experience",
      "- Task",
      "- Context",
      "- Plan",
      "- Proposal",
      "- Authority",
      "- Apply",
      "- Verification",
      "- Repair",
      "- Tools",
      "- Verdict",
      "- Not proven",
      "- Next action",
      "",
    ]);
    expect(surface?.lines.join("\n")).toContain("authority required");
    expect(surface?.lines.join("\n")).toContain("Apply: not-run");
    expect(surface?.verdict).toBe("Stopped: explicit authority is required before continuing.");
  });

  it("keeps failed verification and external-live tool claims in not-proven output", () => {
    const result = codingResult({
      evidence: [
        "not-proven:live provider exact proposal",
        "tool-ecosystem:receipt:external-mcp-unavailable",
        "tool-ecosystem:source:no-external-live-claim",
      ],
      verification: {
        status: "failed",
        command: "npm test -w packages/ts-shell -- route227h.test.ts",
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
        reason: "focused verification failed",
        nextAction: "Inspect the failed verification before claiming completion.",
      },
    });

    const surface = projectCliSessionProductSurface({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      stopReason: "verification failed",
      codingResult: result,
    });

    expect(surface?.verdict).toBe("Stopped: verification failed and repair or inspection is required.");
    expect(surface?.notProvenClaims).toContain("live provider exact proposal");
    expect(surface?.notProvenClaims).toContain("relevant verification did not pass");
    expect(surface?.notProvenClaims).toContain("external-live tool execution");
    expect(surface?.lines.join("\n")).toContain("Tools: receipts=");
  });

  it("keeps skipped verification as partial instead of CLI/session success", () => {
    const result = codingResult({
      changedFiles: ["cli-entry-tool-execution.txt"],
      verification: {
        status: "skipped",
        selectionScope: "none",
        selectionSource: "auto-from-changes",
        reason:
          "targeted verification skipped: changed files do not map to a supported allowlisted verification command",
        nextAction:
          "targeted verification skipped: changed files do not map to a supported allowlisted verification command",
      },
      taskSatisfaction: {
        verdict: "completed-with-caveats",
        reasons: ["write completed, verification skipped"],
        requiredEvidence: ["task-relevant verification"],
        observedEvidence: ["file write"],
      },
    });

    const surface = projectCliSessionProductSurface({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: result,
    });

    expect(surface?.verdict).toBe(
      "Partial: some work completed, but required evidence is incomplete.",
    );
    expect(surface?.notProvenClaims).toContain("relevant verification did not pass");
    expect(surface?.lines.join("\n")).toContain("- Verification: status=skipped");
    expect(surface?.lines.join("\n")).not.toContain("Outcome: success");
  });

  it("consumes safe session and runtime projections without changing the verdict", () => {
    const result = codingResult({
      verification: {
        status: "skipped",
        reason: "not run",
      },
    });
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess_product_projection",
        projectRoot: "/workspace",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        status: "completed",
        turns: [
          {
            role: "user",
            content: "token=secret oldText=raw",
          },
        ],
      },
      stateSnapshot: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
      },
    });
    const runtimeEvents = projectRuntimeEvents({
      sessionProjection,
      resourceProjection: projectStaticResourceRegistry({
        descriptors: [
          {
            id: "prompt.safe",
            kind: "prompt-template",
            name: "Safe Prompt",
            description: "Prompt template metadata only.",
            sourceType: "fixture",
            ownerDomain: "runtime/resources",
            visibility: "cli",
            enabledByDefault: false,
            requiresOptIn: false,
            capabilitiesSummary: ["prompt routing"],
            riskLevel: "low",
            notProvenClaims: [],
          },
        ],
      }),
      resultFacts: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        verdictSource: "result",
      },
    });

    const surface = projectCliSessionProductSurface({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: result,
      sessionProjection,
      resourceProjection: projectStaticResourceRegistry({
        descriptors: [
          {
            id: "prompt.safe",
            kind: "prompt-template",
            name: "Safe Prompt",
            description: "Prompt template metadata only.",
            sourceType: "fixture",
            ownerDomain: "runtime/resources",
            visibility: "cli",
            enabledByDefault: false,
            requiresOptIn: false,
            capabilitiesSummary: ["prompt routing"],
            riskLevel: "low",
            notProvenClaims: [],
          },
        ],
      }),
      runtimeEvents,
    });
    const rendered = surface?.lines.join("\n") ?? "";

    expect(rendered).toContain("- Session path: activePath=2; tree=linear-path");
    expect(rendered).toContain("- Runtime events: count=4; last=session-projection-observed");
    expect(rendered).toContain("- Static resources: count=1; registry=explicit-static; dynamic=disabled; execution=disabled; providerDefault=disabled");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toMatch(/secret|oldText=raw/);
    expect(surface?.verdict).toBe(
      "Not proven: the system did not gather enough evidence to claim success.",
    );
  });

  it("redacts raw content, provider homes, secrets, and raw edit text", () => {
    const result = codingResult({
      evidence: [
        "proposal-source:rawProviderOutput=secret-payload",
        "proposal-state:oldText=broken newText=fixed",
        "not-proven:token=abc123 /home/wang/.private-agents-real/provider.env <html>secret</html>",
      ],
      verification: {
        status: "skipped",
        reason: "authorization=Bearer-secret /home/wang/.private-agents-real/provider.env",
      },
    });

    const rendered = projectCliSessionProductSurface({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      stopReason: "not verified",
      codingResult: result,
    })?.lines.join("\n") ?? "";

    expect(rendered).not.toContain("secret-payload");
    expect(rendered).not.toContain("broken");
    expect(rendered).not.toContain("fixed");
    expect(rendered).not.toContain("/home/wang/.private-agents-real");
    expect(rendered).not.toContain("abc123");
    expect(rendered).not.toContain("<html>");
    expect(rendered).toContain("[redacted]");
    expect(rendered).toContain("[redacted-real-provider-home]");
    expect(rendered).toContain("[raw-content-excluded]");
  });

  it("renders through the session terminal path after query.completed", () => {
    const terminalState = createSessionTerminalState();
    applyTerminalQueryEvent(terminalState, {
      type: "query.completed",
      result: {
        status: "completed",
        terminalReason: "completed",
        terminalClassification: "success",
        transcript: [],
        sharedContext: {
          sessionId: "sess_route227h_surface",
          initialPrompt: "apply and verify",
          notes: [],
          handoffs: [],
        },
        finalOutput: "done",
        codingResult: codingResult({
          changedFiles: ["packages/ts-shell/src/core/shell/example.ts"],
          verifiedFiles: ["packages/ts-shell/src/core/shell/example.ts"],
          verification: {
            status: "passed",
            command: "npm test -w packages/ts-shell -- src/core/shell/example.test.ts",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
            reason: "changed-file relevant verification passed",
          },
          evidence: ["authority:granted", "proposal-source:product-path"],
        }),
      },
    });

    const lines: string[] = [];
    renderSessionTerminalSurface({
      renderer: {
        renderLine(line: string) {
          lines.push(line);
        },
        renderChunk() {},
      },
      terminalState,
      eventDigest: createRuntimeEventDigest(),
      printMode: true,
      viewMode: "compact",
      startedRendering: false,
    });

    expect(lines).toContain("Product experience");
    for (const label of [
      "- Task:",
      "- Context:",
      "- Plan:",
      "- Proposal:",
      "- Authority:",
      "- Apply:",
      "- Verification:",
      "- Repair:",
      "- Tools:",
      "- Verdict:",
      "- Not proven:",
      "- Next action:",
    ]) {
      expect(lines.some((line) => line.startsWith(label))).toBe(true);
    }
    expect(lines.join("\n")).toContain("Verified success: relevant verification passed.");
  });
});

function codingResult(overrides: Partial<CodingResultSummary> = {}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: ["not enough evidence yet"],
      requiredEvidence: ["task-relevant verification"],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
    },
    evidence: [],
    ...overrides,
  };
}
