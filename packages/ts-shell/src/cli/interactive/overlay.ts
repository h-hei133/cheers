import { OptionModel, type Option } from "../../presentation/tui/chrome/options.js";
import { renderModal } from "../../presentation/tui/chrome/modal.js";
import { renderPanel } from "../../presentation/tui/chrome/panel.js";
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";

/**
 * The active picker.
 *
 * A picker is data plus two callbacks; this holds whichever one is open, routes
 * keys to it, and renders it in whichever form it asked for. Keeping the routing
 * here — rather than in the main keymap — is what lets an open picker consume
 * every key it needs without the keymap having to know which keys those are.
 */

export type PickerForm = "panel" | "modal";

export interface Picker {
  readonly title: string;
  readonly form: PickerForm;
  /** Shown when the option set turns out to be empty. */
  readonly empty: string;
  /** True when the picker collects several answers before applying. */
  readonly multiple?: boolean;
  /** Rows each option occupies beyond its first, in the full-screen form. */
  readonly detailRows?: number;
  /** Options to offer; may hit the network or the filesystem. */
  load(): Promise<readonly Option[]>;
  /** Apply the choice. Any returned text is appended to the transcript. */
  apply(ids: readonly string[]): Promise<string | undefined>;
}

/** Rows the inline panel is allowed to occupy. */
const PANEL_ROWS = 12;

export class OverlayHost {
  private picker: Picker | undefined;
  private readonly model = new OptionModel();
  private loading = false;

  constructor(private readonly onChange: () => void) {}

  get active(): boolean {
    return this.picker !== undefined;
  }

  /** Whether the open picker wants the whole screen. */
  get fullScreen(): boolean {
    return this.picker?.form === "modal";
  }

  /** Open `picker`, loading its options in the background. */
  open(picker: Picker): void {
    this.picker = picker;
    this.loading = true;
    this.model.setOptions([]);
    this.model.setFilter("");
    this.onChange();
    void picker
      .load()
      .then((options) => {
        if (this.picker !== picker) return;
        this.model.setOptions(options);
      })
      .catch(() => {
        if (this.picker === picker) this.model.setOptions([]);
      })
      .finally(() => {
        if (this.picker === picker) this.loading = false;
        this.onChange();
      });
  }

  close(): void {
    this.picker = undefined;
    this.loading = false;
    this.onChange();
  }

  /** Rows for the open picker at the given geometry, or none when closed. */
  render(width: number, height: number): string[] {
    const picker = this.picker;
    if (!picker) return [];
    const empty = this.loading ? "loading…" : picker.empty;
    if (picker.form === "modal") {
      return renderModal(this.model, { title: picker.title, empty, detailRows: picker.detailRows ?? 2 }, width, height);
    }
    return renderPanel(
      this.model,
      { title: picker.title, empty, multiple: picker.multiple === true },
      width,
      Math.min(PANEL_ROWS, Math.max(4, height - 6)),
    );
  }

  /**
   * Route one key. Returns false only for keys the picker does not claim, which
   * currently means nothing: a picker owns the keyboard while it is open.
   */
  handleKey(event: ParsedKeyEvent, apply: (picker: Picker, ids: readonly string[]) => void): boolean {
    const picker = this.picker;
    if (!picker) return false;
    switch (event.keyId) {
      case "escape":
        this.close();
        return true;
      case "up":
        this.model.step(-1);
        break;
      case "down":
        this.model.step(1);
        break;
      case "space":
        if (picker.multiple) this.model.toggle();
        else this.model.appendFilter(" ");
        break;
      case "backspace":
        this.model.backspaceFilter();
        break;
      case "enter":
        this.accept(picker, apply);
        return true;
      default:
        if (event.text) this.model.appendFilter(event.text);
        else return true;
    }
    this.onChange();
    return true;
  }

  private accept(picker: Picker, apply: (picker: Picker, ids: readonly string[]) => void): void {
    const ids = picker.multiple ? this.model.chosenIds() : idsOf(this.model.current());
    this.close();
    // A single-select picker with nothing under the cursor has no answer to
    // apply; a multi-select one applying an empty set is a real choice.
    if (ids.length > 0 || picker.multiple) apply(picker, ids);
  }
}

function idsOf(option: Option | undefined): readonly string[] {
  return option && !option.disabled ? [option.id] : [];
}
