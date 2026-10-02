import { readProjectMemoryHealth } from "./store/health.js";
import type { ProjectMemoryRecallCommandRequest } from "./projectMemoryRecallCommandContract.js";
import { retrieveProjectMemoryRecords } from "./projectMemoryRetrieval.js";
import { buildProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";
import type {
  ProjectMemoryStore,
  ProjectMemoryStoreHealth,
} from "./projectMemoryStoreContract.js";
import { renderProjectMemoryRecallSurface } from "./projectMemoryRecallSurface.js";

export type ProjectMemoryRecallCommandOutcome =
  | "recalled"
  | "wakeup-preview"
  | "blocked";

export interface RunProjectMemoryRecallCommandInput {
  readonly request: ProjectMemoryRecallCommandRequest;
  readonly memoryStore?: ProjectMemoryStore;
}

export interface ProjectMemoryRecallCommandResult {
  readonly outcome: ProjectMemoryRecallCommandOutcome;
  readonly output: string;
  readonly providerCall: "none";
  readonly persistence: "none";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

export async function runProjectMemoryRecallCommand(
  input: RunProjectMemoryRecallCommandInput,
): Promise<ProjectMemoryRecallCommandResult> {
  const health = await readProjectMemoryHealth(input.memoryStore, "project-memory-recall-command-runner");
  if (!input.memoryStore || !(health.readable ?? health.writable)) {
    return buildResult({
      input,
      health,
      outcome: "blocked",
      blocker: "Explicit local memory store root is required for recall.",
    });
  }
  if (input.request.mode === "wake") {
    const wakeup = await buildProjectMemoryWakeupPreview(input.memoryStore);
    return buildResult({
      input,
      health,
      outcome: "wakeup-preview",
      wakeup,
      evidence: wakeup.evidence,
    });
  }

  const retrieval = await retrieveProjectMemoryRecords(input.memoryStore, {
    query: input.request.query,
    filters: {
      candidateKind: input.request.candidateKind,
      retentionClass: input.request.retentionClass,
      source: input.request.source,
    },
    maxResults: input.request.maxResults,
  });
  return buildResult({
    input,
    health,
    outcome: "recalled",
    retrieval,
    evidence: retrieval.evidence,
  });
}

function buildResult(input: {
  readonly input: RunProjectMemoryRecallCommandInput;
  readonly health: ProjectMemoryStoreHealth;
  readonly outcome: ProjectMemoryRecallCommandOutcome;
  readonly retrieval?: Awaited<ReturnType<typeof retrieveProjectMemoryRecords>>;
  readonly wakeup?: Awaited<ReturnType<typeof buildProjectMemoryWakeupPreview>>;
  readonly blocker?: string;
  readonly evidence?: readonly string[];
}): ProjectMemoryRecallCommandResult {
  return {
    outcome: input.outcome,
    output: renderProjectMemoryRecallSurface({
      request: input.input.request,
      outcome: input.outcome,
      health: input.health,
      retrieval: input.retrieval,
      wakeup: input.wakeup,
      blocker: input.blocker,
    }),
    providerCall: "none",
    persistence: "none",
    autoInjected: false,
    evidence: [
      ...input.input.request.evidence,
      ...input.health.evidence,
      ...(input.evidence ?? []),
      "project-memory-recall-command-runner:no-provider-call",
      "project-memory-recall-command-runner:no-persistence-write",
      "project-memory-recall-command-runner:no-auto-injection",
    ],
  };
}
