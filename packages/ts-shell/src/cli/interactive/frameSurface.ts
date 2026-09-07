import { defaultTheme } from "../../presentation/theme/theme.js";
import { padToWidth } from "../../presentation/tui/text/layout.js";
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
import { highlightSelection, type SelectionSpan } from "./selection.js";
import { Transcript } from "../../presentation/tui/transcript/container.js";
import { renderActivity, type TurnActivity } from "../../presentation/tui/transcript/live.js";

/**
 * Frame composition for the interactive session.
 *
 * The screen is split once, here: chrome owns the bottom rows and the transcript
 * gets whatever is left. Since the screen is ours alone there is no terminal
 * scrollback to defer to, so this also owns *where* in the transcript the window
 * sits — which is what makes scrolling back a thing the surface can simply do.
 *
 * The window follows the newest rows unless the user has scrolled away from them.
 * Following is the default because a conversation is read at its end; an explicit
 * scroll is a statement that the user is reading something else, and new output
 * must not yank them away from it.
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
  /** True when an open picker or reader wants the whole screen. */
  overlayFullScreen(): boolean;
  /** Rows for an open picker, or none when none is open. */
  overlayRows(width: number, height: number): string[];
  /** Cells the pointer is currently covering, or none when it is not dragging. */
  selection(): SelectionSpan | undefined;
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
  /** Rows between the bottom of the transcript and the bottom of the window. */
  private scrollBack = 0;
  /** Row the transcript window started at last frame, for hit-testing a click. */
  private lastTop = 0;
  /**
   * Blank rows padded in above the transcript last frame.
   *
   * A short conversation is pushed to the bottom of the screen, so screen row 0 is
   * not transcript row `lastTop` — it is filler. Hit-testing without subtracting
   * this looked up the wrong block, or none, which is why clicking a card did
   * nothing on any screen that was not already full.
   */
  private lastFiller = 0;
  /** Transcript rows actually on screen last frame, which is at most the capacity. */
  private lastVisible = 0;
  private lastTranscriptRows = 0;
  /** How far back the window could go at the last frame, so a key can be honest. */
  private lastMaxBack = 0;
  private lastOwners: readonly number[] = [];

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
      return { rows: this.shade(this.context.overlayRows(width, height)) };
    }
    const chrome = this.renderChrome(width, height);
    const capacity = Math.max(MIN_TRANSCRIPT_ROWS, height - chrome.length);
    const rendered = this.transcript.render(width);
    const maxBack = Math.max(0, rendered.rows.length - capacity);
    this.lastMaxBack = maxBack;
    this.scrollBack = Math.min(this.scrollBack, maxBack);
    const top = maxBack - this.scrollBack;
    this.lastTop = top;
    this.lastTranscriptRows = capacity;
    this.lastOwners = rendered.owners;
    const visible = rendered.rows.slice(top, top + capacity);
    this.lastVisible = visible.length;
    // The transcript is padded down to its capacity so the chrome stays put: a
    // short conversation should not float the prompt up the middle of the screen.
    const filler = Array.from({ length: Math.max(0, capacity - visible.length) }, () => "");
    this.lastFiller = filler.length;
    return { rows: [...this.shade([...filler, ...visible]), ...chrome] };
  }

  /** The frame with an in-progress drag shaded, which is the only sign it made one. */
  private shade(rows: readonly string[]): string[] {
    const span = this.context.selection();
    return span ? highlightSelection(rows, span) : [...rows];
  }

  /** How far back the window is, in rows; 0 means it is following the newest. */
  get scrolledBack(): number {
    return this.scrollBack;
  }

  /**
   * Move the window by `rows` (negative scrolls back). Returns whether it moved,
   * so a key that could not scroll can fall through to something else.
   */
  scroll(rows: number): boolean {
    // Bounded by what the last frame could actually reveal, so a key that had
    // nowhere to go says so instead of reporting a move that renders identically.
    const next = Math.min(this.lastMaxBack, Math.max(0, this.scrollBack - rows));
    if (next === this.scrollBack) return false;
    this.scrollBack = next;
    return true;
  }

  /** Jump to the newest rows, which is also what any new output implies. */
  scrollToEnd(): void {
    this.scrollBack = 0;
  }

  /** Scroll by whole screens, for PageUp and PageDown. */
  scrollPage(direction: -1 | 1): boolean {
    return this.scroll(direction * Math.max(1, this.lastTranscriptRows - 1));
  }

  /**
   * The block under screen row `row`, for a click that lands on the transcript.
   *
   * Rows above the transcript window are padding and rows below it are chrome;
   * both answer with nothing rather than with the nearest block, so a click on the
   * status band cannot fold away whatever happens to sit at that offset.
   */
  blockAtScreenRow(row: number): ReturnType<Transcript["blockAt"]> {
    const within = row - this.lastFiller;
    if (within < 0 || within >= this.lastVisible) return undefined;
    const index = this.lastOwners[this.lastTop + within];
    return index === undefined ? undefined : this.transcript.blockAt(index);
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
        },
        this.context.ambient(),
        width,
      ),
    );
    return rows;
  }
}
