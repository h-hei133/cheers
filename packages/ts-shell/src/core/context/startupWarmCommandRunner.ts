import type { ProjectMemoryStore } from "./projectMemoryStoreContract.js";
import { buildStartupWarmContext } from "./startupWarmContextBuilder.js";
import type { StartupWarmCommandRequest } from "./startupWarmCommandContract.js";
import { renderStartupWarmContextSurface } from "./startupWarmContextSurface.js";
import type {
  StartupWarmContextCacheHealth,
  StartupWarmContextCacheStore,
} from "./startupWarmContextHealth.js";

export interface RunStartupWarmCommandInput {
  readonly request: StartupWarmCommandRequest;
  readonly projectRoot: string;
  readonly cacheStore?: StartupWarmContextCacheStore;
  readonly memoryStore?: ProjectMemoryStore;
  readonly now?: () => string;
}

export interface StartupWarmCommandResult {
  readonly outcome: "status" | "rebuilt" | "blocked";
  readonly output: string;
  readonly providerCall: "none";
  readonly futureTurnInjection: "none";
  readonly evidence: readonly string[];
}

export async function runStartupWarmCommand(
  input: RunStartupWarmCommandInput,
): Promise<StartupWarmCommandResult> {
  const health = input.cacheStore
    ? await input.cacheStore.health()
    : disabledHealth();
  if (!input.cacheStore) {
    if (input.request.mode === "status") {
      return result(input, {
        outcome: "status",
        health,
      });
    }
    return result(input, {
      outcome: "blocked",
      health,
      blocker: "Explicit local startup warm cache store is required.",
    });
  }
  if (input.request.mode === "status") {
    const read = await input.cacheStore.read();
    return result(input, {
      outcome: "status",
      health: await input.cacheStore.health(),
      read,
    });
  }
  if (!health.writable) {
    return result(input, {
      outcome: "blocked",
      health,
      blocker: "Startup warm cache rebuild requires an explicit writable cache root.",
    });
  }
  const built = await buildStartupWarmContext({
    projectRoot: input.projectRoot,
    cacheMode: input.cacheStore.ref.mode,
    createdAt: input.now ? input.now() : new Date().toISOString(),
    memoryStore: input.memoryStore,
    compactSummary: "Compact v2 summary source is safe-summary-only when supplied by route/session code.",
    validationEvidence: ["warmup-command:rebuild-explicit"],
    routePhase: {
      summary: "Startup warm context cache prototype is local, discardable, and not auto-injected.",
      nextAction: "Inspect status; defer startup auto-load and sidebar integration.",
      evidence: ["route87:warmup-command"],
    },
  });
  const write = await input.cacheStore.write(built.cache);
  return result(input, {
    outcome: write.written ? "rebuilt" : "blocked",
    health: await input.cacheStore.health(),
    write,
    blocker: write.blocker,
    extraEvidence: built.evidence,
  });
}

function result(
  input: RunStartupWarmCommandInput,
  data: {
    readonly outcome: StartupWarmCommandResult["outcome"];
    readonly health: StartupWarmContextCacheHealth;
    readonly read?: Awaited<ReturnType<StartupWarmContextCacheStore["read"]>>;
    readonly write?: Awaited<ReturnType<StartupWarmContextCacheStore["write"]>>;
    readonly blocker?: string;
    readonly extraEvidence?: readonly string[];
  },
): StartupWarmCommandResult {
  return {
    outcome: data.outcome,
    output: renderStartupWarmContextSurface({
      outcome: data.outcome,
      health: data.health,
      read: data.read,
      write: data.write,
      blocker: data.blocker,
    }),
    providerCall: "none",
    futureTurnInjection: "none",
    evidence: [
      ...input.request.evidence,
      ...data.health.evidence,
      ...(data.read?.evidence ?? []),
      ...(data.write?.evidence ?? []),
      ...(data.extraEvidence ?? []),
      "startup-warm-command-runner:no-provider-call",
      "startup-warm-command-runner:no-model-injection",
      "startup-warm-command-runner:no-future-turn-injection",
      "startup-warm-command-runner:no-session-schema-change",
    ],
  };
}

function disabledHealth(): StartupWarmContextCacheHealth {
  return {
    mode: "disabled",
    ok: true,
    writable: false,
    found: false,
    staleness: "unknown",
    detail: "No startup warm cache store configured.",
    evidence: [
      "startup-warm-command-runner:store-disabled",
      "startup-warm-command-runner:no-default-path",
    ],
  };
}
