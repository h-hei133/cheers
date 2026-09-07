import { componentTheme } from "./theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { OptionModel, type Option } from "../chrome/options.js";
import { scrollWindow } from "../chrome/window.js";
import type { PointerEvent, PointerResult, ViewComponent } from "./contract.js";

const theme = componentTheme();

export interface SelectCallbacks {
  readonly onSelect?: (option: Option) => void;
  readonly onCancel?: () => void;
}

export class SelectList implements ViewComponent {
  private readonly model: OptionModel;
  private readonly callbacks: SelectCallbacks;
  private maxVisible: number;
  private offset = 0;

  constructor(model?: OptionModel, maxVisible = 5, callbacks: SelectCallbacks = {}) {
    this.model = model ?? new OptionModel();
    this.maxVisible = Math.max(1, Math.floor(maxVisible));
    this.callbacks = callbacks;
  }

  get inner(): OptionModel {
    return this.model;
  }

  setOptions(options: readonly Option[]): void {
    this.model.setOptions(options);
  }

  setFilter(query: string): void {
    this.model.setFilter(query);
  }

  move(delta: 1 | -1): void {
    this.model.step(delta);
  }

  accept(): void {
    const current = this.model.current();
    if (current) this.callbacks.onSelect?.(current);
  }

  cancel(): void {
    this.callbacks.onCancel?.();
  }

  handleInput(data: string): void {
    if (data === "\x1b[A") this.model.step(-1);
    else if (data === "\x1b[B") this.model.step(1);
    else if (data === "\r" || data === "\n") this.accept();
    else if (data === "\x1b") this.cancel();
    else if (data === "\x7f") this.model.backspaceFilter();
    else if (data.length === 1 && data >= " ") this.model.appendFilter(data);
  }

  handlePointer(event: PointerEvent): PointerResult | undefined {
    if (event.kind === "wheel" && event.wheelDelta) {
      this.model.step(event.wheelDelta < 0 ? -1 : 1);
      return { handled: true };
    }
    if (event.kind !== "press" && event.kind !== "click") return undefined;
    const window = scrollWindow(this.model.selectedIndex, this.model.total, this.maxVisible, this.offset);
    this.offset = window.offset;
    // Row 0 is the first option: render emits no header, so the event row
    // maps directly into the window (Pi select-list parity).
    const index = window.offset + event.y;
    const option = this.model.visible[index];
    if (!option || option.disabled) return undefined;
    if (event.kind === "press") {
      const at = this.model.visible.indexOf(option);
      if (at >= 0) this.moveTo(at);
      return { handled: true, focus: true };
    }
    this.callbacks.onSelect?.(option);
    return { handled: true };
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safe = Math.max(8, Math.floor(width));
    const visible = this.model.visible;
    if (visible.length === 0) return [theme.muted("  No matching options")];
    const window = scrollWindow(this.model.selectedIndex, visible.length, this.maxVisible, this.offset);
    this.offset = window.offset;
    const labelWidth = Math.min(
      Math.max(...visible.map((option) => visibleWidth(option.label)), 8),
      Math.max(8, safe - 12),
    );
    const lines: string[] = [];
    for (let i = window.offset; i < window.offset + window.count; i++) {
      const option = visible[i]!;
      const active = i === this.model.selectedIndex;
      const marker = active ? theme.accent("❯ ") : "  ";
      const label = truncateToWidth(option.label, labelWidth);
      const detail = option.detail ? theme.muted(` ${truncateToWidth(option.detail, Math.max(0, safe - labelWidth - 6))}`) : "";
      const row = truncateToWidth(`${marker}${padToWidth(label, labelWidth)}${detail}`, safe);
      lines.push(active ? theme.selected(padToWidth(row, safe)) : row);
    }
    if (window.above > 0 || window.below > 0) {
      lines.push(theme.muted(truncateToWidth(`  (${this.model.selectedIndex + 1}/${visible.length})`, safe)));
    }
    return lines;
  }

  private moveTo(index: number): void {
    const delta = index - this.model.selectedIndex;
    const steps = Math.abs(delta);
    for (let i = 0; i < steps; i++) this.model.step(delta < 0 ? -1 : 1);
  }
}
