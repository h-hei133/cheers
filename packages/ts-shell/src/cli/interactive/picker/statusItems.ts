import {
  normalizeStatusItems,
  STATUS_ITEMS,
  type StatusItemId,
} from "../../../presentation/tui/chrome/items.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Status band chooser.
 *
 * The band is right there under the list, so a tick shows up in it immediately —
 * choosing which facts to keep is a visual judgement, and making it from a list of
 * names alone is guessing. The preview is only a preview: it is not written
 * anywhere until Enter, and leaving with Escape puts the saved band straight back.
 *
 * Items are applied in canonical order, so the layout is stable regardless of the
 * order the boxes were ticked.
 */

export interface StatusItemPickerOptions {
  readonly current: readonly StatusItemId[];
  /** Persist the chosen items and report the outcome. */
  readonly save: (items: readonly StatusItemId[]) => Promise<string | undefined>;
  /** Show `items` in the band without saving them. */
  readonly preview: (items: readonly StatusItemId[] | undefined) => void;
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
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const items = normalizeStatusItems(ids);
      options.preview(undefined);
      const note = await options.save(items);
      return note ? { note } : undefined;
    },
    previewChange(ids: readonly string[]): void {
      options.preview(normalizeStatusItems(ids));
    },
    previewEnd(): void {
      options.preview(undefined);
    },
  };
}
