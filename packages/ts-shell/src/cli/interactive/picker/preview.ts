import { isComposerShape } from '../../../presentation/tui/composer/shapes.js';
import type { ComposerShapeId } from '../../../presentation/tui/composer/contract.js';
import type { ThemePreferences } from '../../../presentation/theme/preview.js';
import type { ThemePreview } from '../../../presentation/theme/selection.js';
import type { StatusItemId } from '../../../presentation/tui/chrome/items.js';

export interface PreferenceHost {
  readonly themes?: ThemePreferences;
  previewComposerShape?(shape: ComposerShapeId | undefined): void;
  previewStatusItems?(items: readonly StatusItemId[] | undefined): void;
}

/** One picker gets one revocable lease, started only after its predecessor ends. */
export function settingPreview(host: PreferenceHost, key: string) {
  if (key !== 'tui.composerShape' && (key !== 'theme' || !host.themes)) return undefined;
  let lease: ThemePreview | undefined;
  let ended = false;
  const revision = host.themes?.revision();
  return {
    show(value: unknown): boolean {
      if (ended) return false;
      if (key === 'theme') {
        lease ??= host.themes!.begin(revision);
        return lease.show(typeof value === 'string' ? value : host.themes!.selected());
      }
      host.previewComposerShape?.(isComposerShape(value) ? value : undefined);
      return true;
    },
    end(): void {
      if (ended) return;
      ended = true;
      if (key === 'theme') lease?.end();
      else host.previewComposerShape?.(undefined);
    },
  };
}
