import { isComposerShape } from '../../../presentation/tui/composer/shapes.js';
import type { ComposerShapeId } from '../../../presentation/tui/composer/contract.js';
import type { ThemePreferences } from '../../../presentation/theme/preview.js';
import type { ThemePreview } from '../../../presentation/theme/selection.js';
import { STATUS_ITEMS, type StatusItemId } from '../../../presentation/tui/chrome/items.js';

export interface PreferenceHost {
  readonly themes?: ThemePreferences;
  readonly configurationRevision?: () => number;
  previewComposerShape?(shape: ComposerShapeId | undefined): void;
  previewStatusItems?(items: readonly StatusItemId[] | undefined): void;
}

/** One picker gets one revocable lease, started only after its predecessor ends. */
export function settingPreview(host: PreferenceHost, key: string) {
  if (key !== 'tui.composerShape' && key !== 'tui.statusItems' && (key !== 'theme' || !host.themes)) return undefined;
  const revision = key === 'theme' ? host.themes?.revision : host.configurationRevision;
  const expectedRevision = revision?.();
  let lease: ThemePreview | undefined;
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    if (key === 'theme') lease?.end();
    else if (key === 'tui.statusItems') host.previewStatusItems?.(undefined);
    else host.previewComposerShape?.(undefined);
  };
  return {
    show(value: unknown): boolean {
      if (ended || (expectedRevision !== undefined && revision?.() !== expectedRevision)) {
        end();
        return false;
      }
      if (key === 'theme') {
        lease ??= host.themes!.begin(expectedRevision);
        return lease.show(typeof value === 'string' ? value : host.themes!.selected());
      }
      if (key === 'tui.statusItems') {
        const valid = Array.isArray(value) && value.every(id => typeof id === 'string' && STATUS_ITEMS.some(item => item.id === id));
        host.previewStatusItems?.(valid ? value as readonly StatusItemId[] : undefined);
        return valid;
      }
      host.previewComposerShape?.(isComposerShape(value) ? value : undefined);
      return true;
    },
    end,
  };
}
