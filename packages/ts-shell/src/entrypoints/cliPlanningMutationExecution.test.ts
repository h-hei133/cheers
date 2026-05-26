import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildCliPlanningMutationExecutionOptions } from "./cliPlanningMutationExecution.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildCliPlanningMutationExecutionOptions", () => {
  it("returns undefined when no explicit planning mutation controls are present", () => {
    expect(
      buildCliPlanningMutationExecutionOptions({
        options: {},
        workspaceRoot: "/workspace",
      }),
    ).toBeUndefined();
  });

  it("loads explicit proposal input and confirmation from CLI flags", () => {
    const workspaceRoot = createWorkspace();
    fs.writeFileSync(
      path.join(workspaceRoot, "proposal.json"),
      JSON.stringify({
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/app.ts",
            oldText: "old",
            newText: "new",
          },
        ],
      }),
      "utf8",
    );

    const result = buildCliPlanningMutationExecutionOptions({
      workspaceRoot,
      providerModeEnv: "synthetic",
      options: {
        planningMutationConfirm: true,
        planningMutationControlledWorkspace: true,
        planningMutationSelectedWorkspace: true,
        planningMutationLiveProviderProposal: true,
        planningMutationProposalPath: "proposal.json",
        planningMutationVerifyCommand: "node --version",
      },
    });

    expect(result?.confirmation).toEqual({ state: "trusted-confirmed" });
    expect(result?.rawProposal?.operationKind).toBe("exact-fenced-replacement");
    expect(result?.controlledWorkspace).toEqual({
      scope: "controlled-temp-workspace",
      source: "cli-flag",
    });
    expect(result?.selectedWorkspace).toEqual({
      scope: "selected-workspace",
      source: "cli-flag",
      explicitWorkspaceAuthority: true,
      allowedRoot: workspaceRoot,
    });
    expect(result?.verificationCommand).toEqual({
      command: "node --version",
      approval: "explicit",
      source: "cli-flag",
    });
    expect(result?.liveProviderProposal).toEqual({
      optIn: true,
      source: "cli-flag",
      attempts: [
        {
          role: "primary",
          providerSafeLabel: "unknown",
          providerConfigSource: "not-configured",
          providerAvailability: {
            kind: "not-configured",
            reason: "resolved credential missing",
          },
          readinessStatus: "not-ready",
          evidenceSource: "fake-provider",
        },
      ],
      fallbackPolicy: {
        enabled: false,
        reason: "CLI live-provider product path runs one configured provider profile per process.",
      },
      taskEvidence: {
        mode: "single-file-exact-patch",
        targetContentMaxChars: 6000,
      },
    });
  });

  it("builds an approved live provider attempt only from explicit real opt-in and resolved credentials", () => {
    const workspaceRoot = createWorkspace();
    const result = buildCliPlanningMutationExecutionOptions({
      workspaceRoot,
      providerModeEnv: "real",
      realProviderSmokeOptIn: true,
      providerCredentialResolution: {
        provider: "openai-compatible",
        expectedEnvVarName: "OPENAI_COMPATIBLE_API_KEY",
        baseUrl: "https://provider.example.test/v1",
        model: "model-test",
        credential: {
          provider: "openai-compatible",
          authMode: "api-key",
          apiKey: "sk-test",
          baseUrl: "https://provider.example.test/v1",
          model: "model-test",
          source: "env",
          envVarName: "OPENAI_COMPATIBLE_API_KEY",
        },
      },
      options: {
        planningMutationLiveProviderProposal: true,
      },
    });

    expect(result?.liveProviderProposal?.attempts?.[0]).toMatchObject({
      role: "primary",
      providerSafeLabel: "openai-compatible",
      providerConfigSource: "resolved-env",
      providerAvailability: {
        kind: "available",
        providerKindLabel: "openai-compatible",
      },
      readinessStatus: "ready",
      evidenceSource: "live-provider",
    });
    expect(result?.liveProviderProposal?.attempts?.[0]?.provider).toBeDefined();
  });

  it("rejects proposal files outside the selected workspace", () => {
    const workspaceRoot = createWorkspace();
    const outside = path.join(os.tmpdir(), "route210-outside-proposal.json");
    fs.writeFileSync(outside, JSON.stringify({ operationKind: "exact-fenced-replacement" }), "utf8");
    tempRoots.push(outside);

    expect(() =>
      buildCliPlanningMutationExecutionOptions({
        workspaceRoot,
        options: {
          planningMutationProposalPath: path.relative(workspaceRoot, outside),
        },
      }),
    ).toThrow("--planning-mutation-proposal must point to a JSON file inside the selected workspace.");
  });
});

function createWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route210-cli-planning-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.ts"), "old\n", "utf8");
  return root;
}
