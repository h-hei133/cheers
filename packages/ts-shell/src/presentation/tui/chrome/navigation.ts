import { defaultTheme } from '../../theme/theme.js';
import { padToWidth, truncateToWidth } from '../text/layout.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { renderPanel, type PanelChrome } from './panel.js';
import type { OptionModel } from './options.js';

export interface NavigationChrome {
  readonly items: readonly { readonly id: string; readonly label: string; readonly note?: string }[];
  readonly active: string;
  readonly focused: boolean;
  readonly onItem: (row: number, id: string, from: number, to: number) => void;
}

/** Wide frames keep navigation visible; narrow frames dedicate it a focus page. */
export function renderNavigation(model: OptionModel, chrome: PanelChrome, navigation: NavigationChrome, width: number, height: number): string[] {
  if (width <= 0 || height <= 0) return [];
  const narrow = width < 72;
  if (narrow && !navigation.focused) return renderPanel(model, chrome, width, height);
  const navWidth = narrow ? width : Math.min(24, Math.max(18, Math.floor(width / 5)));
  const current = Math.max(0, navigation.items.findIndex(item => item.id === navigation.active));
  const capacity = Math.max(0, height - 2);
  const offset = Math.max(0, Math.min(current - Math.floor(capacity / 2), navigation.items.length - capacity));
  const rows = [defaultTheme.bold(truncateToWidth('  Browse', navWidth))];
  for (const item of navigation.items.slice(offset, offset + capacity)) {
    const active = item.id === navigation.active;
    const label = neutraliseForDisplay(item.label);
    const text = `${active && navigation.focused ? '▸' : active ? '•' : ' '} ${label}${item.note ? ` ${neutraliseForDisplay(item.note)}` : ''}`;
    const line = padToWidth(truncateToWidth(text, navWidth), navWidth);
    navigation.onItem(rows.length, item.id, 0, navWidth);
    rows.push(active ? defaultTheme.bg('selectedBg', line) : line);
  }
  if (narrow) return [...rows, truncateToWidth('Enter: content · Esc: close', width)].slice(0, height);
  const body = renderPanel(model, { ...chrome,
    onListRow: (row, from, to) => chrome.onListRow?.(row, navWidth + 1 + from, navWidth + 1 + to),
    onOptionRow: (row, id, from = 0, to = width) =>
    chrome.onOptionRow?.(row, id, navWidth + 1 + from, navWidth + 1 + to) }, width - navWidth - 1, height);
  return Array.from({ length: Math.min(height, Math.max(rows.length, body.length)) }, (_, row) =>
    padToWidth(rows[row] ?? '', navWidth) + defaultTheme.fg('border', '│') + (body[row] ?? ''));
}
