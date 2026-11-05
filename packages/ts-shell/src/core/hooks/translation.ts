import { isRecord } from '../values/record.js';
import type { HookDecision, PreToolUsePayload } from './types.js';

export const CANONICAL_WRITE_MATCHER = '^(?:Write|Edit|MultiEdit|NotebookEdit)$';
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
  return { decision: 'block', reason: `The write hook could not be evaluated (${reasonCode}).`,
    hookVerdict: { status: 'unknown', source: 'adapter', reasonCode } };
}

function unsupported(reasonCode: string, reason: string): HookDecision {
  return { decision: 'unsupported', reason, hookVerdict: { status: 'unsupported', source: 'adapter', reasonCode } };
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
  if (typeof args.path !== 'string' || !args.path.trim() || typeof args.content !== 'string') {
    return unsupported('full_content_required', 'A single path and complete replacement content are required; partial edits are not judged.');
  }
  // These forms can take precedence over content in the native edit owner. Never judge a decoy.
  if (['edits', 'oldText', 'newText', 'replaceAll', 'files', 'targets', 'operations', 'new_string', 'new_source'].some(key => key in args)) {
    return unsupported('ambiguous_content', 'Mixed replacement, multi-target or cell arguments cannot be reduced losslessly to one file.');
  }
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
  const veto = normalizeHookVeto(value);
  if (veto) return veto;
  if (!isRecord(value) || value.decision !== 'allow' || typeof value.reasonCode !== 'string') return hookUnknown('invalid_output');
  if (value.reasonCode === 'could_not_decide') return { decision: 'unknown',
    reason: 'The write gate could not reach a decision.', hookVerdict: { status: 'unknown', source: 'hook', reasonCode: 'could_not_decide' } };
  if (value.reasonCode === 'not_a_judged_write') return unsupported('not_a_judged_write', 'The gate did not recognize a supported write.');
  if (value.reasonCode !== 'no_violation' && value.reasonCode !== 'not_configured') return hookUnknown('version_mismatch');
  return { decision: 'allow', hookVerdict: { status: 'allow', source: 'hook', reasonCode: value.reasonCode } };
}

/** Cheers chooses to block undecidable checks. This never calls or grants ordinary permission. */
export function applyWriteHookPolicy(result: HookDecision): HookDecision {
  return result.decision === 'unknown' ? { ...result, decision: 'block',
    hookVerdict: { ...result.hookVerdict!, policy: 'block' } } : result;
}
