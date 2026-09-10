import type { TerminalFramePlan, ViewportSize } from "../render/frame.js";
import type { Block } from "../transcript/blocks.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import type { ScrollbarGeometry } from "../transcript/viewport.js";
import { createViewState, type InteractiveView, type ViewContext, type ViewState } from "../view.js";
import { Composer, StatusBar, type ComposerFacts } from "./chrome.js";
import type { ViewComponent } from "./contract.js";
import type { SessionFacts } from "./model.js";
import { TranscriptPane } from "./pane.js";

/**
 * Frame composition from components.
 *
 * The same screen as the direct-render surface — transcript pane above, chrome
 * below — but the chrome is a status bar and a composer that implement the
 * component contract, so the host talks to them only through facts and the frame
 * is theirs to lay out. The pane is shared with the other surface, which is what
 * keeps scrolling, selection, and the scrollbar identical between the two.
 */

/** Minimum transcript rows kept visible however tall the chrome grows. */
const MIN_TRANSCRIPT_ROWS = 1;

/** Rows for an open panel picker, sized to the screen the frame is being drawn for. */
class PanelRows implements ViewComponent {
  height = 0;

  constructor(private readonly rows: (width: number, height: number) => string[]) {}

  invalidate(): void {}

  render(width: number): string[] {
    return this.rows(width, this.height);
  }
}

export class ComposedView implements InteractiveView {
  readonly transcript: ViewState["transcript"];
  readonly editor: ViewState["editor"];
  readonly pastes: ViewState["pastes"];
  readonly suggestions: ViewState["suggestions"];
  private readonly pane: TranscriptPane;
  private readonly panel: PanelRows;
  private readonly status: StatusBar;
  private readonly composer: Composer;
  private suggesting = false;

  constructor(
    private readonly context: ViewContext,
    state: ViewState = createViewState(),
  ) {
    this.transcript = state.transcript;
    this.editor = state.editor;
    this.pastes = state.pastes;
    this.suggestions = state.suggestions;
    this.pane = new TranscriptPane(state.transcript);
    this.panel = new PanelRows((width, height) => context.overlayRows(width, height));
    // Facts are read at paint time only: the host hands over its context before
    // the parties those thunks reach into exist, so nothing here may call them.
    this.status = new StatusBar({ facts: { model: "", provider: "" }, items: [], activity: undefined, busy: false }, this.panel);
    this.composer = new Composer(
      state.editor,
      { busy: false, suggesting: false, cancelArmed: false, queued: 0, newlineKey: "", ambient: { openTodos: 0, peerSessions: 0 } },
      state.suggestions,
    );
  }

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
      return { rows: this.context.overlayRows(width, height) };
    }
    const chrome = this.renderChrome(width, height);
    const capacity = Math.max(MIN_TRANSCRIPT_ROWS, height - chrome.length);
    const transcriptRows = this.pane.render(width, capacity, this.context.selection());
    return { rows: [...transcriptRows, ...chrome] };
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

  /** The bottom block: status bar (activity, panel picker, band) then the composer. */
  private renderChrome(width: number, height: number): string[] {
    this.panel.height = height;
    this.status.setFacts(this.sessionFacts());
    this.composer.setFacts(this.composerFacts(height));
    return [...this.status.render(width), ...this.composer.render(width)];
  }

  private sessionFacts(): SessionFacts {
    return {
      facts: this.context.facts(),
      items: this.context.statusItems(),
      activity: this.context.activity(),
      busy: this.context.busy(),
      now: this.context.now(),
    };
  }

  private composerFacts(height: number): ComposerFacts {
    return {
      busy: this.context.busy(),
      suggesting: this.suggestionsOpen,
      cancelArmed: this.context.cancelArmed(),
      queued: this.context.queuedCount(),
      newlineKey: this.context.newlineKey(),
      ambient: this.context.ambient(),
      maxRows: Math.max(3, Math.min(10, Math.floor(height * 0.35))),
      toast: this.context.toast?.(),
    };
  }
}
