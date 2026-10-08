import path from 'node:path';
import type { ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import type { BrowserSessionManager } from '../sessionManager.js';
import { approvedResult, deniedResult } from '../../core/tools/toolResultLifecycle.js';
import { captureScreenshot } from '../session/screenshot.js';
import { downloadUrl, TRANSFER_BYTES } from '../session/download.js';
import { browserCall, verifyUploadSource } from './preparation.js';
import { readBinarySnapshot } from '../../runtime/execution/snapshot.js';
import { ArtifactManager } from '../../core/session/artifactManager.js';
import { readBrowserOriginPolicy } from '../originPolicy.js';
import { networkFailure } from '../../core/network/error.js';
import { ArtifactPublicationError } from '../../core/session/artifacts/publication.js';

export async function browserFeature(action: string, args: Record<string, unknown>, context: ToolExecutionContext, manager: BrowserSessionManager): Promise<ToolExecutionResult | undefined> {
  if (!['tabs', 'tab_new', 'tab_select', 'tab_close', 'screenshot', 'upload', 'download'].includes(action)) return undefined;
  if (action === 'download' && (typeof args.url !== 'string' || !/^https?:\/\//i.test(args.url))) return deniedResult('Downloads require an explicit http(s) URL. Click/blob downloads are unsupported.');
  if (action === 'download' && process.platform !== 'linux') return deniedResult('Download unavailable: verified binary artifact publication requires Linux. No remote transfer was started.');
  const scope = manager.actions.scope;
  try {
    scope?.check();
    if (action === 'tabs') return approvedResult(JSON.stringify(manager.tabs.list()), { browserTabs: manager.tabs.list() });
    if (action === 'tab_new') {
      if (manager.tabs.list().length >= 8) throw new Error('At most 8 browser tabs are supported.');
      const current = await manager.getOrCreatePage();
      if (!current) throw new Error('A browser page is unavailable. Open a page first.');
      if (manager.context) {
        const create = async () => { const page = await manager.context!.newPage(); manager.tabs.register(page); return page; };
        const page = scope ? await scope.perform(create) : await create();
        manager.tabs.current = page;
      } else throw new Error('Tab creation adapter is unavailable.');
      return approvedResult(JSON.stringify(manager.tabs.list()), { browserTabs: manager.tabs.list() });
    }
    if (action === 'tab_select' || action === 'tab_close') {
      if (typeof args.tabId !== 'string') throw new Error('tabId is required.');
      if (action === 'tab_select') manager.tabs.select(args.tabId);
      else {
        const close = () => manager.tabs.close(args.tabId as string);
        const result = scope ? await scope.perform(close) : await close();
        if (result !== 'closed') { manager.tabs.failure = 'Tab cleanup is unconfirmed. Close the browser session before continuing.'; return deniedResult(`Tab cleanup ${result}.`, { browserCleanup: result }); }
      }
      return approvedResult(JSON.stringify(manager.tabs.list()), { browserTabs: manager.tabs.list() });
    }
    const page = manager.tabs.current;
    if (!page) throw new Error('No browser page is open. Open a page first.');
    const binding = manager.tabs.binding();
    if (action === 'screenshot') {
      if (args.masks !== undefined && (!Array.isArray(args.masks) || args.masks.some(value => typeof value !== 'string'))) throw new Error('masks must be an array of CSS selectors.');
      const image = await captureScreenshot(page, (args.masks ?? []) as string[]);
      scope?.check();
      if (manager.tabs.binding() !== binding) throw new Error('The page changed during screenshot capture. No image was returned.');
      return { success: true, output: 'Viewport screenshot captured. Form controls, editable content and iframe/frame regions are masked; arbitrary canvas or closed shadow content may contain unrecognized secrets.', images: [image], metadata: { screenshot: { bytes: Buffer.byteLength(image.data, 'base64'), mimeType: image.mimeType, masked: true } } };
    }
    if (action === 'upload') return await upload(args, context, manager, binding);
    const store = ArtifactManager.getShared(context.artifactRoot ?? context.workspaceRoot, context.sessionId ?? 'default');
    store.assertBinaryStorage();
    const operation = () => downloadUrl(args.url as string, readBrowserOriginPolicy(), store, scope?.signal ?? context.abortSignal);
    const artifact = scope ? await scope.perform(operation) : await operation();
    return approvedResult(`Downloaded ${artifact.totalBytes} bytes to ${artifact.uri}. SHA-256: ${artifact.sha256}. Publication: verified.`, { download: artifact });
  } catch (error) {
    if (error instanceof ArtifactPublicationError) {
      if (error.cleanupResource) manager.retainedCleanup.add(error.cleanupResource);
      if (error.cleanup === 'unknown') manager.tabs.failure = 'Artifact cleanup is unconfirmed. Close the browser session before continuing.';
      return deniedResult(`Download artifact publication ${error.publication}; cleanup ${error.cleanup}. ${error.publication === 'not-published' ? 'No artifact was published.' : 'A destination may remain and was preserved.'}`, {
        artifactPublication: { state: error.publication, cleanup: error.cleanup, target: error.target, retained: error.publication !== 'not-published' },
      });
    }
    if (action === 'download') return deniedResult(`Download failed: ${networkFailure(error).code}. No verified artifact result is available.`);
    return deniedResult(error instanceof Error ? error.message : 'Browser action failed.');
  }
}

async function upload(args: Record<string, unknown>, context: ToolExecutionContext, manager: BrowserSessionManager, binding: string): Promise<ToolExecutionResult> {
  const sources = browserCall(args)?.sources;
  if (!sources?.length) throw new Error('A prepared upload with a complete source list is required.');
  if (typeof args.selector !== 'string' || !args.selector.trim()) throw new Error('Upload requires a file input selector.');
  const page = manager.tabs.current!;
  if (!page.setInputFiles) throw new Error('Upload adapter is unavailable.');
  const files: Array<{ name: string; mimeType: string; buffer: Buffer }> = [];
  let bytes = 0;
  for (const source of sources) {
    verifyUploadSource(source, context);
    const buffer = await readBinarySnapshot({ absolutePath: source.path, workspaceRoot: source.root, assertFileAccess: context.assertFileAccess,
      abortSignal: manager.actions.scope?.signal ?? context.abortSignal }, TRANSFER_BYTES - bytes);
    bytes += buffer.length;
    files.push({ name: path.basename(source.path), mimeType: 'application/octet-stream', buffer });
  }
  for (const source of sources) verifyUploadSource(source, context);
  manager.actions.scope?.check();
  if (manager.tabs.binding() !== binding) throw new Error('The selected browser document changed before upload.');
  const selector = manager.resolveSelector(args.selector);
  const operation = () => page.setInputFiles!(selector, files, { timeout: 5000 });
  if (manager.actions.scope) await manager.actions.scope.perform(operation); else await operation();
  return approvedResult(`Uploaded ${files.length} files (${bytes} bytes) to the selected file input.`, { upload: { files: sources.map(source => source.path), bytes } });
}
