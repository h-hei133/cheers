import { isFocusable, type Option } from '../../../../presentation/tui/chrome/options.js';

/** Refresh fallback uses the previous catalogue's neighbours, never model labels. */
export class ModelFocus {
  notice?: string;

  reset(): void {
    this.notice = undefined;
  }

  select(options: readonly Option[], previous: readonly Option[], focused: string): string | undefined {
    if (!focused.startsWith('model:')) return undefined;
    const candidates = options.filter(row => row.id.startsWith('model:') && row.id !== 'model:current' && isFocusable(row));
    const available = new Set(candidates.map(row => row.id));
    const index = previous.findIndex(row => row.id === focused);
    // Prefer the following surviving row, then the preceding one. New rows
    // only supply a fallback when none of the old neighbours survives.
    const replacement = previous.slice(index + 1).find(row => available.has(row.id))?.id
      ?? previous.slice(0, index).reverse().find(row => available.has(row.id))?.id
      ?? candidates[Math.min(Math.max(0, index), candidates.length - 1)]?.id;
    this.notice = 'Focused model left the catalogue. ' + (replacement ? 'Moved to a nearby model.' : 'No nearby models remain.');
    return replacement;
  }
}
