import { describe, expect, it } from "vitest";
import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import {
  formatAgentModeStatusLines,
  formatViewModeStatusLines,
  formatWorkspaceInfoLines,
  projectPermissionListDisplay,
} from "./cliDisplayProjection.js";
import { projectCliProviderProjection } from "./cliProviderProjection.js";
import {
  formatSessionSwitchFailureLine,
  formatSessionSwitchSuccessLines,
  formatSessionSwitchUsage,
} from "./cliSessionProjection.js";
import {
  projectCliApprovalStartupSummary,
  projectCliStartupPlan,
} from "./cliStartupPlan.js";

const providerCredentialResolution: ProviderCredentialResolution = {
  provider: "openai",
  expectedEnvVarName: "OPENAI_API_KEY",
  model: "gpt-test",
  baseUrl: "https://provider.example.test",
  credential: {
    provider: "openai",
    authMode: "api-key",
    apiKey: "sk-secret-value",
    source: "cli",
    envVarName: "OPENAI_API_KEY",
    model: "gpt-test",
    baseUrl: "https://provider.example.test",
  },
};

describe("CLI core split projections", () => {
  it("projects print-mode startup facts without executing runtime", () => {
    let runtimeTouched = false;
    const plan = projectCliStartupPlan({
      options: {
        printMode: true,
        promptArg: "hello",
        nonInteractiveApproval: "deny",
      },
      cliModePlan: { kind: "print" },
      stdinTransportMode: "disabled",
      nonInteractivePromptCount: 1,
      launchCwd: "/launch",
      runtimeBaseDir: "/workspace",
      workspaceRoot: "/workspace",
      projectRoot: "/workspace",
      rootMode: "git-root",
      providerCredentialResolution,
      providerModeEnv: "synthetic",
      maxTurns: 4,
    });

    expect(plan).toMatchObject({
      requestedMode: "print",
      promptSource: "print-argument",
      sessionMode: "default-selection",
      runtimeInvocationShape: "print-runtime",
      stdinTransportMode: "disabled",
      nonInteractivePromptCount: 1,
      maxTurns: 4,
      approval: {
        nonInteractiveApproval: "deny",
        summaryLabel: "explicit deny",
      },
      provider: {
        providerMode: "synthetic",
        readinessLabel: "synthetic-default",
        credentialSource: "cli",
        authMode: "api-key",
      },
    });
    expect(plan.workspace).toEqual({
      launchCwd: "/launch",
      runtimeBaseDir: "/workspace",
      workspaceRoot: "/workspace",
      projectRoot: "/workspace",
      rootMode: "git-root",
    });

    expect(runtimeTouched).toBe(false);
    runtimeTouched = true;
    expect(runtimeTouched).toBe(true);
  });

  it("projects interactive startup facts with default approval summary", () => {
    const plan = projectCliStartupPlan({
      options: {},
      cliModePlan: { kind: "interactive" },
      stdinTransportMode: "disabled",
      nonInteractivePromptCount: 0,
      launchCwd: "/launch",
      runtimeBaseDir: "/workspace",
      workspaceRoot: "/workspace",
      projectRoot: "/workspace",
      providerCredentialResolution: {
        provider: "anthropic",
        expectedEnvVarName: "ANTHROPIC_API_KEY",
      },
      providerModeEnv: "real",
      maxTurns: 8,
    });

    expect(plan.requestedMode).toBe("interactive");
    expect(plan.promptSource).toBe("interactive");
    expect(plan.sessionMode).toBe("default-selection");
    expect(plan.runtimeInvocationShape).toBe("interactive-runtime");
    expect(plan.approval).toEqual({
      nonInteractiveApproval: "default",
      summaryLabel: "default non-interactive deny",
    });
    expect(plan.provider).toMatchObject({
      provider: "anthropic",
      providerMode: "real",
      readinessLabel: "real-provider-missing-credential",
      credentialSource: "missing",
      authMode: "none",
      expectedEnvVarName: "ANTHROPIC_API_KEY",
    });
  });

  it("projects session switch and current-session display facts exactly", () => {
    expect(formatSessionSwitchUsage({ printMode: true })).toBe(
      "Usage: /resume switch <id|prefix|title|last>",
    );
    expect(formatSessionSwitchUsage({ printMode: false })).toBe(
      "\nUsage: /resume switch <id|prefix|title|last>\n",
    );
    expect(
      formatSessionSwitchSuccessLines({
        previousSessionId: "sess_old",
        nextSessionId: "sess_new",
        projectRoot: "/workspace",
        printMode: false,
      }),
    ).toEqual([
      "\nSwitched session: sess_old -> sess_new\n",
      "Project context: /workspace",
    ]);
    expect(
      formatSessionSwitchFailureLine({
        message: "not found",
        printMode: true,
      }),
    ).toBe("Failed to switch session: not found");
  });

  it("projects synthetic/default provider readiness without leaking secrets", () => {
    const projection = projectCliProviderProjection({
      providerCredentialResolution,
      providerModeEnv: "real",
    });
    const serialized = JSON.stringify(projection);

    expect(projection).toEqual({
      provider: "openai",
      providerMode: "real",
      readinessLabel: "real-provider-configured",
      credentialSource: "cli",
      authMode: "api-key",
      expectedEnvVarName: "OPENAI_API_KEY",
      model: "gpt-test",
      baseUrlConfigured: true,
    });
    expect(serialized).not.toContain("sk-secret-value");
    expect(serialized).not.toContain("accountAuth");
  });

  it("keeps approval mode summary stable", () => {
    expect(projectCliApprovalStartupSummary({})).toEqual({
      nonInteractiveApproval: "default",
      summaryLabel: "default non-interactive deny",
    });
    expect(
      projectCliApprovalStartupSummary({
        nonInteractiveApproval: "allow-always",
      }),
    ).toEqual({
      nonInteractiveApproval: "allow-always",
      summaryLabel: "explicit allow-always",
    });
  });

  it("projects display facts without changing known CLI strings", () => {
    expect(
      formatWorkspaceInfoLines({
        cwd: "/workspace/subdir",
        projectRoot: "/workspace",
      }),
    ).toEqual([
      "",
      "Current working directory: /workspace/subdir",
      "Project root: /workspace",
      "Use /cd <path> (or /workspace attach <path>) to switch target project.",
      "",
    ]);
    expect(formatViewModeStatusLines({ viewMode: "compact" })).toEqual([
      "\nCurrent view mode: user (compact)",
      "Use /view user for product-style output, or /view developer for runtime-level diagnostics.\n",
    ]);
    expect(formatAgentModeStatusLines({ agentMode: "plan" })).toEqual([
      "\nCurrent agent mode: plan",
      "Use /plan for planning-oriented reasoning, or /build for coding/build execution (default).\n",
    ]);
    expect(
      projectPermissionListDisplay({
        projectRoot: "/workspace/project",
        grantCount: 0,
      }),
    ).toEqual({
      projectLabel: "project",
      grantCount: 0,
      emptyLines: [
        "- No persisted allow-always grants for this project.",
        "- Use /permissions reset all to clear global grants if needed.",
        "",
      ],
    });
  });
});
