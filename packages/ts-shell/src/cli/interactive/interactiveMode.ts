import type { Interface as ReadlineInterface } from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { handleShellClose } from "../../core/shell/signalHandlers.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { newlineKeyFor } from "../../presentation/tui/chrome/hints.js";
import { renderWelcome, type WelcomeState } from "../../presentation/tui/chrome/welcome.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { TUI } from "../../presentation/tui/render/engine.js";
import { processTerminal, type TerminalDevice } from "../../presentation/tui/terminal.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import type { RenderScheduler, ResizeScrollbackMode } from "../../presentation/tui/render/frame.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import { InteractiveSurface } from "./frameSurface.js";
import { routeKey } from "./keymap.js";
import { QuestionBridge } from "./questionBridge.js";
import { readAmbientFacts } from "./ambientFacts.js";
import { readBandState } from "./sessionFacts.js";
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
function resizeScrollbackMode(env: NodeJS.ProcessEnv): ResizeScrollbackMode {
  return env.TSSHELL_TUI_RESIZE_SCROLLBACK === "preserve" ? "preserve" : "rebuild";
}

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

  private busy = false;
  private turnNumber = 0;
  private readonly queue: string[] = [];

  constructor(private readonly options: InteractiveModeOptions) {
    this.terminal = options.terminal ?? processTerminal;
    this.tui = new TUI(this.terminal, options.scheduler, resizeScrollbackMode(process.env));
    this.surface = new InteractiveSurface({
      band: () => readBandState(this.options.runtimeContext),
      activity: () => this.sink.activity(),
      busy: () => this.busy,
      queuedCount: () => this.queue.length,
      now: () => Date.now(),
      ambient: () => readAmbientFacts(this.options.runtimeContext.session.id),
      newlineKey: () => newlineKeyFor(this.terminal.keyboardProtocol ?? "legacy"),
      cancelArmed: () => this.isCancelArmed(),
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
      rows: (width) => renderWelcome(this.welcomeState(), width),
    });
    this.stdin.onKey((event) => this.onKey(event));
    this.stdin.onPaste((text) => this.onPaste(text));
    this.tui.onInput((data) => this.stdin.feed(data));
    this.options.sessionRuntime.observeEvents((event) => this.sink.handleEvent(event));
    this.tui.start();
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

  /** Intro facts, resolved at paint time so a mid-session change is reflected. */
  private welcomeState(): WelcomeState {
    const facts = readBandState(this.options.runtimeContext);
    return {
      model: facts.model,
      directory: facts.directory ?? this.options.runtimeContext.projectRoot,
      branch: facts.branch,
      resumeHint: this.options.fallbackSessionId
        ? `/resume to continue session ${this.options.fallbackSessionId}`
        : undefined,
    };
  }

  private onKey(event: Parameters<typeof routeKey>[0]): void {
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
    } catch (error) {
      this.surface.transcript.append(
        textBlock("error", error instanceof Error ? error.message : String(error), "error"),
      );
    } finally {
      this.options.renderer.clearSink();
      this.sink.end();
      this.busy = false;
      this.tui.requestRender();
      const next = this.queue.shift();
      if (next !== undefined) void this.run(next);
    }
  }

  private interrupt(): void {
    if (!this.busy) return;
    this.sink.markCancelling();
    this.options.sessionRuntime.cancelCurrentRun();
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
