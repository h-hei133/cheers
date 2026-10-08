import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../tools/types.js';
import type { ExecutionService } from '../runtime/execution/types.js';
import { desktopConfig } from './config.js';
import { desktopState } from './state.js';
import { prepareDesktop, verifyDesktopCall } from './preparation.js';
import { desktopOperation } from './operation.js';
import { X11Adapter } from './adapter.js';
import { DesktopError, type DesktopEvidence } from './model.js';

export function createDesktopToolDefinition(service: ExecutionService): ToolDefinition {
  const execute = (args: Record<string, unknown>, context: ToolExecutionContext) => executeDesktop(service, args, context);
  return { name: 'desktop', description: 'Native Linux X11 desktop inspection and approved input. Requires explicit installed adapters/display; no browser substitute. Observe selected window/screen, capture a masked image, then use its current snapshotId for individual approved actions. Clipboard plaintext is redacted.',
    argsSchema: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', enum: ['capabilities', 'windows', 'observe', 'screenshot', 'focus', 'click', 'key', 'type', 'clipboard', 'close'] },
      scope: { type: 'string', enum: ['screen', 'window'] }, windowId: { type: 'string', pattern: '^\\d{1,12}$' }, snapshotId: { type: 'string' },
      x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 }, button: { type: 'integer', enum: [1, 2, 3] }, key: { type: 'string' },
      text: { type: 'string', maxLength: 16384 }, reviewedMasks: { type: 'boolean' }, masks: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false,
        properties: { x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 } }, required: ['x', 'y', 'width', 'height'] } },
    }, required: ['action'] }, prepare: (args, context) => prepareDesktop(args, context, execute), execute };
}

async function executeDesktop(service: ExecutionService, args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const evidence: DesktopEvidence = { state: 'completed', effect: 'none', cleanup: 'complete' };
  try {
    if (args.action === 'capabilities') {
      const config = desktopConfig();
      return { success: true, output: JSON.stringify({ platform: 'linux', adapter: 'x11', display: config.display, capture: 'configured, system permission unverified',
        input: 'configured, system permission unverified', clipboard: config.xclip ? 'configured, plaintext redacted' : 'unavailable', automaticSecretDetection: false }), metadata: { desktopAction: evidence } };
    }
    const state = desktopState(context);
    if (args.action === 'close') { await state.close(); return { success: !state.blocked, output: 'Desktop control revoked and snapshots invalidated.', ...(state.blocked ? { error: 'Desktop process cleanup is unconfirmed; restart is required.' } : {}), metadata: { desktopAction: { ...evidence, state: state.blocked ? 'failed' : 'completed', cleanup: state.blocked ? 'unknown' : 'complete' } } }; }
    return await state.run(context.abortSignal, async scope => {
      try {
        const call = verifyDesktopCall(args, context);
        const result = await desktopOperation(args, context, scope, state, new X11Adapter(call.config, service, context.workspaceRoot), call);
        return { ...result, metadata: { ...result.metadata, desktopAction: { ...scope.evidence } } };
      } catch (error) {
        return failure(error, scope.evidence);
      }
    });
  } catch (error) { return failure(error, evidence); }
}

function failure(error: unknown, evidence: DesktopEvidence): ToolExecutionResult {
  const code = error instanceof DesktopError ? error.code : 'command';
  return { success: false, error: error instanceof DesktopError ? error.message : 'Native desktop operation failed.', metadata: { desktopAction: {
    ...evidence, state: evidence.state === 'cancelled' || code === 'cancelled' ? 'cancelled' : code === 'unavailable' ? 'unavailable' : 'failed', code,
  } } };
}
