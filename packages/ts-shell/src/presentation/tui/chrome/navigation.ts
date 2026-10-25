import { defaultTheme } from '../../theme/theme.js';
import { padToWidth, truncateToWidth } from '../text/layout.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { renderPanel, type PanelChrome } from './panel.js';
import type { OptionModel } from './options.js';
import { scrollWindow, type ListWindow } from './window.js';

/** Sidebar panning changes its viewport independently from the active category. */
export class NavigationViewport {
  private offset = 0;
  private capacity = 0;
  private items: NavigationChrome['items'] = [];
  private active?: string;
  private focused = false;
  private narrow = false;

  window(items: NavigationChrome['items'], active: string, capacity: number, focused: boolean, narrow: boolean): ListWindow {
    const follow = active !== this.active || (focused && !this.focused) || narrow !== this.narrow || capacity !== this.capacity;
    if (items !== this.items) {
      const anchor = this.items[this.offset]?.id;
      const index = anchor === undefined ? -1 : items.findIndex(item => item.id === anchor);
      if (index >= 0) this.offset = index;
    }
    this.items = items; this.active = active; this.focused = focused; this.narrow = narrow; this.capacity = capacity;
    const count = Math.max(0, Math.min(capacity, items.length));
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, items.length - count)));
    if (follow && count > 0) this.offset = scrollWindow(Math.max(0, items.findIndex(item => item.id === active)), items.length, count, this.offset).offset;
    return { offset: this.offset, count, above: this.offset, below: items.length - this.offset - count };
  }

  pan(delta: -1 | 1): boolean {
    if (this.capacity <= 0) return false;
    const next = Math.max(0, Math.min(this.offset + delta, Math.max(0, this.items.length - this.capacity)));
    if (next === this.offset) return false;
    this.offset = next;
    return true;
  }

  reveal(): void { this.active = undefined; }
}

export interface NavigationChrome {
  readonly items: readonly { readonly id: string; readonly label: string; readonly note?: string }[];
  readonly active: string;
  readonly focused: boolean;
  readonly viewport?: NavigationViewport;
  readonly onItem: (row: number, id: string, from: number, to: number) => void;
  readonly onSidebarRow?: (row: number, from: number, to: number) => void;
}

/** Wide frames keep navigation visible; narrow frames dedicate it a focus page. */
export function renderNavigation(model: OptionModel, chrome: PanelChrome, navigation: NavigationChrome, width: number, height: number): string[] {
  if (width <= 0 || height <= 0) return [];
  const narrow = width < 72;
  const navWidth = narrow ? width : Math.min(24, Math.max(18, Math.floor(width / 5)));
  const current = Math.max(0, navigation.items.findIndex(item => item.id === navigation.active));
  const capacity = Math.max(0, height - 2);
  const offset = navigation.viewport?.window(navigation.items, navigation.active, capacity, navigation.focused, narrow).offset
    ?? Math.max(0, Math.min(current - Math.floor(capacity / 2), navigation.items.length - capacity));
  if (narrow && !navigation.focused) return renderPanel(model, chrome, width, height);
  const rows = [defaultTheme.bold(truncateToWidth('  Browse', navWidth))];
  for (const item of navigation.items.slice(offset, offset + capacity)) {
    const active = item.id === navigation.active;
    const label = neutraliseForDisplay(item.label);
    const text = `${active && navigation.focused ? '▸' : active ? '•' : ' '} ${label}${item.note ? ` ${neutraliseForDisplay(item.note)}` : ''}`;
    const line = padToWidth(truncateToWidth(text, navWidth), navWidth);
    navigation.onItem(rows.length, item.id, 0, navWidth);
    navigation.onSidebarRow?.(rows.length, 0, navWidth);
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
