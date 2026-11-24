import path from 'node:path';
import type { PermissionScope } from "../core/shell/approval/scope.js";
import { boundText, TOOL_OUTPUT_LIMIT, type AgentTool, type AgentToolResult, type ToolHooks } from "../core/agent/tools.js";
import { OutputAccumulator } from "../core/tools/outputAccumulator.js";
import { DEFAULT_MAX_LINES } from "../core/tools/truncation.js";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import { buildToolEscalationPrompt, evaluateToolPermissionScope, planModeBlock } from "../core/query/toolPolicy.js";
import type { DenyRule } from "../core/shell/approval/deny.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { InteractiveAsk } from "../core/tools/ask/contract.js";
import { oneTimeApproval, type ApprovalInteraction, type EscalationPrompt, type EscalationResponse } from "../core/shell/approval/contract.js";
import { approvalCallBinding } from '../core/shell/approval/binding.js';
import type { ToolDefinition, ToolExecutionContext, ToolPreparation } from "../tools/types.js";
import type { SubagentRunner } from "../core/subagents/runner.js";
import { validateToolArguments } from "../core/tools/arguments.js";
import { workspaceToolBinding } from '../core/workspace/tools.js';
import type { WorkspaceRoot } from '../core/workspace/model.js';
import {
  authorizeToolCall,
  bindPreparedToolCall,
  consumeToolCall,
  discardToolCall,
  preparedSelection,
  preparedSelectionRevision,
  preparedToolCall,
  prepareToolCall,
  setPreparedSelection,
} from '../tools/preparation.js';
import { preparationContext, preparationPermission } from './preparation.js';
import { bindExecutionTarget, executionApprovalPreview } from '../runtime/execution/binding.js';
import { assertSourceAccess } from '../core/query/sourcePolicy.js';
import { assertArtifactSourceAccess } from '../core/session/artifacts/access.js';
import { EditOperationError } from '../edit/recovery/operation/write.js';
import { createComponentLogger } from "../observability/structuredLogger.js";
import { redactExportText, redactReportText } from '../core/security/redaction.js';
import type { ToolScopeBinding } from '../config/scope/tools.js';
import { bindToolScope, forgetToolScope, toolScopePolicy } from './scope.js';
import { authorizeFileAccess, bindFileAccess, captureFileAccess, fileAccessArguments, fileAccessOptions, fileAccessPrompt, forgetFileAccess, requireFileAccess } from './workspace.js';
import { createGatedNestedToolExecutor } from './nestedTools.js';
import { toolExecutionMode } from './execution.js';
import { getExtensionEventRunners } from '../core/hooks/extensionBridge.js';
import { collectToolResult, projectToolResult, scriptHookOutput } from './result.js';
import { currentScriptOutput } from '../core/hooks/script.js';
import { displayReportText } from '../core/commands/report/projection.js';
import { snapshotData } from '../core/values/data.js';
const traceLogger = createComponentLogger("tool-call");

/** A tool definition in the shape a chat completion request takes. */
export interface ToolSchema {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters: Record<string, unknown>;
  };
}

/**
 * The registry's tools as the kernel runs them.
 *
 * The kernel knows how to run a tool and pair its result; it does not know
 * what the user allowed, what mode the session is in, or which hooks want a
 * say. Those decisions live here, in front of every call, and the answer to
 * each is written into the tool result so the model learns why a call did not
 * run rather than seeing it silently skipped.
 */

export interface ToolGateOptions {
  readonly modelCatalog?: ToolExecutionContext['modelCatalog'];
  readonly configScope?: ToolScopeBinding;
  readonly background?: ToolExecutionContext['background'];
  readonly correlationId?: string;
  readonly commandProof?: import('../runtime/execution/proof.js').CommandProofObserver;
  /** Rechecked at each effect boundary, including after asynchronous approvals. */
  readonly admission?: () => string | undefined;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly agentMode?: "plan" | "build";
  readonly permissionScope?: PermissionScope;
  readonly hooks: HookDispatcher;
  readonly escalationPromptHandler?: (prompt: EscalationPrompt, interaction?: ApprovalInteraction) => Promise<EscalationResponse>;
  readonly interactiveAsk?: InteractiveAsk;
  /** Approval events, so a card can say it is waiting and how it was answered. */
  readonly emit: (event: QueryEvent) => void;
  /**
   * What a command the model runs should know about the session it runs in.
   *
   * Resolved once by whoever assembled the turn and handed down, because the
   * tool layer is where a command is built and the values are about the model
   * answering, not about this process.
   */
  readonly commandEnv?: Readonly<Record<string, string>>;
  /**
   * How to run a subagent, handed down so the delegating tool can reach it.
   *
   * Supplied by whoever assembled the turn, because running one needs the model
   * side and this layer has none of it. Absent means the tool cannot delegate.
   */
  readonly runSubagent?: SubagentRunner;
  /**
   * Tools this session refuses, whatever else says otherwise.
   *
   * Read from the run's configuration. Empty means nothing is refused, which is
   * what a session that declares no rules has always had.
   */
  readonly denyRules?: readonly DenyRule[];
}

/** Key the step runner uses to carry an argument parse failure into the call. */
export const PARSE_ERROR_KEY = "__parseError";

const SCHEMA_LIMITS = { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 46, sortKeys: true } as const;

/** The registry's schemas in the shape a chat completion request takes. */
export function toolSchemas(tools: ReadonlyMap<string, ToolDefinition>): readonly ToolSchema[] {
  const result: ToolSchema[] = [];
  for (const tool of tools.values()) {
    result.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: snapshotData(tool.argsSchema ?? { type: "object", properties: {} }, SCHEMA_LIMITS) as Record<string, unknown>,
      },
    });
  }
  return result;
}

/** Wrap every registry tool so the kernel can execute it. */
export function adaptTools(
  tools: ReadonlyMap<string, ToolDefinition>,
  options: ToolGateOptions,
): readonly AgentTool[] {
  const prepareArgsFor = (tool: ToolDefinition, args: unknown, signal: AbortSignal | undefined) => {
    const prepared = prepareArguments(tool.name, args);
    if (tool.validateArguments) tool.validateArguments(prepared);
    else validateToolArguments(tool.argsSchema, prepared);
    captureFileAccess(tool.name, prepared, options);
    if (!tool.prepare) return prepared;
    const context = preparationContext(tool.name, options, signal, prepared);
    let refusal: 'blocked' | 'failed' = 'failed';
    const verify = () => {
      signal?.throwIfAborted();
      const blocked = options.admission?.() ?? planModeBlock(options.agentMode, tool.name, prepared, tool);
      if (blocked) { refusal = 'blocked'; throw new Error(blocked); }
    };
    const refused = (error: unknown): never => {
      forgetFileAccess(prepared);
      tool.onRefusal?.(prepared, context, signal?.aborted && error === signal.reason ? 'cancelled' : refusal);
      throw error;
    };
    try {
      verify();
      const result = prepareToolCall(tool, prepared, context, options, verify);
      if (result instanceof Promise) return result.then(selected => { bindToolScope(prepared, selected, options); bindFileAccess(prepared, selected); return selected; }).catch(refused);
      bindToolScope(prepared, result, options);
      bindFileAccess(prepared, result);
      return result;
    } catch (error) { return refused(error); }
  };
  return [...tools.values()].map((tool) => ({
    name: tool.name,
    ...(toolExecutionMode(tool) ? { executionMode: toolExecutionMode(tool) } : {}),
    prepareArguments: (args, signal) => prepareArgsFor(tool, args, signal),
    execute: (toolCallId, args, signal, onUpdate) => {
      const nestedCatalog = tool.name === 'codemode' ? tool.nestedToolCatalog?.() ?? tools : undefined;
      const emitNested = (event: QueryEvent) => {
        if (event.type === 'approval.requested' || event.type === 'approval.resolved'
          || event.type === 'tool.started' || event.type === 'tool.result') {
          options.emit({ ...event, parentToolCallId: toolCallId });
        } else options.emit(event);
      };
      const executeNestedTool = nestedCatalog ? createGatedNestedToolExecutor({
            tools: nestedCatalog,
            parentToolCallId: toolCallId,
            emit: emitNested,
            hooks: createToolHooks(options, nestedCatalog, toolCallId, emitNested),
            prepare: (nestedTool, nestedArgs, nestedSignal) => prepareArgsFor(nestedTool, nestedArgs, nestedSignal),
            execute: (nestedTool, nestedCallId, nestedArgs, nestedSignal) =>
              executeTool(nestedTool, nestedCallId, nestedArgs, nestedSignal, options, { nested: true }),
            cleanup: (_nestedTool, nestedArgs) => {
              discardToolCall(nestedArgs);
              forgetToolScope(nestedArgs);
              forgetFileAccess(nestedArgs);
            },
          }, signal) : undefined;
      return executeTool(tool, toolCallId, args, signal, options, { onUpdate, executeNestedTool, nestedCatalog });
    },
  }));
}

function prepareArguments(toolName: string, args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error(`Error: Malformed JSON arguments for tool '${toolName}': arguments must be a JSON object.`);
  }
  const record = args as Record<string, unknown>;
  const parseError = record[PARSE_ERROR_KEY];
  if (typeof parseError === "string") {
    throw new Error(`Error: Malformed JSON arguments for tool '${toolName}': ${parseError}`);
  }
  return record;
}

async function executeTool(
  tool: ToolDefinition,
  toolCallId: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  options: ToolGateOptions,
  {
    onUpdate, executeNestedTool, nestedCatalog, nested = false,
  }: {
    onUpdate?: (partialResult: unknown) => void;
    executeNestedTool?: ToolExecutionContext['executeNestedTool'];
    nestedCatalog?: ReadonlyMap<string, ToolDefinition>;
    nested?: boolean;
  } = {},
): Promise<AgentToolResult> {
  let accumulator: OutputAccumulator | undefined;
  let settled = false;
  const snapshotStreamed = (): string | undefined => {
    settled = true;
    if (!accumulator) return undefined;
    accumulator.finish();
    const text = accumulator.snapshot().content;
    return text.length > 0 ? text : undefined;
  };
  const startedAt = Date.now();
  traceLogger.info("tool call started", { toolCallId, tool: tool.name, requestId: options.correlationId });
  try {
    const blocked = options.admission?.();
    if (blocked) throw new Error(blocked);
    if (tool.validateArguments) tool.validateArguments(args);
    else validateToolArguments(tool.argsSchema, args);
    toolScopePolicy(tool.name, args, options, preparedToolCall(args, options));
    requireFileAccess(args, toolCallId);
    const accessOptions = fileAccessOptions(tool.name, args, options);
    const binding = workspaceToolBinding(tool.name, fileAccessArguments(tool.name, args), options.workspaceRoot, accessOptions.workspaceRoots);
    const selection = preparedSelection(args);
    const selectionRevision = preparedSelectionRevision(args);
    const preparation = consumeToolCall(args, options, tool, toolCallId);
    const execute = preparation ? (_args: Record<string, unknown>, context: import('../tools/types.js').ToolExecutionContext) =>
      preparation.execute(context, selection, selectionRevision ? { revision: selectionRevision } : undefined)
      : tool.execute.bind(tool);
    const result = await execute(binding.args, {
      workspaceRoot: binding.root,
      workspaceRoots: accessOptions.workspaceRoots,
      artifactRoot: options.workspaceRoot,
      taskId: toolCallId,
      ...(nested ? { nested: true } : {}),
      abortSignal: signal,
      admission: options.admission,
      interactiveAsk: options.interactiveAsk,
      sessionId: options.sessionId,
      correlationId: options.correlationId,
      commandProof: options.commandProof,
      assertSourceAccess: absolute => {
        if (tool.name === 'task') preparationContext(tool.name, options, signal, args).assertSourceAccess!(absolute);
        else {
          const scoped = toolScopePolicy(tool.name, args, options, undefined, absolute);
          assertArtifactSourceAccess(absolute, options.workspaceRoot, options.sessionId, options.workspaceRoots, options.permissionScope, [...options.denyRules ?? [], ...scoped.denyRules ?? []]);
        }
      },
      assertFileAccess: (absolutePath) => {
        if (preparation) { preparationContext(tool.name, options, signal, args).assertFileAccess!(absolutePath); return; }
        const blocked = options.admission?.();
        if (blocked) throw new Error(blocked);
        const scoped = toolScopePolicy(tool.name, args, options, undefined, absolutePath);
        const denyRules = [...options.denyRules ?? [], ...scoped.denyRules ?? []];
        if (tool.name === 'read' && typeof args.path === 'string' && args.path.startsWith('artifact://')) {
          assertArtifactSourceAccess(absolutePath, options.workspaceRoot, options.sessionId, options.workspaceRoots, options.permissionScope, denyRules);
          return;
        }
        const actualArgs = { ...args, path: absolutePath, filePath: absolutePath };
        const access = fileAccessOptions(tool.name, args, options, absolutePath);
        // Original reads and post-publication verification require read access.
        // Recheck it at every file boundary, including absent creation targets.
        if (tool.name === 'write' || tool.name === 'edit') {
          for (const root of new Set([options.workspaceRoot, binding.root])) {
            const read = evaluateToolPermissionScope('read', actualArgs, options.permissionScope, root, denyRules);
            if (read.denied) throw new Error(read.reason);
          }
        }
        if (tool.name === 'browser') assertSourceAccess(absolutePath, options.workspaceRoot, options.workspaceRoots, options.permissionScope, denyRules);
        if (tool.name === 'lsp') {
          const fileArgs = { ...actualArgs, backend: 'scanner' };
          const selected = workspaceToolBinding('lsp', fileArgs, options.workspaceRoot, options.workspaceRoots);
          for (const root of new Set([options.workspaceRoot, selected.root])) {
            for (const name of ['lsp', 'read']) {
              const checked = evaluateToolPermissionScope(name, fileArgs, options.permissionScope, root, denyRules);
              if (checked.denied) throw new Error(checked.reason);
            }
          }
        }
        if (binding.scoped) {
          const actual = workspaceToolBinding(tool.name, actualArgs, options.workspaceRoot, access.workspaceRoots);
          if (actual.root !== binding.root) throw new Error('The tool target changed workspace roots.');
        }
        const decision = binding.scoped ? evaluateWorkspacePermission(tool.name, actualArgs, options, undefined, access.workspaceRoots)
          : evaluateToolPermissionScope(tool.name, actualArgs, options.permissionScope, options.workspaceRoot, denyRules);
        if (decision.denied) throw new Error(decision.reason);
      },
      ...(options.commandEnv ? { commandEnv: options.commandEnv } : {}),
      ...(options.background ? { background: options.background } : {}),
      ...(options.runSubagent ? { runSubagent: options.runSubagent } : {}),
      ...(executeNestedTool ? { executeNestedTool } : {}),
      ...(options.agentMode ? { agentMode: options.agentMode } : {}),
      ...(nestedCatalog ? { toolCatalog: nestedCatalog } : {}),
      ...(options.modelCatalog ? { modelCatalog: options.modelCatalog } : {}),
      // unaffected, since the callback only fires if the tool calls it.
      onOutput: (chunk: string) => {
        if (settled) return;
        (accumulator ??= new OutputAccumulator({ maxLines: DEFAULT_MAX_LINES, maxBytes: TOOL_OUTPUT_LIMIT })).append(chunk);
        onUpdate?.(chunk);
      },
    });
    const output = result.output ?? result.content ?? snapshotStreamed();
    traceLogger.info("tool call completed", { toolCallId, tool: tool.name, requestId: options.correlationId, success: result.success, durationMs: Math.max(0, Date.now() - startedAt) });
    return {
      output: result.success ? output ?? "Success"
        : [result.error, output].filter(Boolean).join("\n") || "Tool failed.",
      isError: !result.success,
      ...(result.metadata ? { metadata: result.metadata } : {}),
      ...(result.images ? { images: result.images } : {}),
      ...(result.terminate !== undefined ? { terminate: result.terminate } : {}),
      ...(result.stop ? { stop: result.stop } : {}),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    traceLogger.warn("tool call failed", { toolCallId, tool: tool.name, requestId: options.correlationId,
      ...(tool.name === 'codemode' || nested ? {} : { error: detail }) });
    const errorLine = `Tool execution error: ${detail}`;
    const streamed = snapshotStreamed();
    const prefix = streamed ? boundText(streamed, Math.max(0, TOOL_OUTPUT_LIMIT - errorLine.length - 2)) : "";
    return { output: [prefix, errorLine].filter(Boolean).join("\n"), isError: true,
      ...(error instanceof EditOperationError ? { metadata: { operationId: error.operationId, status: error.status } } : {}) };
  } finally { discardToolCall(args); forgetFileAccess(args); }
}

/**
 * The gate in front of each call and the hook behind it.
 *
 * Before: plan mode, the permission scope with the
 * user's answer, then the pre-use hook. After: the post-use hook, whose
 * feedback (a compile error after an edit, say) is attached to the result so
 * the model reads it with the output it belongs to.
 */
export function createToolHooks(options: ToolGateOptions,
  tools?: ReadonlyMap<string, ToolDefinition> | (() => ReadonlyMap<string, ToolDefinition>),
  parentToolCallId?: string, emit = options.emit): ToolHooks {
  const toolFor = (name: string) => (typeof tools === 'function' ? tools() : tools)?.get(name);
  const approvals = new Map<string, { operation: string; decision: string }>();
  const writeContext = new WeakMap<object, string>();
  return {
    beforeToolCall: async ({ call, args }, signal, beginWait) => {
      let authorized = false;
      let refusal: 'blocked' | 'denied' = 'blocked';
      try {
      const blocked = options.admission?.();
      if (blocked) return { block: true, reason: blocked };
      if (toolFor(call.name)?.prepare && !preparedToolCall(args, options)) return { block: true, reason: 'The original prepared tool call is required.' };
      const planBlock = planModeBlock(options.agentMode, call.name, args, toolFor(call.name));
      if (planBlock) return { block: true, reason: planBlock };
      if (parentToolCallId !== undefined && options.agentMode === 'plan'
        && call.name === 'todo' && args.action !== 'list') {
        return { block: true, reason: 'Plan mode permits listing tasks from scripts.' };
      }
      const permission = await askPermission(call.id, call.name, args, options, { signal, beginWait }, toolFor(call.name), emit);
      if (permission.blocked) {
        refusal = 'denied';
        return { block: true, reason: permission.blocked, ...(permission.denial ? { denial: permission.denial } : {}) };
      }
      const afterApproval = options.admission?.();
      if (afterApproval) return { block: true, reason: afterApproval };
      toolScopePolicy(call.name, args, options, preparedToolCall(args, options));
      if (permission.approved) approvals.set(call.id, permission.approved);
      bindPreparedToolCall(args, options, call.name, call.id);
      const decision = await options.hooks.dispatch({
        eventName: "PreToolUse",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        toolName: call.name,
        toolCallId: call.id,
        args,
      }, { signal });
      const afterHook = options.admission?.();
      if (afterHook) { approvals.delete(call.id); return { block: true, reason: afterHook }; }
      toolScopePolicy(call.name, args, options, preparedToolCall(args, options));
      if (decision.decision === "block") {
        approvals.delete(call.id);
        return { block: true, reason: `Blocked by Hook: ${decision.reason || "Action rejected by security/verification hook policy."}` };
      }
      if (decision.decision === "retry") {
        // Asked to try again rather than refused. Treated as a block carrying the
        // hook's reason, which is what a retry has to say to be actionable — the
        // previous behaviour dropped the decision entirely, so a hook asking for
        // another attempt was indistinguishable from one that had nothing to say.
        approvals.delete(call.id);
        return {
          block: true,
          reason: `Hook asked for a different attempt: ${decision.reason || "Retry with different arguments."}`,
        };
      }
      authorizeToolCall(args, options, call.name, call.id);
      authorizeFileAccess(args, call.id);
      if (typeof decision.additionalContext === 'string') writeContext.set(args, decision.additionalContext);
      authorized = true;
      return undefined;
      } finally { if (!authorized) {
        try {
          try { toolFor(call.name)?.onRefusal?.(args, preparationContext(call.name, options), signal?.aborted ? 'cancelled' : refusal); }
          catch { /* Tool-owned refusal observation cannot override the gate verdict. */ }
        }
        finally { discardToolCall(args); forgetToolScope(args); forgetFileAccess(args); }
      } }
    },
    afterToolCall: async (context, signal) => {
      const { call, args, result, isError } = context;
      const preUseFeedback = writeContext.get(args);
      writeContext.delete(args);
      discardToolCall(args);
      forgetFileAccess(args);
      const approval = approvals.get(call.id);
      approvals.delete(call.id);
      const tool = toolFor(call.name);
      const runners = [...getExtensionEventRunners(options.workspaceRoot, options.sessionId)];
      const script = scriptHookOutput(context);
      const registrationCurrent = runners.length || script ? options.hooks.captureRegistration?.() : undefined;
      const timestamp = new Date().toISOString();
      // A call that failed is announced as a failure. Sending it on
      // `PostToolUse` alone would make the event name mean "a call finished",
      // and a hook watching for breakage would have to re-derive the outcome
      // from a field rather than being told.
      const base = { sessionId: options.sessionId, workspaceRoot: options.workspaceRoot, timestamp,
        toolName: call.name, toolCallId: call.id, args: script ? Object.freeze({ code: script.code }) : args,
        ...(script ? { script } : {}) };
      const resultAdmission = () => {
        let refused: string | undefined;
        try { refused = tool?.resultAdmission?.(); }
        catch { refused = 'Original result authority could not be verified.'; }
        try { toolScopePolicy(call.name, args, options); }
        catch { refused ??= 'Configuration scope changed before result publication.'; }
        return refused;
      };
      try {
        const payload = isError
          ? { ...base, eventName: "PostToolUseFailure" as const, error: script?.result ?? result.output }
          : { ...base, eventName: "PostToolUse" as const, output: script?.result ?? result.output, success: true };
        const dispatch = options.hooks.dispatch(script ? Object.freeze(payload) : payload, { extensionRunners: runners, signal });
        const decision = await (script ? dispatch.catch(() => {
          traceLogger.warn('Script result hook dispatch failed.', { toolCallId: call.id });
          return { decision: 'allow' as const, feedback: 'Script result hook failed.' };
        }) : dispatch);
        let refused = resultAdmission();
        const draft = refused ? undefined : await collectToolResult({ context, workspaceRoot: options.workspaceRoot,
          sessionId: options.sessionId, timestamp, parentToolCallId, tool,
          protectedOutput: Boolean(approval) || decision.decision === 'block' || decision.decision === 'retry' || decision.decision === 'unknown',
          runners, signal,
          admission: () => options.admission?.() ?? ((registrationCurrent?.() ?? true) && toolFor(call.name) === tool
            ? undefined : 'Tool result authority changed.'),
        });
        if (runners.length) refused ??= resultAdmission();
        const patch = !refused && draft?.isCurrent() ? draft.patch : undefined;
        const replacement = script && !refused && !signal?.aborted && !options.admission?.()
          && (registrationCurrent?.() ?? true) && toolFor(call.name) === tool ? currentScriptOutput(decision) : undefined;
        const scriptText = replacement === undefined ? script?.result
          : [isError ? 'Script failed' : 'Script completed', replacement].filter(Boolean).join('\n\n');
        const output = projectToolResult(result, scriptText === undefined ? patch : { ...patch, output: scriptText }, decision.feedback,
          refused, preUseFeedback);
        const outputNotice = script && typeof result.metadata?.outputNotice === 'string'
          ? redactExportText(displayReportText(result.metadata.outputNotice)) : undefined;
        if (!refused && output === result.output && !approval && !script) return undefined;
        return { ...(refused ? { isError: true } : {}),
          ...(output === result.output ? {} : { output, preserveResultEvidence: true as const }),
          ...(approval || script ? { metadata: {
            ...(approval ? { approval } : {}),
            ...(script ? { scriptStatus: refused || isError ? 'failed' : 'ok' } : {}),
            ...(outputNotice === undefined ? {} : { outputNotice }),
          } } : {}) };
      } finally { forgetToolScope(args); }
    },
  };
}

/**
 * Whether the user allows this call under the session's scope.
 *
 * A denial with a comment is the user's instruction for what to do instead, and
 * travels to the model verbatim; a bare denial only says no.
 */
async function askPermission(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  options: ToolGateOptions,
  interaction: ApprovalInteraction,
  tool?: ToolDefinition,
  emit = options.emit,
): Promise<{ readonly blocked?: string; readonly approved?: { operation: string; decision: string };
  readonly denial?: 'with-feedback' | 'without-feedback' }> {
  const signal = interaction.signal;
  let evaluation: ReturnType<typeof evaluateToolPermissionScope>;
  let preparation: ToolPreparation | undefined;
  let callBinding: string | undefined;
  try {
    captureFileAccess(toolName, args, options);
    if (toolName === 'lsp' && args.backend !== 'scanner' && args.operation !== 'discover') bindExecutionTarget(args, args.server, options.workspaceRoot);
    preparation = preparedToolCall(args, options);
    evaluation = preparation ? preparationPermission(toolName, preparation, options, args) : evaluateWorkspacePermission(toolName, args, options, tool);
    callBinding = approvalCallBinding(preparation?.permissionToolName ?? toolName, args, preparation);
    const external = fileAccessPrompt(args);
    if (external && !evaluation.denied) evaluation = { ...evaluation, requiresEscalation: true,
      target: external, reason: `This call accesses files outside the registered workspace roots. One-time approval is required.\n${evaluation.reason}` };
  }
  catch (error) { return { blocked: error instanceof Error ? error.message : 'Workspace access could not be checked.' }; }
  // A refusal is an answer, not a question. Asking about it would offer the user
  // a chance to override what the user already wrote, and the tool would be
  // usable again by answering "allow" — which is what makes a rule real.
  if (evaluation.denied) {
    emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
    await options.hooks.dispatch({
      eventName: "PermissionDenied",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      args,
      reason: evaluation.reason,
    });
    return { blocked: `Blocked: ${evaluation.reason}` };
  }
  const requiresSelection = Boolean(preparation?.selections?.length);
  if (!evaluation.requiresEscalation && !requiresSelection) return {};
  if (!options.escalationPromptHandler) {
    return {
      blocked: requiresSelection
        ? `Blocked: Tool '${toolName}' requires an explicit group selection, but no interactive handler is available.`
        : `Blocked: Tool '${toolName}' requires permission (${evaluation.reason}), but no interactive handler is available.`,
    };
  }
  emit({ type: "approval.requested", toolName, taskId: toolCallId });
  if (evaluation.requiresEscalation) {
    await options.hooks.dispatch({
      eventName: "PermissionRequest",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      args,
    });
  }
  const promptReason = evaluation.requiresEscalation
    ? evaluation.reason
    : "The permission scope allows this operation, but the exact patch groups still require explicit selection.";
  const prompt = buildToolEscalationPrompt(toolName, evaluation.operation, evaluation.target, promptReason);
  if (callBinding !== undefined) prompt.context.callBinding = callBinding;
  if (fileAccessPrompt(args)) {
    prompt.context.explicitApproval = true;
    prompt.options = prompt.options.filter(option => option.value !== 'allow-always');
  }
  if (toolName === 'codemode' && typeof args.code === 'string') {
    prompt.context.preview = redactReportText(args.code, 48_000, { preserveLines: true, ellipsis: true });
    prompt.context.previewKind = 'execution';
  }
  if (preparation) {
    prompt.context.preview = preparation.preview; prompt.context.previewKind = preparation.previewKind;
    if (preparation.selections) prompt.context.selections = preparation.selections;
    if (preparation.selectionRevision) prompt.context.selectionRevision = preparation.selectionRevision;
    if (preparation.selectionPreview) prompt.context.selectionPreview = preparation.selectionPreview;
  }
  else if (toolName === 'lsp' && args.backend !== 'scanner' && args.operation !== 'discover') {
    prompt.context.preview = executionApprovalPreview(args, args.server, options.workspaceRoot);
    prompt.context.previewKind = 'execution';
  }
  let response: EscalationResponse;
  try {
    signal?.throwIfAborted();
    response = await options.escalationPromptHandler(prompt, interaction);
  } catch (error) {
    emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
    throw error;
  }
  if (signal?.aborted) {
    emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
    return { blocked: "Operation aborted" };
  }
  if (response.decision === 'allow-always' && (oneTimeApproval(toolName) || fileAccessPrompt(args))) {
    emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
    return {
      blocked: toolName === 'apply_patch'
        ? "Blocked: apply_patch requires an exact one-time selection; allow-always is not available for this tool."
        : `Blocked: ${toolName} requires one-time approval; allow-always is not available.`,
    };
  }
  if (response.decision === "deny") {
    try { emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" }); } catch { /* The denial itself remains authoritative. */ }
    const feedback = (response.denialFeedback ?? (response.denialSource === undefined
      ? /^User denied with reason:\s*([\s\S]*)/i.exec(response.userComment ?? '')?.[1] : undefined))?.trim();
    if (evaluation.requiresEscalation) {
      try { await options.hooks.dispatch({
        eventName: "PermissionDenied",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        toolName,
        toolCallId,
        args,
        reason: feedback || evaluation.reason,
      }, { signal }); } catch { /* A denial-observer failure cannot make denial recoverable. */ }
    }
    return {
      ...(response.denialSource === 'policy' ? {} : { denial: feedback ? 'with-feedback' : 'without-feedback' }),
      blocked: feedback
        ? `[User Denied Permission]: The user explicitly rejected this tool call.\nUser feedback / instructions: "${feedback}"\nYou MUST follow the user's instructions above instead of repeating the rejected action.`
        : !evaluation.requiresEscalation && requiresSelection
          ? `Blocked: User declined the exact group selection for '${toolName}' on '${evaluation.target}'.`
          : `Blocked: User denied permission for tool '${toolName}' (${evaluation.operation}) on '${evaluation.target}'.`,
    };
  }
  if (preparation?.selections?.length) {
    const selected = response.selected;
    const offered = new Set(preparation.selections.map(selection => selection.id));
    const unique = Array.isArray(selected) ? new Set(selected) : undefined;
    if (!Array.isArray(selected) || selected.length === 0
      || typeof response.selectionRevision !== "string" || !response.selectionRevision.trim()) {
      emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
      return {
        blocked: "Blocked: this tool requires an explicit group selection and exact selection revision. Nothing was executed.",
      };
    }
    if (unique?.size !== selected.length || selected.some(id => typeof id !== "string" || !offered.has(id))) {
      emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
      return {
        blocked: "Blocked: the approval selected unknown or duplicate groups. Nothing was executed.",
      };
    }
    setPreparedSelection(args, selected, response.selectionRevision);
  }
  emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "approved" });
  return { approved: { operation: evaluation.operation, decision: response.decision } };
}

/** Denials apply to the requested spelling and to the selected root's relative paths. */
function evaluateWorkspacePermission(toolName: string, args: Record<string, unknown>, options: ToolGateOptions, tool?: ToolDefinition,
  roots?: readonly WorkspaceRoot[]) {
  const scoped = toolScopePolicy(toolName, args, options);
  const denyRules = [...options.denyRules ?? [], ...scoped.denyRules ?? []];
  const original = evaluateToolPermissionScope(toolName, args, options.permissionScope, options.workspaceRoot, denyRules, tool);
  if (original.denied) return original;
  const access = fileAccessOptions(toolName, args, options);
  const binding = workspaceToolBinding(toolName, args, options.workspaceRoot, roots ?? access.workspaceRoots);
  // Writers read originals and verify their published bytes. Refuse read-denied
  // targets before hooks or writes, even when the target does not exist yet.
  if ((toolName === 'write' || toolName === 'edit') && typeof binding.args.path === 'string') {
    for (const root of new Set([options.workspaceRoot, binding.root])) {
      const read = evaluateToolPermissionScope('read', binding.args, options.permissionScope, root, denyRules);
      if (read.denied) return read;
    }
  }
  return binding.root === options.workspaceRoot ? original
    : evaluateToolPermissionScope(toolName, binding.args, options.permissionScope, binding.root, denyRules, tool);
}
