import type { CustomAgentMessage } from '../agent/custom.js';
import { catalogContributions } from './contributions.js';

/** Display output is optional; durable content remains the fallback for retired or failed renderers. */
export function renderCustomMessage(root: string, sessionId: string, message: CustomAgentMessage): string | undefined {
  if (!message.display) return undefined;
  const renderer = catalogContributions(root, sessionId)
    .flatMap(entry => entry.messageRenderers ?? [])
    .find(candidate => candidate.customType === message.customType);
  try {
    const value = renderer?.render(message);
    return typeof value === 'string' && value.length <= 32 * 1024 && Buffer.byteLength(value) <= 32 * 1024 ? value : undefined;
  }
  catch { return undefined; }
}
