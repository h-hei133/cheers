import path from "node:path";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { switchActiveSession } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { TurnInput } from "../../turn/session.js";
import type { SubmissionQueue } from "../interactive/inputQueue.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { readModelCatalog } from "../../core/commands/modelCommandRuntime.js";
import { setModel } from "../../core/commands/model/selection.js";
import { modelRequest } from "../../core/commands/model/target.js";
import { captureThinkingPreference } from "../../core/models/preference.js";
import { thinkingSyntax } from "../../core/commands/thinking/syntax.js";
import { costModel } from "../../core/commands/cost/model.js";
import { loadCatalog } from "../../core/models/catalogStore.js";
import { listVisibleCommands } from "../../core/commands/registry.js";
import { getSessionUsage } from "../../observability/usageTelemetry.js";
import { readSessionNavigationAsync } from "../../session/query/navigation.js";
import { readSessionEntries, readSessionTree } from "../../session/query/sessionEntries.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../../session/store/sessionFileLayout.js";
import { readTranscriptEvents } from "../../session/transcript/sessionTranscript.js";
import { loadSessionRecord } from "../../session/store/sessionStore.js";
import { readSessionThreadSnapshot } from "../../session/store/threadState.js";
import { messageToText } from "../../model-adapters/multimodal.js";
import { configurationAdmission } from "../../core/shell/configuration.js";
import { openSettings } from "../interactive/settings.js";
import { navigateSession } from "../runtime/navigation.js";
import { readLogicalModel } from '../../session/model/logical.js';
import { sessionModelCatalog } from '../../core/catalog/models.js';

export const THINKING_LEVELS = thinkingSyntax.actions
  .map(action => action.name)
  .filter((name): name is string => name.length > 0);

const SESSION_ARTIFACT_FILES = new Set(["metadata", "state", "transcript"]);

export function resolveSessionTargetId(sessionPath: string): string {
  const cleaned = sessionPath.replace(/[\\/]+$/, "");
  const base = path.basename(cleaned, path.extname(cleaned));
  if (SESSION_ARTIFACT_FILES.has(base)) {
    const parent = path.basename(path.dirname(cleaned));
    if (parent && parent !== ".") return parent;
  }
  return base || cleaned;
}

export function buildRpcCommandContext(runtimeContext: ShellRuntimeContext) {
  return {
    cwd: runtimeContext.cwd,
    projectRoot: runtimeContext.projectRoot,
    sessionId: runtimeContext.session.id,
    runtimeConfig: runtimeContext.runtimeConfig,
    admission: configurationAdmission(runtimeContext),
    logicalModelAdmission: configurationAdmission(runtimeContext, { deferredModel: true }),
    resolveConfigTarget: runtimeContext.resolveConfigTarget,
    readConfiguration: () => ({
      config: runtimeContext.configuration.current.config,
      catalog: runtimeContext.configuration.current.catalog,
    }),
  };
}

export function assertModelApplied(output: string): string {
  if (!output.startsWith("Model switched to ") && !output.startsWith("Model preference saved for ")) {
    throw new Error(output);
  }
  return output;
}

export async function saveRpcSetting(runtimeContext: ShellRuntimeContext, key: string, value: unknown): Promise<void> {
  const draft = openSettings(runtimeContext, () => undefined, "user");
  const result = await draft.save(key, value);
  if (!result.applied) throw new Error(result.note);
}

export function readRpcSessionStats(session: Session): Record<string, unknown> {
  const usage = getSessionUsage(session.id);
  const model = costModel(usage, loadCatalog());
  const turns = session.turns;
  return {
    sessionId: session.id,
    userMessages: turns.filter(t => t.role === "user").length,
    assistantMessages: turns.filter(t => t.role === "assistant").length,
    toolResults: turns.filter(t => t.role === "tool").length,
    totalMessages: turns.length,
    ...model,
  };
}

export function readLastAssistantText(session: Session): string | null {
  for (let i = session.turns.length - 1; i >= 0; i -= 1) {
    const turn = session.turns[i];
    if (turn?.role === "assistant") return messageToText(turn.content);
  }
  return null;
}

export async function cycleRpcModel(runtimeContext: ShellRuntimeContext): Promise<Record<string, unknown> | null> {
  const ctx = buildRpcCommandContext(runtimeContext);
  const catalog = await readModelCatalog(false, runtimeContext.session.id, runtimeContext.runtimeConfig, ctx);
  const addressed = [...catalog.models.map(id => ({ provider: catalog.provider as string, id })),
    ...(catalog.virtual ?? []).map(model => ({ provider: model.provider, id: model.id }))];
  const scoped = runtimeContext.scopedModels;
  const candidates = scoped?.length
    ? addressed.filter(({ provider, id }) =>
        scoped.some((pattern) => {
          const p = pattern.trim().toLowerCase();
          return p.includes('/') ? `${provider}/${id}`.toLowerCase() === p : id.toLowerCase().includes(p);
        }),
      )
    : addressed;
  const pool = candidates.length > 0 ? candidates : addressed;
  if (pool.length === 0) return null;
  const active = modelRequest(ctx, runtimeContext.runtimeConfig);
  const current = catalog.logical ? `${catalog.logical.provider}/${catalog.logical.model}` : `${catalog.provider}/${catalog.active ?? active.model}`;
  const idx = pool.findIndex(model => `${model.provider}/${model.id}` === current);
  const nextModel = pool[(idx + 1) % pool.length]!;
  const note = assertModelApplied(await setModel([`${nextModel.provider}/${nextModel.id}`], ctx, false));
  return { model: nextModel, note };
}

export async function setRpcThinking(runtimeContext: ShellRuntimeContext, level: string): Promise<{ readonly level: string }> {
  const action = thinkingSyntax.actions.find(item => item.name === level || item.aliases?.includes(level));
  if (!action || action.effort === undefined) throw new Error(`Unknown thinking level '${level}'.`);
  assertModelApplied(await setModel([], buildRpcCommandContext(runtimeContext), false, action.effort));
  return { level: action.effort ?? "auto" };
}

export async function cycleRpcThinking(runtimeContext: ShellRuntimeContext): Promise<{ readonly level: string } | null> {
  const ctx = buildRpcCommandContext(runtimeContext);
  const active = modelRequest(ctx, runtimeContext.runtimeConfig);
  const logical = readLogicalModel(runtimeContext.session.id);
  const current = (logical ? logical.thinkingEffort : captureThinkingPreference(runtimeContext.projectRoot, active.thinkingEffort).thinkingEffort) ?? "off";
  const idx = THINKING_LEVELS.indexOf(current);
  const nextName = THINKING_LEVELS[(idx + 1) % THINKING_LEVELS.length]!;
  const action = thinkingSyntax.actions.find(item => item.name === nextName);
  if (!action || action.effort === undefined) return null;
  assertModelApplied(await setModel([], ctx, false, action.effort));
  return { level: action.effort ?? "auto" };
}

export async function readRpcEntries(runtimeContext: ShellRuntimeContext, since?: string | number): Promise<Record<string, unknown>> {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), runtimeContext.session.id);
  const events = readTranscriptEvents(layout.transcriptPath);
  const session = loadSessionRecord({ sessionId: runtimeContext.session.id, layout, cwd: runtimeContext.cwd });
  const thread = readSessionThreadSnapshot({ session, layout });
  const leafId = thread.activeLeafId ?? null;
  if (typeof since === "number") {
    const result = readSessionEntries(events, leafId);
    if (result === "unknown-cursor") throw new Error("Unknown session entry cursor.");
    return { entries: result.entries.slice(Math.max(0, Math.floor(since))), leafId: result.leafId };
  }
  const result = readSessionEntries(events, leafId, since);
  if (result === "unknown-cursor") throw new Error("Unknown session entry cursor.");
  return { entries: result.entries, leafId: result.leafId };
}

export async function readRpcTree(runtimeContext: ShellRuntimeContext): Promise<Record<string, unknown>> {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), runtimeContext.session.id);
  const session = loadSessionRecord({ sessionId: runtimeContext.session.id, layout, cwd: runtimeContext.cwd });
  const snapshot = readSessionThreadSnapshot({ session, layout });
  const tree = readSessionTree(snapshot.entries);
  if (tree === "unknown-cursor") throw new Error("Session tree unavailable.");
  return { tree, leafId: snapshot.activeLeafId };
}

export async function readRpcForkMessages(runtimeContext: ShellRuntimeContext): Promise<readonly { readonly entryId: string; readonly text: string }[]> {
  const nav = await readSessionNavigationAsync(runtimeContext.session.id, runtimeContext.cwd);
  return nav.points.map(point => ({ entryId: point.entryId, text: point.prompt ?? "" }));
}

export function listRpcModels(runtimeContext?: ShellRuntimeContext): readonly Record<string, unknown>[] {
  const catalog = runtimeContext ? sessionModelCatalog(runtimeContext.cwd, runtimeContext.session.id, runtimeContext.configuration.current.catalog)
    : { physical: loadCatalog(), virtual: [] };
  return [...catalog.physical.flatMap(provider => provider.models.map(model => ({
    provider: provider.id,
    id: model.id,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }))), ...catalog.virtual.map(model => ({ provider: model.provider, id: model.id, virtual: true,
    contextWindow: model.contextWindow, maxTokens: model.maxTokens }))];
}

export function listRpcCommands(runtimeContext: ShellRuntimeContext): readonly Record<string, unknown>[] {
  return listVisibleCommands(runtimeContext.cwd, runtimeContext.runtimeConfig).map(cmd => ({
    name: cmd.name,
    description: cmd.summary,
    ...(cmd.aliases ? { aliases: cmd.aliases } : {}),
  }));
}

export function applyRpcSessionSwitch(
  runtimeContext: ShellRuntimeContext,
  nextSession: Session,
  switchSession?: (session: Session) => boolean,
): boolean {
  if (switchSession) {
    return switchSession(nextSession);
  } else {
    switchActiveSession(runtimeContext, nextSession, nextSession.projectRoot,
      { cwd: nextSession.projectRoot, projectRoot: nextSession.projectRoot });
    return true;
  }
}

/** Snapshot and remove input from the same two live lanes and the host's submission queue. */
export function clearRpcQueue(input: TurnInput | undefined, queue: SubmissionQueue) {
  const pending = input?.pending() ?? { steering: [], followUps: [] };
  const activeRemoved = input?.clearQueue() ?? [];
  const removed = queue.splice(0);
  return { cleared: activeRemoved.length + removed.length, steering: pending.steering,
    followUp: [...pending.followUps, ...removed] };
}

/** Persist once, then apply only to the captured turn if its admission still holds. */
export async function setRpcQueueMode(runtimeContext: ShellRuntimeContext, sessionRuntime: ShellSessionRuntime,
  lane: 'steering' | 'followUp', mode: 'one-at-a-time' | 'all'): Promise<void> {
  const input = sessionRuntime.input?.();
  const admitted = configurationAdmission(runtimeContext);
  if (input && !input.setQueueMode) throw new Error('The active input queue cannot change its delivery mode.');
  await saveRpcSetting(runtimeContext, lane === 'steering' ? 'steeringMode' : 'followUpMode', mode);
  const refusal = admitted();
  if (refusal || input !== sessionRuntime.input?.()) {
    throw new Error(refusal ?? 'Queue mode was saved, but the active turn changed before it could be applied.');
  }
  input?.setQueueMode?.(lane, mode);
}

export function navigateRpcTree(
  runtimeContext: ShellRuntimeContext,
  manager: SessionManager,
  sessionRuntime: ShellSessionRuntime,
  entryId: string,
  expectedVersion?: string,
) {
  return navigateSession(
    { runtimeContext, sessionManager: manager, sessionRuntime },
    entryId,
    expectedVersion,
    configurationAdmission(runtimeContext),
  );
}

export function readRpcState(runtimeContext: ShellRuntimeContext, queueLength: number, isStreaming: boolean, session: Session) {
  const ctx = buildRpcCommandContext(runtimeContext);
  const active = modelRequest(ctx, runtimeContext.runtimeConfig);
  const thinking = captureThinkingPreference(runtimeContext.projectRoot, active.thinkingEffort);
  const logical = readLogicalModel(session.id);
  return {
    sessionId: session.id,
    workspaceRoot: runtimeContext.projectRoot,
    isStreaming,
    messageCount: session.turns.length,
    pendingMessageCount: queueLength,
    model: { provider: logical?.provider ?? active.provider, id: logical?.model ?? active.model },
    thinkingLevel: (logical ? logical.thinkingEffort : thinking.thinkingEffort) ?? "auto",
    steeringMode: runtimeContext.runtimeConfig.steeringMode ?? "one-at-a-time",
    followUpMode: runtimeContext.runtimeConfig.followUpMode ?? "one-at-a-time",
    ...(session.title ? { sessionName: session.title } : {}),
    autoCompactionEnabled: runtimeContext.runtimeConfig.compactionEnabled !== false,
    autoRetryEnabled: runtimeContext.runtimeConfig.retryEnabled !== false,
  };
}
