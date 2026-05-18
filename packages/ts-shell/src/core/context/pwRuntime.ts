import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type PwRuntimeStatusKind =
  | "ready"
  | "package-missing"
  | "binary-missing"
  | "disabled"
  | "failed";

export interface PwBrowserType {
  executablePath(): string;
  launch(options?: {
    readonly headless?: boolean;
    readonly executablePath?: string;
    readonly timeout?: number;
  }): Promise<PwBrowser>;
}

export interface PwBrowser {
  newContext(options?: Record<string, unknown>): Promise<PwBrowserContext>;
  close(): Promise<void>;
}

export interface PwBrowserContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}

export interface PwLocator {
  first(): PwLocator;
  count(): Promise<number>;
  click(options?: { readonly timeout?: number }): Promise<void>;
  fill(value: string, options?: { readonly timeout?: number }): Promise<void>;
  innerText(options?: { readonly timeout?: number }): Promise<string>;
  evaluateAll<T>(pageFunction: (elements: Element[]) => T): Promise<T>;
}

export interface PwPage {
  setDefaultTimeout(timeoutMs: number): void;
  setContent(html: string, options?: { readonly waitUntil?: "load" | "domcontentloaded" | "networkidle"; readonly timeout?: number }): Promise<void>;
  waitForFunction(pageFunction: string | ((...args: unknown[]) => unknown), arg?: unknown, options?: { readonly timeout?: number }): Promise<unknown>;
  title(): Promise<string>;
  locator(selector: string): PwLocator;
  getByRole(role: string, options?: { readonly name?: string | RegExp }): PwLocator;
  getByLabel(text: string | RegExp): PwLocator;
  close(): Promise<void>;
}

export interface PwRuntimeModule {
  readonly chromium?: PwBrowserType;
}

export interface PwRuntimeStatus {
  readonly status: PwRuntimeStatusKind;
  readonly dependency: "playwright-core" | "playwright" | "none";
  readonly packageName?: "playwright-core" | "playwright";
  readonly browserName: "chromium";
  readonly executablePath?: string;
  readonly realBrowserValidationAvailable: boolean;
  readonly passiveStatusCheck: true;
  readonly browserLaunched: false;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly mcpLaunched: false;
  readonly reason: string;
  readonly skipReason?: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface PwRuntimeStatusInput {
  readonly enabled?: boolean;
  readonly importer?: (specifier: string) => Promise<unknown>;
  readonly fsExists?: (path: string) => boolean;
  readonly env?: Record<string, string | undefined>;
}

export async function getPwRuntimeStatus(input: PwRuntimeStatusInput = {}): Promise<PwRuntimeStatus> {
  if (input.enabled === false) {
    return status("disabled", {
      dependency: "none",
      reason: "Direct Playwright runtime status checks are disabled.",
      skipReason: "direct-playwright-disabled",
      nextAction: "Enable the explicit runtime status check before attempting controlled browser validation.",
      warnings: ["pw-runtime:disabled"],
      evidence: ["pw-runtime:disabled"],
    });
  }

  const imported = await importPwRuntime(input.importer);
  if (!imported.ok) {
    return status("package-missing", {
      dependency: "none",
      reason: "No usable Playwright package could be imported.",
      skipReason: "playwright-package-missing",
      nextAction: "Install the workspace Playwright dependency before running real browser validation.",
      warnings: ["pw-runtime:package-missing"],
      evidence: imported.evidence,
    });
  }

  const executable = resolveChromiumExecutable(imported.module, input);
  if (!executable.ok) {
    return status(executable.failed ? "failed" : "binary-missing", {
      dependency: imported.packageName,
      packageName: imported.packageName,
      reason: executable.reason,
      skipReason: executable.failed ? "playwright-binary-probe-failed" : "playwright-browser-binary-missing",
      nextAction: executable.failed
        ? "Fix the Playwright Chromium binary probe before running real browser validation."
        : "Run `npx playwright install chromium` or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a controlled local Chromium.",
      warnings: executable.failed ? ["pw-runtime:binary-probe-failed"] : ["pw-runtime:binary-missing"],
      evidence: imported.evidence,
      executablePath: executable.executablePath,
    });
  }

  return status("ready", {
    dependency: imported.packageName,
    packageName: imported.packageName,
    reason: "Playwright runtime and Chromium executable are available for explicit controlled local/test execution.",
    nextAction: "Run the Direct Playwright adapter only through an explicit controlled runtime manifest.",
    warnings: [],
    evidence: imported.evidence,
    executablePath: executable.executablePath,
  });
}

export async function importPwRuntime(
  importer: (specifier: string) => Promise<unknown> = dynamicImport,
): Promise<
  | {
      readonly ok: true;
      readonly packageName: "playwright-core" | "playwright";
      readonly module: PwRuntimeModule;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly evidence: readonly string[];
    }
> {
  for (const packageName of ["playwright-core", "playwright"] as const) {
    try {
      const imported = await importer(packageName);
      if (isPwRuntimeModule(imported)) {
        return {
          ok: true,
          packageName,
          module: imported,
          evidence: [`pw-runtime:import:${packageName}`, "pw-runtime:passive-no-launch"],
        };
      }
    } catch {
      // Try the next allowed package name.
    }
  }
  return {
    ok: false,
    evidence: ["pw-runtime:import-missing", "pw-runtime:passive-no-launch"],
  };
}

function resolveChromiumExecutable(
  module: PwRuntimeModule,
  input: PwRuntimeStatusInput,
): {
  readonly ok: boolean;
  readonly failed?: boolean;
  readonly executablePath?: string;
  readonly reason: string;
} {
  const fsExists = input.fsExists ?? existsSync;
  const envPath = input.env?.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  try {
    const executablePath = sanitizeBrowserText(envPath || module.chromium?.executablePath() || "", 500);
    if (!executablePath) {
      return {
        ok: false,
        reason: "Playwright Chromium executable path could not be resolved.",
      };
    }
    if (!fsExists(executablePath)) {
      return {
        ok: false,
        executablePath,
        reason: "Playwright Chromium executable path is not present on this machine.",
      };
    }
    return {
      ok: true,
      executablePath,
      reason: "Playwright Chromium executable is present.",
    };
  } catch (error) {
    return {
      ok: false,
      failed: true,
      reason: sanitizeBrowserText(error instanceof Error ? error.message : String(error), 240),
    };
  }
}

function status(
  kind: PwRuntimeStatusKind,
  input: {
    readonly dependency: PwRuntimeStatus["dependency"];
    readonly packageName?: PwRuntimeStatus["packageName"];
    readonly executablePath?: string;
    readonly reason: string;
    readonly skipReason?: string;
    readonly nextAction: string;
    readonly warnings: readonly string[];
    readonly evidence: readonly string[];
  },
): PwRuntimeStatus {
  return {
    status: kind,
    dependency: input.dependency,
    packageName: input.packageName,
    browserName: "chromium",
    executablePath: input.executablePath ? sanitizeBrowserText(input.executablePath, 500) : undefined,
    realBrowserValidationAvailable: kind === "ready",
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: sanitizeBrowserText(input.reason, 240),
    skipReason: input.skipReason,
    nextAction: sanitizeBrowserText(input.nextAction, 240),
    warnings: input.warnings,
    evidence: [
      ...input.evidence,
      `pw-runtime:status:${kind}`,
      "pw-runtime:no-provider-or-model-call",
      "pw-runtime:no-mcp-launch",
      "pw-runtime:no-browser-launch-during-status",
    ],
  };
}

function isPwRuntimeModule(value: unknown): value is PwRuntimeModule {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as PwRuntimeModule).chromium?.launch === "function" &&
    typeof (value as PwRuntimeModule).chromium?.executablePath === "function";
}

async function dynamicImport(specifier: string): Promise<unknown> {
  return createRequire(import.meta.url)(specifier);
}
