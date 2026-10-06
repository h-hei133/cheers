import { OptionModel, type Option } from "../../presentation/tui/chrome/options.js";
import { renderModal, modalBody } from "../../presentation/tui/chrome/modal.js";
import { renderPanel } from "../../presentation/tui/chrome/panel.js";
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";
import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { defaultTheme } from "../../presentation/theme/theme.js";
import { CURSOR_MARKER } from "../../presentation/tui/render/paint.js";
import { truncateToWidth } from "../../presentation/tui/text/layout.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import { InputForm, type PickerInput } from './picker/input.js';
import type { CommandReport } from '../../core/commands/report/contract.js';

/**
 * The active picker.
 *
 * A picker is data plus two callbacks; this holds whichever one is open, routes
 * keys to it, and renders it in whichever form it asked for. Keeping the routing
 * here — rather than in the main keymap — is what lets an open picker consume
 * every key it needs without the keymap having to know which keys those are.
 */

export type PickerForm = "panel" | "modal";

export interface PickerOutcome {
  /** Read-only documentation to retain in the transcript and open for reading. */
  readonly report?: CommandReport;
  /** Continue a staged interaction in this same overlay without writing. */
  readonly next?: Picker;
  /** Text to append to the transcript. */
  readonly note?: string;
  /**
   * Text to place in the prompt instead of acting immediately. Used where the
   * next step needs explicit submission or arguments — the user gets the exact
   * command with the cursor after it.
   */
  readonly draft?: string;
}

export interface Picker {
  /** Keep typed/pasted input within a staged interaction while its step applies. */
  readonly holdInput?: boolean;
  readonly input?: PickerInput<PickerOutcome | undefined>;
  readonly title: string;
  readonly form: PickerForm;
  /** Queue new submissions until a conversation-changing selection has settled. */
  readonly exclusive?: boolean;
  readonly initialSelection?: string;
  readonly initialFilter?: string;
  /** Shown when the option set turns out to be empty. */
  readonly empty: string;
  /** Safe failure text when loading fails, distinct from a successful empty set. */
  readonly loadError?: string;
  readonly footer?: string;
  /** True when the picker collects several answers before applying. */
  readonly multiple?: boolean;
  /**
   * False when typing must never narrow the options. The approval picker owns
   * single-key shortcuts (1/y, 2/a, 3/n/d), so any other keystroke is absorbed
   * without touching the filter — otherwise the shortcut hints painted on the
   * right read as filter text being typed.
   */
  readonly filterable?: boolean;
  /** Rows each option occupies beyond its first, in the full-screen form. */
  readonly detailRows?: number;
  /** Options to offer; may hit the network or the filesystem. */
  load(): Promise<readonly Option[]>;
  /** Publish live options until the host releases the subscription on close. */
  subscribe?(publish: (options: readonly Option[]) => void): () => void;
  /** Apply the choice, reporting what to show or to draft next. */
  apply(ids: readonly string[]): Promise<PickerOutcome | undefined>;
  /**
   * The selection changed but has not been applied. A picker whose subject is
   * visible on screen can show what the choice would look like here — nothing is
   * saved, and {@link previewEnd} puts the display back.
   */
  previewChange?(ids: readonly string[]): void;
  /** The picker closed without applying; drop any preview. */
  previewEnd?(): void;
  /**
   * The user pressed Delete or Ctrl+D on the currently selected option. If the
   * picker implements this, the deletion is handled through the confirmation
   * dialog and refreshed afterwards.
   */
  onDelete?(id: string): Promise<string | undefined> | void;
  /**
   * The user pressed Ctrl+R to rename the selected option to `newTitle`.
   */
  onRename?(id: string, newTitle: string): Promise<string | undefined> | void;
  /**
   * The user denied permission. If implemented, user can provide an optional
   * reason string, or undefined when denied without reason.
   */
  onDeny?(reason: string | undefined): Promise<void> | void;
}

export class OverlayHost {
  private generation = 0;
  private input: InputForm | undefined;
  private picker: Picker | undefined;
  private model = new OptionModel();
  private loading = false;
  private loadFailed = false;
  private unsubscribe: (() => void) | undefined;
  private readonly optionRows = new Map<number, string>();
  private renderedWidth = 0;

  // In-TUI modal sub-modes for interactive delete confirmation and rename
  private subMode: "none" | "confirm-delete" | "rename" | "deny-reason" = "none";
  private subTargetId: string | undefined;
  private subTargetLabel: string | undefined;
  private renameDraft = "";
  private denyDraft = "";
  constructor(private readonly onChange: () => void) {}

  get active(): boolean {
    return this.picker !== undefined;
  }
  get revision(): number { return this.generation; }

  /** Whether the open picker wants the whole screen. */
  get fullScreen(): boolean {
    return this.picker?.form === "modal";
  }

  /** Open `picker`, loading its options in the background. */
  open(picker: Picker): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.model = new OptionModel();
    const generation = ++this.generation;
    this.input = picker.input ? new InputForm(picker.input) : undefined;
    this.optionRows.clear();
    this.picker?.previewEnd?.();
    this.picker = picker;
    this.loading = true;
    this.loadFailed = false;
    this.subMode = "none";
    this.subTargetId = undefined;
    this.subTargetLabel = undefined;
    this.renameDraft = "";
    this.denyDraft = "";
    this.model.setFilter(picker.initialFilter ?? "");
    this.onChange();
    void picker
      .load()
      .then((options) => {
        if (this.picker !== picker || this.generation !== generation) return;
        this.optionRows.clear();
        this.model.setOptions(options);
        if (picker.initialSelection) this.model.focus(picker.initialSelection);
        if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
        if (this.picker !== picker || this.generation !== generation) return;
        const unsubscribe = picker.subscribe?.(options => {
          if (this.picker !== picker || this.generation !== generation) return;
          this.optionRows.clear();
          this.model.setOptions(options);
          this.onChange();
        });
        if (this.picker === picker && this.generation === generation) this.unsubscribe = unsubscribe;
        else unsubscribe?.();
      })
      .catch(() => {
        if (this.picker === picker && this.generation === generation) {
          this.loadFailed = true;
          this.model.setOptions([]);
        }
      })
      .finally(() => {
        if (this.picker === picker && this.generation === generation) this.loading = false;
        this.onChange();
      });
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.generation++;
    this.input = undefined;
    this.optionRows.clear();
    this.picker?.previewEnd?.();
    this.picker = undefined;
    this.subMode = "none";
    this.subTargetId = undefined;
    this.subTargetLabel = undefined;
    this.renameDraft = "";
    this.loading = false;
    this.onChange();
  }

  /** Rows for the open picker at the given geometry, or none when closed. */
  render(width: number, height: number, availableRows = Math.max(0, height - 6)): string[] {
    this.optionRows.clear();
    this.renderedWidth = width;
    const picker = this.picker;
    if (!picker) return [];
    if (this.input) return this.input.render(picker.title, width, height);

    if (this.subMode === "confirm-delete") {
      return this.renderConfirmDelete(width, height);
    }
    if (this.subMode === "rename") {
      return this.renderRename(width, height);
    }
    if (this.subMode === "deny-reason") {
      return this.renderDenyReason(width, height);
    }
    const empty = this.loading ? "loading…" : this.loadFailed ? picker.loadError ?? picker.empty : picker.empty;
    const actionHints =
      picker.onDelete || picker.onRename
        ? `${picker.onDelete ? "^D delete" : ""}  ${picker.onRename ? "^R rename" : ""}`.trim()
        : undefined;

    if (picker.form === "modal") {
      return renderModal(
        this.model,
        {
          title: picker.title,
          empty,
          detailRows: picker.detailRows ?? 2,
          onOptionRow: (row, id) => this.optionRows.set(row, id),
          ...(actionHints ? { actionHints } : {}),
        },
        width,
        height,
      );
    }
    const isApproval =
      picker.title.startsWith("Permission:") ||
      (this.model.visible.some((o) => o.id === "allow-once") &&
        this.model.visible.some((o) => o.id === "deny"));
    return renderPanel(
      this.model,
      {
        title: picker.title,
        empty,
        multiple: picker.multiple === true,
        filterable: picker.filterable,
        footer: picker.footer,
        hideCount: isApproval,
        onOptionRow: (row, id) => this.optionRows.set(row, id),
      },
      width,
      Math.max(0, Math.min(height, availableRows)),
    );
  }

  /** A picker owns pointer input; a click focuses, and keyboard confirmation applies. */
  handlePointer(report: MouseReport, top?: number): boolean {
    if (!this.picker) return false;
    if (this.input) return true;
    if (!this.loading && this.subMode === "none" && top !== undefined &&
        report.kind === "press" && report.button === 0 && !report.shift && !report.alt && !report.ctrl &&
        report.column >= 0 && report.column < this.renderedWidth) {
      const id = this.optionRows.get(report.row - top);
      if (id !== undefined) {
        this.model.focus(id);
        if (!this.picker.multiple) this.picker.previewChange?.(idsOf(this.model.current()));
        this.onChange();
      }
    }
    return true;
  }

  /** Pasted form text never reaches the underlying conversation draft. */
  handlePaste(text: string): boolean {
    if (!this.picker) return false;
    if (this.input) this.input.paste(text);
    else if (this.subMode === 'none' && this.picker.filterable !== false) {
      this.optionRows.clear();
      this.model.appendFilter(stripAnsi(text).replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, ''));
    }
    this.onChange();
    return true;
  }

  private renderConfirmDelete(width: number, height: number): string[] {
    const inner = Math.max(20, width - 2);
    const title = defaultTheme.bold(defaultTheme.fg("error", " Delete Session "));
    const fill = Math.max(0, inner - 18);
    const rows: string[] = [
      defaultTheme.fg("border", "┌") + title + defaultTheme.fg("border", `${"─".repeat(fill)}┐`),
      modalBody("", inner),
      modalBody(defaultTheme.bold("Delete this session from disk?"), inner),
      modalBody("", inner),
      modalBody(defaultTheme.fg("accent", `  ${this.subTargetLabel ?? ""}`), inner),
      modalBody("", inner),
      modalBody(defaultTheme.dim("  This will permanently delete the conversation and cannot be undone."), inner),
      modalBody("", inner),
      modalBody(`  ${defaultTheme.fg("error", "[y / Enter] Delete")}    ${defaultTheme.fg("muted", "[n / Esc] Cancel")}`, inner),
      modalBody("", inner),
    ];
    while (rows.length < height - 1) rows.push(modalBody("", inner));
    rows.push(defaultTheme.fg("border", `└${"─".repeat(inner)}┘`));
    return rows.slice(0, height);
  }

  private renderRename(width: number, height: number): string[] {
    const inner = Math.max(20, width - 2);
    const title = defaultTheme.bold(defaultTheme.fg("accent", " Rename Session "));
    const fill = Math.max(0, inner - 18);
    const rows: string[] = [
      defaultTheme.fg("border", "┌") + title + defaultTheme.fg("border", `${"─".repeat(fill)}┐`),
      modalBody("", inner),
      modalBody(defaultTheme.dim(`Current: "${this.subTargetLabel ?? ""}"`), inner),
      modalBody("", inner),
      modalBody(defaultTheme.bold("New title:") + " " + defaultTheme.fg("accent", this.renameDraft) + CURSOR_MARKER + "█", inner),
      modalBody("", inner),
      modalBody(`  ${defaultTheme.fg("success", "[Enter] Save")}    ${defaultTheme.fg("muted", "[Esc] Cancel")}`, inner),
      modalBody("", inner),
    ];
    while (rows.length < height - 1) rows.push(modalBody("", inner));
    rows.push(defaultTheme.fg("border", `└${"─".repeat(inner)}┘`));
    return rows.slice(0, height);
  }

  private renderDenyReason(width: number, height: number): string[] {
    const isModal = this.picker?.form === "modal";
    if (isModal) {
      const inner = Math.max(20, width - 2);
      const title = defaultTheme.bold(defaultTheme.fg("warning", " Deny Permission "));
      const fill = Math.max(0, inner - 19);
      const rows: string[] = [
        defaultTheme.fg("border", "┌") + title + defaultTheme.fg("border", `${"─".repeat(fill)}┐`),
        modalBody("", inner),
        modalBody(defaultTheme.bold("Explain why this was denied (optional):"), inner),
        modalBody("", inner),
        modalBody(`  > ${defaultTheme.fg("accent", this.denyDraft)}${CURSOR_MARKER}█`, inner),
        modalBody("", inner),
        modalBody(`  ${defaultTheme.fg("success", "[Enter] Submit")}    ${defaultTheme.fg("muted", "[Esc] Skip (no reason)")}`, inner),
        modalBody("", inner),
      ];
      while (rows.length < height - 1) rows.push(modalBody("", inner));
      rows.push(defaultTheme.fg("border", `└${"─".repeat(inner)}┘`));
      return rows.slice(0, height);
    }
    const title = defaultTheme.bold(`  Permission Denied: ${this.picker?.title.replace(/^Permission:\s*/, "") ?? ""}`);
    const prompt = defaultTheme.dim("  Explain why this was denied (optional, press Enter to skip):");
    const input = `  > ${defaultTheme.fg("accent", this.denyDraft)}${CURSOR_MARKER}█`;
    const hints = defaultTheme.dim("  [Enter] Submit reason    [Esc] Deny without reason");
    return [
      truncateToWidth(title, width),
      truncateToWidth(prompt, width),
      truncateToWidth(input, width),
      truncateToWidth(hints, width),
    ];
  }

  /**
   * Route one key. Returns false only for keys the picker does not claim, which
   * currently means nothing: a picker owns the keyboard while it is open.
   */
  handleKey(event: ParsedKeyEvent, apply: (picker: Picker, ids: readonly string[]) => void): boolean {
    const picker = this.picker;
    if (!picker) return false;
    if (this.input) {
      if (event.keyId === 'escape' || event.keyId === 'ctrl+c') this.close();
      else if (event.keyId === 'enter') {
        const value = this.input.value();
        if (value !== undefined) this.acceptDirect({ ...picker, apply: () => picker.input!.apply(value) }, apply, []);
      } else this.input.key(event);
      this.onChange();
      return true;
    }

    // Sub-mode: confirm delete
    if (this.subMode === "confirm-delete") {
      if (event.keyId === "y" || event.keyId === "enter") {
        const id = this.subTargetId;
        this.subMode = "none";
        this.subTargetId = undefined;
        this.subTargetLabel = undefined;
        if (id && picker.onDelete) {
          const maybe = picker.onDelete(id);
          if (maybe instanceof Promise) void maybe.then(() => this.reload());
          else this.reload();
        }
        this.onChange();
        return true;
      }
      if (event.keyId === "n" || event.keyId === "escape") {
        this.subMode = "none";
        this.subTargetId = undefined;
        this.subTargetLabel = undefined;
        this.onChange();
        return true;
      }
      return true; // absorb all other keys while dialog is up
    }

    // Sub-mode: rename session
    if (this.subMode === "rename") {
      if (event.keyId === "escape") {
        this.subMode = "none";
        this.subTargetId = undefined;
        this.subTargetLabel = undefined;
        this.renameDraft = "";
        this.onChange();
        return true;
      }
      if (event.keyId === "enter") {
        const id = this.subTargetId;
        const newTitle = this.renameDraft.trim();
        this.subMode = "none";
        this.subTargetId = undefined;
        this.subTargetLabel = undefined;
        this.renameDraft = "";
        if (id && newTitle && picker.onRename) {
          const maybe = picker.onRename(id, newTitle);
          if (maybe instanceof Promise) void maybe.then(() => this.reload());
          else this.reload();
        }
        this.onChange();
        return true;
      }
      if (event.keyId === "backspace") {
        if (this.renameDraft.length > 0) {
          this.renameDraft = this.renameDraft.slice(0, -1);
          this.onChange();
        }
        return true;
      }
      if (event.text && !event.ctrl && !event.alt) {
        this.renameDraft += event.text;
        this.onChange();
        return true;
      }
      return true; // absorb all other keys while renaming
    }
    // Sub-mode: deny with optional reason
    if (this.subMode === "deny-reason") {
      if (event.keyId === "enter") {
        const reason = this.denyDraft.trim();
        const onDeny = this.picker?.onDeny;
        this.close();
        void onDeny?.(reason || undefined);
        return true;
      }
      if (event.keyId === "escape" || (event.ctrl && (event.keyId === "c" || event.keyId === "ctrl+c"))) {
        const onDeny = this.picker?.onDeny;
        this.close();
        void onDeny?.(undefined);
        return true;
      }
      if (event.keyId === "backspace") {
        if (this.denyDraft.length > 0) {
          this.denyDraft = this.denyDraft.slice(0, -1);
          this.onChange();
        }
        return true;
      }
      if (event.text && !event.ctrl && !event.alt) {
        this.denyDraft += event.text;
        this.onChange();
        return true;
      }
      return true; // absorb all other keys while typing reason
    }

    // Normal navigation mode
    const isApprovalPicker =
      picker.title.startsWith("Permission:") ||
      (this.model.visible.some((o) => o.id === "allow-once") &&
        this.model.visible.some((o) => o.id === "deny"));

    if (isApprovalPicker) {
      const key = event.keyId.toLowerCase();
      const text = (event.text ?? "").toLowerCase();
      if (key === "y" || key === "1" || text === "1" || text === "y") {
        this.acceptDirect(picker, apply, ["allow-once"]);
        return true;
      }
      if (key === "a" || key === "2" || text === "2" || text === "a") {
        this.acceptDirect(picker, apply, ["allow-always"]);
        return true;
      }
      if (key === "n" || key === "d" || key === "3" || text === "3" || text === "n" || text === "d") {
        if (picker.onDeny) {
          this.subMode = "deny-reason";
          this.denyDraft = "";
          this.onChange();
          return true;
        }
        this.acceptDirect(picker, apply, ["deny"]);
        return true;
      }
      if (key === "j") {
        this.model.step(1);
        this.onChange();
        return true;
      }
      if (key === "k") {
        this.model.step(-1);
        this.onChange();
        return true;
      }
    }

    switch (event.keyId) {
      case "delete":
      case "ctrl+d": {
        if (picker.onDelete) {
          const current = this.model.current();
          if (current) {
            this.subMode = "confirm-delete";
            this.subTargetId = current.id;
            this.subTargetLabel = current.label;
            this.onChange();
            return true;
          }
        }
        break;
      }
      case "ctrl+r": {
        if (picker.onRename) {
          const current = this.model.current();
          if (current) {
            this.subMode = "rename";
            this.subTargetId = current.id;
            this.subTargetLabel = current.label;
            this.renameDraft = current.label === "New session" ? "" : current.label;
            this.onChange();
            return true;
          }
        }
        break;
      }
      case "escape":
      case "ctrl+c":
        if (isApprovalPicker && picker.onDeny) {
          void picker.onDeny(undefined);
        }
        this.close();
        return true;
      case "up":
        this.model.step(-1);
        if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
        break;
      case "down":
        this.model.step(1);
        if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
        break;
      case "space":
        if (picker.multiple) {
          this.model.toggle();
          picker.previewChange?.(this.model.chosenIds());
        } else if (!isApprovalPicker && picker.filterable !== false) {
          this.optionRows.clear();
          this.model.appendFilter(" ");
        }
        break;
      case "backspace":
        if (!isApprovalPicker && picker.filterable !== false) {
          this.optionRows.clear();
          this.model.backspaceFilter();
        }
        break;
      case "enter":
        if (isApprovalPicker && this.model.current()?.id === "deny" && picker.onDeny) {
          this.subMode = "deny-reason";
          this.denyDraft = "";
          this.onChange();
          return true;
        }
        this.accept(picker, apply);
        return true;
      default:
        if (event.ctrl && (event.keyId === "c" || event.keyId === "ctrl+c")) {
          this.close();
          return true;
        }
        if (event.text && !event.ctrl && !event.alt) {
          if (!isApprovalPicker && picker.filterable !== false) {
            this.optionRows.clear();
            this.model.appendFilter(event.text);
          }
        } else {
          return true;
        }
    }
    this.onChange();
    return true;
  }

  private reload(): void {
    if (!this.picker) return;
    void this.picker
      .load()
      .then((options) => {
        this.optionRows.clear();
        this.model.setOptions(options);
        this.onChange();
      })
      .catch(() => {
        this.model.setOptions([]);
        this.onChange();
      });
  }

  private accept(picker: Picker, apply: (picker: Picker, ids: readonly string[]) => void): void {
    const ids = picker.multiple ? this.model.chosenIds() : idsOf(this.model.current());
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.picker = undefined;
    this.subMode = "none";
    this.loading = false;
    this.onChange();
    if (ids.length > 0 || picker.multiple) {
      apply(picker, ids);
    } else {
      picker.previewEnd?.();
    }
  }
  private acceptDirect(picker: Picker, apply: (picker: Picker, ids: readonly string[]) => void, ids: readonly string[]): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.picker = undefined;
    this.subMode = "none";
    this.loading = false;
    this.onChange();
    apply(picker, ids);
  }
}

function idsOf(option: Option | undefined): readonly string[] {
  return option ? [option.id] : [];
}
