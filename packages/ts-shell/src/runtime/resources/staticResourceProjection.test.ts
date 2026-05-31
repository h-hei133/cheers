import { describe, expect, it } from "vitest";

import type { StaticResourceDescriptor } from "./descriptor.js";
import { validateStaticResourceDescriptor } from "./descriptor.js";
import { projectStaticResourceRegistry } from "./projection.js";

describe("static resource projection", () => {
  it("accepts safe static descriptors and adds not-proven resource claims", () => {
    const validation = validateStaticResourceDescriptor(
      descriptor({
        id: "skill.inspect",
        kind: "skill",
        name: "Inspect",
        description: "Read-only inspection guidance.",
        capabilitiesSummary: ["read-only analysis"],
      }),
    );

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error("expected descriptor to validate");
    }
    expect(validation.descriptor.enabledByDefault).toBe(false);
    expect(validation.descriptor.notProvenClaims).toEqual(
      expect.arrayContaining([
        "resource-execution",
        "dynamic-discovery",
        "provider-enabled",
        "terminal-success",
      ]),
    );
  });

  it("redacts unsafe provider metadata without enabling the provider", () => {
    const projection = projectStaticResourceRegistry({
      descriptors: [
        descriptor({
          id: "provider.openai-compatible",
          kind: "provider-metadata",
          name: "OpenAI Compatible",
          description:
            "provider.env=/home/wang/.private-agents-real/provider.env Authorization: Bearer abc raw provider output: hidden",
          requiresOptIn: true,
          capabilitiesSummary: ["text", "tool-use"],
          riskLevel: "high",
          reportSafeMetadata: {
            apiKey: "sk-1234567890",
            note: "oldText=raw-before newText=raw-after",
          },
          providerMetadata: {
            providerLabel: "openai-compatible",
            modelLabel: "gpt-compatible",
            endpointClass: "openai-compatible",
            capabilityFlags: ["text", "tool-use"],
            defaultEnabled: false,
            requiresOptIn: true,
          },
        }),
      ],
    });
    const serialized = JSON.stringify(projection);

    expect(projection.resources[0]?.provider).toMatchObject({
      providerLabel: "openai-compatible",
      defaultEnabled: false,
      requiresOptIn: true,
    });
    expect(projection.providerDefaultEnablement).toBe("disabled");
    expect(projection.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(
      /private-agents-real|Bearer abc|sk-1234567890|raw-before|raw-after|raw provider output/i,
    );
  });

  it("rejects executable extension manifests and never runs supplied functions", () => {
    let executed = false;
    const projection = projectStaticResourceRegistry({
      descriptors: [
        descriptor({
          id: "extension.review",
          kind: "extension-manifest",
          name: "Review Extension",
          description: "Metadata-only extension manifest.",
          capabilitiesSummary: ["review hints"],
          reportSafeMetadata: {
            run: () => {
              executed = true;
            },
          } as never,
          extensionManifest: {
            extensionId: "extension.review",
            safeName: "Review Extension",
            capabilities: ["review"],
            toolKinds: ["read"],
            requiredPermissions: ["none"],
            executable: true,
            supported: false,
          } as never,
        }),
      ],
    });

    expect(projection.resources).toHaveLength(0);
    expect(projection.rejectedResourceCount).toBe(1);
    expect(projection.pluginExecution).toBe("disabled");
    expect(executed).toBe(false);
  });

  it("projects explicit static resource metadata without dynamic discovery or success claims", () => {
    const projection = projectStaticResourceRegistry({
      descriptors: [
        descriptor({
          id: "prompt.fix",
          kind: "prompt-template",
          name: "Fix Prompt",
          description: "Safe prompt template metadata only.",
          capabilitiesSummary: ["prompt routing"],
        }),
        descriptor({
          id: "extension.safe",
          kind: "extension-manifest",
          name: "Safe Extension Manifest",
          description: "Manifest metadata only.",
          capabilitiesSummary: ["metadata"],
          extensionManifest: {
            extensionId: "extension.safe",
            safeName: "Safe Extension Manifest",
            capabilities: ["metadata"],
            lifecycleEvents: ["tool-call-prepared", "save-point-observed"],
            hookEffects: ["observe-only", "annotate-evidence"],
            toolKinds: [],
            requiredPermissions: ["explicit-opt-in"],
            executable: false,
            supported: false,
          },
        }),
      ],
    });

    expect(projection.registryMode).toBe("explicit-static");
    expect(projection.dynamicDiscovery).toBe("disabled");
    expect(projection.packageLoading).toBe("disabled");
    expect(projection.pluginExecution).toBe("disabled");
    expect(projection.resources.map((resource) => resource.kind)).toEqual([
      "prompt-template",
      "extension-manifest",
    ]);
    expect(projection.resources[1]?.extension).toMatchObject({
      lifecycleEvents: ["tool-call-prepared", "save-point-observed"],
      hookEffects: ["observe-only", "annotate-evidence"],
      executable: false,
      supported: false,
    });
    expect(JSON.stringify(projection)).not.toContain('"success":true');
    expect(projection.notProvenClaims).toEqual(
      expect.arrayContaining([
        "resource-execution",
        "provider-success",
        "tool-success",
        "verification-success",
        "terminal-success",
      ]),
    );
  });

  it("rejects extension manifests that reference unsupported lifecycle metadata", () => {
    const projection = projectStaticResourceRegistry({
      descriptors: [
        descriptor({
          id: "extension.future",
          kind: "extension-manifest",
          name: "Future Extension Manifest",
          description: "Unsupported lifecycle metadata.",
          extensionManifest: {
            extensionId: "extension.future",
            safeName: "Future Extension Manifest",
            capabilities: ["metadata"],
            lifecycleEvents: ["execute-plugin-now"],
            toolKinds: [],
            requiredPermissions: [],
            executable: false,
            supported: false,
          } as never,
        }),
      ],
    });

    expect(projection.resources).toHaveLength(0);
    expect(projection.rejectedResourceCount).toBe(1);
    expect(projection.pluginExecution).toBe("disabled");
  });

  it("rejects extension manifests that reference unsupported hook effects", () => {
    const projection = projectStaticResourceRegistry({
      descriptors: [
        descriptor({
          id: "extension.hook",
          kind: "extension-manifest",
          name: "Hook Extension Manifest",
          description: "Unsupported hook metadata.",
          extensionManifest: {
            extensionId: "extension.hook",
            safeName: "Hook Extension Manifest",
            capabilities: ["metadata"],
            hookEffects: ["force-terminal-success"],
            toolKinds: [],
            requiredPermissions: [],
            executable: false,
            supported: false,
          } as never,
        }),
      ],
    });

    expect(projection.resources).toHaveLength(0);
    expect(projection.rejectedResourceCount).toBe(1);
    expect(projection.pluginExecution).toBe("disabled");
  });
});

function descriptor(
  input: Partial<StaticResourceDescriptor> & Pick<StaticResourceDescriptor, "id" | "kind" | "name" | "description">,
): StaticResourceDescriptor {
  return {
    sourceType: "fixture",
    version: "0.0.0",
    ownerDomain: "runtime/resources",
    visibility: "runtime",
    enabledByDefault: false,
    requiresOptIn: false,
    capabilitiesSummary: [],
    riskLevel: "low",
    notProvenClaims: [],
    ...input,
  };
}
