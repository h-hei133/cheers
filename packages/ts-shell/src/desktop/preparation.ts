import { freezeDeep } from '../core/values/freeze.js';
import { bindExecutionTarget, executionWorkspaceKey } from '../runtime/execution/binding.js';
import type { ToolExecutionContext, ToolExecutionResult, ToolPreparation } from '../tools/types.js';
import type { DesktopConfig, DesktopSnapshot } from '@cheers/desktop';
import { DesktopAdmissionError, loadDesktop, type DesktopDomain } from './domain.js';
import { desktopState } from './state.js';

export interface DesktopCall { readonly domain: DesktopDomain; readonly config: DesktopConfig; readonly snapshot?: DesktopSnapshot }
const calls = new WeakMap<object, DesktopCall>();

export async function prepareDesktop(args: Record<string, unknown>, context: ToolExecutionContext,
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult>): Promise<ToolPreparation> {
  const selected = freezeDeep(JSON.parse(JSON.stringify(args))) as Record<string, unknown>;
  bindExecutionTarget(selected, selected, context.workspaceRoot);
  if (selected.action === 'close') return { targets: [], permissionArgs: selected, previewKind: 'execution',
    preview: 'Revoke native desktop control, cancel pending input and invalidate snapshots. Applied external effects are preserved.',
    execute: current => { executionWorkspaceKey(selected, selected, current.workspaceRoot); return execute(selected, current); } };
  let domain: DesktopDomain | undefined;
  let config: DesktopConfig;
  try {
    domain = await loadDesktop();
    config = domain.desktopConfig();
  } catch (error) {
    if (!(error instanceof DesktopAdmissionError) && !(domain && error instanceof domain.DesktopError)) throw error;
    return { targets: [], permissionArgs: selected, previewKind: 'execution', preview: `Native desktop unavailable: ${error.message}`,
      execute: async () => ({ success: false, error: error.message, metadata: { desktopAction: { state: 'unavailable', effect: 'none', cleanup: 'complete' } } }) };
  }
  context.abortSignal?.throwIfAborted();
  executionWorkspaceKey(selected, selected, context.workspaceRoot);
  const action = String(selected.action);
  const snapshot = desktopState(context).snapshot;
  if (!['capabilities', 'windows', 'observe', 'close'].includes(action) && (!snapshot || selected.snapshotId !== snapshot.id)) {
    throw new DesktopAdmissionError('changed', 'A current desktop snapshotId is required. Observe the selected scope first.');
  }
  const call = Object.freeze({ domain, config, ...(!['capabilities', 'windows', 'observe', 'close'].includes(action) ? { snapshot } : {}) });
  calls.set(selected, call);
  const preview = ['Native desktop request', `Action: ${JSON.stringify(action)}`, `Project: ${JSON.stringify(context.workspaceRoot)}`,
    `Display: ${JSON.stringify(config.display)}`, `Authority file: ${JSON.stringify(config.authority ?? '(none configured)')}`,
    `Native utilities: ${JSON.stringify({ xdotool: config.xdotool, ffmpeg: config.ffmpeg, xclip: config.xclip })}`,
    `Selected snapshot and focus: ${JSON.stringify(call.snapshot ?? '(new inspection)')}`, `Complete literal arguments: ${JSON.stringify(selected)}`,
    'Desktop input can affect other applications. Focus and geometry are rechecked immediately before dispatch; external races and applied effects cannot be rolled back.',
    'Screenshot masks are caller-reviewed rectangles; arbitrary desktop secrets are not automatically detected. Unreviewed screenshots are fully blacked out and cannot authorize coordinates.',
    'Clipboard plaintext is redacted; only bounded byte count and SHA-256 are returned.', 'Closing this preview does not approve execution.'].join('\n');
  return { targets: [], permissionArgs: selected, previewKind: 'execution', preview, execute: current => execute(selected, current) };
}

export function boundDesktopCall(args: Record<string, unknown>, context: ToolExecutionContext): DesktopCall {
  const call = calls.get(args);
  if (!call) throw new DesktopAdmissionError('invalid', 'A prepared and approved desktop request is required.');
  executionWorkspaceKey(args, args, context.workspaceRoot);
  if (call.snapshot && desktopState(context).snapshot !== call.snapshot) throw new DesktopAdmissionError('changed', 'Desktop snapshot changed after approval. Observe and approve a current snapshot.');
  return call;
}
