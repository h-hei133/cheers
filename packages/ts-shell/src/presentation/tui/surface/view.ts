import { truncateToWidth } from "../text/layout.js";
import type { FrameLayout, TerminalFramePlan, ViewportSize } from "../render/frame.js";
import type { Block } from "../transcript/blocks.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import type { ScrollbarGeometry } from "../transcript/viewport.js";
import { createViewState, type ChoiceRegions, type ComposerGeometry, type InteractiveView, type PointerGeometry, type ViewContext, type ViewState } from "./contract.js";
import { TranscriptPane } from "./pane.js";
import { renderChrome } from "./chrome.js";

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

export class InteractiveSurface implements InteractiveView {
  choiceRegions: ChoiceRegions = {};
  readonly editor: ViewState["editor"];
  readonly pastes: ViewState["pastes"];
  readonly transcript: ViewState["transcript"];
  readonly suggestions: ViewState["suggestions"];
  private readonly pane: TranscriptPane;
  private suggesting = false;
  private lastComposerGeometry: ComposerGeometry | undefined;
  pointerGeometry: PointerGeometry | undefined;

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
    this.pointerGeometry = undefined;
    const width = Math.max(0, Math.floor(dimensions.columns));
    const height = Math.max(0, Math.floor(dimensions.rows));
    if (width === 0 || height === 0) {
      this.lastComposerGeometry = undefined;
      this.choiceRegions = {};
      return { rows: [], chromeRows: [] };
    }
    const chrome = renderChrome(this.context, this, width, height);
    if (this.context.overlayFullScreen()) {
      this.choiceRegions = { overlay: { top: 0, height } };
      this.lastComposerGeometry = undefined;
      // A full-screen overlay owns every row, so there is no fixed block to
      // redraw separately.
      return { rows: chrome.overlayRows.slice(0, height).map(row => truncateToWidth(row, width)), fullScreen: true,
        pointerMotion: this.context.overlayPointerMotion?.() === true };
    }
    const capacity = Math.max(0, height - chrome.rows.length);
    const transcriptRows = capacity === 0 && layout !== "document" ? [] : this.pane.render(
      width,
      capacity,
      this.context.selection(),
      this.context.highlightSearchMatches,
      { imageProtocol: this.context.imageProtocol?.(), thinkingShortcut: this.context.thinkingShortcut?.() },
      layout,
    );
    this.lastComposerGeometry = layout === "document" || chrome.composerRows.length === 0 ? undefined : {
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
    if (transcriptRows.length > 0) this.pointerGeometry = { width, height, layout };
    return {
      documentId: this.transcript.all(),
      rows: [...transcriptRows, ...chrome.rows],
      sensitiveRows: this.pane.sensitiveRows,
      chromeRows: chrome.rows,
      pointerMotion: this.context.overlayPointerMotion?.() === true,
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

  selectionRevision(): number {
    return this.pane.selectionRevision();
  }

  selectionTop(): number {
    return this.pane.selectionTop();
  }

  blockAtScreenRow(row: number): Block | undefined {
    return this.pane.blockAtScreenRow(row);
  }

  toggleCollapsed(only?: "thinking" | "tool"): boolean {
    return this.pane.toggleCollapsed(only);
  }

  transcriptSource(anchor: SelectionPoint, focus: SelectionPoint): string | undefined {
    return this.pane.extractSource(anchor, focus);
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
    this.pointerGeometry = undefined;
    this.choiceRegions = {};
  }
}
