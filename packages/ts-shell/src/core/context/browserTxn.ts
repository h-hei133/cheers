import type { BrowserAccessibilityNodeInput } from "./browserAccessibilitySnapshot.js";
import { createBrowserActionContract } from "./browserActionContract.js";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import {
  createBrowserExecutionRequest,
  type BrowserExecutionRequest,
} from "./browserExecutionContract.js";
import { browserObservationFromRuntimeResult } from "./browserObs.js";
import type { BrowserTxnPlan, BrowserTxnStepPlan } from "./browserPlan.js";
import { planBrowserRepair } from "./browserRepair.js";
import {
  createBrowserTxnResult,
  type BrowserTxnResult,
  type BrowserTxnStepSummary,
  type BrowserTxnStatus,
} from "./browserTxnEvidence.js";
import {
  createBrowserRuntimeManifest,
  validateBrowserRuntimeManifest,
  type BrowserRuntimeManifest,
} from "./browserRuntimeManifest.js";
import type {
  PwBrowser,
  PwBrowserContext,
  PwLocator,
  PwPage,
  PwRuntimeModule,
  PwRuntimeStatus,
} from "./pwRuntime.js";
import { importPwRuntime } from "./pwRuntime.js";
import { mapPwEvidence, type PwCleanupStatus, type PwPageEvidence } from "./pwEvidence.js";
import {
  browserActionKindForTool,
  decideBrowserToolPolicy,
  type BrowserToolName,
} from "./browserToolPolicy.js";
import { pwTxnFixtures } from "../harness/browserTxnFixtures.js";
import type { PwFixture } from "./pwAdapter.js";

export interface BrowserTxnExecutionOptions {
  readonly runtimeStatus: PwRuntimeStatus;
  readonly fixtures?: readonly PwFixture[];
  readonly runtimeModule?: PwRuntimeModule;
  readonly timeoutMs?: number;
  readonly launchTimeoutMs?: number;
}

export async function executeBrowserTransaction(
  plan: BrowserTxnPlan,
  options: BrowserTxnExecutionOptions,
): Promise<BrowserTxnResult> {
  const startedAt = Date.now();
  const evidence = [
    ...plan.planner.evidence,
    "browser-transaction:lifecycle:temporary-page",
    "browser-transaction:same-page:true",
  ];

  if (plan.planner.confidence === "low") {
    return stoppedTxn({
      plan,
      startedAt,
      reasonCode: "planner-low-confidence",
      reason: plan.planner.reason,
      cleanupStatus: "not-started",
      evidence: [...evidence, "browser-transaction:stopped-before-runtime"],
    });
  }

  const manifest = createTxnManifest(plan, options.timeoutMs);
  const manifestLoad = validateBrowserRuntimeManifest(manifest);
  if (manifestLoad.status !== "valid") {
    return stoppedTxn({
      plan,
      startedAt,
      reasonCode: "policy-blocked",
      reason: manifestLoad.reason,
      cleanupStatus: "not-started",
      evidence: [...evidence, ...manifestLoad.evidence],
    });
  }

  const policy = decideBrowserTransactionPolicy({
    plan,
    manifest: manifestLoad.manifest,
    runtimeStatus: options.runtimeStatus,
  });
  if (policy.allowed === false) {
    return stoppedTxn({
      plan,
      startedAt,
      reasonCode: policy.reasonCode,
      reason: policy.reason,
      cleanupStatus: "not-started",
      evidence: [...evidence, ...policy.evidence, "browser-transaction:stopped-before-runtime"],
    });
  }

  const timeoutMs = Math.min(manifestLoad.manifest.timeoutMs, plan.timeoutMs ?? options.timeoutMs ?? 5_000);
  const fixtures = options.fixtures ?? pwTxnFixtures;
  const fixture = resolveFixture(plan, fixtures);
  let browser: PwBrowser | undefined;
  let context: PwBrowserContext | undefined;
  let page: PwPage | undefined;
  let browserLaunched = false;
  const stepSummaries: BrowserTxnStepSummary[] = [];
  let observationNodes: readonly BrowserAccessibilityNodeInput[] = [];
  let repairStatus: BrowserTxnResult["repairStatus"] = "not-needed";
  let redactionStatus: BrowserTxnResult["redactionStatus"] = "clean";
  let failure:
    | { readonly reasonCode: string; readonly reason: string; readonly status: BrowserTxnStatus }
    | undefined;

  try {
    const runtime = options.runtimeModule ?? await loadRuntimeModule();
    if (!runtime.chromium) {
      throw new Error("Playwright Chromium runtime is unavailable.");
    }
    browser = await runtime.chromium.launch({
      headless: true,
      executablePath: options.runtimeStatus.executablePath,
      timeout: Math.max(timeoutMs, options.launchTimeoutMs ?? 5_000),
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

    for (const step of plan.steps) {
      const stepKind = executionKind(step);
      if (stepKind === "click" || stepKind === "type") {
        const actionResult = await runActionStep({
          page,
          step,
          observationNodes,
          repairAllowed: plan.planner.repairAllowed,
          timeoutMs,
        });
        if (actionResult.repairAttempted) {
          repairStatus = actionResult.succeeded ? "succeeded" : "failed";
          evidence.push(...actionResult.repairEvidence);
        }
        if (!actionResult.succeeded) {
          failure = {
            status: "stopped",
            reasonCode: actionResult.reasonCode,
            reason: actionResult.reason,
          };
          stepSummaries.push({
            kind: step.kind,
            status: "stopped",
            target: step.target ?? step.selector ?? "controlled-target",
            summary: actionResult.reason,
            reasonCode: actionResult.reasonCode,
            repairStatus: actionResult.repairAttempted ? "failed" : "not-needed",
          });
          break;
        }
      }

      const request = createStepRequest(plan, step, actionResultTarget(step));
      const pageEvidence = await collectPageEvidence({
        page,
        request,
        fixture,
        browserLaunched,
        cleanupStatus: "not-started",
      });
      const mapped = mapPwEvidence({ request, manifest: manifestLoad.manifest, evidence: pageEvidence });
      const observation = browserObservationFromRuntimeResult({
        toolName: toolNameForStep(step),
        result: mapped,
      });
      redactionStatus = observation.redactionStatus === "redacted" ? "redacted" : redactionStatus;
      observationNodes = mapped.accessibilityNodes;
      stepSummaries.push({
        kind: step.kind,
        status: observation.status === "success" ? "success" : observation.status,
        target: step.target ?? step.selector ?? plan.controlledTarget,
        summary: observation.visibleTextSummary || observation.actionResultSummary,
        reasonCode: observation.reasonCode,
        repairStatus: repairStatus === "succeeded" && (step.kind === "click" || step.kind === "type")
          ? "succeeded"
          : undefined,
      });
      evidence.push(...observation.evidence);
      evidence.push(...mapped.redactions);
    }
  } catch (error) {
    failure = {
      status: "failed",
      reasonCode: classifyTxnFailure(error, "observe"),
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const cleanupStatus = await closeAll(page, context, browser);
  const cleanupEvidence = [`browser-transaction:cleanup:${cleanupStatus}`];
  const finalStep = stepSummaries[stepSummaries.length - 1];
  const cleanupFailure = cleanupStatus === "close-failed";
  const status: BrowserTxnStatus = cleanupFailure
    ? "failed"
    : failure?.status ?? "success";
  const reasonCode = cleanupFailure
    ? "cleanup-failed"
    : failure?.reasonCode ?? finalStep?.reasonCode ?? "ready";
  const finalSummary = cleanupFailure
    ? "Browser transaction cleanup failed after temporary page use."
    : failure?.reason ?? finalStep?.summary ?? "Browser transaction produced no page summary.";

  return createBrowserTxnResult({
    status,
    transactionId: plan.transactionId,
    controlledTarget: plan.controlledTarget,
    planner: plan.planner,
    plannedSteps: plan.steps.map((step) => step.kind),
    stepSummaries,
    finalSummary,
    reasonCode,
    cleanupStatus,
    redactionStatus,
    repairStatus,
    durationMs: Date.now() - startedAt,
    evidence: [
      ...evidence,
      ...cleanupEvidence,
      ...(reasonCode === "policy-blocked" ? ["actionable-blocker-kind:browser-policy-blocked"] : []),
      ...(reasonCode === "runtime-disabled" ||
        reasonCode === "runtime-package-missing" ||
        reasonCode === "runtime-binary-missing"
        ? ["actionable-blocker-kind:browser-unavailable"]
        : []),
      ...(reasonCode === "action-target-missing" || reasonCode === "repair-failed"
        ? ["actionable-blocker-kind:browser-target-missing"]
        : []),
      ...(reasonCode === "action-timeout" || reasonCode === "navigation-timeout"
        ? ["actionable-blocker-kind:browser-timeout"]
        : []),
      ...(reasonCode === "cleanup-failed"
        ? ["actionable-blocker-kind:browser-cleanup-failed"]
        : []),
      ...(reasonCode === "adapter-invalid-result"
        ? ["actionable-blocker-kind:browser-adapter-failure"]
        : []),
    ],
  });
}

function createTxnManifest(
  plan: BrowserTxnPlan,
  timeoutMs: number | undefined,
): BrowserRuntimeManifest {
  return createBrowserRuntimeManifest({
    manifestId: "browser-runtime:agent-loop-transaction",
    runtimeMode: "direct-playwright-core",
    source: "test-only",
    allowedOrigins: [
      "local-fixture://pw/static",
      "local-fixture://pw/js",
      "local-fixture://pw/timeout",
      "local-fixture://pw/unsafe",
      "local-fixture://pw/redaction",
      "local-fixture://txn/repair",
      "local-fixture://txn/target-missing",
      "local-fixture://txn/stale",
      plan.controlledTarget,
    ],
    allowedActions: ["observe", "extract", "click", "type"],
    timeoutMs: plan.timeoutMs ?? timeoutMs ?? 5_000,
    outputBudgetChars: 2_400,
    warnings: ["browser-transaction:controlled-local-only"],
  });
}

function decideBrowserTransactionPolicy(input: {
  readonly plan: BrowserTxnPlan;
  readonly manifest: BrowserRuntimeManifest;
  readonly runtimeStatus: PwRuntimeStatus;
}): { readonly allowed: true; readonly evidence: readonly string[] } | {
  readonly allowed: false;
  readonly reasonCode: string;
  readonly reason: string;
  readonly evidence: readonly string[];
} {
  const evidence = ["browser-transaction-policy:single-preflight"];
  for (const step of input.plan.steps) {
    const toolName = toolNameForStep(step);
    const decision = decideBrowserToolPolicy({
      toolName,
      args: stepArgs(input.plan, step),
      runtimeStatus: input.runtimeStatus,
      manifest: input.manifest,
    });
    if (!decision.allowed) {
      return {
        allowed: false,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        evidence: [...evidence, ...decision.evidence],
      };
    }
    evidence.push(...decision.evidence);
  }
  return {
    allowed: true,
    evidence: [
      ...evidence,
      "browser-transaction-policy:allowed",
      "browser-transaction-policy:no-public-web-default",
      "browser-transaction-policy:no-auth-session-persistence",
    ],
  };
}

async function runActionStep(input: {
  readonly page: PwPage;
  readonly step: BrowserTxnStepPlan;
  readonly observationNodes: readonly BrowserAccessibilityNodeInput[];
  readonly repairAllowed: boolean;
  readonly timeoutMs: number;
}): Promise<{
  readonly succeeded: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly repairAttempted: boolean;
  readonly repairEvidence: readonly string[];
}> {
  try {
    await applyAction(input.page, input.step, input.timeoutMs);
    return {
      succeeded: true,
      reasonCode: "ready",
      reason: "browser action applied",
      repairAttempted: false,
      repairEvidence: [],
    };
  } catch (error) {
    const reasonCode = classifyTxnFailure(error, executionKind(input.step));
    const repair = planBrowserRepair({
      step: input.step,
      failureCode: reasonCode,
      observationNodes: input.observationNodes,
      repairAllowed: input.repairAllowed,
      priorAttempts: 0,
    });
    if (repair.status !== "attempted") {
      const repairFailed = input.repairAllowed && repair.status === "blocked";
      return {
        succeeded: false,
        reasonCode: repairFailed ? "repair-failed" : reasonCode,
        reason: repairFailed
          ? repair.reason
          : error instanceof Error ? error.message : String(error),
        repairAttempted: repairFailed,
        repairEvidence: repairFailed ? [...repair.evidence, "browser-repair:failed"] : repair.evidence,
      };
    }
    try {
      await applyAction(input.page, {
        ...input.step,
        target: repair.repairedTarget ?? input.step.target,
        selector: repair.repairedSelector ?? input.step.selector,
      }, input.timeoutMs);
      return {
        succeeded: true,
        reasonCode: "ready",
        reason: repair.reason,
        repairAttempted: true,
        repairEvidence: [...repair.evidence, "browser-repair:succeeded"],
      };
    } catch (repairError) {
      return {
        succeeded: false,
        reasonCode: "repair-failed",
        reason: repairError instanceof Error ? repairError.message : String(repairError),
        repairAttempted: true,
        repairEvidence: [...repair.evidence, "browser-repair:failed"],
      };
    }
  }
}

async function applyAction(
  page: PwPage,
  step: BrowserTxnStepPlan,
  timeoutMs: number,
): Promise<void> {
  if (step.kind === "click") {
    const locator = await firstAvailable([
      step.selector ? page.locator(step.selector) : undefined,
      page.getByRole("button", { name: step.target ?? "" }),
      step.target ? page.getByRole("link", { name: step.target }) : undefined,
      selectorLocator(page, step.target),
    ]);
    await locator.click({ timeout: timeoutMs });
    return;
  }
  if (step.kind === "type") {
    const locator = await firstAvailable([
      step.selector ? page.locator(step.selector) : undefined,
      step.target ? page.getByLabel(step.target) : undefined,
      step.target ? page.getByRole("textbox", { name: step.target }) : undefined,
      selectorLocator(page, step.target),
    ]);
    await locator.fill(step.text ?? "", { timeout: timeoutMs });
  }
}

async function collectPageEvidence(input: {
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
      "browser-transaction:real-playwright",
      `browser-transaction:fixture:${input.fixture.marker}`,
      `browser-transaction:operation:${input.request.actionKind}`,
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

function createStepRequest(
  plan: BrowserTxnPlan,
  step: BrowserTxnStepPlan,
  targetOverride?: string,
): BrowserExecutionRequest {
  const actionKind = executionKind(step);
  const target = targetOverride ?? step.target ?? plan.controlledTarget;
  return createBrowserExecutionRequest({
    requestId: `${plan.transactionId}:${actionKind}:${target}`,
    mode: "test-local",
    source: "test",
    approval: actionKind === "observe" || actionKind === "extract" ? "read-only" : "none",
    action: createBrowserActionContract({
      actionKind,
      target,
      url: plan.controlledTarget,
      selector: step.selector,
      text: actionKind === "type" ? step.text : undefined,
      extractionGoal: actionKind === "extract" ? step.extractionKind ?? step.target ?? "visible-text" : undefined,
      userIntentSummary: `browser transaction ${actionKind} on ${plan.controlledTarget}`,
      requiresNetwork: false,
      requiresAuth: false,
    }),
  });
}

function stoppedTxn(input: {
  readonly plan: BrowserTxnPlan;
  readonly startedAt: number;
  readonly reasonCode: string;
  readonly reason: string;
  readonly cleanupStatus: string;
  readonly evidence: readonly string[];
}): BrowserTxnResult {
  return createBrowserTxnResult({
    status: "stopped",
    transactionId: input.plan.transactionId,
    controlledTarget: input.plan.controlledTarget,
    planner: input.plan.planner,
    plannedSteps: input.plan.steps.map((step) => step.kind),
    stepSummaries: [],
    finalSummary: input.reason,
    reasonCode: input.reasonCode,
    cleanupStatus: input.cleanupStatus,
    redactionStatus: "clean",
    repairStatus: "not-needed",
    durationMs: Date.now() - input.startedAt,
    evidence: input.evidence,
  });
}

function resolveFixture(
  plan: BrowserTxnPlan,
  fixtures: readonly PwFixture[],
): PwFixture {
  return fixtures.find((fixture) => fixture.marker === plan.controlledTarget) ??
    fixtures[0] ??
    { marker: "local-fixture://txn/missing", html: "<main><h1>Missing fixture</h1></main>" };
}

function stepArgs(
  plan: BrowserTxnPlan,
  step: BrowserTxnStepPlan,
): Record<string, unknown> {
  return {
    page: plan.controlledTarget,
    target: step.target,
    selector: step.selector,
    text: step.text,
    valueClassification: step.valueClassification,
    extractionKind: step.extractionKind,
    timeoutMs: plan.timeoutMs,
  };
}

function executionKind(step: BrowserTxnStepPlan): "observe" | "extract" | "click" | "type" {
  return step.kind === "re-observe" ? "observe" : step.kind;
}

function toolNameForStep(step: BrowserTxnStepPlan): BrowserToolName {
  return `browser.${browserActionKindForTool(`browser.${executionKind(step)}` as BrowserToolName)}` as BrowserToolName;
}

function actionResultTarget(step: BrowserTxnStepPlan): string | undefined {
  return step.target ?? step.selector;
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

async function loadRuntimeModule(): Promise<PwRuntimeModule> {
  const imported = await importPwRuntime();
  if (!imported.ok) {
    throw new Error("Playwright runtime import failed.");
  }
  return imported.module;
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

function classifyTxnFailure(
  error: unknown,
  actionKind: "observe" | "extract" | "click" | "type",
): string {
  const message = sanitizeBrowserText(error instanceof Error ? error.message : String(error), 240).toLowerCase();
  if (/target.*not found|controlled playwright target was not found|not found/i.test(message)) {
    return "action-target-missing";
  }
  if (/timeout|timed out/i.test(message)) {
    return actionKind === "click" || actionKind === "type" ? "action-timeout" : "navigation-timeout";
  }
  if (actionKind === "extract") {
    return "extract-failed";
  }
  if (actionKind === "observe") {
    return "observe-failed";
  }
  return "adapter-invalid-result";
}
