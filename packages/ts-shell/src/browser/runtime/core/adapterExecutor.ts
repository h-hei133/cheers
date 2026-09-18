import type {
  BrowserRuntimeExecutor,
  BrowserRuntimeExecutorResult,
} from "./executor.js";
import type { BrowserExecutionRequest } from "../../browserExecutionContract.js";
import type { BrowserRuntimeManifest } from "./manifest.js";
import {
  type BrowserExternalRuntimeManifestLoadResult,
} from "../external/runtimeManifest.js";
import { decideBrowserRuntimeAdapterPolicy } from "./adapterPolicy.js";
import { runBrowserRuntimeProcessAdapter } from "./processAdapter.js";
import {
  validateBrowserRuntimeProtocolResponse,
  type BrowserRuntimeProtocolValidation,
} from "./protocol.js";
import {
  validateBrowserSkillRuntimeBinding,
  type BrowserSkillRuntimeBinding,
} from "../../skill/runtime/binding.js";
import { validateBrowserRuntimeSnapshots } from "../../browserSnapshotValidation.js";

export class BrowserRuntimeAdapterExecutor implements BrowserRuntimeExecutor {
  readonly kind: BrowserRuntimeManifest["runtimeMode"];

  constructor(
    private readonly manifestLoad: BrowserExternalRuntimeManifestLoadResult,
    private readonly skillBinding?: BrowserSkillRuntimeBinding,
  ) {
    this.kind = manifestLoad.status === "valid" && manifestLoad.manifest.runtimeMode === "skill-managed"
      ? "skill-managed-browser-runtime"
      : "external-browser-runtime";
  }

  async execute(input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserRuntimeManifest;
  }): Promise<BrowserRuntimeExecutorResult> {
    const request = input.request;
    const policy = decideBrowserRuntimeAdapterPolicy({ request, manifestLoad: this.manifestLoad });
    if (!policy.allowed || this.manifestLoad.status !== "valid" || this.manifestLoad.runtimeManifest.status !== "valid") {
      return blockedResult(request, this.kind, policy.reason, policy.warnings, policy.evidence);
    }
    const manifest = this.manifestLoad.manifest;
    const runtimeManifest = this.manifestLoad.runtimeManifest.manifest;
    const validation = manifest.runtimeMode === "skill-managed"
      ? await this.runSkillManaged(request)
      : await this.runExternalProcess(request);
    if (!validation.ok) {
      const invalidValidation = validation as Extract<BrowserRuntimeProtocolValidation, { readonly ok: false }>;
      return blockedResult(request, runtimeManifest.runtimeMode, invalidValidation.reason, invalidValidation.warnings, invalidValidation.evidence);
    }
    const snapshotValidation = validateBrowserRuntimeSnapshots({
      response: validation.response,
      outputBudgetChars: manifest.outputBudgetChars,
    });
    if (snapshotValidation.status !== "valid") {
      return blockedResult(request, runtimeManifest.runtimeMode, snapshotValidation.warnings[0] ?? "Snapshot validation failed.", snapshotValidation.warnings, snapshotValidation.evidence);
    }
    return {
      status: validation.response.status === "ok"
        ? request.actionKind === "click" || request.actionKind === "type" ? "acted" : "observed"
        : validation.response.status === "blocked" ? "blocked" : "failed",
      runtimeMode: runtimeManifest.runtimeMode,
      actionKind: request.actionKind,
      url: validation.response.currentUrlSummary,
      title: validation.response.title ?? validation.response.domSnapshotPayload?.title ?? "untitled",
      html: validation.response.domSnapshotPayload?.html ?? validation.response.domSnapshotPayload?.textSummary ?? "",
      renderedText: validation.response.postActionObservation ?? validation.response.domSnapshotPayload?.textSummary ?? "",
      accessibilityNodes: validation.response.accessibilitySnapshotPayload?.nodes ?? [],
      actionApplied: request.actionKind === "click" || request.actionKind === "type",
      browserLaunched: manifest.browserLaunchAllowed === "explicit-controlled-only" && manifest.runtimeMode === "external-process",
      publicAutomation: false,
      evidence: [
        `browser-runtime-adapter-executor:${manifest.runtimeMode}`,
        `browser-runtime-adapter-executor:policy:${policy.status}`,
        `browser-runtime-adapter-executor:snapshot:${snapshotValidation.status}`,
        "browser-runtime-adapter-executor:no-provider-or-model-call",
        "browser-runtime-adapter-executor:raw-content-excluded",
      ],
      warnings: [
        ...policy.warnings,
        ...validation.warnings,
        ...snapshotValidation.warnings,
      ],
      rawContent: "internal-only",
      redactions: [
        ...validation.redactions,
        ...snapshotValidation.redactions,
      ],
    };
  }

  private async runExternalProcess(request: BrowserExecutionRequest): Promise<BrowserRuntimeProtocolValidation> {
    if (this.manifestLoad.status !== "valid") {
      return {
        ok: false,
        status: "invalid",
        reason: this.manifestLoad.reason,
        warnings: this.manifestLoad.warnings,
        redactions: this.manifestLoad.redactions,
        evidence: this.manifestLoad.evidence,
      };
    }
    const processResult = await runBrowserRuntimeProcessAdapter({
      request,
      manifest: this.manifestLoad.manifest,
    });
    if (processResult.validation) {
      return processResult.validation;
    }
    return {
      ok: false,
      status: "invalid",
      reason: processResult.stderrSummary || processResult.status,
      warnings: processResult.warnings,
      redactions: [],
      evidence: processResult.evidence,
    };
  }

  private async runSkillManaged(request: BrowserExecutionRequest): Promise<BrowserRuntimeProtocolValidation> {
    if (this.manifestLoad.status !== "valid") {
      return {
        ok: false,
        status: "invalid",
        reason: this.manifestLoad.reason,
        warnings: this.manifestLoad.warnings,
        redactions: this.manifestLoad.redactions,
        evidence: this.manifestLoad.evidence,
      };
    }
    const binding = validateBrowserSkillRuntimeBinding({
      manifest: this.manifestLoad.manifest,
      binding: this.skillBinding,
    });
    if (binding.status !== "ready" || !binding.binding.run) {
      return {
        ok: false,
        status: "invalid",
        reason: binding.reason,
        warnings: binding.warnings,
        redactions: [],
        evidence: binding.evidence,
      };
    }
    const response = await binding.binding.run({
      request,
      manifest: this.manifestLoad.manifest,
    });
    return validateBrowserRuntimeProtocolResponse({
      response,
      outputBudgetChars: this.manifestLoad.manifest.outputBudgetChars,
    });
  }
}

function blockedResult(
  request: BrowserExecutionRequest,
  runtimeMode: BrowserRuntimeManifest["runtimeMode"],
  reason: string,
  warnings: readonly string[],
  evidence: readonly string[],
): BrowserRuntimeExecutorResult {
  return {
    status: "blocked",
    runtimeMode,
    actionKind: request.actionKind,
    url: request.action.url ?? request.action.target ?? "controlled-runtime://blocked",
    title: "blocked",
    html: "",
    renderedText: "",
    accessibilityNodes: [],
    actionApplied: false,
    browserLaunched: false,
    publicAutomation: false,
    evidence: [
      `browser-runtime-adapter-executor:blocked:${runtimeMode}`,
      `browser-runtime-adapter-executor:reason:${reason}`,
      "browser-runtime-adapter-executor:raw-content-excluded",
    ],
    warnings: [...warnings, ...evidence],
    rawContent: "internal-only",
    redactions: [],
  };
}
