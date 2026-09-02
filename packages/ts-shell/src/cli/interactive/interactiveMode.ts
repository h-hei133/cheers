import type { Interface as ReadlineInterface } from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { handleShellClose } from "../../core/shell/signalHandlers.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { newlineKeyFor } from "../../presentation/tui/chrome/hints.js";
import type { StatusItemId } from "../../presentation/tui/chrome/items.js";
import { renderWelcome } from "../../presentation/tui/chrome/welcome.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { Clipboard } from "./clipboard.js";
import { DragSelection } from "./selection.js";
import { TUI } from "../../presentation/tui/render/engine.js";
import { processTerminal, type TerminalDevice } from "../../presentation/tui/terminal.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import type { RenderScheduler } from "../../presentation/tui/render/frame.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import { InteractiveSurface } from "./frameSurface.js";
import { routeKey } from "./keymap.js";
import { QuestionBridge } from "./questionBridge.js";
import { readAmbientFacts } from "./ambientFacts.js";
import { OverlayHost, type Picker } from "./overlay.js";
import { opensPicker, pickerFor, type PickerHost } from "./picker/registry.js";
import { readStatusItems, resizeScrollbackMode, writeStatusItems } from "./tuiSettings.js";
import { readStatusFacts, readWelcomeState } from "./sessionFacts.js";
import { slashSuggestions } from "./slashSuggestions.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { TurnSink } from "./turnSink.js";

/**
 * Interactive session host.
 *
 * Owns the terminal for the lifetime of the session and mediates between three
 * parties that would otherwise collide: raw stdin, the differential renderer,
 * and runtime code that expects to write prose and ask readline questions. It
 * runs on the terminal's normal screen so the transcript retires into real
 * scrollback, which the alternate buffer would make impossible.
 */

const DEFAULT_PLACEHOLDER = "Ask anything, or / for commands";

/** Window in which the exit hint stays on screen after one cancel press. */
const CANCEL_ARMED_MS = 600;

/**
 * Resize policy for retired scrollback. Rebuilding republishes the ledger at the
 * new width, which is what a reader wants; `preserve` is for terminals where
 * clearing scrollback is worse than a stale rewrap of already-retired rows.
 */
export interface InteractiveModeOptions {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  readonly initialMcpGateway: CliMcpGateway;
  readonly setReadline?: (readline: ReadlineInterface | null) => void;
  readonly setActiveNonInteractiveApprovalMode?: (mode: ApprovalModeObject | undefined) => void;
  readonly exit?: (code?: number) => never;
  /** Output device; defaults to the process terminal. */
  readonly terminal?: TerminalDevice;
  /** Frame scheduler; defaults to real timers. */
  readonly scheduler?: RenderScheduler;
}

export class InteractiveMode {
  private readonly terminal: TerminalDevice;
  private readonly tui: TUI;
  private readonly surface: InteractiveSurface;
  private readonly stdin = new StdinBuffer();
  private readonly sink: TurnSink;
  private readonly questions: QuestionBridge;
  private readonly readline: ReadlineInterface;
  private readonly gesture: { lastCancelAt?: number } = {};
  private readonly overlay: OverlayHost;
  private readonly selection: DragSelection;
  private readonly clipboard: Clipboard;
  private statusItems: readonly StatusItemId[];

  private busy = false;
  private turnNumber = 0;
  private readonly queue: string[] = [];

  constructor(private readonly options: InteractiveModeOptions) {
    this.terminal = options.terminal ?? processTerminal;
    this.statusItems = readStatusItems(options.runtimeContext.projectRoot);
    this.clipboard = new Clipboard({
      projectRoot: options.runtimeContext.projectRoot,
      cwd: options.runtimeContext.cwd,
      sessionId: options.runtimeContext.session.id,
      setTracking: (enabled) => this.tui.setMouseTracking(enabled),
      notify: (text) => this.sink.notify(text),
    });
    this.selection = new DragSelection(
      { rows: () => this.tui.screenRows() },
      (text) => this.clipboard.copy(text),
    );
    this.overlay = new OverlayHost(() => this.tui.requestRender());
    this.tui = new TUI(this.terminal, options.scheduler, resizeScrollbackMode(process.env));
    this.surface = new InteractiveSurface({
      facts: () => readStatusFacts(this.options.runtimeContext, this.options.sessionRuntime.getAgentMode()),
      statusItems: () => this.statusItems,
      activity: () => this.sink.activity(),
      busy: () => this.busy,
      queuedCount: () => this.queue.length,
      now: () => Date.now(),
      ambient: () => readAmbientFacts(this.options.runtimeContext.session.id),
      newlineKey: () => newlineKeyFor(this.terminal.keyboardProtocol ?? "legacy"),
      cancelArmed: () => this.isCancelArmed(),
      overlayFullScreen: () => this.overlay.fullScreen,
      overlayRows: (width, height) => this.overlay.render(width, height),
    });
    this.sink = new TurnSink(this.surface.transcript, () => this.tui.requestRender());
    this.questions = new QuestionBridge({
      ask: (question) => this.onQuestion(question),
      settle: () => this.onQuestionSettled(),
    });
    this.readline = this.questions.asReadline(() => this.stop());
    this.options.setReadline?.(this.readline);
    this.tui.setFrameProvider(this.surface);
    this.surface.editor.placeholder = DEFAULT_PLACEHOLDER;
  }

  start(): void {
    // The intro renders itself at the frame width so a resize re-elides the path
    // instead of keeping the elision it was born with.
    this.surface.transcript.append({
      kind: "notice",
      text: "",
      finalized: true,
      rows: (width) =>
        renderWelcome(
          readWelcomeState(
            this.options.runtimeContext,
            this.options.sessionRuntime.getAgentMode(),
            this.options.fallbackSessionId !== undefined,
          ),
          width,
        ),
    });
    this.stdin.onKey((event) => this.onKey(event));
    this.stdin.onPaste((text) => this.onPaste(text));
    this.stdin.onMouse((report) => this.selection.handle(report));
    this.tui.onInput((data) => this.stdin.feed(data));
    this.options.sessionRuntime.observeEvents((event) => this.sink.handleEvent(event));
    this.tui.start();
    this.clipboard.applyStoredPreference();
  }

  stop(): void {
    this.questions.abandon();
    this.options.renderer.clearSink();
    this.stdin.dispose();
    this.tui.stop();
  }

  /** Whether a second cancel press within the double-press window would exit. */
  private isCancelArmed(): boolean {
    const last = this.gesture.lastCancelAt;
    return last !== undefined && Date.now() - last < CANCEL_ARMED_MS;
  }

  private onKey(event: Parameters<typeof routeKey>[0]): void {
    // An open picker owns the keyboard: it needs the arrows, Enter, Escape, and
    // every printable character for its filter.
    if (this.overlay.handleKey(event, (picker, ids) => this.applyPicker(picker, ids))) return;
    routeKey(event, {
      surface: this.surface,
      busy: this.busy,
      now: () => Date.now(),
      gesture: this.gesture,
      actions: {
        submit: (text) => this.onSubmit(text),
        interrupt: () => this.interrupt(),
        exit: () => this.shutdown(),
        redraw: () => this.tui.requestRender(),
        clearScreen: () => this.clearScreen(),
        cycleAgentMode: () => this.cycleAgentMode(),
        redrawAfter: (delayMs) => {
          setTimeout(() => this.tui.requestRender(), delayMs).unref?.();
        },
        syncSuggestions: (mayOpen) => this.syncSuggestions(mayOpen),
      },
    });
  }

  /** Publish a runtime question as a transcript block and retarget the prompt. */
  private onQuestion(question: string): void {
    this.surface.transcript.append(textBlock("notice", `  ${question}`));
    this.surface.editor.placeholder = "Answer above, then press Enter";
    this.tui.requestRender();
  }

  private onQuestionSettled(): void {
    this.surface.editor.placeholder = DEFAULT_PLACEHOLDER;
    this.tui.requestRender();
  }

  private onPaste(text: string): void {
    this.surface.editor.insert(text);
    this.syncSuggestions(false);
    this.tui.requestRender();
  }

  /**
   * Recompute completions. A list that is not already open only opens when the
   * gesture was typing or Tab, so arrow-key history recall keeps the arrows.
   */
  private syncSuggestions(mayOpen: boolean): void {
    const matches = slashSuggestions(this.surface.editor.getText());
    if (!matches) {
      this.surface.setSuggesting(false);
      return;
    }
    if (!mayOpen && !this.surface.suggestionsOpen) return;
    this.surface.suggestions.setItems(matches);
    this.surface.setSuggesting(true);
  }

  private onSubmit(text: string): void {
    if (this.questions.answer(text)) {
      this.tui.requestRender();
      return;
    }
    if (!this.busy && opensPicker(text)) {
      this.openPicker(text);
      return;
    }
    this.surface.transcript.append(textBlock("user", text));
    if (this.busy) {
      this.queue.push(text);
      this.tui.requestRender();
      return;
    }
    void this.run(text);
  }

  /** Execute one submission, then drain anything typed while it ran. */
  private async run(text: string): Promise<void> {
    this.busy = true;
    let exiting = false;
    const command = text.startsWith("/") ? text.split(/\s+/)[0]! : "turn";
    this.sink.begin(text.startsWith("/") ? "command" : "turn", command);
    this.options.renderer.setSink(this.sink);
    try {
      const result = await routeInteractiveCommand({
        prompt: text,
        readline: this.readline,
        mcpGateway: this.options.initialMcpGateway,
        fallbackSessionId: this.options.fallbackSessionId,
        sessionManager: this.options.sessionManager,
        runtimeContext: this.options.runtimeContext,
        renderer: this.options.renderer,
        sessionRuntime: this.options.sessionRuntime,
        logger: this.options.logger,
        approvalTrustPolicy: this.options.approvalTrustPolicy,
        turnNumber: this.turnNumber,
        setActiveNonInteractiveApprovalMode:
          this.options.setActiveNonInteractiveApprovalMode ?? (() => {}),
      });
      this.turnNumber = result.turnNumber;
      if (result.exitRequested) exiting = true;
    } catch (error) {
      this.surface.transcript.append(
        textBlock("error", error instanceof Error ? error.message : String(error), "error"),
      );
    } finally {
      this.options.renderer.clearSink();
      this.sink.end();
      this.busy = false;
      if (exiting) {
        this.shutdown();
        return;
      }
      this.tui.requestRender();
      const next = this.queue.shift();
      if (next !== undefined) void this.run(next);
    }
  }

  /** Open the chooser a bare command maps to. */
  private openPicker(command: string): void {
    const picker = pickerFor(command, this.pickerHost());
    if (!picker) return;
    this.overlay.open(picker);
  }

  /** Hand the choice to the picker that produced it and surface what it reports. */
  private applyPicker(picker: Picker, ids: readonly string[]): void {
    void picker
      .apply(ids)
      .then((outcome) => {
        if (outcome?.note) {
          this.surface.transcript.append(textBlock("command", outcome.note, picker.title));
        }
        if (outcome?.draft) {
          // The next step needs a secret, so the picker hands over the exact
          // command with the caret after it rather than collecting it here.
          this.surface.editor.setText(outcome.draft);
        }
      })
      .catch((error: unknown) => {
        this.surface.transcript.append(
          textBlock("error", error instanceof Error ? error.message : String(error), picker.title),
        );
      })
      .finally(() => this.tui.requestRender());
  }

  /** Everything the pickers need from the session, resolved lazily. */
  private pickerHost(): PickerHost {
    return {
      commandContext: { cwd: this.options.runtimeContext.cwd, sessionId: this.options.runtimeContext.session.id },
      transcript: this.surface.transcript,
      sessionManager: this.options.sessionManager,
      mcpGateway: this.options.initialMcpGateway,
      approvalTrustPolicy: this.options.approvalTrustPolicy,
      projectRoot: this.options.runtimeContext.projectRoot,
      statusItems: this.statusItems,
      resumeSession: (sessionId) => this.runCommandLine(`/resume ${sessionId}`),
      refreshServer: (serverName) => this.runCommandLine(`/mcp refresh ${serverName}`),
      revokeGrant: (key) => this.runCommandLine(`/permissions revoke ${key}`),
      mouseCopy: this.clipboard.dragEnabled,
      setMouseCopy: async (enabled) => this.clipboard.setDragEnabled(enabled),
      saveStatusItems: async (items) => {
        this.statusItems = items;
        return `Status band items saved to ${writeStatusItems(this.options.runtimeContext.projectRoot, items)}`;
      },
    };
  }

  /** Route a command line as if the user had typed it, reusing the same path. */
  private async runCommandLine(line: string): Promise<undefined> {
    this.surface.transcript.append(textBlock("user", line));
    await this.run(line);
    return undefined;
  }

  private interrupt(): void {
    if (!this.busy) return;
    this.sink.markCancelling();
    this.options.sessionRuntime.cancelCurrentRun();
  }

  /**
   * Swap between planning and building. This replaces four commands that each
   * did one leg of the same toggle, and puts it on a key so the mode can be
   * changed mid-thought without abandoning the draft.
   */
  private cycleAgentMode(): void {
    const next = this.options.sessionRuntime.getAgentMode() === "plan" ? "build" : "plan";
    this.options.sessionRuntime.setAgentMode(next);
    this.tui.requestRender();
  }

  /** Drop the visible transcript and the terminal's scrollback together. */
  private clearScreen(): void {
    this.surface.transcript.clear();
    this.tui.requestRender({ force: true, clearScrollback: true });
  }

  private shutdown(): void {
    this.stop();
    handleShellClose({
      sessionRuntime: this.options.sessionRuntime,
      renderer: this.options.renderer,
      runtimeContext: this.options.runtimeContext,
      exit: this.options.exit,
    });
  }
}
