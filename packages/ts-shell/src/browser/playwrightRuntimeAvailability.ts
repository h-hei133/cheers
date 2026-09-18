import { sanitizeBrowserText } from "./capabilityModel.js";

export type BrowserPlaywrightRuntimeAvailabilityStatus =
  | "available"
  | "package-missing"
  | "binary-missing"
  | "unavailable"
  | "blocked-by-policy";

export type BrowserPlaywrightDependencyStatus =
  | "declared"
  | "lockfile-only"
  | "missing";

export type BrowserPlaywrightRuntimeImportStatus =
  | "available"
  | "missing"
  | "not-checked"
  | "blocked";

export interface BrowserPlaywrightRuntimeAvailability {
  readonly status: BrowserPlaywrightRuntimeAvailabilityStatus;
  readonly dependencyStatus: BrowserPlaywrightDependencyStatus;
  readonly runtimeImportStatus: BrowserPlaywrightRuntimeImportStatus;
  readonly browserBinaryStatus: "available" | "missing" | "not-checked" | "blocked";
  readonly packageNames: readonly string[];
  readonly directPlaywrightCoreViable: boolean;
  readonly defaultRuntime: "disabled";
  readonly browserLaunched: false;
  readonly mcpLaunched: false;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly reason: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface BrowserPlaywrightRuntimeAvailabilityInput {
  readonly rootPackageJson?: unknown;
  readonly workspacePackageJson?: unknown;
  readonly lockfileText?: string;
  readonly allowRuntimeImportCheck?: boolean;
  readonly allowBrowserBinaryProbe?: boolean;
  readonly runtimeImport?: (specifier: string) => Promise<unknown>;
  readonly browserBinaryProbe?: () => Promise<"available" | "missing"> | "available" | "missing";
}

export async function auditBrowserPlaywrightRuntimeAvailability(
  input: BrowserPlaywrightRuntimeAvailabilityInput = {},
): Promise<BrowserPlaywrightRuntimeAvailability> {
  const packageNames = detectDeclaredPlaywrightPackages(input);
  const dependencyStatus = packageNames.length > 0
    ? packageNames.some((name) => name.endsWith(":lockfile-only"))
      ? "lockfile-only"
      : "declared"
    : "missing";

  const runtimeImportStatus = await resolveRuntimeImportStatus(input);
  const browserBinaryStatus = await resolveBrowserBinaryStatus(input);

  if (input.allowRuntimeImportCheck === false) {
    return availability("blocked-by-policy", {
      dependencyStatus,
      runtimeImportStatus: "blocked",
      browserBinaryStatus,
      packageNames,
      reason: "Direct Playwright runtime import check was blocked by policy.",
      nextAction: "Keep Direct Playwright disabled until Route 126 approves dependency/runtime checks.",
      warnings: ["playwright-runtime-import-blocked"],
      evidence: ["browser-playwright-runtime-availability:import-blocked"],
    });
  }

  if (dependencyStatus === "missing" && runtimeImportStatus !== "available") {
    return availability("package-missing", {
      dependencyStatus,
      runtimeImportStatus,
      browserBinaryStatus,
      packageNames,
      reason: "Playwright is not declared in this workspace and runtime import was not available.",
      nextAction: "Route 126 should decide whether to add a Direct Playwright dependency before enabling a real core runtime.",
      warnings: ["playwright-package-missing"],
      evidence: ["browser-playwright-runtime-availability:package-missing"],
    });
  }

  if (runtimeImportStatus === "missing") {
    return availability("unavailable", {
      dependencyStatus,
      runtimeImportStatus,
      browserBinaryStatus,
      packageNames,
      reason: "Playwright package metadata exists, but runtime import is unavailable.",
      nextAction: "Do not launch a browser; keep the adapter on injected deterministic fixtures.",
      warnings: ["playwright-runtime-import-missing"],
      evidence: ["browser-playwright-runtime-availability:runtime-missing"],
    });
  }

  if (browserBinaryStatus === "missing") {
    return availability("binary-missing", {
      dependencyStatus,
      runtimeImportStatus,
      browserBinaryStatus,
      packageNames,
      reason: "Playwright runtime is importable, but browser binary availability was not proven.",
      nextAction: "Treat binary availability as a Route 126 implementation prerequisite.",
      warnings: ["playwright-browser-binary-missing"],
      evidence: ["browser-playwright-runtime-availability:binary-missing"],
    });
  }

  if (runtimeImportStatus === "available") {
    return availability("available", {
      dependencyStatus,
      runtimeImportStatus,
      browserBinaryStatus,
      packageNames,
      reason: "Direct Playwright runtime is available for an explicit controlled adapter seam.",
      nextAction: "Keep Direct Playwright opt-in and route it through existing policy, receipt, evidence, and eval layers.",
      warnings: [],
      evidence: ["browser-playwright-runtime-availability:available"],
    });
  }

  return availability("unavailable", {
    dependencyStatus,
    runtimeImportStatus,
    browserBinaryStatus,
    packageNames,
    reason: "Direct Playwright runtime was not checked and remains disabled.",
    nextAction: "Use injected Playwright-like fixtures for deterministic Route 125 scenarios.",
    warnings: ["playwright-runtime-not-checked"],
    evidence: ["browser-playwright-runtime-availability:not-checked"],
  });
}

export function renderBrowserPlaywrightRuntimeAvailability(
  availability: BrowserPlaywrightRuntimeAvailability,
): string {
  return [
    "Direct Playwright availability",
    `- Status: ${availability.status}`,
    `- Dependency: ${availability.dependencyStatus}`,
    `- Runtime import: ${availability.runtimeImportStatus}`,
    `- Browser binary: ${availability.browserBinaryStatus}`,
    `- Default runtime: ${availability.defaultRuntime}`,
    "- Browser launched: no",
    "- MCP launched: no",
    "- Provider/model call: none",
    `- Reason: ${safe(availability.reason, 220)}`,
    `- Next action: ${safe(availability.nextAction, 220)}`,
  ].join("\n");
}

function detectDeclaredPlaywrightPackages(
  input: BrowserPlaywrightRuntimeAvailabilityInput,
): readonly string[] {
  const names = new Set<string>();
  for (const [scope, value] of [
    ["root", input.rootPackageJson],
    ["workspace", input.workspacePackageJson],
  ] as const) {
    const record = asRecord(value);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const deps = asRecord(record?.[field]);
      for (const name of ["playwright", "playwright-core", "@playwright/test"]) {
        if (typeof deps?.[name] === "string") {
          names.add(`${scope}:${name}`);
        }
      }
    }
  }
  if (input.lockfileText && /"playwright(?:-core)?"\s*:/i.test(input.lockfileText)) {
    names.add("package-lock:playwright:lockfile-only");
  }
  return Array.from(names).sort();
}

async function resolveRuntimeImportStatus(
  input: BrowserPlaywrightRuntimeAvailabilityInput,
): Promise<BrowserPlaywrightRuntimeImportStatus> {
  if (!input.allowRuntimeImportCheck) {
    return "not-checked";
  }
  const importer = input.runtimeImport ?? dynamicImport;
  try {
    const imported = await importer("playwright");
    return imported ? "available" : "missing";
  } catch {
    try {
      const importedCore = await importer("playwright-core");
      return importedCore ? "available" : "missing";
    } catch {
      return "missing";
    }
  }
}

async function resolveBrowserBinaryStatus(
  input: BrowserPlaywrightRuntimeAvailabilityInput,
): Promise<BrowserPlaywrightRuntimeAvailability["browserBinaryStatus"]> {
  if (!input.allowBrowserBinaryProbe) {
    return "not-checked";
  }
  if (!input.browserBinaryProbe) {
    return "blocked";
  }
  return await input.browserBinaryProbe();
}

function availability(
  status: BrowserPlaywrightRuntimeAvailabilityStatus,
  input: {
    readonly dependencyStatus: BrowserPlaywrightDependencyStatus;
    readonly runtimeImportStatus: BrowserPlaywrightRuntimeImportStatus;
    readonly browserBinaryStatus: BrowserPlaywrightRuntimeAvailability["browserBinaryStatus"];
    readonly packageNames: readonly string[];
    readonly reason: string;
    readonly nextAction: string;
    readonly warnings: readonly string[];
    readonly evidence: readonly string[];
  },
): BrowserPlaywrightRuntimeAvailability {
  return {
    status,
    dependencyStatus: input.dependencyStatus,
    runtimeImportStatus: input.runtimeImportStatus,
    browserBinaryStatus: input.browserBinaryStatus,
    packageNames: input.packageNames,
    directPlaywrightCoreViable: status === "available",
    defaultRuntime: "disabled",
    browserLaunched: false,
    mcpLaunched: false,
    providerCall: "none",
    modelCall: "none",
    reason: safe(input.reason, 240),
    nextAction: safe(input.nextAction, 240),
    warnings: input.warnings,
    evidence: [
      ...input.evidence,
      `browser-playwright-runtime-availability:${status}`,
      "browser-playwright-runtime-availability:no-install",
      "browser-playwright-runtime-availability:no-browser-launch",
      "browser-playwright-runtime-availability:no-mcp-launch",
      "browser-playwright-runtime-availability:no-provider-or-model-call",
    ],
  };
}

async function dynamicImport(specifier: string): Promise<unknown> {
  const importer = new Function("specifier", "return import(specifier)") as (
    value: string,
  ) => Promise<unknown>;
  return importer(specifier);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
