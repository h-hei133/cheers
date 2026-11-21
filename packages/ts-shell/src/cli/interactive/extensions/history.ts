import type { CustomAgentMessage } from '../../../core/agent/custom.js';
import { observeCatalogContributions } from '../../../core/catalog/contributions.js';
import { currentMessageText, MAX_RENDER_BATCH_MESSAGES, renderCustomMessages, type InstalledMessageText } from '../../../core/catalog/renderers.js';
import type { Block } from '../../../presentation/tui/transcript/blocks.js';
import type { Transcript } from '../../../presentation/tui/transcript/container.js';
import { dialogText } from './limits.js';

export interface CustomHistoryRow {
  readonly block: Block;
  readonly message: CustomAgentMessage;
}

interface RenderHistory {
  readonly root: string;
  readonly sessionId: string;
  readonly transcript: Transcript;
  readonly rows: readonly CustomHistoryRow[];
  readonly isCurrent: () => boolean;
  readonly changed: () => void;
}

/** Keep renderer receipts for the most recent custom rows so retirement can restore their text. */
const MAX_RENDERED_ROWS = 120;

export class HistoryRenderers {
  private binding?: { readonly active: () => boolean; readonly append: (row: CustomHistoryRow) => void; readonly release: () => void };

  show({ root, sessionId, transcript, rows, isCurrent, changed }: RenderHistory): void {
    this.clear();
    if (rows.length === 0) return;
    const tracked = new Map(rows.map(row => [row.block, { ...row, initial: row.block.text }]));
    const accepted = new Map<Block, InstalledMessageText>();
    const queued = new Set(tracked.values());
    let pending: AbortController | undefined;
    const redraw = (blocks: Iterable<Block>) => {
      if (!isCurrent()) return;
      const visible = new Set(transcript.all());
      let modified = false;
      for (const block of blocks) {
        const row = tracked.get(block);
        if (!row || !visible.has(block)) continue;
        const receipt = accepted.get(block);
        const text = receipt && currentMessageText(receipt);
        const body = text === undefined ? row.initial : dialogText(text, 32 * 1024);
        if (block.text === body) continue;
        transcript.setText(block, body);
        modified = true;
      }
      if (modified) changed();
    };
    const drain = () => {
      if (pending || !queued.size || !isCurrent()) return;
      const operation = pending = new AbortController();
      const signal = AbortSignal.any([operation.signal, AbortSignal.timeout(2_500)]);
      void (async () => {
        while (queued.size && !signal.aborted) {
          const batch = [...queued].slice(0, MAX_RENDER_BATCH_MESSAGES);
          for (const row of batch) queued.delete(row);
          const result = await renderCustomMessages(root, sessionId, batch.map(row => row.message), signal);
          if (pending !== operation || signal.aborted || !isCurrent()) return;
          for (const [index, { block }] of batch.entries()) {
            if (!tracked.has(block)) continue;
            const receipt = result.get(index);
            if (receipt) accepted.set(block, receipt);
            else accepted.delete(block);
          }
          redraw(batch.map(row => row.block));
        }
      })().catch(() => { /* Saved content remains available if an optional renderer fails. */ }).finally(() => {
        if (pending !== operation) return;
        pending = undefined;
        drain();
      });
    };
    const unsubscribe = observeCatalogContributions(root, () => {
      pending?.abort();
      pending = undefined;
      if (!isCurrent()) return;
      redraw(tracked.keys());
      for (const row of tracked.values()) queued.add(row);
      drain();
    });
    this.binding = {
      active: isCurrent,
      append: row => {
        if (tracked.size >= MAX_RENDERED_ROWS) {
          const oldest = tracked.values().next().value!;
          accepted.delete(oldest.block);
          redraw([oldest.block]);
          queued.delete(oldest);
          tracked.delete(oldest.block);
        }
        const trackedRow = { ...row, initial: row.block.text };
        tracked.set(row.block, trackedRow);
        queued.add(trackedRow);
        drain();
      },
      release: () => { unsubscribe(); pending?.abort(); pending = undefined; queued.clear(); },
    };
    drain();
  }

  append(target: Omit<RenderHistory, 'rows'>, row: CustomHistoryRow): void {
    if (this.binding?.active()) this.binding.append(row);
    else this.show({ ...target, rows: [row] });
  }

  clear(): void {
    this.binding?.release();
    this.binding = undefined;
  }
}
