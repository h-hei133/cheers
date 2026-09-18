export type BrowserPlaywrightRuntimeKind = "module" | "cli" | "unavailable";

export type BrowserPlaywrightAvailabilityStatus =
  | "available"
  | "unavailable"
  | "disabled"
  | "blocked-by-policy";

export interface BrowserPlaywrightAvailability {
  readonly runtimeKind: BrowserPlaywrightRuntimeKind;
  readonly status: BrowserPlaywrightAvailabilityStatus;
  readonly version?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export type BrowserPlaywrightAvailabilityChecker =
  () => BrowserPlaywrightAvailability | Promise<BrowserPlaywrightAvailability>;

export function createBrowserPlaywrightAvailability(
  input: Partial<BrowserPlaywrightAvailability> = {},
): BrowserPlaywrightAvailability {
  const status = input.status ?? "unavailable";
  const runtimeKind = input.runtimeKind ?? (status === "available" ? "module" : "unavailable");
  return {
    runtimeKind,
    status,
    version: input.version,
    reason: input.reason ?? defaultReason(status),
    nextAction: input.nextAction ?? defaultNextAction(status),
    evidence: [
      ...(input.evidence ?? []),
      `browser-playwright-availability:status:${status}`,
      `browser-playwright-availability:runtime:${runtimeKind}`,
      "browser-playwright-availability:no-install",
      "browser-playwright-availability:no-process-spawn",
      "browser-playwright-availability:no-network",
    ],
    warnings: input.warnings ?? [],
  };
}

export async function resolveBrowserPlaywrightAvailability(input: {
  readonly checker?: BrowserPlaywrightAvailabilityChecker;
} = {}): Promise<BrowserPlaywrightAvailability> {
  if (!input.checker) {
    return createBrowserPlaywrightAvailability({
      status: "unavailable",
      runtimeKind: "unavailable",
      reason: "No explicit Playwright runtime checker was injected.",
      nextAction: "Keep playwright-local execution unavailable unless a route injects a safe local checker.",
    });
  }
  try {
    return await input.checker();
  } catch {
    return createBrowserPlaywrightAvailability({
      status: "unavailable",
      runtimeKind: "unavailable",
      reason: "Playwright runtime checker failed without exposing raw details.",
      nextAction: "Keep browser execution blocked and inspect the checker in a focused test route.",
      warnings: ["browser-playwright-availability:checker-failed"],
    });
  }
}

function defaultReason(status: BrowserPlaywrightAvailabilityStatus): string {
  if (status === "available") {
    return "Explicit Playwright runtime checker reported a local runtime.";
  }
  if (status === "disabled") {
    return "Playwright local execution is disabled.";
  }
  if (status === "blocked-by-policy") {
    return "Playwright local execution is blocked by route policy.";
  }
  return "Playwright runtime is unavailable.";
}

function defaultNextAction(status: BrowserPlaywrightAvailabilityStatus): string {
  if (status === "available") {
    return "Execute only local-fixture observe/extract/navigation through an injected local runner.";
  }
  return "Keep /browser execute blocked or unavailable; do not install Playwright in this route.";
}
