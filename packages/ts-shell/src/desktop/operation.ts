import type { ToolExecutionContext, ToolExecutionResult } from '../tools/types.js';
import type { DesktopScope } from './command.js';
import { X11Adapter } from './adapter.js';
import { DesktopError, type DesktopSnapshot, type Rectangle } from './model.js';
import { verifyDesktopCall, type DesktopCall } from './preparation.js';
import type { DesktopState } from './state.js';

export async function desktopOperation(args: Record<string, unknown>, context: ToolExecutionContext, scope: DesktopScope, state: DesktopState, adapter: X11Adapter, call: DesktopCall): Promise<ToolExecutionResult> {
  const action = args.action as string;
  if (action === 'windows') return { success: true, output: JSON.stringify({ windowIds: await adapter.windows(scope), titles: 'redacted' }) };
  if (action === 'observe') {
    if (!['screen', 'window'].includes(args.scope as string)) throw new DesktopError('invalid', 'observe requires an explicit screen or window scope.');
    const snapshot = state.setSnapshot(await adapter.observe(scope, args.scope as 'screen' | 'window', args.windowId as string | undefined));
    return snapshotResult(snapshot);
  }
  const snapshot = call.snapshot!;
  await verifyNativeSnapshot(adapter, scope, snapshot);
  verifyDesktopCall(args, context); scope.check();
  if (action === 'screenshot') {
    const masks = screenshotMasks(args, snapshot);
    const png = await adapter.screenshot(scope, snapshot, masks);
    await verifyNativeSnapshot(adapter, scope, snapshot); verifyDesktopCall(args, context); scope.check();
    const image = { width: snapshot.frame.width, height: snapshot.frame.height, masks, coordinatesAvailable: args.reviewedMasks === true };
    const captured = state.setSnapshot({ ...snapshot, image });
    return { ...snapshotResult(captured), images: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }] };
  }
  if (action === 'clipboard') return { success: true, output: 'Clipboard plaintext redacted.', metadata: { clipboard: await adapter.clipboard(scope) } };
  if (!['focus', 'click', 'key', 'type'].includes(action)) throw new DesktopError('invalid', 'Unsupported desktop action.');
  if (action !== 'focus' && snapshot.scope === 'window' && snapshot.focus !== snapshot.windowId) {
    throw new DesktopError('changed', 'Input requires the selected window to be focused. Focus it, then observe and capture a current snapshot.');
  }
  try {
    await adapter.input(scope, action, args, snapshot);
    if (action !== 'focus') await verifyNativeSnapshot(adapter, scope, snapshot);
    else {
      const focused = await adapter.observe(scope, snapshot.scope, snapshot.windowId);
      if (focused.focus !== snapshot.windowId || JSON.stringify(focused.frame) !== JSON.stringify(snapshot.frame)) throw new DesktopError('changed', 'Focus changed but the selected window could not be confirmed.');
    }
    return { success: true, output: `Native desktop ${action} completed. The snapshot is now invalid; observe again before another action.` };
  } finally { state.snapshot = undefined; }
}

async function verifyNativeSnapshot(adapter: X11Adapter, scope: DesktopScope, before: DesktopSnapshot): Promise<void> {
  const current = await adapter.observe(scope, before.scope, before.windowId);
  const { id: _id, image: _image, ...original } = before;
  if (JSON.stringify(current) !== JSON.stringify(original)) throw new DesktopError('changed', 'Native focus, window identity or geometry changed after the snapshot. No new input was authorized.');
}

function snapshotResult(snapshot: DesktopSnapshot): ToolExecutionResult {
  return { success: true, output: JSON.stringify({ snapshotId: snapshot.id, scope: snapshot.scope, windowId: snapshot.windowId, focus: snapshot.focus,
    focusWindowId: snapshot.focus, frame: snapshot.frame,
    origin: { x: snapshot.frame.x, y: snapshot.frame.y }, width: snapshot.frame.width, height: snapshot.frame.height,
    coordinateMapping: 'native pixels, 1:1; x/y are relative to this image origin', coordinatesAvailable: snapshot.image?.coordinatesAvailable ?? false,
    masks: snapshot.image?.masks, redaction: snapshot.image?.coordinatesAvailable ? 'caller-reviewed rectangles; no automatic secret detection' : 'automation coordinates unavailable until a reviewed screenshot' }), metadata: { desktopSnapshot: snapshot } };
}

function screenshotMasks(args: Record<string, unknown>, snapshot: DesktopSnapshot): readonly Rectangle[] {
  if (args.reviewedMasks !== true) return [{ x: 0, y: 0, width: snapshot.frame.width, height: snapshot.frame.height }];
  if (!Array.isArray(args.masks) || args.masks.length > 16) throw new DesktopError('invalid', 'Reviewed screenshots require an explicit mask rectangle array of at most 16 entries.');
  return args.masks.map(value => {
    const mask = value as Rectangle;
    if (!mask || [mask.x, mask.y, mask.width, mask.height].some(number => !Number.isInteger(number)) || mask.x < 0 || mask.y < 0
      || mask.width < 1 || mask.height < 1 || mask.x + mask.width > snapshot.frame.width || mask.y + mask.height > snapshot.frame.height) {
      throw new DesktopError('invalid', 'Screenshot masks must be integer rectangles inside the selected frame.');
    }
    return Object.freeze({ x: mask.x, y: mask.y, width: mask.width, height: mask.height });
  });
}
