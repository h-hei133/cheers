import type { ProjectMemoryDeleteCommandRequest } from "./projectMemoryDeleteCommandContract.js";
import {
  deleteProjectMemoryRecord,
  invalidateProjectMemoryRecord,
} from "./projectMemoryInvalidation.js";
import type {
  ProjectMemoryDeleteResult,
  ProjectMemoryInvalidateResult,
  ProjectMemoryStore,
  ProjectMemoryStoreHealth,
} from "./projectMemoryStoreContract.js";
import { renderProjectMemoryDeleteSurface } from "./projectMemoryDeleteSurface.js";

export type ProjectMemoryDeleteCommandOutcome =
  | "invalidated"
  | "deleted"
  | "blocked";

export interface RunProjectMemoryDeleteCommandInput {
  readonly request: ProjectMemoryDeleteCommandRequest;
  readonly memoryStore?: ProjectMemoryStore;
  readonly now?: () => string;
}

export interface ProjectMemoryDeleteCommandResult {
  readonly outcome: ProjectMemoryDeleteCommandOutcome;
  readonly output: string;
  readonly invalidateResult?: ProjectMemoryInvalidateResult;
  readonly deleteResult?: ProjectMemoryDeleteResult;
  readonly providerCall: "none";
  readonly persistence: "explicit-local";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

export async function runProjectMemoryDeleteCommand(
  input: RunProjectMemoryDeleteCommandInput,
): Promise<ProjectMemoryDeleteCommandResult> {
  const health = input.memoryStore
    ? await input.memoryStore.health()
    : disabledStoreHealth();
  if (!input.memoryStore || !health.writable) {
    return buildResult({
      input,
      health,
      outcome: "blocked",
      blocker: "Explicit local memory store root is required.",
    });
  }

  if (input.request.mode === "invalidate") {
    const invalidateResult = await invalidateProjectMemoryRecord({
      store: input.memoryStore,
      request: {
        recordId: input.request.recordId,
        reason: input.request.reason,
        now: input.now,
        sourceCommand: "/memory",
      },
    });
    return buildResult({
      input,
      health: await input.memoryStore.health(),
      outcome: invalidateResult.invalidated ? "invalidated" : "blocked",
      invalidateResult,
      blocker: invalidateResult.invalidated ? undefined : invalidateResult.blocker,
      evidence: invalidateResult.evidence,
    });
  }

  const deleteResult = await deleteProjectMemoryRecord({
    store: input.memoryStore,
    request: {
      recordId: input.request.recordId,
      reason: input.request.reason,
      now: input.now,
      sourceCommand: "/memory",
    },
  });
  return buildResult({
    input,
    health: await input.memoryStore.health(),
    outcome: deleteResult.deleted ? "deleted" : "blocked",
    deleteResult,
    blocker: deleteResult.deleted ? undefined : deleteResult.blocker,
    evidence: deleteResult.evidence,
  });
}

function buildResult(input: {
  readonly input: RunProjectMemoryDeleteCommandInput;
  readonly health: ProjectMemoryStoreHealth;
  readonly outcome: ProjectMemoryDeleteCommandOutcome;
  readonly invalidateResult?: ProjectMemoryInvalidateResult;
  readonly deleteResult?: ProjectMemoryDeleteResult;
  readonly blocker?: string;
  readonly evidence?: readonly string[];
}): ProjectMemoryDeleteCommandResult {
  return {
    outcome: input.outcome,
    output: renderProjectMemoryDeleteSurface({
      request: input.input.request,
      outcome: input.outcome,
      health: input.health,
      invalidateResult: input.invalidateResult,
      deleteResult: input.deleteResult,
      blocker: input.blocker,
    }),
    invalidateResult: input.invalidateResult,
    deleteResult: input.deleteResult,
    providerCall: "none",
    persistence: "explicit-local",
    autoInjected: false,
    evidence: [
      ...input.input.request.evidence,
      ...input.health.evidence,
      ...(input.evidence ?? []),
      "project-memory-delete-command-runner:explicit-user-action",
      "project-memory-delete-command-runner:no-provider-call",
      "project-memory-delete-command-runner:no-auto-cleanup",
      "project-memory-delete-command-runner:no-auto-injection",
    ],
  };
}

function disabledStoreHealth(): ProjectMemoryStoreHealth {
  return {
    mode: "disabled",
    ok: true,
    writable: false,
    detail: "No explicit local memory store configured.",
    evidence: [
      "project-memory-delete-command-runner:store-disabled",
      "project-memory-delete-command-runner:no-default-path",
    ],
  };
}
