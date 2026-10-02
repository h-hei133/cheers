import type { ProjectMemoryStore } from "../../memory/projectMemoryStoreContract.js";
import path from "node:path";
import { projectStartupWarmContextCacheHealth } from "./startupWarmContextHealth.js";
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
  if (!input.cacheStore) {
    if (input.request.mode === "status") {
      return result(input, {
        outcome: "status",
        health: disabledHealth(),
      });
    }
    return result(input, {
      outcome: "blocked",
      health: disabledHealth(),
      blocker: "Explicit local startup warm cache store is required.",
    });
  }
  if (input.cacheStore.ref.projectRoot && path.resolve(input.cacheStore.ref.projectRoot) !== path.resolve(input.projectRoot)) {
    return result(input, { outcome: "blocked", health: disabledHealth(), blocker: "Startup warm cache belongs to a different project." });
  }
  if (input.request.mode === "status") {
    const read = await input.cacheStore.read();
    return result(input, {
      outcome: read.blocker ? "blocked" : "status",
      health: projectStartupWarmContextCacheHealth(input.cacheStore.ref, read),
      read,
      blocker: read.blocker,
    });
  }
  const health = await input.cacheStore.health();
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
  });
  const write = await input.cacheStore.write(built.cache);
  const read = await input.cacheStore.read({ currentSourceSignature: built.cache.sourceSummary.sourceSignature });
  const verified = write.written && read.found && read.staleness === "fresh";
  return result(input, {
    outcome: verified ? "rebuilt" : "blocked",
    health: projectStartupWarmContextCacheHealth(input.cacheStore.ref, read),
    write,
    read,
    blocker: verified ? undefined : write.blocker ?? read.blocker ?? "The rebuilt cache could not be verified.",
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
