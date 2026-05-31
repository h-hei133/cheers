import type { BrowserAccessibilityNodeInput } from "./browserAccessibilitySnapshot.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type {
  BrowserRuntimeExecutor,
  BrowserRuntimeExecutorResult,
} from "./browser/runtime/core/executor.js";
import type { BrowserRuntimeManifest } from "./browser/runtime/core/manifest.js";
import { mapPwEvidence, type PwCleanupStatus, type PwFailureCode, type PwPageEvidence } from "./pwEvidence.js";
import {
  importPwRuntime,
  type PwBrowser,
  type PwBrowserContext,
  type PwLocator,
  type PwPage,
  type PwRuntimeModule,
  type PwRuntimeStatus,
} from "./pwRuntime.js";

export interface PwFixture {
  readonly marker: string;
  readonly html: string;
  readonly waitForReady?: boolean;
}

export interface PwInjectedClient {
  run(input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserRuntimeManifest;
    readonly fixture: PwFixture;
    readonly timeoutMs: number;
  }): Promise<PwPageEvidence> | PwPageEvidence;
}

export class PwAdapter implements BrowserRuntimeExecutor {
  readonly kind = "direct-playwright-core" as const;

  constructor(
    private readonly input: {
      readonly status: PwRuntimeStatus;
      readonly fixtures: readonly PwFixture[];
      readonly injectedClient?: PwInjectedClient;
      readonly runtimeModule?: PwRuntimeModule;
      readonly timeoutMs?: number;
      readonly launchTimeoutMs?: number;
      readonly outputBudgetChars?: number;
    },
  ) {}

  async execute(input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserRuntimeManifest;
  }): Promise<BrowserRuntimeExecutorResult> {
    const timeoutMs = Math.min(input.manifest.timeoutMs, this.input.timeoutMs ?? 5_000);
    const fixture = this.resolveFixture(input.request, input.manifest);
    const evidence = this.input.injectedClient
      ? await this.runInjected(input.request, input.manifest, fixture, timeoutMs)
      : await this.runReal(input.request, input.manifest, fixture, timeoutMs);
    return mapPwEvidence({
      request: input.request,
      manifest: input.manifest,
      evidence,
    });
  }

  private async runInjected(
    request: BrowserExecutionRequest,
    manifest: BrowserRuntimeManifest,
    fixture: PwFixture,
    timeoutMs: number,
  ): Promise<PwPageEvidence> {
    try {
      return await withTimeout(
        Promise.resolve(this.input.injectedClient!.run({ request, manifest, fixture, timeoutMs })),
        timeoutMs,
      );
    } catch (error) {
      return this.errorEvidence(request, fixture, "timed-out", "timeout", error, false, "closed", [
        "pw-adapter:injected-timeout",
      ]);
    }
  }

  private async runReal(
    request: BrowserExecutionRequest,
    manifest: BrowserRuntimeManifest,
    fixture: PwFixture,
    timeoutMs: number,
  ): Promise<PwPageEvidence> {
    if (this.input.status.status !== "ready") {
      return this.errorEvidence(
        request,
        fixture,
        "unavailable",
        "unavailable",
        this.input.status.reason,
        false,
        "not-started",
        [`pw-adapter:runtime:${this.input.status.status}`],
        this.input.status.reasonCode === "ready" ? "unknown" : this.input.status.reasonCode,
      );
    }

    let browser: PwBrowser | undefined;
    let context: PwBrowserContext | undefined;
    let page: PwPage | undefined;
    let outcome: PwPageEvidence | undefined;
    let browserLaunched = false;
    try {
      const runtime = this.input.runtimeModule ?? await loadRuntimeModule();
      if (!runtime.chromium) {
        throw new Error("Playwright Chromium runtime is unavailable.");
      }
      browser = await runtime.chromium.launch({
        headless: true,
        executablePath: this.input.status.executablePath,
        timeout: Math.max(timeoutMs, this.input.launchTimeoutMs ?? 5_000),
      });
      browserLaunched = true;
      context = await browser.newContext({
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
        permissions: [],
        storageState: { cookies: [], origins: [] },
      });
      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.setContent(fixture.html, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      if (fixture.waitForReady) {
        await page.waitForFunction("window.__pwReady === true", undefined, { timeout: timeoutMs });
      }
      if (request.actionKind === "click") {
        await clickTarget(page, request.action.target, timeoutMs);
      }
      if (request.actionKind === "type") {
        await typeTarget(page, request.action.target, request.action.text ?? "", timeoutMs);
      }
      outcome = await collectEvidence({
        page,
        request,
        fixture,
        browserLaunched,
        cleanupStatus: "not-started",
      });
    } catch (error) {
      outcome = this.errorEvidence(
        request,
        fixture,
        isTimeoutError(error) ? "timed-out" : "failed",
        isTimeoutError(error) ? "timeout" : "runtime",
        error,
        browserLaunched,
        "not-started",
        ["pw-adapter:real-error"],
        /target.*not found|not found/i.test(error instanceof Error ? error.message : String(error))
          ? "action-target-missing"
          : undefined,
      );
    }

    const cleanupStatus = await closeAll(page, context, browser);
    return {
      ...outcome,
      cleanupStatus,
      warnings: [
        ...(outcome.warnings ?? []),
        cleanupWarning(cleanupStatus),
      ],
      evidence: [
        ...(outcome.evidence ?? []),
        `pw-adapter:cleanup:${cleanupStatus}`,
      ],
    };
  }

  private resolveFixture(
    request: BrowserExecutionRequest,
    manifest: BrowserRuntimeManifest,
  ): PwFixture {
    const marker = request.action.url ??
      (request.actionKind === "navigate" ? request.action.target : undefined) ??
      manifest.allowedOrigins.find((origin) => origin.startsWith("local-fixture://")) ??
      this.input.fixtures[0]?.marker;
    return this.input.fixtures.find((fixture) => fixture.marker === marker) ??
      this.input.fixtures[0] ??
      { marker: "local-fixture://pw/missing", html: "<main><h1>Missing fixture</h1></main>" };
  }

  private errorEvidence(
    request: BrowserExecutionRequest,
    fixture: PwFixture,
    status: PwPageEvidence["status"],
    errorKind: PwPageEvidence["errorKind"],
    error: unknown,
    browserLaunched: boolean,
    cleanupStatus: PwCleanupStatus,
    warnings: readonly string[],
    failureCode?: PwFailureCode,
  ): PwPageEvidence {
    return {
      status,
      operation: request.actionKind,
      fixtureMarker: fixture.marker,
      urlSummary: fixture.marker,
      title: "Direct Playwright error",
      visibleText: "",
      browserLaunched,
      cleanupStatus,
      actionApplied: false,
      targetSummary: request.action.target,
      errorKind,
      errorSummary: error instanceof Error ? error.message : String(error),
      failureCode,
      warnings,
      evidence: ["pw-adapter:error"],
    };
  }
}

function cleanupWarning(cleanupStatus: PwCleanupStatus): string {
  if (cleanupStatus === "closed") {
    return "pw-adapter:cleanup-closed";
  }
  if (cleanupStatus === "close-failed") {
    return "pw-adapter:cleanup-failed";
  }
  return "pw-adapter:cleanup-not-started";
}

async function loadRuntimeModule(): Promise<PwRuntimeModule> {
  const imported = await importPwRuntime();
  if (!imported.ok) {
    throw new Error("Playwright runtime import failed.");
  }
  return imported.module;
}

async function collectEvidence(input: {
  readonly page: PwPage;
  readonly request: BrowserExecutionRequest;
  readonly fixture: PwFixture;
  readonly browserLaunched: boolean;
  readonly cleanupStatus: PwCleanupStatus;
}): Promise<PwPageEvidence> {
  const title = await input.page.title();
  const visibleText = await input.page.locator("body").innerText();
  const accessibilityNodes = await collectAccessibilityNodes(input.page);
  return {
    status: "ok",
    operation: input.request.actionKind,
    fixtureMarker: input.fixture.marker,
    urlSummary: input.fixture.marker,
    title,
    visibleText,
    rawHtml: input.fixture.html,
    accessibilityNodes,
    actionApplied: input.request.actionKind === "click" || input.request.actionKind === "type",
    browserLaunched: input.browserLaunched,
    cleanupStatus: input.cleanupStatus,
    targetSummary: input.request.action.target,
    evidence: [
      "pw-adapter:real-playwright",
      `pw-adapter:fixture:${input.fixture.marker}`,
      `pw-adapter:operation:${input.request.actionKind}`,
    ],
  };
}

async function collectAccessibilityNodes(page: PwPage): Promise<readonly BrowserAccessibilityNodeInput[]> {
  return page.locator("main, h1, h2, h3, button, a, input, textarea, select, [role]").evaluateAll((elements) =>
    elements.slice(0, 40).map((element) => {
      const input = element as HTMLInputElement;
      const tag = element.tagName.toLowerCase();
      const explicitRole = element.getAttribute("role");
      const role = explicitRole ??
        (tag === "button" ? "button" :
          tag === "a" ? "link" :
            ["input", "textarea", "select"].includes(tag) ? "textbox" :
              tag.match(/^h[1-6]$/) ? "heading" :
                tag === "main" ? "main" : "generic");
      const label = element.getAttribute("aria-label") ||
        element.textContent?.trim() ||
        input.name ||
        input.id ||
        tag;
      return {
        role,
        name: label,
        selector: element.id ? `#${element.id}` : tag,
        disabled: Boolean((element as HTMLButtonElement).disabled),
        hidden: input.type === "hidden" || element.hasAttribute("hidden"),
        value: input.value ? "[REDACTED_VALUE]" : undefined,
      };
    }),
  );
}

async function clickTarget(page: PwPage, target: string | undefined, timeoutMs: number): Promise<void> {
  const locator = await firstAvailable([
    page.getByRole("button", { name: target ?? "" }),
    target ? page.getByRole("link", { name: target }) : undefined,
    selectorLocator(page, target),
  ]);
  await locator.click({ timeout: timeoutMs });
}

async function typeTarget(page: PwPage, target: string | undefined, value: string, timeoutMs: number): Promise<void> {
  const locator = await firstAvailable([
    target ? page.getByLabel(target) : undefined,
    target ? page.getByRole("textbox", { name: target }) : undefined,
    selectorLocator(page, target),
  ]);
  await locator.fill(value, { timeout: timeoutMs });
}

async function firstAvailable(candidates: readonly (PwLocator | undefined)[]): Promise<PwLocator> {
  for (const candidate of candidates) {
    if (candidate && await candidate.count() > 0) {
      return candidate.first();
    }
  }
  throw new Error("Controlled Playwright target was not found.");
}

function selectorLocator(page: PwPage, value: string | undefined): PwLocator | undefined {
  if (!value || !/^(#|\.|\[|input|button|a|textarea|select)/.test(value.trim())) {
    return undefined;
  }
  return page.locator(value);
}

async function closeAll(
  page: PwPage | undefined,
  context: PwBrowserContext | undefined,
  browser: PwBrowser | undefined,
): Promise<PwCleanupStatus> {
  try {
    await page?.close();
    await context?.close();
    await browser?.close();
    return page || context || browser ? "closed" : "not-started";
  } catch {
    return "close-failed";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Direct Playwright operation timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  return /timeout|timed out/i.test(error instanceof Error ? error.message : String(error));
}
