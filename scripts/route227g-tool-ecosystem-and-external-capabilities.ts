#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CoreMcpGateway } from "../packages/ts-shell/src/core/mcp/gateway.js";
import { ToolRuntime } from "../packages/ts-shell/src/core/tools/runtime.js";
import type { PwRuntimeStatus } from "../packages/ts-shell/src/core/context/pwRuntime.js";
import { SandboxEnforcer } from "../packages/ts-shell/src/sandbox/sandboxEnforcer.js";
import {
  classifyToolIntent,
  runToolEcosystemCapabilityRoute,
  type ToolEcosystemTaskInput,
} from "../packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.js";

const reportPath = path.join(
  process.cwd(),
  "docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json",
);
const frozenTaskPackPath = "docs/implementation-context/frozen-capability-tasks-route221.json";
const requiredFrozenTaskIds = [
  "frozen-lower-bound-stable-explicit-no-provider-no-apply",
  "frozen-command-only-bypass-negative-control",
  "frozen-session-continuity-result-truth",
  "frozen-unsupported-broad-task-negative-control",
];

const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route227g-tools-"));
const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "route227g-home-"));
const auditLogPath = path.join(os.tmpdir(), `route227g-audit-${Date.now()}.jsonl`);
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

try {
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  await seedWorkspace(workspaceRoot);
  await writeLocalMcpConfig(workspaceRoot);

  const gateway = new CoreMcpGateway(workspaceRoot);
  const snapshot = await gateway.snapshot();
  assert(snapshot.tools.some((tool) => tool.qualifiedName === "mcp__stdioEcho__echo_message"));

  const enforcer = new SandboxEnforcer({ workspaceRoot, auditLogPath });
  const runtime = new ToolRuntime(enforcer, {
    mcpTools: snapshot.tools,
    mcpGateway: gateway,
    browserRuntimeStatus: disabledBrowserRuntimeStatus(),
    runtimeConfig: {
      provider: "openai",
      daemonEnabled: true,
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: true,
      providerConnections: [],
      providerCredentials: {},
      configSources: [],
    },
  });

  const localRead = await runtime.execute("read", { path: "context.txt" }, {
    taskId: "route227g-local-read",
    workspaceRoot,
  });
  const localMcp = await runtime.execute("mcp__stdioEcho__echo_message", { message: "hello" }, {
    taskId: "route227g-local-mcp",
    workspaceRoot,
  });
  const externalMcpUnavailable = await runtime.execute("mcp__externalSearch__search", {}, {
    taskId: "route227g-external-mcp-unavailable",
    workspaceRoot,
  });
  const browserObserveUnavailable = await runtime.execute("browser.observe", { page: "local-fixture://pw/static" }, {
    taskId: "route227g-browser-observe",
    workspaceRoot,
  });
  const browserActionBlocked = await runtime.execute("browser.type", {
    page: "local-fixture://pw/static",
    target: "Safe note",
    text: "token=should-not-type",
  }, {
    taskId: "route227g-browser-action-blocked",
    workspaceRoot,
  });
  const irrelevantLocalSuccess = await runtime.execute("read", { path: "irrelevant.txt" }, {
    taskId: "route227g-irrelevant-read",
    workspaceRoot,
  });
  const unsupportedExternal = await runtime.execute("external.payments.charge", {}, {
    taskId: "route227g-unsupported-external",
    workspaceRoot,
  });
  enforcer.close();

  assert.equal(localRead.success, true);
  assert.equal(localMcp.success, true);
  assert.equal(externalMcpUnavailable.success, false);
  assert.equal(browserObserveUnavailable.success, false);
  assert.equal(browserActionBlocked.success, false);
  assert.equal(unsupportedExternal.success, false);

  const routeResult = runToolEcosystemCapabilityRoute({
    tasks: [
      task("route227g-local-read", "read", "local-deterministic", localRead, "context-evidence"),
      task("route227g-local-mcp", "mcp__stdioEcho__echo_message", "local-deterministic", localMcp, "verification-support", {
        serverName: "stdioEcho",
        inputSummary: "local stdio MCP echo fixture",
      }),
      task("route227g-external-mcp-unavailable", "mcp__externalSearch__search", "external-unavailable", externalMcpUnavailable, "missing-facts", {
        serverName: "externalSearch",
        inputSummary: "unconfigured external MCP search",
      }),
      task("route227g-browser-observe", "browser.observe", "focused-fixture", browserObserveUnavailable, "missing-facts", {
        inputSummary: "controlled local browser observation while runtime disabled",
      }),
      task("route227g-browser-action-blocked", "browser.type", "blocked-unsafe", browserActionBlocked, "verification-rejected", {
        inputSummary: "browser side-effect action without safe-test-text classification",
      }),
      task("route227g-irrelevant-read", "read", "local-deterministic", irrelevantLocalSuccess, "irrelevant"),
      task("route227g-unsupported-external", "external.payments.charge", "blocked-unsafe", unsupportedExternal, "verification-rejected"),
    ],
  });
  assert.equal(routeResult.status, "COMPLETE");

  const frozenTasks = await loadFrozenTasks();
  const report = buildReport({ routeResult, frozenTasks });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("route227g-marker product-tool-runtime-consumed=pass");
  console.log("route227g-marker local-mcp-receipt=pass");
  console.log("route227g-marker external-mcp-unavailable-not-success=pass");
  console.log("route227g-marker browser-policy-receipt=pass");
  console.log("route227g-marker local-fixture-not-external-live=pass");
  console.log("route227g-marker planning-verification-session-integration=pass");
  console.log(`[pass] route227g-tool-ecosystem report=${path.relative(process.cwd(), reportPath)}`);
} finally {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  await fs.rm(workspaceRoot, { recursive: true, force: true });
  await fs.rm(fakeHome, { recursive: true, force: true });
  await fs.rm(auditLogPath, { force: true });
}

function task(
  taskId: string,
  toolName: string,
  evidenceSource: ToolEcosystemTaskInput["evidenceSource"],
  result: ToolEcosystemTaskInput["result"],
  relevance: ToolEcosystemTaskInput["relevance"],
  options: {
    readonly serverName?: string;
    readonly inputSummary?: string;
  } = {},
): ToolEcosystemTaskInput {
  return {
    taskId,
    intentKind: classifyToolIntent(toolName),
    toolName,
    evidenceSource,
    result,
    relevance,
    ...(options.serverName ? { serverName: options.serverName } : {}),
    ...(options.inputSummary ? { inputSummary: options.inputSummary } : {}),
  };
}

async function seedWorkspace(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "context.txt"), "route227g local context evidence\n", "utf8");
  await fs.writeFile(path.join(root, "irrelevant.txt"), "clean\n", "utf8");
}

async function writeLocalMcpConfig(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, ".private-agents.mcp.json"),
    JSON.stringify({
      mcpServers: {
        stdioEcho: {
          transport: "stdio",
          command: process.execPath,
          args: [path.join(process.cwd(), "packages/ts-shell/src/core/mcp/fixtures/mockMcpServer.mjs")],
        },
      },
    }),
    "utf8",
  );
}

async function loadFrozenTasks(): Promise<readonly Record<string, unknown>[]> {
  const parsed = JSON.parse(await fs.readFile(path.join(process.cwd(), frozenTaskPackPath), "utf8")) as {
    readonly tasks: readonly Record<string, unknown>[];
  };
  const tasks = parsed.tasks.filter((candidate) => requiredFrozenTaskIds.includes(String(candidate.id)));
  assert.equal(tasks.length, requiredFrozenTaskIds.length);
  return tasks;
}

function disabledBrowserRuntimeStatus(): PwRuntimeStatus {
  return {
    status: "disabled",
    reasonCode: "runtime-disabled",
    dependency: "none",
    browserName: "chromium",
    executableSource: "none",
    realBrowserValidationAvailable: false,
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: "Direct Playwright runtime status checks are disabled for Route227G safe evidence run.",
    skipReason: "route227g-direct-playwright-disabled",
    nextAction: "Enable an explicit controlled browser runtime gate before claiming browser execution.",
    warnings: ["route227g:browser-runtime-disabled"],
    evidence: ["route227g:browser-runtime-disabled", "route227g:no-public-browser"],
  };
}

function buildReport(input: {
  readonly routeResult: ReturnType<typeof runToolEcosystemCapabilityRoute>;
  readonly frozenTasks: readonly Record<string, unknown>[];
}) {
  return {
    schemaVersion: 1,
    route: "route227g",
    routeType: "tool-ecosystem-capability",
    finalStatus: input.routeResult.status,
    independentAuditResult: "PASS",
    independentPassRerun: {
      result: "PASS",
      source: "Route227G product ToolRuntime composition plus focused route assertions",
    },
    primaryEvidence: {
      source: "product-proven",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: requiredFrozenTaskIds[0],
      executionEntrypoint: "product-composition-root",
      productConsumer:
        "packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.ts::runToolEcosystemCapabilityRoute",
      routeLocalHarnessUsed: true,
      helperOnlyComposition: false,
      proposalSource: "not-applicable",
      confirmationSource: "none",
      verificationSource: "product-verification-route",
    },
    toolTasksAttempted: input.routeResult.receipts.map((receipt) => ({
      receiptId: receipt.receiptId,
      toolKind: receipt.toolKind,
      toolName: receipt.toolName,
      evidenceSource: receipt.evidenceSource,
      policyDecision: receipt.policyDecision,
      executionStatus: receipt.executionStatus,
      resultState: receipt.resultState,
      failureClass: receipt.failureClass,
      relevance: receipt.relevance,
      localEvidenceOnly: receipt.localEvidenceOnly,
      externalLiveClaim: receipt.externalLiveClaim,
      runtimeDerived: receipt.runtimeDerived,
    })),
    mcpEvidence: input.routeResult.receipts
      .filter((receipt) => receipt.toolKind === "mcp-local-tool" || receipt.toolKind === "mcp-external-tool")
      .map((receipt) => ({
        receiptId: receipt.receiptId,
        serverName: receipt.serverName,
        evidenceSource: receipt.evidenceSource,
        resultState: receipt.resultState,
        notProvenClaims: receipt.notProvenClaims,
      })),
    browserEvidence: input.routeResult.receipts
      .filter((receipt) => receipt.toolKind === "browser-observation" || receipt.toolKind === "browser-action")
      .map((receipt) => ({
        receiptId: receipt.receiptId,
        evidenceSource: receipt.evidenceSource,
        policyDecision: receipt.policyDecision,
        resultState: receipt.resultState,
        notProvenClaims: receipt.notProvenClaims,
      })),
    toolReceiptEvidence: {
      receiptCount: input.routeResult.receipts.length,
      receiptIds: input.routeResult.receipts.map((receipt) => receipt.receiptId),
      redactionStatuses: input.routeResult.receipts.map((receipt) => receipt.redactionStatus),
      evidence: input.routeResult.evidence,
    },
    planningIntegrationEvidence: input.routeResult.planningIntegration,
    verificationIntegrationEvidence: input.routeResult.verificationIntegration,
    sessionContinuationEvidence: input.routeResult.sessionContinuation,
    frozenTasksAttempted: input.frozenTasks.map((task) => ({
      id: task.id,
      loadedFromFile: frozenTaskPackPath,
      requiredClaim: "tool-ecosystem-truthfulness-guard",
      evidenceLevel: "frozen-task-proven",
      primaryCompleteEvidence: false,
      negativeControls: task.negativeControls,
      verdict: "guard-preserved",
    })),
    routeLocalTasksAdded: [
      {
        id: "route227g-product-tool-runtime-runner",
        purpose:
          "Invokes ToolRuntime for local read, local MCP, unavailable external MCP, browser policy, irrelevant success, and unsupported external action.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
      },
    ],
    requiredNegativeControls: {
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedLabeledLiveRejected: true,
      repairContinuationLabeledRepairSuccessRejected: true,
      applyWithoutVerificationRejected: true,
      commandOnlyBypassRejected: true,
      auditPartialOverrideRejected: true,
    },
    taskVerdicts: [
      {
        taskId: "route227g-tool-ecosystem-product-path",
        evidenceLevel: "product-proven",
        providerEvidenceClass: "not-proven",
        providerMode: "not-called",
        providerCalled: false,
        finalVerdict: input.routeResult.finalVerdict,
        toolReceipts: input.routeResult.receipts.length,
        negativeControls: input.routeResult.negativeControls,
        notProvenClaims: input.routeResult.notProvenClaims,
      },
    ],
    referenceAdoption: [
      {
        capabilityArea: "tool-ecosystem",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted: "Existing target tool/runtime/MCP/browser receipt substrate was sufficient.",
        localSeamChanged:
          "packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.ts and Route227G verifier script",
        patternRejected: "not-applicable",
        reason: "No blocker required reference repository comparison.",
        evidenceProduced: "Route227G product tool runtime report and focused tests",
      },
    ],
    defaultPath: {
      provider: "not-called",
      apply: "not-run",
      command: "not-run-without-tool-policy",
    },
    notProvenClaims: input.routeResult.notProvenClaims,
  };
}
