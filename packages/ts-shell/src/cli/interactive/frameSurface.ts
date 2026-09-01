import { Editor } from "../../presentation/tui/editor.js";
import { renderBand, type BandState } from "../../presentation/tui/chrome/band.js";
import { composerTextWidth, renderComposer } from "../../presentation/tui/chrome/composer.js";
import { renderHints } from "../../presentation/tui/chrome/hints.js";
import { SuggestionList } from "../../presentation/tui/chrome/suggestions.js";
import type {
  TerminalFramePlan,
  TerminalFrameProvider,
  ViewportSize,
} from "../../presentation/tui/render/frame.js";
import { Transcript } from "../../presentation/tui/transcript/container.js";
import { renderActivity, type TurnActivity } from "../../presentation/tui/transcript/live.js";

/**
 * Frame composition for the interactive session.
 *
 * The screen is split once, here: chrome owns the bottom rows and the transcript
 * gets whatever is left. Because the transcript's capacity is known before it
 * renders, retirement is offered in the same frame the rows would have
 * overflowed — so a batch leaves the mutable viewport exactly as it enters the
 * terminal's scrollback, and is never painted twice.
 */

export interface SurfaceContext {
  band(): BandState;
  activity(): TurnActivity | undefined;
  busy(): boolean;
  queuedCount(): number;
  now(): number;
}

/** Minimum transcript rows kept visible however tall the chrome grows. */
const MIN_TRANSCRIPT_ROWS = 1;

export class InteractiveSurface implements TerminalFrameProvider {
  readonly editor = new Editor();
  readonly transcript = new Transcript();
  readonly suggestions = new SuggestionList();

  private suggesting = false;

  constructor(private readonly context: SurfaceContext) {}

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
    const chrome = this.renderChrome(width);
    const capacity = Math.max(MIN_TRANSCRIPT_ROWS, height - chrome.length);
    const history = this.transcript.peekBatch(width, capacity);
    const live = this.transcript.renderViewport(width, capacity);
    return { history, viewport: [...live, ...chrome] };
  }

  acknowledgeHistory(id: number): void {
    this.transcript.acknowledge(id);
  }

  beginHistoryReplay(): void {
    this.transcript.beginReplay();
  }

  beginHistoryFlush(): void {
    this.transcript.beginFlush();
  }

  /** The fixed bottom block: activity, band, prompt, and either hints or completions. */
  private renderChrome(width: number): string[] {
    const busy = this.context.busy();
    const rows = [
      ...renderActivity(this.context.activity(), this.context.now(), width),
      renderBand(this.context.band(), width),
      ...renderComposer(this.editor, { busy, queued: this.context.queuedCount() }, width),
    ];
    if (this.suggestionsOpen) {
      rows.push(...this.suggestions.render(width));
    }
    rows.push(
      ...renderHints(
        {
          busy,
          hasDraft: this.editor.getText().trim().length > 0,
          suggesting: this.suggestionsOpen,
          multiline: this.editor.getText().includes("\n"),
        },
        width,
      ),
    );
    return rows;
  }
}
