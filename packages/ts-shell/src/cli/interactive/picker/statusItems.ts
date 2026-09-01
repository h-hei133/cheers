import {
  normalizeStatusItems,
  STATUS_ITEMS,
  type StatusItemId,
} from "../../../presentation/tui/chrome/items.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";

/**
 * Status band chooser.
 *
 * Multi-select over the item vocabulary, applied in canonical order so the band
 * layout is stable regardless of the order the boxes were ticked.
 */

export interface StatusItemPickerOptions {
  readonly current: readonly StatusItemId[];
  /** Persist the chosen items and report the outcome. */
  readonly save: (items: readonly StatusItemId[]) => Promise<string | undefined>;
}

export function statusItemPicker(options: StatusItemPickerOptions): Picker {
  const chosen = new Set(options.current);
  return {
    title: "Status band items",
    form: "panel",
    empty: "No status items available.",
    multiple: true,
    async load(): Promise<readonly Option[]> {
      return STATUS_ITEMS.map<Option>((item) => ({
        id: item.id,
        label: item.label,
        detail: item.describe,
        selected: chosen.has(item.id),
      }));
    },
    async apply(ids: readonly string[]): Promise<string | undefined> {
      return options.save(normalizeStatusItems(ids));
    },
  };
}
