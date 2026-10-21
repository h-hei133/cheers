import type { Picker } from '../overlay.js';

/** A stale or failing display binding can only suppress publication. */
export function pickerIsCurrent(picker: Picker): boolean {
  try { return picker.isCurrent?.() ?? true; } catch { return false; }
}
