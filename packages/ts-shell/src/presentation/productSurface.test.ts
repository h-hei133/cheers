import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../orchestration/types.js";
import {
  projectProviderRegistry,
  unknownProviderCompatibilityFlags,
} from "../provider/providerRegistry.js";
import { projectRuntimeEvents } from "../runtime/events/runtimeEventProjection.js";
import { runAgentLoopContract } from "../runtime/loop/agentLoopContract.js";
import { projectLoopTrajectory } from "../runtime/loop/trajectoryProjection.js";
import {
  projectPackageResourceInventory,
  type PackageManifestContract,
} from "../runtime/resources/packageInventory.js";
import { projectStaticResourceRegistry } from "../runtime/resources/staticResourceProjection.js";
import { projectSessionTree } from "../session/sessionTreeProjection.js";
import { projectProductSurfaceViewModel } from "./productSurface.js";
import { renderTerminalMessage } from "./terminalMessageRenderer.js";

describe("product surface view model", () => {
  it("builds semantic sections from result, session, event, provider, package, and resource facts", () => {
    const resources = projectStaticResourceRegistry({
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
    });
    const packages = projectPackageResourceInventory({
      manifests: [
        manifest({
          packageId: "pkg.safe",
          safeName: "Safe Package",
          resourceIds: ["prompt.safe"],
          declaredCapabilities: ["prompt routing"],
        }),
      ],
    });
    const providerRegistry = projectProviderRegistry({
      providers: [
        {
          providerId: "openai",
          safeLabel: "OpenAI",
          providerKind: "openai",
          endpointClass: "default",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: unknownProviderCompatibilityFlags(),
          riskLevel: "medium",
        },
      ],
    });
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess_surface",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
        status: "completed",
        turns: [{ role: "user", content: "please inspect" }],
      },
      stateSnapshot: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
      },
    });
    const runtimeEvents = projectRuntimeEvents({
      sessionProjection,
      resourceProjection: resources,
      packageInventory: packages,
      resultFacts: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        verdictSource: "result",
      },
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: codingResult(),
      resourceProjection: resources,
      packageInventory: packages,
      providerRegistry,
      runtimeEvents,
      sessionProjection,
    });

    expect(viewModel?.sections.map((section) => section.kind)).toEqual([
      "task",
      "context",
      "plan",
      "proposal",
      "authority",
      "apply",
      "verification",
      "repair",
      "tools",
      "resources",
      "provider",
      "packages",
      "session",
      "events",
      "verdict",
      "not_proven",
      "next_action",
    ]);
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(viewModel?.sections.find((section) => section.kind === "provider")).toMatchObject({
      status: "not_proven",
      severity: "not_proven",
    });
    expect(viewModel?.sections.find((section) => section.kind === "packages")?.summary)
      .toContain("installation=disabled");
  });

  it("renders stable compact and detailed output without inventing success", () => {
    const viewModel = projectProductSurfaceViewModel({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: codingResult({
        verification: {
          status: "skipped",
          reason: "selected but not run",
        },
        taskSatisfaction: {
          verdict: "completed-with-caveats",
          reasons: ["selected verification did not run"],
          requiredEvidence: ["task-relevant verification"],
          observedEvidence: ["patch applied"],
        },
      }),
    });

    const compact = renderTerminalMessage(viewModel!).lines.join("\n");
    const detailed = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(compact).toContain("[partial] Verification: status=skipped");
    expect(compact).toContain("[partial] Verdict: Partial");
    expect(compact).not.toContain("Outcome: success");
    expect(detailed).toContain("not_proven: relevant verification did not pass");
    expect(detailed).toContain("status: not_run");
  });

  it("renders loop trajectory summaries without turning observations into success", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess_surface_loop",
      workspaceRoot: "/workspace",
      prompt: "summarize trajectory",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-surface-loop",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "surface-loop",
      prompt: "summarize trajectory",
      loop,
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      loopTrajectory: trajectory,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(viewModel?.sections.map((section) => section.kind)).toEqual([
      "task",
      "turn",
      "provider",
      "tools",
      "execution",
      "save_point",
      "session",
      "context",
      "events",
      "verdict",
      "not_proven",
      "next_action",
    ]);
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(rendered).toContain("[not_proven] Provider:");
    expect(rendered).toContain("[not_proven] Verdict:");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toContain("Outcome: success");
  });

  it("redacts unsafe raw output, provider config, patch payloads, and hidden reasoning", () => {
    const viewModel = projectProductSurfaceViewModel({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      stopReason: "not verified",
      codingResult: codingResult({
        evidence: [
          "proposal-source:rawProviderOutput=secret-payload",
          "proposal-state:oldText=before newText=after hidden reasoning",
          "not-proven:provider.env=/home/wang/.private-agents-real/provider.env token=abc123 <html>unsafe</html>",
        ],
        verification: {
          status: "failed",
          command: "npm test",
          reason: "stdout raw command output stderr hidden reasoning",
        },
      }),
    });
    const rendered = renderTerminalMessage(viewModel!).lines.join("\n");

    expect(rendered).not.toMatch(
      /secret-payload|oldText=before|newText=after|abc123|<html>|\/home\/wang\/\.private-agents-real|stdout raw command output|hidden reasoning/i,
    );
    expect(rendered).toContain("provider-config=[redacted]");
    expect(rendered).toContain("[raw-content-excluded]");
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

function manifest(input: Partial<PackageManifestContract>): PackageManifestContract {
  return {
    packageId: "pkg.default",
    safeName: "Default Package",
    version: {
      exactVersion: "0.0.0",
      pinnedState: "pinned",
      integrity: "sha256-default",
    },
    sourceKind: "test_fixture",
    sourceLabel: "test fixture",
    scope: "test_fixture",
    trustLevel: "trusted",
    enabledState: "disabled",
    resourceIds: [],
    declaredCapabilities: [],
    requiredPermissions: [],
    executable: false,
    supported: false,
    notProvenClaims: [],
    ...input,
  };
}
