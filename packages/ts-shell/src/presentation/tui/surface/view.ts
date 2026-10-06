import { layoutComposer } from "../composer/layout.js";
import { composerStatus } from "../composer/status.js";
import { highlightComposer } from "../composer/projection.js";
import type { ComposerLayout } from "../composer/contract.js";
import { truncateToWidth } from "../text/layout.js";
import { renderHints } from "../chrome/hints.js";
import { renderSearchBar } from "../chrome/searchBar.js";
import type { FrameLayout, TerminalFramePlan, ViewportSize } from "../render/frame.js";
import type { Block } from "../transcript/blocks.js";
import { renderActivity } from "../transcript/live.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import type { ScrollbarGeometry } from "../transcript/viewport.js";
import { createViewState, type ChoiceRegions, type ComposerGeometry, type InteractiveView, type ViewContext, type ViewState } from "./contract.js";
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
  choiceRegions: ChoiceRegions = {};
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
    this.choiceRegions = { ...this.choiceRegions, suggestions: undefined };
    this.suggesting = open;
    if (!open) this.suggestions.reset();
  }

  renderFrame(dimensions: ViewportSize, layout: FrameLayout = "viewport"): TerminalFramePlan {
    const width = Math.max(0, Math.floor(dimensions.columns));
    const height = Math.max(0, Math.floor(dimensions.rows));
    if (width === 0 || height === 0) {
      this.lastComposerGeometry = undefined;
      this.choiceRegions = {};
      return { rows: [], chromeRows: [] };
    }
    const chrome = this.renderChrome(width, height);
    if (this.context.overlayFullScreen()) {
      this.choiceRegions = { overlay: { top: 0, height } };
      this.lastComposerGeometry = undefined;
      // A full-screen overlay owns every row, so there is no fixed block to
      // redraw separately.
      return { rows: chrome.overlayRows.slice(0, height).map(row => truncateToWidth(row, width)), fullScreen: true };
    }
    const capacity = Math.max(0, height - chrome.rows.length);
    const transcriptRows = capacity === 0 && layout !== "document" ? [] : this.pane.render(
      width,
      capacity,
      this.context.selection(),
      this.context.highlightSearchMatches,
      this.context.imageProtocol ? { imageProtocol: this.context.imageProtocol() } : {},
      layout,
    );
    this.lastComposerGeometry = layout === "document" ? undefined : {
      top: transcriptRows.length + chrome.composerOffset,
      bottom: transcriptRows.length + chrome.composerOffset + chrome.composerRows.length - 1,
      rows: chrome.composerRows,
      layout: chrome.composerLayout,
    };
    this.choiceRegions = {
      overlay: {
        top: transcriptRows.length + chrome.overlayOffset, height: chrome.overlayHeight,
        visibleTop: transcriptRows.length + Math.max(0, chrome.overlayOffset),
      },
      ...(this.suggestionsOpen ? {
        suggestions: {
          top: transcriptRows.length + chrome.composerOffset + chrome.composerRows.length,
          height: chrome.suggestionRows,
          width,
        },
      } : {}),
    };
    return {
      rows: [...transcriptRows, ...chrome.rows],
      chromeRows: chrome.rows,
    };
  }

  /**
   * Scroll so a content row is visible, for stepping through search matches.
   *
   * A search that knows where the match is but cannot put it on screen leaves the
   * user cycling a counter with nothing changing in front of them.
   */
  scrollToContentRow(row: number): boolean {
    return this.pane.scrollToContentRow(row);
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
    const geometry = this.lastComposerGeometry;
    if (!geometry || this.context.overlayFullScreen() || geometry.layout.shape !== (this.context.composerShape?.() ?? "default")) return undefined;
    const source = this.editor.snapshot();
    return source.revision === geometry.layout.sourceRevision && source.text === geometry.layout.source
      ? geometry : undefined;
  }

  invalidateLayout(): void {
    this.lastComposerGeometry = undefined;
    this.choiceRegions = {};
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
    readonly composerLayout: ComposerLayout;
    readonly overlayOffset: number;
    readonly overlayHeight: number;
    readonly overlayRows: readonly string[];
    readonly suggestionRows: number;
  } {
    const busy = this.context.busy();
    const chromeCapacity = Math.max(1, height - MIN_TRANSCRIPT_ROWS);
    const maxComposerRows = Math.min(chromeCapacity, Math.max(3, Math.min(10, Math.floor(height * 0.35))));
    const activityRows = renderActivity(this.context.activity(), this.context.now(), width);
    const composerLayout = layoutComposer(
      this.editor,
      { busy, shape: this.context.composerShape?.() ?? "default", status: composerStatus(this.context.facts(), this.context.statusItems(), width) },
      width,
      maxComposerRows,
    );
    const composerRows = highlightComposer(composerLayout, this.context.composerSelection?.());
    let remaining = chromeCapacity - composerRows.length;
    const suggestionRows = this.suggestionsOpen ? this.suggestions.render(width, remaining) : [];
    remaining -= suggestionRows.length;
    // The search bar takes the hint row rather than adding one: an open search is
    // itself the hint, and the composer above it is where the user's text lives, so
    // taking that row instead would lose whatever they had typed.
    const searchBar = this.context.searchBar?.();
    const hints = (searchBar ? renderSearchBar(searchBar, width) : renderHints(
        {
          busy,
          suggesting: this.suggestionsOpen,
          cancelArmed: this.context.cancelArmed(),
          queued: this.context.queuedCount(),
          steering: this.context.steeringCount?.() ?? 0,
          toast: this.context.toast?.(),
        },
        this.context.ambient(),
        width,
      )).slice(0, remaining);
    remaining -= hints.length;
    const overlayRows = this.context.overlayRows(width, height, Math.max(0, remaining - activityRows.length));
    const statusRows = [...activityRows, ...overlayRows];
    const visibleStatus = remaining > 0 ? statusRows.slice(-remaining) : [];
    const droppedStatus = statusRows.length - visibleStatus.length;
    return {
      rows: [...visibleStatus, ...composerRows, ...suggestionRows, ...hints].map(row => truncateToWidth(row, width)),
      composerOffset: visibleStatus.length, composerRows, composerLayout,
      overlayOffset: activityRows.length - droppedStatus, overlayHeight: overlayRows.length, overlayRows, suggestionRows: suggestionRows.length,
    };
  }
}
