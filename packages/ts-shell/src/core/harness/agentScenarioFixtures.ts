import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCompactInjectionStateStore } from "../../context/compact/injection/compactInjectionState.js";
import { createCompactLiveCheckpointStore } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { createProjectMemoryInjectionStateStore } from "../../memory/projectMemoryInjectionState.js";
import { createProjectMemoryLocalStore } from "../../memory/projectMemoryLocalStore.js";
import { createProjectMemoryReviewStateStore } from "../../memory/projectMemoryReviewState.js";
import type { ProjectMemoryRecord } from "../../memory/projectMemoryStoreContract.js";
import { createSidebarLiveEventStore } from "../../presentation/sidebar/sidebarLiveEventStore.js";
import type { BrowserExecutor } from "../../browser/executor.js";
import type { BrowserExecutionConfirmationRecord } from "../../browser/executionConfirmation.js";
import type { BrowserNetworkAllowlist } from "../../browser/networkAllowlist.js";
import type { BrowserSandboxAuthority } from "../../browser/sandboxAuthority.js";
import { createStartupWarmContextCacheStore } from "../../context/startup/startupWarmContextHealth.js";
import type { CommandContext } from "../commands/types.js";
import {
  deterministicScenarioTimestamp,
  scenarioSessionScopeId,
  type AgentScenarioContext,
} from "./agentScenarioModel.js";

export interface AgentScenarioFixtureContext extends AgentScenarioContext {
  readonly workspaceRoot: string;
  readonly memoryStoreRoot: string;
  readonly warmupCacheRoot: string;
}

export function createAgentScenarioFixtureContext(input: {
  readonly scenarioId: string;
  readonly workspaceRoot?: string;
  readonly sessionId?: string;
  readonly browserExecutor?: BrowserExecutor;
  readonly browserSandboxAuthority?: BrowserSandboxAuthority;
  readonly browserNetworkAllowlist?: BrowserNetworkAllowlist;
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[];
}): AgentScenarioFixtureContext {
  const workspaceRoot =
    input.workspaceRoot ??
    fs.mkdtempSync(path.join(os.tmpdir(), "agent-scenario-workspace-"));
  const memoryStoreRoot = path.join(workspaceRoot, ".scenario-memory");
  const warmupCacheRoot = path.join(workspaceRoot, ".scenario-warmup");
  const sessionId = input.sessionId ?? input.scenarioId;
  const sessionScopeId = scenarioSessionScopeId(sessionId);
  let nowIndex = 0;
  let idIndex = 0;
  const now = () => deterministicScenarioTimestamp(nowIndex++);
  const nextId = (prefix: string) => {
    idIndex += 1;
    return `${prefix}-${idIndex}`;
  };
  const compactCheckpointStore = createCompactLiveCheckpointStore({
    now,
    nextId: () => nextId("checkpoint"),
  });
  const compactInjectionStateStore = createCompactInjectionStateStore({ now });
  const projectMemoryReviewStateStore = createProjectMemoryReviewStateStore({
    now,
  });
  const projectMemoryInjectionStateStore = createProjectMemoryInjectionStateStore({
    now,
    nextId: () => nextId("pmi"),
  });
  const projectMemoryStore = createProjectMemoryLocalStore({
    ref: { mode: "test-only", root: memoryStoreRoot },
  });
  const startupWarmContextCacheStore = createStartupWarmContextCacheStore({
    ref: {
      mode: "test-only",
      projectRoot: workspaceRoot,
      cacheRoot: warmupCacheRoot,
    },
  });
  const sidebarLiveEventStore = createSidebarLiveEventStore({
    now,
    nextId: () => nextId("sidebar-event"),
  });
  const commandContext: CommandContext = {
    cwd: workspaceRoot,
    sessionId,
    compactCheckpointStore,
    compactInjectionStateStore,
    projectMemoryReviewStateStore,
    projectMemoryInjectionStateStore,
    projectMemoryStore,
    startupWarmContextCacheStore,
    browserExecutor: input.browserExecutor,
    browserSandboxAuthority: input.browserSandboxAuthority,
    browserNetworkAllowlist: input.browserNetworkAllowlist,
    browserExecutionConfirmations: input.browserExecutionConfirmations,
    sidebarLiveEventStore,
  };
  return {
    cwd: workspaceRoot,
    workspaceRoot,
    memoryStoreRoot,
    warmupCacheRoot,
    sessionId,
    sessionScopeId,
    commandContext,
    now,
    nextId,
    cleanup: () => {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}

export async function seedProjectMemoryRecord(
  context: AgentScenarioContext,
  input: Partial<ProjectMemoryRecord> = {},
): Promise<ProjectMemoryRecord> {
  const store = context.commandContext.projectMemoryStore;
  if (!store) {
    throw new Error("Project memory store fixture is required.");
  }
  const record: ProjectMemoryRecord = {
    id: input.id ?? "pmr:scenario-record",
    version: 1,
    createdAt: input.createdAt ?? "2026-05-17T00:00:00.000Z",
    candidateId: input.candidateId ?? "pmc:scenario-record",
    candidateKind: input.candidateKind ?? "project-fact",
    retentionClass: input.retentionClass ?? "project-scoped-candidate",
    approvedAt: input.approvedAt ?? "2026-05-17T00:00:00.000Z",
    approvedBySourceCommand: "/memory",
    memoryText:
      input.memoryText ??
      "Scenario memory records are explicit, deterministic, and safe.",
    structuredFact: input.structuredFact,
    evidence: input.evidence ?? ["agent-scenario-fixture:memory-record"],
    source: input.source ?? "system-derived",
    sourcePacket: input.sourcePacket ?? "agent-scenario-fixture",
    routeReferences: input.routeReferences ?? ["route95"],
    safety: input.safety ?? "safe",
    redactions: input.redactions ?? [],
  };
  await store.write({ storeRef: store.ref, record });
  return record;
}

export function createValidationEvidenceFixture(): readonly string[] {
  return [
    "agent-scenario-fixture:validation-status",
    "agent-scenario-fixture:focused-tests",
    "agent-scenario-fixture:diff-check",
  ];
}
