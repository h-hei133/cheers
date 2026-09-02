import { Editor } from "../../presentation/tui/editor.js";
import { PasteStore } from "../../presentation/tui/pastes.js";
import { renderBand } from "../../presentation/tui/chrome/band.js";
import type { StatusFacts, StatusItemId } from "../../presentation/tui/chrome/items.js";
import { composerTextWidth, renderComposer } from "../../presentation/tui/chrome/composer.js";
import { renderHints, type AmbientContext } from "../../presentation/tui/chrome/hints.js";
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
  facts(): StatusFacts;
  statusItems(): readonly StatusItemId[];
  activity(): TurnActivity | undefined;
  busy(): boolean;
  queuedCount(): number;
  now(): number;
  /** Background facts for the row under the prompt. */
  ambient(): AmbientContext;
  /** Key that inserts a newline on this terminal. */
  newlineKey(): string;
  /** True while a second cancel press would exit. */
  cancelArmed(): boolean;
  /** True when an open picker or editor wants the whole screen. */
  overlayFullScreen(): boolean;
  /** Rows for an open picker, or none when none is open. */
  overlayRows(width: number, height: number): string[];
}

/** Minimum transcript rows kept visible however tall the chrome grows. */
const MIN_TRANSCRIPT_ROWS = 1;

export class InteractiveSurface implements TerminalFrameProvider {
  readonly editor = new Editor();
  /**
   * Long pastes held aside behind placeholders. Lives with the editor because the
   * draft on screen and the text that will be sent are the same object's two
   * readings, and nothing else should have to know they differ.
   */
  readonly pastes = new PasteStore();
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
    if (this.context.overlayFullScreen()) {
      // A full-screen picker owns the borrowed alternate screen; the transcript
      // and its scrollback stay exactly as they were underneath.
      return { modal: this.context.overlayRows(width, height), viewport: [] };
    }
    const chrome = this.renderChrome(width, height);
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

  /**
   * The fixed bottom block: activity, an open panel picker, the band, the prompt,
   * and either completions or the hint row. The picker sits above the band so the
   * prompt stays where the user's attention already is.
   */
  private renderChrome(width: number, height: number): string[] {
    const busy = this.context.busy();
    const rows = [
      ...renderActivity(this.context.activity(), this.context.now(), width),
      ...this.context.overlayRows(width, height),
      renderBand(this.context.facts(), this.context.statusItems(), width),
      ...renderComposer(this.editor, { busy }, width),
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
        },
        this.context.ambient(),
        width,
      ),
    );
    return rows;
  }
}
