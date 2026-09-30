import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { sanitizeBrowserText } from "./capabilityModel.js";
import type { PwFailureCode } from "./playwrightEvidence.js";

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
    readonly args?: readonly string[];
    readonly ignoreDefaultArgs?: readonly string[];
  }): Promise<PwBrowser>;
}

export interface PwBrowser {
  newContext(options?: Record<string, unknown>): Promise<PwBrowserContext>;
  close(): Promise<void>;
}

export interface PwBrowserContext {
  /** Covers pages and popup first requests, but not every server redirect hop. */
  route(pattern: string, handler: (route: PwRoute) => Promise<void>): Promise<void>;
  newPage(): Promise<PwPage>;
  /** Present in Playwright; optional here because a minimal double need not take a script. */
  addInitScript?(script: string): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * The page surface this runtime uses.
 *
 * Narrow on purpose: it is everything the browser session calls, and nothing
 * else. A wider declaration would describe Playwright rather than our use of it,
 * and every member declared but unused is one a reader has to rule out before
 * they can trust the ones that are. The locator API (`locator`, `getByRole`,
 * `getByLabel`) was declared here and never called from anywhere; the session
 * evaluates selectors directly, so it is gone rather than carried.
 *
 * The shapes match Playwright's, so the value returned by a real launch
 * satisfies this without a cast.
 */
export interface PwPage {
  goto(url: string, options?: { readonly waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit"; readonly timeout?: number }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  evaluate<T>(pageFunction: () => T): Promise<T>;
  click(selector: string, options?: { readonly timeout?: number }): Promise<void>;
  fill(selector: string, value: string, options?: { readonly timeout?: number }): Promise<void>;
  selectOption(selector: string, value: string, options?: { readonly timeout?: number }): Promise<void>;
  hover(selector: string, options?: { readonly timeout?: number }): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  on(event: string, handler: () => void): void;
  close(): Promise<void>;
}

/** One intercepted request, as much of it as the policy check reads. */
export interface PwRoute {
  request(): { url(): string };
  continue(): Promise<void>;
  abort(reason?: string): Promise<void>;
}

export interface PwRuntimeModule {
  readonly chromium?: PwBrowserType;
}

export interface PwRuntimeStatus {
  readonly status: PwRuntimeStatusKind;
  readonly reasonCode: PwFailureCode | "ready";
  readonly dependency: "playwright-core" | "playwright" | "none";
  readonly packageName?: "playwright-core" | "playwright";
  readonly browserName: "chromium";
  readonly executablePath?: string;
  readonly executableSource: "env" | "playwright-cache" | "system-path" | "none" | "unknown";
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
  readonly platform?: NodeJS.Platform;
}

export async function getPwRuntimeStatus(input: PwRuntimeStatusInput = {}): Promise<PwRuntimeStatus> {
  if (input.enabled === false) {
    return status("disabled", {
      dependency: "none",
      reasonCode: "runtime-disabled",
      executableSource: "none",
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
      reasonCode: "runtime-package-missing",
      executableSource: "none",
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
      reasonCode: executable.failed ? "unknown" : "runtime-binary-missing",
      executableSource: executable.source,
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
    reasonCode: "ready",
    executableSource: executable.source,
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
  readonly source: PwRuntimeStatus["executableSource"];
  readonly reason: string;
} {
  const fsExists = input.fsExists ?? existsSync;
  const envPath = input.env?.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const platform = input.platform ?? process.platform;
  try {
    const envCandidate = sanitizeBrowserText(envPath ?? "", 500);
    if (envCandidate) {
      return fsExists(envCandidate)
        ? {
            ok: true,
            executablePath: envCandidate,
            source: "env",
            reason: "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH points to an existing Chromium executable.",
          }
        : {
            ok: false,
            executablePath: envCandidate,
            source: "env",
            reason: "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set but does not point to an existing executable.",
          };
    }
    const playwrightCandidate = sanitizeBrowserText(module.chromium?.executablePath() || "", 500);
    if (playwrightCandidate && fsExists(playwrightCandidate)) {
      return {
        ok: true,
        executablePath: playwrightCandidate,
        source: "playwright-cache",
        reason: "Playwright-managed Chromium executable is present.",
      };
    }
    const systemCandidate = findSystemChromium({
      fsExists,
      platform,
      env: input.env ?? process.env,
    });
    if (systemCandidate) {
      return {
        ok: true,
        executablePath: systemCandidate,
        source: "system-path",
        reason: "A local Chromium/Chrome executable was found on a common system path.",
      };
    }
    const executablePath = playwrightCandidate || systemChromiumCandidates(platform, input.env ?? process.env)[0] || "";
    if (!executablePath) {
      return {
        ok: false,
        source: "none",
        reason: "Playwright Chromium executable path could not be resolved.",
      };
    }
    return {
      ok: false,
      executablePath,
      source: playwrightCandidate ? "playwright-cache" : "system-path",
      reason: "No Playwright-managed or common local Chromium executable is present on this machine.",
    };
  } catch (error) {
    return {
      ok: false,
      failed: true,
      source: "unknown",
      reason: sanitizeBrowserText(error instanceof Error ? error.message : String(error), 240),
    };
  }
}

function findSystemChromium(input: {
  readonly fsExists: (path: string) => boolean;
  readonly platform: NodeJS.Platform;
  readonly env: Record<string, string | undefined>;
}): string | undefined {
  return systemChromiumCandidates(input.platform, input.env).find((candidate) => input.fsExists(candidate));
}

function systemChromiumCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): readonly string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  if (platform === "win32") {
    const roots = [
      env.LOCALAPPDATA,
      env.PROGRAMFILES,
      env["PROGRAMFILES(X86)"],
    ].filter((value): value is string => !!value);
    return roots.flatMap((root) => [
      `${root}\\Google\\Chrome\\Application\\chrome.exe`,
      `${root}\\Chromium\\Application\\chrome.exe`,
      `${root}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ]);
  }
  return [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
  ];
}

function status(
  kind: PwRuntimeStatusKind,
  input: {
    readonly dependency: PwRuntimeStatus["dependency"];
    readonly packageName?: PwRuntimeStatus["packageName"];
    readonly executablePath?: string;
    readonly executableSource: PwRuntimeStatus["executableSource"];
    readonly reasonCode: PwRuntimeStatus["reasonCode"];
    readonly reason: string;
    readonly skipReason?: string;
    readonly nextAction: string;
    readonly warnings: readonly string[];
    readonly evidence: readonly string[];
  },
): PwRuntimeStatus {
  return {
    status: kind,
    reasonCode: input.reasonCode,
    dependency: input.dependency,
    packageName: input.packageName,
    browserName: "chromium",
    executablePath: input.executablePath ? sanitizeBrowserText(input.executablePath, 500) : undefined,
    executableSource: input.executableSource,
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
      `pw-runtime:reason:${input.reasonCode}`,
      `pw-runtime:executable-source:${input.executableSource}`,
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
