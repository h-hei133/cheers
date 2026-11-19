import { boundText, TOOL_OUTPUT_LIMIT, type AfterToolCallContext } from '../core/agent/tools.js';
import { dispatchExtensionEvent, type ExtensionEventRunner } from '../core/hooks/extensionBridge.js';
import { redactExportText } from '../core/security/redaction.js';
import { neutraliseForDisplay } from '../core/text/safety.js';
import { readOnlyAccess } from '../core/tools/capability.js';
import { truncateTextBytes } from '../core/tools/truncation.js';
import { snapshotData } from '../core/values/data.js';
import { captureToolResult, reduceToolResult } from '../extensions/events/result.js';
import type { ExtensionToolResult, ExtensionToolResultEvent } from '../extensions/events/model.js';
import { redactSecretsFromObject } from '../observability/structuredLogger.js';
import type { ToolDefinition } from '../tools/types.js';

/** Capture inert, bounded observations before exposing them to handlers. */
function publicRecord(value: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> {
  if (!value) return Object.freeze({});
  const limits = { bytes: 96 * 1024, nodes: 4096, depth: 20 };
  try {
    return snapshotData(redactSecretsFromObject(snapshotData(value, limits)), limits) as Readonly<Record<string, unknown>>;
  } catch {
    return Object.freeze({});
  }
}

function canReplace(context: AfterToolCallContext, tool: ToolDefinition | undefined, protectedOutput: boolean): boolean {
  if (!tool || protectedOutput) return false;
  const { result, args } = context;
  const access = readOnlyAccess(tool);
  if (!access || access.network || access.delegation || tool.prepare || tool.resultAdmission
    || context.isError || result.isError || result.terminate || result.images?.length || result.output.includes('artifact://')
    || (typeof args.path === 'string' && args.path.startsWith('artifact://'))) return false;
  return Object.keys(result.metadata ?? {}).every(key => ['read', 'provenance', 'outputNotice'].includes(key));
}

/** Apply a captured audience's text decisions while the completed result stays authoritative. */
export async function collectToolResult(input: {
  readonly context: AfterToolCallContext;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly parentToolCallId?: string;
  readonly tool?: ToolDefinition;
  readonly protectedOutput: boolean;
  readonly runners: readonly ExtensionEventRunner[];
  readonly admission: () => string | undefined;
  readonly signal?: AbortSignal;
}): Promise<{ readonly patch: ExtensionToolResult; readonly isCurrent: () => boolean } | undefined> {
  if (!input.runners.length || input.signal?.aborted) return undefined;
  const { context, workspaceRoot, sessionId, timestamp, parentToolCallId, signal, runners } = input;
  const { call, args, result, isError } = context;
  const withinLimit = Buffer.byteLength(result.output) <= 256 * 1024;
  const observed = withinLimit
    ? boundText(redactExportText(result.output)) : '[Tool output exceeds the extension observation limit.]';
  let event: ExtensionToolResultEvent = Object.freeze({
    type: 'tool_result', eventName: isError ? 'PostToolUseFailure' : 'PostToolUse',
    workspaceRoot, sessionId, timestamp, toolName: call.name, toolCallId: call.id,
    ...(parentToolCallId === undefined ? {} : { parentToolCallId }),
    args: publicRecord(args), output: observed, ...(isError ? { error: observed } : {}), success: !isError, isError,
    ...(result.metadata ? { metadata: publicRecord(result.metadata) } : {}),
    hasImages: Boolean(result.images?.length),
    canReplaceOutput: withinLimit && canReplace(context, input.tool, input.protectedOutput),
  });
  let patch: ExtensionToolResult | undefined;
  const admission = () => {
    try {
      signal?.throwIfAborted();
      const refused = input.admission();
      for (const runner of runners) runner.admission?.();
      signal?.throwIfAborted();
      return refused;
    } catch { return 'The extension tool result audience is retired.'; }
  };
  const outcome = await dispatchExtensionEvent(workspaceRoot, sessionId, 'tool_result', () => event, {
    runners, signal, admission,
    consume: value => {
      try {
        const reduced = reduceToolResult(event, patch, captureToolResult(value));
        event = reduced.event;
        patch = reduced.result;
      } catch { /* A malformed patch does not alter the completed result. */ }
      return true;
    },
  });
  if (!patch || outcome.cancelled || admission()) return undefined;
  return { patch, isCurrent: () => admission() === undefined };
}

/** The model and history receive the same projection, with native notices still reserved. */
export function projectToolResult(result: AfterToolCallContext['result'], patch: ExtensionToolResult | undefined,
  verification: string | undefined, refused: string | undefined): string {
  const originalNotice = typeof result.metadata?.outputNotice === 'string' ? result.metadata.outputNotice : '';
  const replacement = patch?.output === undefined ? undefined : redactExportText(patch.output)
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, char => '\\x' + char.charCodeAt(0).toString(16).padStart(2, '0'));
  const advice = patch?.feedback && truncateTextBytes(neutraliseForDisplay(redactExportText(patch.feedback)), 512);
  const verified = verification && truncateTextBytes(neutraliseForDisplay(redactExportText(verification)), 512);
  const extensionFeedback = advice ? '[Extension feedback]\n' + advice : undefined;
  const verificationFeedback = verified ? '[Verification feedback]\n' + verified : undefined;
  const warning = refused ? truncateTextBytes(neutraliseForDisplay(redactExportText(refused)), 256)
    + ' Actual effect evidence remains visible.' : undefined;
  const suffix = [verificationFeedback, extensionFeedback, warning].filter(Boolean).join('\n\n');
  const content = replacement !== undefined && originalNotice && !replacement.includes(originalNotice)
    ? [replacement, originalNotice].filter(Boolean).join('\n\n') : replacement ?? result.output;
  if (!suffix && replacement === undefined) return result.output;
  const output = [content, suffix].filter(Boolean).join('\n\n');
  return boundText(output, TOOL_OUTPUT_LIMIT, [originalNotice, suffix].filter(Boolean).join('\n\n'));
}
