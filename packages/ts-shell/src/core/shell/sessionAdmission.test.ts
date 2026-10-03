import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCompactCommand } from "../../context/compact/command/compactCommandRunner.js";
import { createCompactLiveCheckpointStore, updateLatestCompactCheckpoint } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { createCompactInjectionStateStore } from "../../context/compact/injection/compactInjectionState.js";
import { runCliRuntimeInvocation, type CliRuntimeInvocationDependencies } from "../../entrypoints/cliRuntimeInvocation.js";
import { createProviderReadinessCliTerminalEvent } from "../../entrypoints/providerReadinessCliSurface.js";
import { createProjectMemoryInjectionStateStore } from "../../memory/projectMemoryInjectionState.js";
import { createProjectMemoryLocalStore } from "../../memory/projectMemoryLocalStore.js";
import { HookDispatcher } from "../hooks/hookDispatcher.js";
import type { QueryEvent } from "../query/runtime/events.js";
import { checkRealProviderReadiness } from "./providerReadiness.js";
import { buildPromptWithFutureTurnInjections } from "./sessionFutureTurnProjection.js";
import { ShellSessionRuntime } from "./sessionRuntime.js";

const sessionId = "admission";
const sessionScopeId = `session:${sessionId}`;
const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-admission-"));
  roots.push(root);
  const compactCheckpointStore = createCompactLiveCheckpointStore();
  const compactInjectionStateStore = createCompactInjectionStateStore();
  const checkpoint = updateLatestCompactCheckpoint(compactCheckpointStore, {
    sessionScopeId, sourceCommand: "/compact",
    result: runCompactCommand({
      mode: "render", source: "route", generatedAt: "2026-10-03T00:00:00.000Z",
      taskGoal: { objective: "Inspect the saved compact context." },
      routeInfo: { name: "Prompt admission", nextAction: "Inspect the requested file." },
    }),
  });
  const compactPending = { sessionScopeId, sourceCommand: "/compact" as const, checkpointId: checkpoint.checkpointId };
  compactInjectionStateStore.markPending(compactPending);
  const projectMemoryStore = createProjectMemoryLocalStore({ ref: { mode: "test-only", root: path.join(root, "memory") } });
  const written = await projectMemoryStore.write({
    storeRef: projectMemoryStore.ref,
    record: {
      id: "pmr:admission", version: 1, createdAt: "2026-10-03T00:00:00.000Z",
      candidateId: "pmc:admission", candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
      approvedAt: "2026-10-03T00:00:00.000Z", approvedBySourceCommand: "/memory",
      memoryText: "Inspect the saved project memory.", evidence: ["test-fixture"],
      source: "system-derived", routeReferences: [], safety: "safe", redactions: [],
    },
  });
  expect(written.written).toBe(true);
  const projectMemoryInjectionStateStore = createProjectMemoryInjectionStateStore({ sessionCapacity: 1 });
  const memoryPending = { sessionScopeId, sourceCommand: "/memory use" as const, mode: "wake" as const, recordIds: ["pmr:admission"] };
  projectMemoryInjectionStateStore.markPending(memoryPending);
  const injections = { compactCheckpointStore, compactInjectionStateStore, projectMemoryStore, projectMemoryInjectionStateStore };
  const snapshots = () => [compactInjectionStateStore.get(sessionScopeId), projectMemoryInjectionStateStore.get(sessionScopeId)];
  const hooks = new HookDispatcher();
  const events: QueryEvent[] = [];
  const rendered: string[] = [];
  const model = { fails: false, prompts: [] as string[], states: [] as string[][] };
  const dependencies: CliRuntimeInvocationDependencies = {
    checkProviderReadiness: async () => ({ ok: true }),
    createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent,
    hooks, tools: () => new Map(),
    createStep: () => async (messages) => {
      model.prompts.push(JSON.stringify(messages));
      model.states.push(snapshots().map(state => state.injectionStatus));
      return model.fails
        ? { text: "", toolCalls: [], stopReason: "error", errorMessage: "provider refused the request" }
        : { text: "answer", toolCalls: [], stopReason: "stop" };
    },
  };
  const manager = {
    persistUserPromptBarrier: vi.fn(), markTurnActive: vi.fn(), markRecoveryReentry: vi.fn(),
    appendQueryEvent: vi.fn((_id: string, event: QueryEvent) => { events.push(event); }),
    saveCompleted: vi.fn(), saveInterrupted: vi.fn(), saveError: vi.fn(),
  };
  const runtime = new ShellSessionRuntime({
    ...injections, sessionManager: manager as never,
    renderer: { renderLine(line: string) { rendered.push(line); }, renderChunk(chunk: string) { rendered.push(chunk); } } as never,
    runPrompt: async function* (prompt, signal, _seed, _snapshot, _attachments, _context, onPromptAccepted) {
      const run = await runCliRuntimeInvocation({
        sessionId, prompt, signal, onPromptAccepted, workspaceRoot: root,
        providerModeEnv: "real", agentMode: "plan", maxTurns: 1, skillOptions: { noSkills: true },
        providerCredentialResolution: {
          provider: "openai", expectedEnvVarName: "OPENAI_API_KEY",
          credential: { provider: "openai", authMode: "api-key", apiKey: "test-key", source: "cli", envVarName: "OPENAI_API_KEY" },
        },
        escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: "deny", respondedAt: 1 }),
      }, dependencies);
      yield* run.events;
    },
  });
  const prepare = () => buildPromptWithFutureTurnInjections({ deps: injections, sessionId, prompt: "inspect notes" });
  return { ...injections, compactPending, memoryPending, snapshots, hooks, events, rendered, model, manager, dependencies, runtime, prepare };
}

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

describe("prompt admission", () => {
  it("retains both pending contexts after a prompt barrier failure and injects them on retry", async () => {
    const f = await fixture();
    const pending = f.snapshots();
    f.manager.persistUserPromptBarrier.mockImplementationOnce(() => { throw new Error("barrier unavailable"); });
    await expect(f.runtime.executePrompt(sessionId, "inspect notes")).rejects.toThrow("barrier unavailable");
    expect(f.snapshots()).toEqual(pending);
    expect(f.events).not.toContainEqual(expect.objectContaining({ type: "query.started" }));
    expect(f.model.prompts).toEqual([]);
    await f.runtime.executePrompt(sessionId, "inspect notes");
    expect(f.model.prompts[0]).toContain("<compact_v2_injected_context>");
    expect(f.model.prompts[0]).toContain("<project_memory_context>");
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
  });

  it("retains both contexts after the production readiness gate refuses a missing key", async () => {
    const f = await fixture();
    const pending = f.snapshots();
    vi.spyOn(f.dependencies, "checkProviderReadiness").mockImplementationOnce(options =>
      checkRealProviderReadiness({ ...options, apiKey: "" }));
    await f.runtime.executePrompt(sessionId, "inspect notes");
    expect(f.snapshots()).toEqual(pending);
    expect(f.model.prompts).toEqual([]);
    expect(f.events).toEqual([expect.objectContaining({ type: "query.completed", result: expect.objectContaining({ status: "stopped_error" }) })]);
    expect(f.manager.saveCompleted).not.toHaveBeenCalled();
    await f.runtime.executePrompt(sessionId, "retry");
    expect(f.model.prompts[0]).toContain("<project_memory_context>");
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
  });

  it.each(["SessionStart", "UserPromptSubmit"] as const)("retains both contexts when %s dispatch rejects", async eventName => {
    const f = await fixture();
    const pending = f.snapshots();
    const dispatch = f.hooks.dispatch.bind(f.hooks);
    const rejection = vi.spyOn(f.hooks, "dispatch").mockImplementation(async event => {
      if (event.eventName === eventName) throw new Error("startup dispatch failed");
      return dispatch(event);
    });
    await expect(f.runtime.executePrompt(sessionId, "inspect notes")).rejects.toThrow("startup dispatch failed");
    expect(f.events[0]?.type).toBe("query.started");
    expect(f.snapshots()).toEqual(pending);
    expect(f.model.prompts).toEqual([]);
    rejection.mockRestore();
    await f.runtime.executePrompt(sessionId, "retry");
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
  });

  it.each(["SessionStart", "UserPromptSubmit"] as const)("retains both contexts when an asynchronous %s hook cancels", async event => {
    const f = await fixture();
    const pending = f.snapshots();
    f.hooks.registerInProcessHook({ event, handler: async () => { await Promise.resolve(); f.runtime.cancelCurrentRun(); } });
    await expect(f.runtime.executePrompt(sessionId, "inspect notes")).rejects.toThrow("without a terminal event");
    expect(f.events[0]?.type).toBe("query.started");
    expect(f.snapshots()).toEqual(pending);
    expect(f.model.prompts).toEqual([]);
    expect(f.manager.saveInterrupted).toHaveBeenCalled();
    expect(f.manager.saveCompleted).not.toHaveBeenCalled();
    expect(f.rendered.join("\n")).not.toContain("Outcome: success");
    f.hooks.clear();
    await f.runtime.executePrompt(sessionId, "retry");
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
  });

  it.each([
    ["SessionStart", "block"], ["SessionStart", "retry"],
    ["UserPromptSubmit", "block"], ["UserPromptSubmit", "retry"],
  ] as const)("honors an explicit %s hook %s before consuming or calling the model", async (event, decision) => {
    const f = await fixture();
    const pending = f.snapshots();
    let refused = true;
    const promptHook = vi.fn();
    f.hooks.registerInProcessHook({ event, handler: () => refused
      ? { decision, ...(decision === "block" ? { reason: "startup refused" } : { feedback: "startup refused" }) }
      : { decision: "allow" },
    });
    f.hooks.registerInProcessHook({ event: "UserPromptSubmit", handler: promptHook });
    await expect(f.runtime.executePrompt(sessionId, "inspect notes")).rejects.toThrow(`${event} hook ${decision}: startup refused`);
    expect(f.snapshots()).toEqual(pending);
    expect(f.model.prompts).toEqual([]);
    expect(f.events).toContainEqual(expect.objectContaining({ type: "query.failed", error: `${event} hook ${decision}: startup refused` }));
    expect(f.manager.saveCompleted).not.toHaveBeenCalled();
    expect(promptHook).not.toHaveBeenCalled();
    refused = false;
    await f.runtime.executePrompt(sessionId, "retry after resolving hook refusal");
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
  });

  it.each([false, true])("consumes once on actual admission, including later provider failure (%s)", async fails => {
    const f = await fixture();
    f.model.fails = fails;
    const run = f.runtime.executePrompt(sessionId, "inspect notes");
    if (fails) await expect(run).rejects.toThrow("provider refused");
    else await run;
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
    expect(f.model.prompts[0]).toContain("<compact_v2_injected_context>");
    expect(f.model.prompts[0]).toContain("<project_memory_context>");
    f.model.fails = false;
    await f.runtime.executePrompt(sessionId, "second prompt");
    expect(f.model.prompts[1]).not.toContain("injected_context");
    expect(f.model.prompts[1]).not.toContain("<project_memory_context>");
    expect(f.compactInjectionStateStore.get(sessionScopeId).injectionCount).toBe(1);
  });

  it.each(["compact rearm", "memory replacement", "memory eviction"])("rejects a draft changed during memory retrieval: %s", async change => {
    const f = await fixture();
    const pending = f.snapshots();
    const gate = latch();
    const health = f.projectMemoryStore.health.bind(f.projectMemoryStore);
    vi.spyOn(f.projectMemoryStore, "health").mockImplementationOnce(async () => { await gate.promise; return health(); });
    const draft = f.prepare();
    if (change === "compact rearm") f.compactInjectionStateStore.markPending(f.compactPending);
    else f.projectMemoryInjectionStateStore.markPending({ ...f.memoryPending, ...(change === "memory eviction" ? { sessionScopeId: "other" } : {}) });
    gate.release();
    await expect(draft).rejects.toThrow("context changed before admission");
    expect(f.compactInjectionStateStore.get(sessionScopeId).injectionStatus).toBe("pending");
    expect(f.projectMemoryInjectionStateStore.get(change === "memory eviction" ? "other" : sessionScopeId).injectionStatus).toBe("pending");
    if (change === "compact rearm") expect(f.snapshots()[1]).toBe(pending[1]);
    else expect(f.snapshots()[0]).toBe(pending[0]);
  });

  it.each(["compact", "memory"])("rejects a draft when %s is replaced during readiness without consuming either component", async component => {
    const f = await fixture();
    const reached = latch();
    const gate = latch();
    vi.spyOn(f.dependencies, "checkProviderReadiness").mockImplementationOnce(async () => {
      reached.release(); await gate.promise; return { ok: true };
    });
    const run = f.runtime.executePrompt(sessionId, "inspect notes");
    await reached.promise;
    if (component === "compact") f.compactInjectionStateStore.markPending(f.compactPending);
    else f.projectMemoryInjectionStateStore.markPending(f.memoryPending);
    const replacement = f.snapshots();
    gate.release();
    await expect(run).rejects.toThrow("context changed before admission");
    expect(f.snapshots()).toEqual(replacement);
    expect(f.snapshots().map(state => state.injectionStatus)).toEqual(["pending", "pending"]);
    expect(f.model.prompts).toEqual([]);
    await f.runtime.executePrompt(sessionId, "retry");
    expect(f.model.states).toEqual([["consumed", "consumed"]]);
  });

  it("accepts a prepared prompt only once", async () => {
    const f = await fixture();
    const prepared = await f.prepare();
    expect(f.snapshots().map(state => state.injectionStatus)).toEqual(["pending", "pending"]);
    prepared.accept();
    const consumed = f.snapshots();
    prepared.accept();
    expect(f.snapshots()).toEqual(consumed);
    expect(f.compactInjectionStateStore.get(sessionScopeId).injectionCount).toBe(1);
  });

  it.each(["compact", "memory"])("defers an invalid %s disposition until admission", async component => {
    const f = await fixture();
    if (component === "memory") {
      await f.projectMemoryStore.delete?.({
        recordId: "pmr:admission", deletedAt: "2026-10-03T01:00:00.000Z", sourceCommand: "/memory", reason: "obsolete",
      });
    } else {
      const result = runCompactCommand({ mode: "render", source: "route" });
      f.compactCheckpointStore.updateLatest({
        ...f.compactPending,
        result: { ...result, packet: {
          ...result.packet,
          taskGoal: { ...result.packet.taskGoal, objective: undefined, nextAction: undefined },
          route: { ...result.packet.route, objective: undefined, nextAction: undefined },
          editCapability: { ...result.packet.editCapability, closeoutStatus: undefined, blockedByDesign: [] },
        } },
      });
    }
    const pending = f.snapshots();
    f.manager.persistUserPromptBarrier.mockImplementationOnce(() => { throw new Error("barrier unavailable"); });
    await expect(f.runtime.executePrompt(sessionId, "inspect notes")).rejects.toThrow("barrier unavailable");
    expect(f.snapshots()).toEqual(pending);
    await f.runtime.executePrompt(sessionId, "retry");
    expect(f.model.states).toEqual([component === "memory" ? ["consumed", "invalid"] : ["invalid", "consumed"]]);
    expect(f.model.prompts[0]).not.toContain(component === "memory" ? "<project_memory_context>" : "<compact_v2_injected_context>");
  });

  it("rejects a replaced compact checkpoint even when its pending state was not rearmed", async () => {
    const f = await fixture();
    const prepared = await f.prepare();
    const pending = f.snapshots();
    f.compactCheckpointStore.updateLatest({
      sessionScopeId, sourceCommand: "/compact", checkpointId: f.compactPending.checkpointId,
      result: runCompactCommand({ mode: "render", source: "route", taskGoal: { objective: "A changed objective." } }),
    });
    expect(() => prepared.accept()).toThrow("context changed before admission");
    expect(f.snapshots()).toEqual(pending);
  });

  it("leaves newly staged context pending during runtime reentry", async () => {
    const f = await fixture();
    const pending = f.snapshots();
    await f.runtime.executePrompt(sessionId, "resume existing run", {
      runtimeSeed: { recoveryBoundary: "mid-turn-reentry" } as never,
    });
    expect(f.snapshots()).toEqual(pending);
    expect(f.model.prompts[0]).not.toContain("injected_context");
    expect(f.model.prompts[0]).not.toContain("<project_memory_context>");
    expect(f.manager.persistUserPromptBarrier).not.toHaveBeenCalled();
    expect(f.manager.markRecoveryReentry).toHaveBeenCalledWith(sessionId, "mid-turn-reentry");
  });
});
