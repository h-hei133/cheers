import { sanitizeBrowserText } from "../../browserCapabilityModel.js";
import type { BrowserRuntimeManifestLoadResult } from "./manifest.js";

export type BrowserRuntimeAvailabilityStatus =
  | "available-simulated"
  | "available-external"
  | "available-skill-managed"
  | "available-direct-playwright"
  | "unavailable"
  | "blocked-by-policy"
  | "dependency-missing";

export interface BrowserRuntimeAvailability {
  readonly status: BrowserRuntimeAvailabilityStatus;
  readonly manifestStatus: BrowserRuntimeManifestLoadResult["status"];
  readonly runtimeMode: string;
  readonly explicitManifestRequired: true;
  readonly defaultRuntime: "disabled";
  readonly browserLaunched: false;
  readonly publicAutomation: false;
  readonly reason: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function decideBrowserRuntimeAvailability(input: {
  readonly manifestLoad: BrowserRuntimeManifestLoadResult;
  readonly executorAvailable?: boolean;
}): BrowserRuntimeAvailability {
  const load = input.manifestLoad;
  if (load.status === "missing") {
    return availability("unavailable", load, {
      runtimeMode: "unavailable",
      reason: load.reason,
      nextAction: "Provide an explicit controlled local/test browser runtime manifest.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  if (load.status === "invalid") {
    return availability("blocked-by-policy", load, {
      runtimeMode: "unavailable",
      reason: load.reason,
      nextAction: "Fix the manifest without enabling public automation, cookies, or persistence.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  const validLoad = load as Extract<BrowserRuntimeManifestLoadResult, { readonly status: "valid" }>;
  const manifest = validLoad.manifest;
  if (manifest.runtimeMode === "unavailable") {
    return availability("dependency-missing", load, {
      runtimeMode: manifest.runtimeMode,
      reason: "Browser runtime manifest declares the runtime unavailable.",
      nextAction: "Use simulated runtime fixtures or a future explicit local adapter route.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  if (input.executorAvailable === false) {
    return availability("dependency-missing", load, {
      runtimeMode: manifest.runtimeMode,
      reason: "Explicit browser runtime executor was not supplied.",
      nextAction: "Inject a simulated/controlled executor for this route.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  if (manifest.runtimeMode === "external-browser-runtime") {
    return availability("available-external", load, {
      runtimeMode: manifest.runtimeMode,
      reason: "Explicit external controlled runtime is available.",
      nextAction: "Keep execution controlled and avoid public click/type.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  if (manifest.runtimeMode === "skill-managed-browser-runtime") {
    return availability("available-skill-managed", load, {
      runtimeMode: manifest.runtimeMode,
      reason: "Explicit skill-managed controlled runtime is available.",
      nextAction: "Keep execution controlled and avoid dynamic discovery.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  if (manifest.runtimeMode === "direct-playwright-core") {
    return availability("available-direct-playwright", load, {
      runtimeMode: manifest.runtimeMode,
      reason: "Explicit Direct Playwright controlled runtime is available.",
      nextAction: "Keep execution opt-in and controlled local/test scoped.",
      warnings: load.warnings,
      evidence: load.evidence,
    });
  }
  return availability("available-simulated", load, {
    runtimeMode: manifest.runtimeMode,
    reason: "Explicit simulated browser runtime is available.",
    nextAction: "Use deterministic local/test browser scenarios only.",
    warnings: load.warnings,
    evidence: load.evidence,
  });
}

export function renderBrowserRuntimeStatusSurface(availability: BrowserRuntimeAvailability): string {
  return [
    "Browser runtime status",
    `- Status: ${availability.status}`,
    `- Manifest status: ${availability.manifestStatus}`,
    `- Runtime mode: ${sanitizeBrowserText(availability.runtimeMode, 100)}`,
    "- Explicit manifest: required",
    "- Default runtime: disabled",
    "- Browser launched: no",
    "- Public automation: no",
    "- Provider/model call: none",
    "- MCP discovery/launch: none",
    "- Persistence: none",
    `- Reason: ${sanitizeBrowserText(availability.reason, 220)}`,
    `- Redactions/warnings: ${availability.warnings.length > 0 ? availability.warnings.map((item) => sanitizeBrowserText(item, 80)).join("; ") : "none"}`,
    `- Next action: ${sanitizeBrowserText(availability.nextAction, 220)}`,
  ].join("\n");
}

function availability(
  status: BrowserRuntimeAvailabilityStatus,
  load: BrowserRuntimeManifestLoadResult,
  input: {
    readonly runtimeMode: string;
    readonly reason: string;
    readonly nextAction: string;
    readonly warnings: readonly string[];
    readonly evidence: readonly string[];
  },
): BrowserRuntimeAvailability {
  return {
    status,
    manifestStatus: load.status,
    runtimeMode: sanitizeBrowserText(input.runtimeMode, 100),
    explicitManifestRequired: true,
    defaultRuntime: "disabled",
    browserLaunched: false,
    publicAutomation: false,
    reason: sanitizeBrowserText(input.reason, 240),
    nextAction: sanitizeBrowserText(input.nextAction, 240),
    warnings: input.warnings,
    evidence: [
      ...input.evidence,
      `browser-runtime-availability:${status}`,
      "browser-runtime-availability:no-default-runtime",
      "browser-runtime-availability:no-browser-launch",
      "browser-runtime-availability:no-public-automation",
    ],
  };
}
