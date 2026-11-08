import { isRecord } from '../values/record.js';
import type { HookDecision, PreToolUsePayload } from './types.js';

export const CANONICAL_WRITE_MATCHER = '^(?:Write|Edit|MultiEdit|NotebookEdit)$';
/** C3b's opt-in experiment policy: block uncertainty, observe unsupported coverage. */
export const WRITE_HOOK_POLICY = 'block-unknown-observe-unsupported' as const;

const VERSIONED_REASON_CODES = new Set([
  'no_violation', 'not_a_judged_write', 'not_configured', 'could_not_decide', 'violation',
]);
const TOOLS: Readonly<Record<string, string>> = {
  write: 'Write', edit: 'Edit', multiedit: 'MultiEdit', notebookedit: 'NotebookEdit',
  Write: 'Write', Edit: 'Edit', MultiEdit: 'MultiEdit', NotebookEdit: 'NotebookEdit',
};

export interface CanonicalHookInput {
  readonly version: 1;
  readonly event: 'PreToolUse';
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly timeoutMs: number;
  readonly reentry: { readonly supported: false; readonly active: false };
  readonly timestamp: string;
  readonly agentId?: string;
  readonly agentType?: string;
  readonly hook_event_name: 'PreToolUse';
  readonly cwd: string;
  readonly tool_name: string;
  readonly tool_input: { readonly file_path: string; readonly content: string };
}

export function canonicalToolName(name: string): string { return TOOLS[name] ?? name; }

export function hookUnknown(reasonCode: string): HookDecision {
  return { decision: 'block', reasonCode, reason: `The write hook could not be evaluated (${reasonCode}).`,
    hookVerdict: { status: 'unknown', source: 'adapter', reasonCode, policy: 'block' } };
}

function unsupported(reasonCode: string, reason: string): HookDecision {
  return { decision: 'unsupported', reasonCode, reason, hookVerdict: { status: 'unsupported', source: 'adapter', reasonCode, policy: 'observe-only' } };
}

/** No reads or edit reconstruction: only full single-file replacement content is judged. */
export function translateWriteInput(payload: PreToolUsePayload, timeoutMs: number): CanonicalHookInput | HookDecision {
  if (payload.eventName !== 'PreToolUse' || typeof payload.workspaceRoot !== 'string' || !payload.workspaceRoot
    || typeof payload.sessionId !== 'string' || typeof payload.toolCallId !== 'string'
    || typeof payload.toolName !== 'string' || !isRecord(payload.args)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return hookUnknown('invalid_input');
  const tool = canonicalToolName(payload.toolName);
  if (tool === 'apply_patch') return unsupported('patch_targets',
    'A patch may contain multiple targets, while content rules apply per file; patch normalization is not implemented.');
  if (tool === 'MultiEdit') return unsupported('multiple_edits', 'Multiple edits have no verified single-file replacement projection.');
  if (tool === 'NotebookEdit') return unsupported('notebook_cells', 'Notebook cell operations are not full file replacement content.');
  if (tool === 'bash') return unsupported('shell_effects', 'Shell commands do not describe their final per-file content.');
  if (tool === 'browser' || tool === 'desktop') return unsupported('external_effects', 'Browser and desktop actions are not single-file content operations.');
  if (tool !== 'Write' && tool !== 'Edit') return unsupported('tool_semantics', 'This tool (including MCP tools) has no declared single-file content semantics.');
  const args = payload.args;
  if (typeof args.path !== 'string' || !args.path.trim()) {
    return unsupported('full_content_required', 'A single path and complete replacement content are required; partial edits are not judged.');
  }
  // These forms can take precedence over content in the native edit owner. Never judge a decoy.
  if (['edits', 'oldText', 'newText', 'replaceAll', 'files', 'targets', 'operations', 'new_string', 'new_source'].some(key => key in args)) {
    return unsupported('ambiguous_content', 'Mixed replacement, multi-target or cell arguments cannot be reduced losslessly to one file.');
  }
  // C3a treats missing content as an input-fidelity gap. Do not let the older pinned
  // artifact's empty-import fallback turn a partial edit into a clean allow.
  if (typeof args.content !== 'string') return hookUnknown('input_incomplete');
  return { version: 1, event: 'PreToolUse', workspaceRoot: payload.workspaceRoot, sessionId: payload.sessionId,
    toolName: payload.toolName, toolCallId: payload.toolCallId, args: { ...args }, timeoutMs,
    reentry: { supported: false, active: false }, timestamp: payload.timestamp,
    ...(payload.agentId === undefined ? {} : { agentId: payload.agentId }),
    ...(payload.agentType === undefined ? {} : { agentType: payload.agentType }),
    hook_event_name: 'PreToolUse', cwd: payload.workspaceRoot, tool_name: tool,
    tool_input: { file_path: args.path, content: args.content } };
}

/** Native flat vetoes retain their full payload; nested vetoes enter the same consumer. */
export function normalizeHookVeto(value: unknown): HookDecision | undefined {
  if (!isRecord(value)) return undefined;
  if (value.decision === 'block' || value.decision === 'retry') return value as unknown as HookDecision;
  if (isRecord(value.hookSpecificOutput) && value.hookSpecificOutput.permissionDecision === 'deny') {
    return { decision: 'block', reason: typeof value.hookSpecificOutput.permissionDecisionReason === 'string'
      ? value.hookSpecificOutput.permissionDecisionReason : 'The write hook denied this action.' };
  }
  return undefined;
}

/** Explicit wire reasons take precedence over the upstream report-only allow spelling. */
export function translateWriteResult(stdout: string): HookDecision {
  if (!stdout.trim()) return hookUnknown('empty_output');
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { return hookUnknown('invalid_output'); }
  if (!isRecord(value)) return hookUnknown('invalid_output');

  // Nested deny is the legacy host wire and remains authoritative even when a
  // producer adds unrelated fields around it.
  if (isRecord(value.hookSpecificOutput) && value.hookSpecificOutput.permissionDecision === 'deny') {
    return normalizeHookVeto(value) ?? hookUnknown('invalid_output');
  }

  const hasReasonCode = 'reasonCode' in value;
  if (hasReasonCode && typeof value.reasonCode !== 'string') return hookUnknown('invalid_output');
  const reasonCode = typeof value.reasonCode === 'string' ? value.reasonCode : undefined;
  const reason = typeof value.reason === 'string' ? value.reason.slice(0, 4_000) : undefined;

  // A flat result without a reasonCode is the old host contract. Preserve its
  // block/retry payloads verbatim and keep its allow distinguishable from a
  // versioned proof-ish result.
  if (reasonCode === undefined) {
    const veto = normalizeHookVeto(value);
    if (veto) return veto;
    if (value.decision === 'allow') return { decision: 'allow', reasonCode: 'explicit_allow',
      ...(reason === undefined ? {} : { reason }),
      hookVerdict: { status: 'allow', source: 'hook', reasonCode: 'explicit_allow', policy: 'permission' } };
    return hookUnknown('invalid_output');
  }

  // The --emit-result contract is closed. A future reason must never fall
  // through to allow, and a known reason must agree with its decision.
  if (!VERSIONED_REASON_CODES.has(reasonCode)) return hookUnknown('version_mismatch');
  if (value.decision === 'block' && reasonCode === 'violation') return { decision: 'block', reasonCode,
    ...(reason === undefined ? {} : { reason }),
    hookVerdict: { status: 'block', source: 'hook', reasonCode, policy: 'block' } };
  if (value.decision !== 'allow') return hookUnknown('conflicting_output');
  switch (reasonCode) {
    case 'no_violation':
      return { decision: 'allow', reasonCode, ...(reason === undefined ? {} : { reason }),
        hookVerdict: { status: 'allow', source: 'hook', reasonCode, policy: 'permission' } };
    case 'could_not_decide':
      return { decision: 'unknown', reasonCode, reason: reason ?? 'The write gate could not reach a decision.',
        hookVerdict: { status: 'unknown', source: 'hook', reasonCode } };
    case 'not_configured':
      return { decision: 'allow', reasonCode, ...(reason === undefined ? {} : { reason }),
        hookVerdict: { status: 'unknown', source: 'hook', reasonCode, policy: 'observe-only' } };
    case 'not_a_judged_write':
      return unsupported(reasonCode, reason ?? 'The gate did not recognize a supported write.');
    case 'violation':
      return hookUnknown('conflicting_output');
  }
  return hookUnknown('invalid_output');
}

/** Cheers chooses to block undecidable checks. This never calls or grants ordinary permission. */
export function applyWriteHookPolicy(result: HookDecision): HookDecision {
  return result.decision === 'unknown' ? { ...result, decision: 'block',
    hookVerdict: { ...(result.hookVerdict ?? { status: 'unknown', source: 'adapter', reasonCode: 'unknown' }), policy: 'block' } } : result;
}

/** Preserve a coverage gap when several opt-in write adapters run for one call. */
export function mergeWriteHookResult(current: HookDecision | null, next: HookDecision): HookDecision {
  if (current === null) return next;
  const currentStatus = current.hookVerdict?.status;
  const nextStatus = next.hookVerdict?.status;
  if (currentStatus === 'unknown') return current;
  if (nextStatus === 'unknown') return next;
  if (currentStatus === 'unsupported') return current;
  if (nextStatus === 'unsupported') return next;
  return next;
}
