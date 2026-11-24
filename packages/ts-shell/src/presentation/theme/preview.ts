import { listThemes } from '../themes/index.js';
import { beginThemePreview, prepareThemeSelection, selectedTheme, themeSelectionRevision, type ThemePreview } from './selection.js';

export interface ThemePreferences {
  names(): readonly string[];
  selected(): string;
  revision(): number;
  begin(expectedRevision?: number): ThemePreview;
  selectForSession(name: string, expectedRevision: number): boolean;
}

/** Connect palette ownership to the host's watcher and repaint lifecycle. */
export function themePreferences(options: {
  readonly workspaceRoot: string;
  readonly extraPaths?: readonly string[];
  readonly follower: { stop(): void; refresh(): void };
  readonly redraw: () => void;
}): ThemePreferences {
  return {
    names: () => [...new Set(['auto', ...listThemes(options.workspaceRoot, options.extraPaths), selectedTheme()])],
    selected: selectedTheme,
    revision: themeSelectionRevision,
    selectForSession(name, expectedRevision) {
      if (themeSelectionRevision() !== expectedRevision) return false;
      const apply = prepareThemeSelection(name, options.workspaceRoot, options.extraPaths);
      if (themeSelectionRevision() !== expectedRevision) return false;
      apply();
      options.follower.refresh();
      options.redraw();
      return true;
    },
    begin(expectedRevision) {
      const lease = beginThemePreview({
        workspaceRoot: options.workspaceRoot, extraPaths: options.extraPaths,
        expectedRevision,
        onEnd: () => { options.follower.refresh(); options.redraw(); },
      });
      if (expectedRevision === undefined || expectedRevision === themeSelectionRevision()) options.follower.stop();
      return {
        show(name) { const shown = lease.show(name); if (shown) options.redraw(); return shown; },
        end: lease.end,
      };
    },
  };
}
