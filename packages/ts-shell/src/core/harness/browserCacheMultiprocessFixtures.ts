import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BROWSER_RECEIPT_CACHE_ROOT_ENV } from "../../browser/receipt/manifest.js";
import {
  createBrowserExternalRunnerManifest,
  serializeBrowserExternalRunnerManifest,
} from "../../browser/runtime/external/manifest.js";
import { BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV } from "../../browser/cliExecutorInjection.js";
import {
  browserReceiptCacheLockPath,
  type BrowserReceiptCacheLockOperation,
} from "../../browser/receipt/lock.js";
import {
  buildProjectCliProcessSpec,
  type BuildProjectCliProcessSpecInput,
} from "../../test-utils/cli/process.js";
import type { AgentCliProcessSpec } from "../../test-utils/cli/model.js";
import type { BrowserCacheProcessRole, BrowserCacheProcessStep } from "./browserCacheMultiprocessScenarioModel.js";

export interface BrowserCacheMultiprocessFixture {
  readonly root: string;
  readonly projectPath: string;
  readonly homeDir: string;
  readonly cacheRoot: string;
  readonly runnerPath: string;
  readonly manifestPath: string;
  readonly env: Readonly<Record<string, string>>;
  cliStep(input: {
    readonly id: string;
    readonly role: BrowserCacheProcessRole;
    readonly prompt: string;
    readonly groupId?: string;
    readonly timeoutMs?: number;
    readonly expectedBlocked?: boolean;
  }): BrowserCacheProcessStep;
  lockHolderStep(input: {
    readonly id: string;
    readonly groupId?: string;
    readonly operation?: BrowserReceiptCacheLockOperation;
    readonly holdMs?: number;
  }): BrowserCacheProcessStep;
  writeStaleLock(operation?: BrowserReceiptCacheLockOperation): void;
  cleanup(): void;
}

export function createBrowserCacheMultiprocessFixture(input: {
  readonly runnerDelayMs?: number;
} = {}): BrowserCacheMultiprocessFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-cache-multiprocess-"));
  const projectPath = path.join(root, "project");
  const homeDir = path.join(root, "home");
  const cacheRoot = path.join(root, "cache");
  const runnerPath = path.join(root, "runner.cjs");
  const manifestPath = path.join(root, "browser-external-runner-manifest.json");
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.writeFileSync(path.join(projectPath, "README.md"), "Route 110 browser cache fixture\n", "utf8");
  fs.writeFileSync(runnerPath, runnerScript(input.runnerDelayMs ?? 0), "utf8");
  const manifest = createBrowserExternalRunnerManifest({
    source: "cli-harness",
    runnerMode: "test-local",
    runnerId: "route110-cache-stress-runner",
    runnerCommand: {
      command: process.execPath,
      args: [runnerPath],
    },
    fixture: {
      id: "fixture:route110-demo",
      title: "Route 110 cache stress fixture",
      url: "local-fixture://route110-demo",
      textSummary: "Route 110 safe local fixture summary.",
      allowedActions: ["observe", "extract", "navigate-local"],
    },
    timeoutMs: Math.max(1200, (input.runnerDelayMs ?? 0) + 1000),
    outputBudgetBytes: 4096,
  });
  fs.writeFileSync(manifestPath, serializeBrowserExternalRunnerManifest(manifest), "utf8");
  const env = {
    [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: manifestPath,
    [BROWSER_RECEIPT_CACHE_ROOT_ENV]: cacheRoot,
  };
  return {
    root,
    projectPath,
    homeDir,
    cacheRoot,
    runnerPath,
    manifestPath,
    env,
    cliStep(step) {
      return {
        id: step.id,
        role: step.role,
        groupId: step.groupId,
        expectedBlocked: step.expectedBlocked,
        spec: cliSpec({
          prompt: step.prompt,
          projectPath,
          homeDir,
          env,
          timeoutMs: step.timeoutMs ?? 8000,
        }),
      };
    },
    lockHolderStep(step) {
      const scriptPath = path.join(root, `${step.id}.lock-holder.cjs`);
      const readyFilePath = path.join(root, `${step.id}.lock-ready`);
      const releaseFilePath = path.join(root, `${step.id}.lock-release`);
      fs.writeFileSync(scriptPath, lockHolderScript({
        cacheRoot,
        operation: step.operation ?? "write",
        holdMs: step.holdMs ?? 500,
        readyFilePath,
        releaseFilePath,
      }), "utf8");
      return {
        id: step.id,
        role: "lock-holder",
        groupId: step.groupId,
        readyFilePath,
        releaseFilePath,
        spec: {
          command: process.execPath,
          args: [scriptPath],
          cwd: projectPath,
          env: {},
          timeoutMs: (step.holdMs ?? 500) + 1500,
          promptSummary: "browser cache lock holder",
        },
      };
    },
    writeStaleLock(operation = "write") {
      fs.writeFileSync(
        browserReceiptCacheLockPath(cacheRoot),
        `${JSON.stringify({
          version: "browser-receipt-cache-lock/v1",
          lockId: "route110-stale-lock",
          ownerId: "route110-test",
          operation,
          createdAt: "2026-05-17T00:00:00.000Z",
          expiresAt: "2026-05-17T00:00:00.001Z",
        })}\n`,
        "utf8",
      );
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function cliSpec(input: Omit<BuildProjectCliProcessSpecInput, "cwd">): AgentCliProcessSpec {
  return buildProjectCliProcessSpec(input);
}

function runnerScript(delayMs: number): string {
  return [
    "let input = '';",
    "process.stdin.on('data', chunk => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    `  setTimeout(() => {`,
    "    process.stdout.write(JSON.stringify({",
    "      status: 'executed', executed: true, mode: 'test-local',",
    "      evidence: {",
    "        safeTitle: 'Route 110 cache stress fixture',",
    "        safeUrl: request.safeUrl,",
    "        safeObservationSummary: `Safe observed ${request.fixtureId}.`,",
    "        actionTraceSummary: `runner:${request.action};fixture:${request.fixtureId}`",
    "      },",
    "      warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
    "    }));",
    `  }, ${delayMs});`,
    "});",
  ].join("\n");
}

function lockHolderScript(input: {
  readonly cacheRoot: string;
  readonly operation: BrowserReceiptCacheLockOperation;
  readonly holdMs: number;
  readonly readyFilePath: string;
  readonly releaseFilePath: string;
}): string {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    `const cacheRoot = ${JSON.stringify(input.cacheRoot)};`,
    "fs.mkdirSync(cacheRoot, { recursive: true });",
    "fs.writeFileSync(path.join(cacheRoot, 'browser-receipt-cache.lock.json'), JSON.stringify({",
    "  version: 'browser-receipt-cache-lock/v1',",
    "  lockId: 'route110-active-lock', ownerId: 'route110-lock-holder',",
    `  operation: ${JSON.stringify(input.operation)},`,
    "  createdAt: new Date(Date.now() + 60000).toISOString(),",
    "  expiresAt: new Date(Date.now() + 120000).toISOString(),",
    "}) + '\\n', 'utf8');",
    `fs.writeFileSync(${JSON.stringify(input.readyFilePath)}, 'ready\\n', 'utf8');`,
    `const releasePath = ${JSON.stringify(input.releaseFilePath)};`,
    "const lockPath = path.join(cacheRoot, 'browser-receipt-cache.lock.json');",
    "const startedAt = Date.now();",
    "const interval = setInterval(() => {",
    `  if (fs.existsSync(releasePath) || Date.now() - startedAt >= ${input.holdMs}) {`,
    "    fs.rmSync(lockPath, { force: true });",
    "    clearInterval(interval);",
    "  }",
    "}, 25);",
  ].join("\n");
}
