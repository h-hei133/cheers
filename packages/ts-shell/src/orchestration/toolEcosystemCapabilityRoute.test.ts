import { describe, expect, it } from "vitest";

import { runToolEcosystemCapabilityRoute } from "./toolEcosystemCapabilityRoute.js";

describe("runToolEcosystemCapabilityRoute", () => {
  it("keeps local MCP/browser evidence separate while exposing planning, verification, and session receipts", () => {
    const result = runToolEcosystemCapabilityRoute({
      tasks: [
        {
          taskId: "local-read",
          intentKind: "code-workspace-tool",
          toolName: "read",
          evidenceSource: "local-deterministic",
          result: { success: true, output: "route227g local context" },
          relevance: "context-evidence",
        },
        {
          taskId: "local-mcp",
          intentKind: "mcp-local-tool",
          toolName: "mcp__stdioEcho__echo_message",
          evidenceSource: "local-deterministic",
          serverName: "stdioEcho",
          result: {
            success: true,
            output: "echo:hello",
            metadata: {
              executionPath: "mcp-stdio",
              serverName: "stdioEcho",
              toolName: "echo_message",
            },
          },
          relevance: "verification-support",
        },
        {
          taskId: "external-mcp-unavailable",
          intentKind: "mcp-external-tool",
          toolName: "mcp__externalSearch__search",
          evidenceSource: "external-unavailable",
          serverName: "externalSearch",
          result: {
            success: false,
            error: "MCP tool 'mcp__externalSearch__search' is not registered",
            metadata: {
              executionPath: "mcp-stdio",
              serverName: "externalSearch",
              blockerKind: "unknown",
            },
          },
          relevance: "missing-facts",
        },
        {
          taskId: "browser-observe",
          intentKind: "browser-observation",
          toolName: "browser.observe",
          evidenceSource: "focused-fixture",
          result: {
            success: true,
            output: "Browser observation: local fixture title",
            metadata: {
              executionPath: "browser-tool",
              browserRuntimeStatus: "ready",
              rawContent: "excluded",
              evidence: ["browser-tool:no-raw-dom"],
            },
          },
          relevance: "planning-fact",
        },
        {
          taskId: "browser-action-blocked",
          intentKind: "browser-action",
          toolName: "browser.type",
          evidenceSource: "blocked-unsafe",
          result: {
            success: false,
            error: "Typing requires valueClassification=safe-test-text.",
            metadata: {
              executionPath: "browser-tool",
              browserReasonCode: "policy-blocked",
            },
          },
          relevance: "verification-rejected",
        },
        {
          taskId: "irrelevant-success",
          intentKind: "code-workspace-tool",
          toolName: "git-status",
          evidenceSource: "local-deterministic",
          result: { success: true, output: "clean" },
          relevance: "irrelevant",
        },
        {
          taskId: "unsupported-external",
          intentKind: "unsupported-external-action",
          toolName: "external.payments.charge",
          evidenceSource: "blocked-unsafe",
          result: { success: false, error: "unsupported external side effect" },
          relevance: "verification-rejected",
        },
      ],
    });

    expect(result.status).toBe("COMPLETE");
    expect(result.receipts).toHaveLength(7);
    expect(
      result.receipts
        .filter((receipt) => receipt.localEvidenceOnly)
        .every((receipt) => receipt.externalLiveClaim === false),
    ).toBe(true);
    expect(result.planningIntegration.facts).toEqual([
      expect.stringContaining("read:local-deterministic:"),
      expect.stringContaining("browser.observe:focused-fixture:"),
    ]);
    expect(result.verificationIntegration.status).toBe("supported");
    expect(result.verificationIntegration.relevantReceiptIds).toEqual([
      "route227g:local-mcp:mcp__stdioecho__echo_message",
    ]);
    expect(result.verificationIntegration.rejectedReceiptIds).toEqual(
      expect.arrayContaining([
        "route227g:browser-action-blocked:browser.type",
        "route227g:irrelevant-success:git-status",
        "route227g:unsupported-external:external.payments.charge",
      ]),
    );
    expect(result.negativeControls).toEqual({
      localFixtureNotExternalLive: true,
      unsupportedActionBlocked: true,
      irrelevantToolSuccessRejected: true,
      unavailableExternalMcpNotSuccess: true,
      browserSideEffectWithoutPolicyBlocked: true,
    });
    expect(result.sessionContinuation.evidenceIds).toContain(
      "tool-ecosystem:receipt:route227g:unsupported-external:external.payments.charge",
    );
    expect(result.evidence).toContain("tool-ecosystem:unsupported-actions-blocked");
    expect(result.notProvenClaims).toContain("external-live tool execution");
  });

  it("does not report complete when verification has only irrelevant or blocked tool evidence", () => {
    const result = runToolEcosystemCapabilityRoute({
      tasks: [
        {
          taskId: "irrelevant",
          intentKind: "code-workspace-tool",
          toolName: "git-status",
          evidenceSource: "local-deterministic",
          result: { success: true, output: "clean" },
          relevance: "irrelevant",
        },
        {
          taskId: "blocked",
          intentKind: "unsupported-external-action",
          toolName: "external.browser.public-write",
          evidenceSource: "blocked-unsafe",
          result: { success: false, error: "blocked unsafe external action" },
          relevance: "verification-rejected",
        },
      ],
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.verificationIntegration.status).toBe("rejected");
    expect(result.finalVerdict).toBe("tool-evidence-partial");
  });
});
