import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserRuntimeProtocolResponse } from "../../runtime/core/protocol.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
import type { BrowserExternalRuntimeManifest } from "../../runtime/external/runtimeManifest.js";

export interface BrowserSkillRuntimeBinding {
  readonly bindingId: string;
  readonly skillId: string;
  readonly mode: "test-only" | "explicit-local-config";
  readonly allowedActions: readonly string[];
  readonly snapshotCapabilities: readonly string[];
  readonly run?: (input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserExternalRuntimeManifest;
    readonly signal?: AbortSignal;
  }) => BrowserRuntimeProtocolResponse | Promise<BrowserRuntimeProtocolResponse>;
}

export type BrowserSkillRuntimeBindingDecision =
  | {
      readonly status: "ready";
      readonly binding: BrowserSkillRuntimeBinding;
      readonly reason: string;
      readonly warnings: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "future-skill-runtime-required" | "invalid";
      readonly reason: string;
      readonly warnings: readonly string[];
      readonly evidence: readonly string[];
    };

export function validateBrowserSkillRuntimeBinding(input: {
  readonly manifest: BrowserExternalRuntimeManifest;
  readonly binding?: BrowserSkillRuntimeBinding;
}): BrowserSkillRuntimeBindingDecision {
  if (input.manifest.runtimeMode !== "skill-managed") {
    return {
      status: "invalid",
      reason: "Skill runtime binding is only valid for skill-managed manifests.",
      warnings: ["browser-skill-runtime-binding:not-skill-managed"],
      evidence: ["browser-skill-runtime-binding:invalid"],
    };
  }
  if (!input.binding) {
    return {
      status: "future-skill-runtime-required",
      reason: "Explicit skill runtime binding metadata was not supplied.",
      warnings: ["browser-skill-runtime-binding:missing"],
      evidence: ["browser-skill-runtime-binding:future-required", "browser-skill-runtime-binding:no-dynamic-discovery"],
    };
  }
  if (input.binding.bindingId !== input.manifest.skillBindingId) {
    return {
      status: "invalid",
      reason: "Skill runtime binding id does not match the manifest.",
      warnings: ["browser-skill-runtime-binding:id-mismatch"],
      evidence: ["browser-skill-runtime-binding:invalid"],
    };
  }
  const missingAction = input.manifest.allowedActions.find((action) => !input.binding!.allowedActions.includes(action));
  if (missingAction) {
    return {
      status: "invalid",
      reason: `Skill runtime binding does not support action ${sanitizeBrowserText(missingAction, 40)}.`,
      warnings: ["browser-skill-runtime-binding:action-missing"],
      evidence: ["browser-skill-runtime-binding:invalid"],
    };
  }
  return {
    status: "ready",
    binding: input.binding,
    reason: "Explicit skill runtime binding is ready.",
    warnings: [],
    evidence: [
      "browser-skill-runtime-binding:ready",
      "browser-skill-runtime-binding:explicit-metadata",
      "browser-skill-runtime-binding:no-dynamic-discovery",
    ],
  };
}
