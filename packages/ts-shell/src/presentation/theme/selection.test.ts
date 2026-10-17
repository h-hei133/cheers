import { expect, it } from 'vitest';
import { beginThemePreview, selectTheme, selectedTheme, themeSelectionRevision } from './selection.js';

it('refuses a preview started against a superseded selection revision', () => {
  const lease = beginThemePreview({ expectedRevision: themeSelectionRevision() - 1, onEnd: () => {} });
  expect(lease.show(selectedTheme())).toBe(false);
  lease.end();
});

it('stops showing and stops restoring once another writer changes the selection', () => {
  const ends: number[] = [];
  const lease = beginThemePreview({ expectedRevision: themeSelectionRevision(), onEnd: () => ends.push(1) });
  expect(lease.show(selectedTheme())).toBe(true);
  selectTheme(selectedTheme());
  expect(lease.show(selectedTheme())).toBe(false);
  lease.end();
  expect(ends).toHaveLength(1);
  expect(selectedTheme()).toBe(selectedTheme());
});
