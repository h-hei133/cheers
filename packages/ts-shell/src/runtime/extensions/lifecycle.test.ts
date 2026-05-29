import { describe, expect, it } from "vitest";

import {
  applyExtensionHookPolicy,
  extensionLifecycleEventContract,
  type ExtensionHookDescriptor,
  validateExtensionHookDescriptor,
} from "./lifecycle.js";

describe("extension lifecycle and hook boundary", () => {
  it("defines report-safe lifecycle event contracts without execution support", () => {
    const contract = extensionLifecycleEventContract(
      "tool-call-prepared",
      "runtime/extensions",
    );

    expect(contract).toMatchObject({
      kind: "tool-call-prepared",
      ownerDomain: "runtime/extensions",
      reportSafe: true,
      execution: "not-supported",
    });
    expect(contract.notProvenClaims).toEqual(
      expect.arrayContaining([
        "extension-execution",
        "plugin-execution",
        "tool-success",
        "terminal-success",
      ]),
    );
  });

  it("accepts static internal descriptors and keeps them metadata-only", () => {
    const validation = validateExtensionHookDescriptor(descriptor());

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error("expected descriptor to validate");
    }
    expect(validation.descriptor).toMatchObject({
      supported: false,
      executable: false,
      registrationMode: "static-internal",
    });
    expect(validation.descriptor.notProvenClaims).toEqual(
      expect.arrayContaining([
        "dynamic-discovery",
        "extension-execution",
        "plugin-execution",
        "terminal-success",
      ]),
    );
  });

  it("rejects executable or dynamically registered hook descriptors", () => {
    expect(
      validateExtensionHookDescriptor({
        ...descriptor(),
        executable: true,
      } as never),
    ).toMatchObject({
      ok: false,
      reason: "extension hooks are metadata-only and cannot be executable",
    });
    expect(
      validateExtensionHookDescriptor({
        ...descriptor(),
        registrationMode: "dynamic-plugin",
      } as never),
    ).toMatchObject({
      ok: false,
      reason: "extension hooks must use static internal registration",
    });
  });

  it("accepts safe hook outcomes as evidence-only policy input", () => {
    const outcome = applyExtensionHookPolicy({
      descriptor: descriptor({ allowedEffect: "annotate-evidence" }),
      requestedEffect: "annotate-evidence",
      summary: "Observed lifecycle fact.",
      evidenceAnnotations: ["extension-hook:observed"],
    });

    expect(outcome).toMatchObject({
      status: "accepted",
      acceptedEffect: "annotate-evidence",
      terminalSuccessClaim: false,
      evidenceAnnotations: ["extension-hook:observed"],
    });
    expect(outcome.notProvenClaims).toContain("terminal-success");
    expect(JSON.stringify(outcome)).not.toContain('"success":true');
  });

  it("rejects forbidden hook outcomes and preserves truthfulness", () => {
    const forbidden = applyExtensionHookPolicy({
      descriptor: descriptor(),
      requestedEffect: "force-terminal-success",
      summary: "Please mark this successful.",
      terminalSuccessClaim: true,
    });

    expect(forbidden).toMatchObject({
      status: "rejected",
      acceptedEffect: "none",
      terminalSuccessClaim: false,
      reason: "forbidden hook effect rejected: force-terminal-success",
    });
    expect(forbidden.notProvenClaims).toContain("terminal-success");
  });

  it("rejects provider, tool, file, shell, transcript, and plugin execution effects", () => {
    for (const input of [
      { requestedEffect: "execute-provider-by-default", providerDefaultExecution: true },
      { requestedEffect: "execute-tool-by-default", toolDefaultExecution: true },
      { requestedEffect: "mutate-files", fileMutation: true },
      { requestedEffect: "run-shell", shellExecution: true },
      { requestedEffect: "alter-hidden-transcript", hiddenTranscriptMutation: true },
      { requestedEffect: "execute-plugin-code", executablePluginCode: () => "run" },
    ] as const) {
      const outcome = applyExtensionHookPolicy({
        descriptor: descriptor(),
        summary: "Unsafe hook effect.",
        ...input,
      });

      expect(outcome.status).toBe("rejected");
      expect(outcome.acceptedEffect).toBe("none");
    }
  });

  it("redacts unsafe descriptor and outcome content without executing functions", () => {
    let executed = false;
    const outcome = applyExtensionHookPolicy({
      descriptor: descriptor({
        reportSafeMetadata: {
          note:
            "provider.env=/home/wang/.private-agents-real/provider.env Authorization: Bearer abc raw provider output: hidden",
          run: () => {
            executed = true;
          },
        },
      }),
      requestedEffect: "observe-only",
      summary:
        "oldText=before newText=after hidden reasoning: secret unredacted command output: secret",
      payload: {
        apiKey: "sk-1234567890",
        transcript: "full transcript: private",
      },
    });
    const serialized = JSON.stringify(outcome);

    expect(executed).toBe(false);
    expect(outcome.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(
      /private-agents-real|Bearer abc|sk-1234567890|before|after|hidden reasoning|unredacted command output|full transcript/i,
    );
    expect(serialized).toContain("[raw-content-excluded]");
  });
});

function descriptor(
  overrides: Partial<ExtensionHookDescriptor> = {},
): ExtensionHookDescriptor {
  return {
    hookId: "extension.safe.observe",
    extensionId: "extension.safe",
    eventKind: "tool-call-prepared",
    ownerDomain: "runtime/extensions",
    allowedEffect: "observe-only",
    riskLevel: "low",
    requiresOptIn: true,
    supported: false,
    executable: false,
    registrationMode: "static-internal",
    notProvenClaims: [],
    ...overrides,
  };
}
