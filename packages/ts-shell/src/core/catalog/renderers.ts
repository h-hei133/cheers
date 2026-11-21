import { types } from 'node:util';
import type { CustomAgentMessage } from '../agent/custom.js';
import { captureRendererMessage, MAX_RENDER_BATCH_BYTES, MAX_RENDER_BATCH_MESSAGES, MAX_RENDER_TEXT_BYTES,
  type InstalledMessageRenderers } from '../../extensions/runtime/renderer.js';
import { catalogContributions } from './contributions.js';

/** Display output is optional; durable content remains the fallback for retired or failed renderers. */
export function renderCustomMessage(root: string, sessionId: string, message: CustomAgentMessage): string | undefined {
  if (!message.display) return undefined;
  const renderer = catalogContributions(root, sessionId)
    .flatMap(entry => entry.messageRenderers ?? [])
    .find(candidate => candidate.customType === message.customType);
  try {
    const value = renderer?.render(message);
    return typeof value === 'string' && value.length <= MAX_RENDER_TEXT_BYTES && Buffer.byteLength(value) <= MAX_RENDER_TEXT_BYTES ? value : undefined;
  }
  catch { return undefined; }
}

export interface InstalledMessageText {
  readonly text: string;
  readonly admission: () => void;
}

export { MAX_RENDER_BATCH_MESSAGES };

export function currentMessageText(result: InstalledMessageText): string | undefined {
  try { result.admission(); return result.text; }
  catch { return undefined; }
}

/** Only displayed messages with an installed renderer enter the worker payload. */
export async function renderCustomMessages(root: string, sessionId: string, messages: readonly CustomAgentMessage[],
  signal?: AbortSignal): Promise<ReadonlyMap<number, InstalledMessageText>> {
  const results = new Map<number, InstalledMessageText>();
  if (signal?.aborted || !messages.length || messages.length > MAX_RENDER_BATCH_MESSAGES) return results;
  const owners = new Map(catalogContributions(root, sessionId).flatMap(entry => entry.installedRenderers ?? [])
    .flatMap(renderer => renderer.customTypes.map(customType => [customType, renderer] as const)));
  if (!owners.size) return results;
  const batches = new Map<InstalledMessageRenderers, { indices: number[]; messages: CustomAgentMessage[] }>();
  let remaining = MAX_RENDER_BATCH_BYTES;
  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object' || types.isProxy(message)) continue;
    const type = Object.getOwnPropertyDescriptor(message, 'customType')?.value;
    const owner = owners.get(type);
    if (!owner || Object.getOwnPropertyDescriptor(message, 'display')?.value !== true) continue;
    try {
      const captured = captureRendererMessage(message);
      const size = Buffer.byteLength(JSON.stringify(captured)) + 2;
      if (captured.role !== 'custom' || size > remaining) continue;
      remaining -= size;
      const batch = batches.get(owner) ?? { indices: [], messages: [] };
      batch.indices.push(index);
      batch.messages.push(captured);
      batches.set(owner, batch);
    } catch { /* Display durable content when the renderer input is unavailable. */ }
  }
  const deadline = AbortSignal.timeout(2500);
  const active = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (const [owner, batch] of batches) {
    if (active.aborted) break;
    try {
      owner.admission();
      const text = await owner.renderBatch(batch.messages, active);
      owner.admission();
      active.throwIfAborted();
      if (text.length !== batch.indices.length) continue;
      for (const [index, row] of batch.indices.entries()) {
        const value = text[index];
        if (typeof value === 'string' && value.length <= MAX_RENDER_TEXT_BYTES && Buffer.byteLength(value) <= MAX_RENDER_TEXT_BYTES) {
          results.set(row, Object.freeze({ text: value, admission: owner.admission }));
        }
      }
    } catch { /* Renderer failure only affects the display. */ }
  }
  return signal?.aborted ? new Map() : results;
}
