import { renderBand } from "../chrome/band.js";
import { renderComposer } from "../chrome/composer.js";
import { renderHints } from "../chrome/hints.js";
import type { TerminalFramePlan, ViewportSize } from "../render/frame.js";
import type { Block } from "../transcript/blocks.js";
import { renderActivity } from "../transcript/live.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import type { ScrollbarGeometry } from "../transcript/viewport.js";
import { createViewState, type ComposerGeometry, type InteractiveView, type ViewContext, type ViewState } from "./contract.js";
import { TranscriptPane } from "./pane.js";

/**
 * The surface: one frame from host-owned state.
 *
 * The screen is split once, here: chrome owns the bottom rows and the transcript
 * pane gets whatever is left. Since the screen is ours alone there is no terminal
 * scrollback to defer to, so the pane also owns *where* in the transcript the
 * window sits — which is what makes scrolling back a thing the surface can simply
 * do. Facts are read from the context at paint time, never copied, so a frame can
 * never show something the host no longer believes.
 */

/** Minimum transcript rows kept visible however tall the chrome grows. */
const MIN_TRANSCRIPT_ROWS = 1;

export class InteractiveSurface implements InteractiveView {
  readonly editor: ViewState["editor"];
  readonly pastes: ViewState["pastes"];
  readonly transcript: ViewState["transcript"];
  readonly suggestions: ViewState["suggestions"];
  private readonly pane: TranscriptPane;
  private suggesting = false;
  private lastComposerGeometry: ComposerGeometry | undefined;

  constructor(
    private readonly context: ViewContext,
    state: ViewState = createViewState(),
  ) {
    this.editor = state.editor;
    this.pastes = state.pastes;
    this.transcript = state.transcript;
    this.suggestions = state.suggestions;
    this.pane = new TranscriptPane(state.transcript);
  }

  /** Whether the completion list is currently intercepting navigation keys. */
  get suggestionsOpen(): boolean {
    return this.suggesting && this.suggestions.length > 0;
  }

  setSuggesting(open: boolean): void {
    this.suggesting = open;
    if (!open) this.suggestions.reset();
  }

  renderFrame(dimensions: ViewportSize): TerminalFramePlan {
    const width = Math.max(8, dimensions.columns);
    const height = Math.max(4, dimensions.rows);
    if (this.context.overlayFullScreen()) {
      // A full-screen overlay owns every row, so there is no fixed block to
      // redraw separately.
      return { rows: this.context.overlayRows(width, height) };
    }
    const chrome = this.renderChrome(width, height);
    const capacity = Math.max(MIN_TRANSCRIPT_ROWS, height - chrome.rows.length);
    this.lastComposerGeometry = {
      top: capacity + chrome.composerOffset,
      bottom: capacity + chrome.composerOffset + chrome.composerRows.length - 1,
      rows: chrome.composerRows,
    };
    const transcriptRows = this.pane.render(width, capacity, this.context.selection());
    // The split and the full document are reported, not just performed: a
    // surface appending to the terminal's scrollback has no window onto the
    // transcript, so it needs every row rather than the ones that fit.
    return {
      rows: [...transcriptRows, ...chrome.rows],
      chromeRows: chrome.rows,
      documentRows: this.pane.documentRows(width),
    };
  }

  get scrolledBack(): number {
    return this.pane.scrolledBack;
  }

  scroll(rows: number): boolean {
    return this.pane.scroll(rows);
  }

  scrollPage(direction: -1 | 1): boolean {
    return this.pane.scrollPage(direction);
  }

  scrollToEnd(): void {
    this.pane.scrollToEnd();
  }

  scrollbarGeometry(): ScrollbarGeometry | undefined {
    return this.pane.scrollbarGeometry();
  }

  scrollToThumb(pointerRow: number, grabOffset = 0): boolean {
    return this.pane.scrollToThumb(pointerRow, grabOffset);
  }

  screenToContent(row: number, column: number): SelectionPoint {
    return this.pane.screenToContent(row, column);
  }

  contentToScreenSpan(span: SelectionSpan): SelectionSpan | undefined {
    return this.pane.contentToScreenSpan(span);
  }

  contentRows(): readonly string[] {
    return this.pane.contentRows();
  }

  blockAtScreenRow(row: number): Block | undefined {
    return this.pane.blockAtScreenRow(row);
  }

  toggleCollapsed(only?: "thinking" | "tool"): boolean {
    const collapsible = this.transcript
      .all()
      .filter((block) => block.collapsed !== undefined)
      .filter((block) => only === undefined || block.kind === only);
    if (collapsible.length === 0) return false;
    // One decision for the whole set, taken from the first: pressing the key
    // again must undo what it just did, which it cannot if some blocks were
    // already in the target state and flip the other way.
    const collapsed = !collapsible[0]!.collapsed;
    for (const block of collapsible) this.transcript.setCollapsed(block, collapsed);
    return true;
  }

  composerGeometry(): ComposerGeometry | undefined {
    return this.lastComposerGeometry;
  }

  /**
   * The fixed bottom block: activity, an open panel picker, the band, the prompt,
   * and either completions or the hint row. The picker sits above the band so the
   * prompt stays where the user's attention already is.
   */
  private renderChrome(width: number, height: number): {
    readonly rows: string[];
    readonly composerOffset: number;
    readonly composerRows: string[];
  } {
    const busy = this.context.busy();
    const maxComposerRows = Math.max(3, Math.min(10, Math.floor(height * 0.35)));
    const statusRows = [
      ...renderActivity(this.context.activity(), this.context.now(), width),
      ...this.context.overlayRows(width, height),
      renderBand(this.context.facts(), this.context.statusItems(), width),
    ];
    const composerRows = renderComposer(
      this.editor,
      { busy },
      width,
      maxComposerRows,
      this.context.composerSelection?.(),
    );
    const rows = [...statusRows, ...composerRows];
    if (this.suggestionsOpen) {
      rows.push(...this.suggestions.render(width));
    }
    rows.push(
      ...renderHints(
        {
          busy,
          suggesting: this.suggestionsOpen,
          cancelArmed: this.context.cancelArmed(),
          queued: this.context.queuedCount(),
          steering: this.context.steeringCount?.() ?? 0,
          newlineKey: this.context.newlineKey(),
          toast: this.context.toast?.(),
        },
        this.context.ambient(),
        width,
      ),
    );
    return { rows, composerOffset: statusRows.length, composerRows };
  }
}
