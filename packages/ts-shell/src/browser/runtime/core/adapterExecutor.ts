import type {
  BrowserRuntimeExecutor,
  BrowserRuntimeExecutorResult,
} from "./executor.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
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
import { stoppedBrowserRuntimeResult } from "./executor.js";
import { validateBrowserRuntimeSnapshots } from "../../snapshotValidation.js";

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
    readonly signal?: AbortSignal;
  }): Promise<BrowserRuntimeExecutorResult> {
    const request = input.request;
    const policy = decideBrowserRuntimeAdapterPolicy({ request, manifestLoad: this.manifestLoad });
    if (!policy.allowed || this.manifestLoad.status !== "valid" || this.manifestLoad.runtimeManifest.status !== "valid") {
      return blockedResult(request, this.kind, policy.reason, policy.warnings, policy.evidence);
    }
    const manifest = this.manifestLoad.manifest;
    const runtimeManifest = this.manifestLoad.runtimeManifest.manifest;
    if (input.signal?.aborted) return stoppedBrowserRuntimeResult(request, runtimeManifest, "cancelled");
    const mutation = request.actionKind === "click" || request.actionKind === "type";
    let validation: BrowserRuntimeProtocolValidation;
    let processEvidence: readonly string[] = [];
    let processCleanupStatus: BrowserRuntimeExecutorResult["processCleanupStatus"] = "not-started";
    if (manifest.runtimeMode === "external-process") {
      const process = await runBrowserRuntimeProcessAdapter({ request, manifest, signal: input.signal });
      processCleanupStatus = process.cleanupStatus;
      processEvidence = [
        ...process.evidence,
        `browser-runtime-adapter-executor:process-cleanup:${process.cleanupStatus}`,
        "browser-runtime-adapter-executor:runtime-cleanup:unknown",
      ];
      if (process.status !== "ok" || !process.validation) {
        return stoppedBrowserRuntimeResult(request, runtimeManifest,
          process.status === "cancelled" ? "cancelled" : process.status === "unavailable" || process.status === "invalid" ? "blocked" : "failed", {
            actionApplied: mutation && process.started ? null : false,
            processCleanupStatus,
            runtimeCleanupStatus: process.started ? "unknown" : "not-started",
            browserLaunched: process.started && manifest.browserLaunchAllowed === "explicit-controlled-only" ? null : false,
            warnings: process.warnings, evidence: processEvidence,
          });
      }
      validation = process.validation;
    } else {
      const binding = validateBrowserSkillRuntimeBinding({ manifest, binding: this.skillBinding });
      if (binding.status !== "ready" || !binding.binding.run) {
        return blockedResult(request, runtimeManifest.runtimeMode, binding.reason, binding.warnings, binding.evidence);
      }
      try {
        const response = await binding.binding.run({ request, manifest, signal: input.signal });
        validation = validateBrowserRuntimeProtocolResponse({ response, outputBudgetChars: manifest.outputBudgetChars });
        processEvidence = ["browser-runtime-adapter-executor:runtime-cleanup:unknown"];
      } catch {
        return stoppedBrowserRuntimeResult(request, runtimeManifest, input.signal?.aborted ? "cancelled" : "failed", {
          actionApplied: mutation ? null : false,
          processCleanupStatus: "unknown",
          runtimeCleanupStatus: "unknown",
          browserLaunched: manifest.browserLaunchAllowed === "explicit-controlled-only" ? null : false,
          warnings: ["browser-runtime-adapter-executor:runner-failed"],
          evidence: ["browser-runtime-adapter-executor:runtime-cleanup:unknown"],
        });
      }
    }
    if (!validation.ok) {
      return stoppedBrowserRuntimeResult(request, runtimeManifest, input.signal?.aborted ? "cancelled" : "blocked", {
        actionApplied: mutation ? null : false,
        processCleanupStatus,
        runtimeCleanupStatus: "unknown",
        browserLaunched: manifest.browserLaunchAllowed === "explicit-controlled-only" ? null : false,
        warnings: validation.warnings, evidence: [...processEvidence, ...validation.evidence],
      });
    }
    const snapshotValidation = validateBrowserRuntimeSnapshots({
      response: validation.response,
      outputBudgetChars: manifest.outputBudgetChars,
    });
    if (snapshotValidation.status !== "valid") {
      return stoppedBrowserRuntimeResult(request, runtimeManifest, input.signal?.aborted ? "cancelled" : "blocked", {
        actionApplied: mutation ? validation.response.status === "ok" ? true : null : false,
        processCleanupStatus,
        runtimeCleanupStatus: "unknown",
        browserLaunched: manifest.browserLaunchAllowed === "explicit-controlled-only" ? null : false,
        warnings: snapshotValidation.warnings, evidence: [...processEvidence, ...snapshotValidation.evidence],
      });
    }
    return {
      status: input.signal?.aborted ? "cancelled" : validation.response.status === "ok"
        ? request.actionKind === "click" || request.actionKind === "type" ? "acted" : "observed"
        : validation.response.status === "blocked" ? "blocked" : "failed",
      runtimeMode: runtimeManifest.runtimeMode,
      actionKind: request.actionKind,
      url: validation.response.currentUrlSummary,
      title: validation.response.title ?? validation.response.domSnapshotPayload?.title ?? "untitled",
      html: validation.response.domSnapshotPayload?.html ?? validation.response.domSnapshotPayload?.textSummary ?? "",
      renderedText: validation.response.postActionObservation ?? validation.response.domSnapshotPayload?.textSummary ?? "",
      accessibilityNodes: validation.response.accessibilitySnapshotPayload?.nodes ?? [],
      actionApplied: mutation ? validation.response.status === "ok" ? true : null : false,
      processCleanupStatus,
      runtimeCleanupStatus: "unknown",
      browserLaunched: manifest.browserLaunchAllowed === "explicit-controlled-only" ? null : false,
      publicAutomation: false,
      evidence: [
        ...processEvidence,
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
