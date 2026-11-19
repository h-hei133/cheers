import type { ToolPreview } from '../../../turn/preview/contract.js';

type Preparing = Exclude<ToolPreview, { phase: 'end' }>;

/** Live activity for proposed calls, before a tool card can exist. */
export class ToolPreparation {
  private readonly calls = new Map<number, Preparing>();
  private id: string | undefined;

  accept(preview: ToolPreview): boolean {
    if (preview.phase === 'start') this.id ??= preview.previewId;
    if (this.id !== preview.previewId) return false;
    if (preview.phase === 'end') {
      this.clear();
      return true;
    }
    if (preview.phase === 'update' && !this.calls.has(preview.index)) return false;
    this.calls.set(preview.index, preview);
    return true;
  }

  clear(): void {
    this.calls.clear();
    this.id = undefined;
  }

  get label(): string | undefined {
    const call = this.calls.values().next().value;
    if (!call) return undefined;
    const detail = call.target ?? (call.fields.length ? call.fields.join(', ') : undefined);
    const extra = this.calls.size > 1 ? ` (+${this.calls.size - 1})` : '';
    return `preparing ${call.toolName}${detail ? ` ${detail}` : ''}${extra}`;
  }
}
