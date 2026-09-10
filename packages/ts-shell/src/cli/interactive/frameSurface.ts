import { renderBand } from "../../presentation/tui/chrome/band.js";
import { composerTextWidth, renderComposer } from "../../presentation/tui/chrome/composer.js";
import { renderHints } from "../../presentation/tui/chrome/hints.js";
import { TranscriptPane } from "../../presentation/tui/adapter/pane.js";
import type { TerminalFramePlan, ViewportSize } from "../../presentation/tui/render/frame.js";
import type { Block } from "../../presentation/tui/transcript/blocks.js";
import { renderActivity } from "../../presentation/tui/transcript/live.js";
import type { SelectionPoint, SelectionSpan } from "../../presentation/tui/transcript/selection.js";
import type { ScrollbarGeometry } from "../../presentation/tui/transcript/viewport.js";
import { createViewState, type InteractiveView, type ViewContext, type ViewState } from "../../presentation/tui/view.js";

export type { ScrollbarGeometry } from "../../presentation/tui/transcript/viewport.js";
/** Kept for callers that named the facts by this surface rather than by the seam. */
export type SurfaceContext = ViewContext;

/**
 * Frame composition by direct rendering.
 *
 * The screen is split once, here: chrome owns the bottom rows and the transcript
 * pane gets whatever is left. Since the screen is ours alone there is no terminal
 * scrollback to defer to, so the pane also owns *where* in the transcript the
 * window sits — which is what makes scrolling back a thing the surface can simply do.
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

  /** Cells available to prompt text at the current terminal width. */
  textWidth(columns: number): number {
    return composerTextWidth(Math.max(8, columns));
  }

  renderFrame(dimensions: ViewportSize): TerminalFramePlan {
    const width = Math.max(8, dimensions.columns);
    const height = Math.max(4, dimensions.rows);
    if (this.context.overlayFullScreen()) {
      return { rows: this.context.overlayRows(width, height) };
    }
    const chrome = this.renderChrome(width, height);
    const capacity = Math.max(MIN_TRANSCRIPT_ROWS, height - chrome.length);
    const transcriptRows = this.pane.render(width, capacity, this.context.selection());
    return { rows: [...transcriptRows, ...chrome] };
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

  get scrolledBack(): number {
    return this.pane.scrolledBack;
  }

  scroll(rows: number): boolean {
    return this.pane.scroll(rows);
  }

  scrollToEnd(): void {
    this.pane.scrollToEnd();
  }

  scrollPage(direction: -1 | 1): boolean {
    return this.pane.scrollPage(direction);
  }

  scrollbarGeometry(): ScrollbarGeometry | undefined {
    return this.pane.scrollbarGeometry();
  }

  scrollToThumb(pointerRow: number, grabOffset = 0): boolean {
    return this.pane.scrollToThumb(pointerRow, grabOffset);
  }

  blockAtScreenRow(row: number): Block | undefined {
    return this.pane.blockAtScreenRow(row);
  }

  /**
   * The fixed bottom block: activity, an open panel picker, the band, the prompt,
   * and either completions or the hint row. The picker sits above the band so the
   * prompt stays where the user's attention already is.
   */
  private renderChrome(width: number, height: number): string[] {
    const busy = this.context.busy();
    const maxComposerRows = Math.max(3, Math.min(10, Math.floor(height * 0.35)));
    const rows = [
      ...renderActivity(this.context.activity(), this.context.now(), width),
      ...this.context.overlayRows(width, height),
      renderBand(this.context.facts(), this.context.statusItems(), width),
      ...renderComposer(this.editor, { busy }, width, maxComposerRows),
    ];
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
          newlineKey: this.context.newlineKey(),
          toast: this.context.toast?.(),
        },
        this.context.ambient(),
        width,
      ),
    );
    return rows;
  }
}
