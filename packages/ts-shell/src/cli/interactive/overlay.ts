import { OptionModel, type Option, type OptionFilter } from "../../presentation/tui/chrome/options.js";
import { renderModal, modalBody } from "../../presentation/tui/chrome/modal.js";
import { renderPanel } from "../../presentation/tui/chrome/panel.js";
import { renderNavigation } from '../../presentation/tui/chrome/navigation.js';
import type { PickerNavigation } from './picker/navigation.js';
import { chipStrip, type Chip } from "../../presentation/tui/chrome/chips.js";
import { Keybindings } from './keybindings.js';
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";
import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { defaultTheme } from "../../presentation/theme/theme.js";
import { CURSOR_MARKER } from "../../presentation/tui/render/paint.js";
import { truncateToWidth } from "../../presentation/tui/text/layout.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import { InputForm, type PickerInput } from './picker/input.js';
import type { CommandReport } from '../../core/commands/report/contract.js';
import { renderDenial } from './overlay/denial.js';

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
  /** The report already exists in the transcript; open it without appending or persisting a copy. */
  readonly reportRetained?: boolean;
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

/** Action wrappers carry the original browser's opaque lifecycle identity. */
export const PICKER_OWNER = Symbol('picker owner');

export interface Picker {
  readonly [PICKER_OWNER]?: Picker;
  readonly navigation?: PickerNavigation;
  /** Start a fresh browsing lifecycle; mutation reloads do not call this. */
  onOpen?(): void;
  /** Suppress stale UI results; this check never grants write or execution authority. */
  readonly isCurrent?: () => boolean;
  /** Keep typed/pasted input within a staged interaction while its step applies. */
  readonly holdInput?: boolean;
  readonly input?: PickerInput<PickerOutcome | undefined>;
  readonly title: string;
  readonly form: PickerForm;
  /** Let a panel consume the whole frame while retaining its two-column layout. */
  readonly fullScreen?: boolean;
  /** Queue new submissions until a conversation-changing selection has settled. */
  readonly exclusive?: boolean;
  readonly initialSelection?: string;
  /** Untouched focus follows an owner's preferred candidate as rows arrive. */
  readonly defaultSelection?: (options: readonly Option[]) => string | undefined;
  /** Reconcile a disappeared focus against the preceding visible rows on refresh. */
  readonly replacementSelection?: (options: readonly Option[], previous: readonly Option[], focused: string) => string | undefined;
  readonly initialFilter?: string;
  /** Replace the initial filter after an asynchronous source resolves. */
  readonly resolvedFilter?: string;
  /** Shown when the option set turns out to be empty. */
  readonly empty: string;
  /** Safe failure text when loading fails, distinct from a successful empty set. */
  readonly loadError?: string;
  readonly footer?: string;
  /** An explicit parent for nested browsing; Escape returns without applying. */
  readonly back?: () => Picker;
  /** Context that depends on which identities remain visible after filtering. */
  status?(visible: readonly Option[], query?: string): string | undefined;
  /** True when the picker collects several answers before applying. */
  readonly multiple?: boolean;
  /**
   * False when typing must never narrow the options. The approval picker owns
   * single-key shortcuts (1/y, 2/a, 3/n/d), so any other keystroke is absorbed
   * without touching the filter — otherwise the shortcut hints painted on the
   * right read as filter text being typed.
   */
  readonly filterable?: boolean;
  /** Search/group projection over the full loaded catalogue; performs no I/O. */
  readonly filterOptions?: OptionFilter;
  /** Search the complete authorized catalogue after a short debounce. */
  readonly search?: (query: string, signal?: AbortSignal) => Promise<readonly Option[]>;
  /** Invalidate any completed search projection as soon as the query changes. */
  readonly onSearchChange?: (query: string) => void;
  /** Delay before `search` starts, so held keys do not dispatch every prefix. */
  readonly searchDebounceMs?: number;
  /** Safe failure text when a catalogue search cannot complete. */
  readonly searchError?: string;
  /** Restore any query-dependent picker state when the user clears the filter. */
  readonly onSearchClear?: () => readonly Option[] | undefined;
  /** Rows each option occupies beyond its first, in the full-screen form. */
  readonly detailRows?: number;
  /** A second column in the inline panel when the surface is wide enough. */
  readonly detail?: (id: string | undefined) => readonly string[];
  /** Display-only hierarchy movement; returned identities still must be visible. */
  navigate?(direction: 'left' | 'right', id: string, query: string): {
    readonly options: readonly Option[];
    readonly focus?: string;
  } | undefined;
  /** A tab strip; selecting a chip opens the picker it returns. */
  readonly chips?: { readonly items: readonly Chip[]; readonly active: string; select(id: string): Picker | undefined };
  /** Options to offer; may hit the network or the filesystem. */
  load(signal?: AbortSignal): Promise<readonly Option[]>;
  /** Publish live options until the host releases the subscription on close. */
  subscribe?(publish: (options: readonly Option[]) => void): () => void;
  /** Opt in to receiving the host ownership check throughout asynchronous application. */
  readonly acceptsOwnership?: boolean;
  /** Apply the choice, reporting what to show or to draft next. */
  apply(ids: readonly string[], stillOwned?: () => boolean): Promise<PickerOutcome | undefined>;
  /** Browse a disabled-but-focusable row without authorizing its normal action. */
  inspect?(id: string): Promise<PickerOutcome | undefined>;
  /** Capture an accepted choice before the host releases its browser signal. */
  previewAccept?(): void;
  /** Prepare parent lifetime transfer; optional cleanup cancels an abandoned return. */
  previewBack?(): void | (() => void);
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
  /** The user pressed Ctrl+P to toggle the selected option's pinned state. */
  onPin?(id: string): Promise<string | undefined> | void;
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
  private loadController: AbortController | undefined;
  private actionPending = false;
  private actionNotice: string | undefined;
  private unsubscribe: (() => void) | undefined;
  private baseOptions: readonly Option[] = [];
  private searchController: AbortController | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private searchGeneration = 0;
  private searching = false;
  private searchFailed = false;
  private readonly optionRows = new Map<number, { readonly id: string; readonly from: number; readonly to: number }>();
  private readonly listRows = new Map<number, Array<{ readonly from: number; readonly to: number; readonly id: string; readonly sidebar?: boolean }>>();
  private hovered?: { readonly id: string; readonly sidebar?: boolean };
  private renderedGeometry = '';
  private readonly chipRows = new Map<number, Array<{ readonly id: string; readonly from: number; readonly to: number }>>();
  private renderedWidth = 0;
  private readonly acceptances = new WeakMap<Picker, () => boolean>();

  // In-TUI modal sub-modes for interactive delete confirmation and rename
  private subMode: "none" | "confirm-delete" | "rename" | "deny-reason" = "none";
  private subTargetId: string | undefined;
  private subTargetLabel: string | undefined;
  private renameDraft = "";
  private denyDraft = "";
  constructor(private readonly onChange: () => void, private readonly bindings = new Keybindings()) {}

  get active(): boolean {
    return this.picker !== undefined;
  }
  get revision(): number { return this.generation; }
  /** The child form owns input even when its chrome has no spare rows. */
  get inputActive(): boolean { return this.input !== undefined; }

  /** Whether the open picker wants the whole screen. */
  get fullScreen(): boolean {
    return this.picker?.fullScreen === true || this.picker?.form === "modal";
  }

  /** Open `picker`, loading its options in the background. */
  open(picker: Picker): void {
    picker.navigation?.viewport.reveal();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.model = new OptionModel(picker.filterOptions, picker.defaultSelection, picker.replacementSelection);
    ++this.generation;
    this.actionPending = false;
    this.actionNotice = undefined;
    this.input = picker.input ? new InputForm(picker.input) : undefined;
    this.baseOptions = [];
    this.cancelSearch();
    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
    this.chipRows.clear();
    this.picker?.previewEnd?.();
    this.picker = picker;
    picker.onOpen?.();
    this.loading = true;
    this.loadFailed = false;
    this.subMode = "none";
    this.subTargetId = undefined;
    this.subTargetLabel = undefined;
    this.renameDraft = "";
    this.denyDraft = "";
    this.model.setFilter(picker.initialFilter ?? "");
    this.onChange();
    this.reload(true);
  }

  close(): void {
    const picker = this.picker;
    this.generation++;
    this.release();
    picker?.previewEnd?.();
    this.onChange();
  }

  /** Drop host-owned sources before notifying or handing the selection to its owner. */
  private release(): void {
    this.loadController?.abort();
    this.loadController = undefined;
    this.cancelSearch();
    this.actionPending = false;
    this.actionNotice = undefined;
    this.denyDraft = "";
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.input = undefined;
    this.model = new OptionModel();
    this.baseOptions = [];
    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
    this.chipRows.clear();
    this.renderedWidth = 0;
    this.picker = undefined;
    this.subMode = "none";
    this.subTargetId = undefined;
    this.subTargetLabel = undefined;
    this.renameDraft = "";
    this.loading = false;
    this.loadFailed = false;
  }

  /** Rows for the open picker at the given geometry, or none when closed. */
  render(width: number, height: number, availableRows = Math.max(0, height - 6)): string[] {
    const geometry = `${width}:${height}:${availableRows}`;
    if (this.renderedGeometry !== geometry) this.hovered = undefined;
    this.renderedGeometry = geometry;
    this.optionRows.clear(); this.listRows.clear();
    this.chipRows.clear();
    this.renderedWidth = width;
    const picker = this.picker;
    if (!picker) return [];
    if (this.input) return this.input.render(picker.title, width, this.fullScreen ? height : availableRows);

    if (this.subMode === "confirm-delete") {
      return this.renderConfirmDelete(width, height);
    }
    if (this.subMode === "rename") {
      return this.renderRename(width, height);
    }
    if (this.subMode === "deny-reason") {
      return renderDenial({ modal: this.picker?.form === 'modal', title: this.picker?.title ?? '', draft: this.denyDraft }, width, height);
    }
    const empty = this.loading ? "loading…" : this.loadFailed ? picker.loadError ?? "Options could not be loaded."
      : this.searchFailed ? picker.searchError ?? "Search could not be completed."
      : this.searching && this.model.total === 0 ? "Searching…" : picker.empty;
    const state = this.loading || (this.searching && this.model.total === 0) ? "loading"
      : this.loadFailed || this.searchFailed ? "error" : undefined;
    const actionHints = (
      picker.onDelete || picker.onRename || picker.onPin
        ? `${picker.onDelete ? "Del delete" : ""}  ${picker.onRename ? "^R rename" : ""}  ${picker.onPin ? "^P pin" : ""}`.trim()
        : undefined);
    const pickerStatus = !this.loading && !this.loadFailed ? picker.status?.(this.model.visible, this.model.filter) : undefined;
    const searchStatus = this.searching ? 'Searching…' : this.searchFailed ? picker.searchError ?? 'Search could not be completed.' : undefined;
    const status = this.actionPending ? 'Updating…' : this.actionNotice ??
      ([searchStatus, pickerStatus].filter(Boolean).join(' ') || undefined);
    const groupKeys = picker.chips && !picker.navigation ? ['tui.overlay.previousGroup', 'tui.overlay.nextGroup'].flatMap(id =>
      this.bindings.keysFor(id).filter(key => this.bindings.actionFor(key, 'overlay') === id)) : [];
    const chips = picker.navigation?.placement === 'top'
      ? { items: picker.navigation.items, active: this.model.filter ? 'all' : picker.navigation.active }
      : !picker.navigation ? picker.chips : undefined;
    const chipChrome = {
      ...(chips ? { chips: chipStrip(chips.items, chips.active, picker.form === 'modal' ? Math.max(0, width - 4) : width) } : {}),
      ...(groupKeys.length ? { groupHint: `${groupKeys.join('/')} group` } : {}),
      onChipRow: (row: number, id: string, from: number, to: number) => {
        const spans = this.chipRows.get(row) ?? [];
        spans.push({ id, from, to });
        this.chipRows.set(row, spans);
      },
    };

    if (picker.form === "modal") {
      return renderModal(
        this.model,
        {
          title: picker.title,
          hovered: this.hovered?.sidebar ? undefined : this.hovered?.id,
          empty,
          ...(state ? { state } : {}),
          detailRows: picker.detailRows ?? 2,
          ...chipChrome,
          onOptionRow: (row, id) => this.optionRows.set(row, { id, from: 0, to: width }),
          onListRow: (row, from, to, id) => this.listRows.set(row, [{ from, to, id }]),
          ...(status ? { status } : picker.footer ? { status: picker.footer } : {}),
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
    const renderer = picker.navigation && picker.navigation.placement !== 'top' ? (model: OptionModel, chrome: Parameters<typeof renderPanel>[1], width: number, height: number) =>
      renderNavigation(model, chrome, { ...picker.navigation!,
        items: picker.navigation!.items, active: picker.navigation!.active, focused: picker.navigation!.focused,
        viewport: picker.navigation!.viewport,
        hovered: this.hovered?.sidebar ? this.hovered.id : undefined,
        onItem: (row, id, from, to) => {
          this.listRows.set(row, [{ from, to, id, sidebar: true }]);
          this.chipRows.set(row, [{ id, from, to }]);
        } }, width, height) : renderPanel;
    return renderer(
      this.model,
      {
        title: picker.title,
        hovered: this.hovered?.sidebar ? undefined : this.hovered?.id,
        empty,
        ...(state ? { state } : {}),
        multiple: picker.multiple === true,
        filterable: picker.filterable,
        footer: status ?? picker.footer,
        hideCount: isApproval,
        ...(picker.detail ? { detail: picker.detail } : {}),
        ...chipChrome,
        onOptionRow: (row, id, from, to) => this.optionRows.set(row, { id, from: from ?? 0, to: to ?? width }),
        onListRow: (row, from, to, id) => this.listRows.set(row, [...this.listRows.get(row) ?? [], { from, to, id }]),
      },
      width,
      this.fullScreen ? height : Math.max(0, Math.min(height, availableRows)),
    );
  }

  /** A picker owns pointer input; a click focuses, and keyboard confirmation applies. */
  handlePointer(report: MouseReport, top?: number): boolean {
    if (!this.picker) return false;
    if (report.kind === 'move') {
      const target = top === undefined || this.input || this.actionPending || this.loading || this.subMode !== 'none'
        || report.shift || report.alt || report.ctrl ? undefined : this.listRows.get(report.row - top)
          ?.find(span => report.column >= span.from && report.column < span.to && !span.id.startsWith('section:'));
      if (target?.id !== this.hovered?.id || target?.sidebar !== this.hovered?.sidebar) {
        this.hovered = target; this.onChange();
      }
      return true;
    }
    this.hovered = undefined;
    if (this.input) {
      if (!this.actionPending && !this.loading && this.subMode === 'none' && this.input.handlePointer(report, top)) this.onChange();
      return true;
    }
    if (report.kind === 'wheel') {
      const hit = top === undefined ? undefined : this.listRows.get(report.row - top)?.find(span => report.column >= span.from && report.column < span.to);
      if (this.actionPending || this.loading || this.subMode !== 'none' || report.shift || report.alt || report.ctrl
        || !hit || report.column < hit.from || report.column >= hit.to || ![-1, 1].includes(report.button)) return true;
      if (hit.sidebar) {
        if (this.picker.navigation?.viewport.pan(report.button as -1 | 1)) {
          this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined; this.chipRows.clear();
          this.onChange();
        }
        return true;
      }
      const before = this.model.current()?.id;
      const update = this.picker.navigation?.key(report.button < 0 ? 'wheel-up' : 'wheel-down', before, this.model.filter.trim().toLowerCase());
      if (update) {
        this.baseOptions = update.options; this.model.setOptions(update.options);
        if (update.focus) this.model.focus(update.focus, true);
      }
      this.model.step(report.button as -1 | 1, false);
      this.picker.navigation?.focus(this.model.current()?.id);
      if (!this.picker.multiple && before !== this.model.current()?.id) this.picker.previewChange?.(idsOf(this.model.current()));
      this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined; this.chipRows.clear();
      this.onChange(); return true;
    }
    if (!this.actionPending && this.subMode === "none" && top !== undefined &&
        report.kind === "press" && report.button === 0 && !report.shift && !report.alt && !report.ctrl &&
        report.column >= 0 && report.column < this.renderedWidth) {
      const chip = this.chipRows.get(report.row - top)?.find(span => report.column >= span.from && report.column < span.to);
      if (chip) {
        const update = this.picker.navigation?.select(chip.id);
        if (update) {
          this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined; this.chipRows.clear();
          this.model.setFilter(update.query ?? this.model.filter);
          this.baseOptions = update.options; this.model.setOptions(update.options);
          if (update.focus) this.model.focus(update.focus, true);
          this.onChange(); return true;
        }
        const next = this.picker.chips?.select(chip.id);
        if (next) this.open(next);
        return true;
      }
      if (this.loading) return true;
      const hit = this.optionRows.get(report.row - top);
      if (hit && report.column >= hit.from && report.column < hit.to) {
        const update = this.picker.navigation?.point(hit.id, this.model.filter);
        if (update) {
          this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined; this.chipRows.clear();
          this.baseOptions = update.options; this.model.setOptions(update.options);
        }
        this.model.focus(hit.id, true);
        this.picker.navigation?.focus(this.model.current()?.id);
        if (!this.picker.multiple) this.picker.previewChange?.(idsOf(this.model.current()));
        this.onChange();
      }
    }
    return true;
  }

  /** Pasted form text never reaches the underlying conversation draft. */
  handlePaste(text: string): boolean {
    this.hovered = undefined;
    if (!this.picker) return false;
    if (this.actionPending) return true;
    if (this.input) this.input.paste(text);
    else if (this.subMode === 'none' && this.picker.filterable !== false) {
      this.changeFilter(() => this.model.appendFilter(
        stripAnsi(text).replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, ''),
      ));
      if (!this.picker.multiple) this.picker.previewChange?.(idsOf(this.model.current()));
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

  /** The accepted picker's owner remains valid until the host opens or closes another surface. */
  acceptanceFor(picker: Picker): (() => boolean) | undefined {
    return this.acceptances.get(picker);
  }

  /**
   * Route one key. Returns false only for keys the picker does not claim, which
   * currently means nothing: a picker owns the keyboard while it is open.
   */
  handleKey(event: ParsedKeyEvent, apply: (picker: Picker, ids: readonly string[]) => void): boolean {
    this.hovered = undefined;
    const picker = this.picker;
    if (!picker) return false;
    if (this.actionPending) {
      if (event.keyId === 'escape' || event.keyId === 'ctrl+c') this.close();
      return true;
    }
    if (this.loading && ['enter', 'delete', 'ctrl+d', 'ctrl+r', 'ctrl+p'].includes(event.keyId)) return true;
    const isApprovalPicker = !this.input && (
      picker.title.startsWith("Permission:") ||
      (this.model.visible.some((o) => o.id === "allow-once") &&
        this.model.visible.some((o) => o.id === "deny")));
    // Cleanup and parent construction can replace or close this host synchronously.
    if (event.keyId === 'escape' && !isApprovalPicker && picker.back && (this.input || this.subMode === 'none')) {
      const generation = this.generation;
      const cancelReturn = picker.previewBack?.();
      let returned = false;
      try {
        if (this.picker !== picker || this.generation !== generation) return true;
        this.close();
        if (this.picker || this.generation !== generation + 1) return true;
        const parent = picker.back();
        if (this.picker || this.generation !== generation + 1) return true;
        this.open(parent);
        returned = true;
      } finally { if (!returned && typeof cancelReturn === 'function') cancelReturn(); }
      return true;
    }
    const focused = this.model.current()?.id;
    if (this.input) {
      if (event.keyId === 'escape' || event.keyId === 'ctrl+c') this.close();
      else if (event.keyId === 'enter') {
        const value = this.input.value();
        if (value !== undefined) this.accept({ ...picker, apply: () => picker.input!.apply(value) }, apply, []);
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
          this.mutate(() => picker.onDelete!(id));
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
          this.mutate(() => picker.onRename!(id, newTitle));
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
    if (isApprovalPicker) {
      const key = event.keyId.toLowerCase();
      const text = (event.text ?? "").toLowerCase();
      if (key === 'g' || key === '4' || text === 'g' || text === '4') {
        this.accept(picker, apply, ['choose-groups']);
        return true;
      }
      if (key === "y" || key === "1" || text === "1" || text === "y") {
        this.accept(picker, apply, ["allow-once"]);
        return true;
      }
      if (key === "a" || key === "2" || text === "2" || text === "a") {
        this.accept(picker, apply, ["allow-always"]);
        return true;
      }
      if (key === "n" || key === "d" || key === "3" || text === "3" || text === "n" || text === "d") {
        if (picker.onDeny) {
          this.subMode = "deny-reason";
          this.denyDraft = "";
          this.onChange();
          return true;
        }
        this.accept(picker, apply, ["deny"]);
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

    const navigation = !isApprovalPicker && !this.loading ? picker.navigation?.key(event.keyId, focused, this.model.filter.trim().toLowerCase()) : undefined;
    if (navigation) {
      this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined; this.chipRows.clear();
      this.model.setFilter(navigation.query ?? this.model.filter);
      this.baseOptions = navigation.options; this.model.setOptions(navigation.options);
      if (navigation.focus) this.model.focus(navigation.focus, true);
      this.onChange(); return true;
    }
    const groupAction = this.bindings.actionFor(event.keyId, 'overlay');
    if (!isApprovalPicker && !this.loading && focused && picker.navigate &&
      (event.keyId === 'left' || event.keyId === 'right')) {
      const update = picker.navigate(event.keyId, focused, this.model.filter.trim().toLowerCase());
      if (update) {
        this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
        this.baseOptions = update.options;
        this.model.setOptions(update.options);
        if (update.focus) this.model.focus(update.focus);
        picker.previewChange?.(idsOf(this.model.current()));
      }
      this.onChange();
      return true;
    }
    if (!isApprovalPicker && picker.chips?.items.length &&
        (groupAction === 'tui.overlay.nextGroup' || groupAction === 'tui.overlay.previousGroup')) {
      const chips = picker.chips;
      const current = Math.max(0, chips.items.findIndex(chip => chip.id === chips.active));
      const index = (current + (groupAction === 'tui.overlay.nextGroup' ? 1 : -1) + chips.items.length) % chips.items.length;
      const next = chips.select(chips.items[index]!.id);
      if (next) this.open(next);
      return true;
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
      case "ctrl+p": {
        if (picker.onPin) {
          const current = this.model.current();
          if (current) {
            this.mutate(() => picker.onPin!(current.id));
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
        break;
      case "down":
        this.model.step(1);
        break;
      case "space":
        if (picker.multiple) {
          this.model.toggle();
          picker.previewChange?.(this.model.chosenIds());
        } else if (!isApprovalPicker && picker.filterable !== false) {
          this.changeFilter(() => this.model.appendFilter(" "));
        }
        break;
      case "backspace":
        if (!isApprovalPicker && picker.filterable !== false) {
          this.changeFilter(() => this.model.backspaceFilter());
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
            this.changeFilter(() => this.model.appendFilter(event.text));
          }
        } else {
          return true;
        }
    }
    if (focused !== this.model.current()?.id) {
      this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
      if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
    }
    picker.navigation?.focus(this.model.current()?.id);
    this.onChange();
    return true;
  }

  private reload(initial = false): void {
    const picker = this.picker;
    if (!picker) return;
    this.loadController?.abort();
    this.cancelSearch();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const controller = new AbortController();
    this.loadController = controller;
    const generation = this.generation;
    this.loading = true;
    this.loadFailed = false;
    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
    let pending: Promise<readonly Option[]>;
    try { pending = picker.load(controller.signal); }
    catch (error) { pending = Promise.reject(error); }
    void pending.then(options => {
      if (this.picker !== picker || this.generation !== generation || this.loadController !== controller) return;
      this.loading = false;
      this.baseOptions = options;
      const resolvedFilter = initial && this.model.filter === (picker.initialFilter ?? '') ? picker.resolvedFilter : undefined;
      if (resolvedFilter !== undefined) this.model.setFilter(resolvedFilter);
      this.model.setOptions(options);
      if (initial && picker.initialSelection) this.model.focus(picker.initialSelection);
      if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
      if (this.picker !== picker || this.generation !== generation || this.loadController !== controller) return;
      const unsubscribe = picker.subscribe?.(options => {
        if (this.picker !== picker || this.generation !== generation || this.loadController !== controller) return;
        this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
        this.baseOptions = options;
        if (!this.model.filter.trim() || !picker.search) this.model.setOptions(options);
        if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
        this.onChange();
      });
      if (this.picker === picker && this.generation === generation && this.loadController === controller) this.unsubscribe = unsubscribe;
      else unsubscribe?.();
      if (this.model.filter.trim() && picker.search) this.scheduleSearch();
      this.onChange();
    }).catch(() => {
      if (this.picker !== picker || this.generation !== generation || this.loadController !== controller) return;
      this.loading = false;
      this.loadFailed = true;
      this.cancelSearch();
      this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
      this.model.setOptions([]);
      picker.previewEnd?.();
      this.onChange();
    });
  }

  /** An accepted mutation keeps its identity; settlement only refreshes its own open instance. */
  private mutate(action: () => Promise<string | undefined> | void): void {
    const picker = this.picker;
    const generation = this.generation;
    this.actionPending = true;
    this.actionNotice = undefined;
    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
    let pending: Promise<string | undefined> | void;
    try { pending = action(); }
    catch { pending = Promise.reject(); }
    void Promise.resolve(pending).then(note => {
      if (this.picker !== picker || this.generation !== generation) return;
      this.actionPending = false;
      this.actionNotice = typeof note === 'string' ? note : undefined;
      this.reload();
      this.onChange();
    }).catch(() => {
      if (this.picker !== picker || this.generation !== generation) return;
      this.actionPending = false;
      this.actionNotice = 'The update could not be confirmed.';
      this.onChange();
    });
  }

  private accept(picker: Picker, apply: (picker: Picker, ids: readonly string[]) => void, directIds?: readonly string[]): void {
    const acceptedGeneration = this.generation;
    const stillOwned = (): boolean => this.generation === acceptedGeneration;
    if (directIds?.some(id => !this.model.visible.some(option => option.id === id && !option.disabled))) return;
    const current = this.model.current();
    if (directIds === undefined && !picker.multiple && current?.disabled) {
      if (!picker.inspect) return;
      const inspect = picker.inspect;
      this.release();
      this.onChange();
      const handed = { ...picker, previewAccept: undefined, apply: () => inspect(current.id) };
      this.acceptances.set(handed, stillOwned);
      try { apply(handed, [current.id]); } finally { this.acceptances.delete(handed); }
      return;
    }
    const ids = directIds ?? (picker.multiple ? this.model.chosenIds() : idsOf(this.model.current()));
    const accepted = directIds !== undefined || ids.length > 0 ||
      (picker.multiple && this.model.visible.some(option => !option.disabled));
    if (accepted) picker.previewAccept?.();
    this.release();
    this.onChange();
    if (accepted) {
      this.acceptances.set(picker, stillOwned);
      try { apply(picker, ids); } finally { this.acceptances.delete(picker); }
    } else {
      picker.previewEnd?.();
    }
  }
  private changeFilter(change: () => void): void {
    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
    this.chipRows.clear();
    this.picker?.navigation?.focus(this.model.current()?.id);
    this.model.setOptions(this.baseOptions);
    change();
    if (!this.model.filter && this.picker?.navigation) {
      const preferred = this.picker.navigation.preferred;
      if (preferred) this.model.focus(preferred);
    }
    this.scheduleSearch();
  }

  private scheduleSearch(): void {
    const picker = this.picker;
    if (!picker?.search) return;
    const query = this.model.filter.trim();
    const generation = ++this.searchGeneration;
    this.searchController?.abort();
    this.searchController = undefined;
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.searchFailed = false;
    if (!query) {
      this.searching = false;
      const restored = picker.onSearchClear?.();
      if (restored !== undefined) this.baseOptions = restored;
      this.model.setOptions(restored ?? this.baseOptions);
      return;
    }
    picker.onSearchChange?.(query);
    this.searching = true;
    this.searchTimer = setTimeout(() => {
      this.searchTimer = undefined;
      const controller = new AbortController();
      this.searchController = controller;
      let pending: Promise<readonly Option[]>;
      try {
        pending = picker.search!(query, controller.signal);
      } catch (error) {
        pending = Promise.reject(error);
      }
      void pending.then(options => {
        if (this.picker !== picker || this.searchGeneration !== generation
          || this.model.filter.trim() !== query || this.searchController !== controller
          || controller.signal.aborted) return;
        this.searching = false;
        this.searchController = undefined;
        this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
        this.model.setOptions(options);
        if (!picker.multiple) picker.previewChange?.(idsOf(this.model.current()));
        this.onChange();
      }).catch(() => {
        if (this.picker !== picker || this.searchGeneration !== generation
          || this.model.filter.trim() !== query || this.searchController !== controller
          || controller.signal.aborted) return;
        this.searching = false;
        this.searchFailed = true;
        this.searchController = undefined;
        this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;
        this.onChange();
      });
    }, Math.max(0, picker.searchDebounceMs ?? 100));
  }

  private cancelSearch(): void {
    ++this.searchGeneration;
    this.searchController?.abort();
    this.searchController = undefined;
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.searching = false;
    this.searchFailed = false;
  }
}

function idsOf(option: Option | undefined): readonly string[] {
  return option ? [option.id] : [];
}
