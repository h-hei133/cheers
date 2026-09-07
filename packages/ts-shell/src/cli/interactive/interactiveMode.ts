import type { Interface as ReadlineInterface } from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { handleShellClose } from "../../core/shell/signalHandlers.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { newlineKeyFor } from "../../presentation/tui/chrome/hints.js";
import { loadPromptHistory, appendPromptHistory } from "./historyStore.js";
import type { StatusItemId } from "../../presentation/tui/chrome/items.js";
import { renderWelcome } from "../../presentation/tui/chrome/welcome.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { nextScope, scopeLabel, scopeMeaning } from "../approval/permissionScope.js";
import { Clipboard } from "./clipboard.js";
import { Pointer } from "./pointer.js";
import { TUI } from "../../presentation/tui/render/engine.js";
import { processTerminal, type TerminalDevice } from "../../presentation/tui/terminal.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import type { RenderScheduler } from "../../presentation/tui/render/frame.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import { replaceLiteral } from "../../presentation/tui/pastes.js";
import { InteractiveSurface } from "./frameSurface.js";
import { routeKey } from "./keymap.js";
import { QuestionBridge } from "./questionBridge.js";
import { readAmbientFacts } from "./ambientFacts.js";
import { showConversation, startFreshSession, type HistoryTarget } from "./history.js";
import { Pager, pageLongOutput } from "../../presentation/tui/chrome/pager.js";
import { OverlayHost, type Picker } from "./overlay.js";
import { opensPicker, pickerFor, type PickerHost } from "./picker/registry.js";
import { readStatusItems, writeStatusItems } from "./tuiSettings.js";
import { readStatusFacts, readWelcomeState } from "./sessionFacts.js";
import { couldBeCommand, slashSuggestions } from "./slashSuggestions.js";
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
/** How often the activity row is repainted while a turn runs, for its clock. */
const ACTIVITY_TICK_MS = 100;

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
  private readonly gesture: { lastCancelAt?: number; lastEscapeAt?: number } = {};
  private readonly overlay: OverlayHost;
  private readonly pager = new Pager();
  private readonly pointer: Pointer;
  private readonly clipboard: Clipboard;
  private statusItems: readonly StatusItemId[];
  /**
   * The band a still-open chooser is proposing. Present only while the chooser is
   * open, so the band shows what a toggle would do without the choice being made
   * — Escape leaves the saved band exactly as it was.
   */
  private previewItems: readonly StatusItemId[] | undefined;

  private busy = false;
  private tick: ReturnType<typeof setInterval> | undefined;
  private turnNumber = 0;
  /** The last thing submitted that was a prompt rather than a command. */
  private lastPrompt: string | undefined;
  private readonly queue: string[] = [];

  constructor(private readonly options: InteractiveModeOptions) {
    this.terminal = options.terminal ?? processTerminal;
    this.statusItems = readStatusItems(options.runtimeContext.projectRoot);
    this.clipboard = new Clipboard({
      cwd: options.runtimeContext.cwd,
      sessionId: options.runtimeContext.session.id,
      notify: (text) => {
        if (this.busy) return;
        this.sink.notify(text, "clipboard");
      },
      write: (data) => this.terminal.write(data),
    });
    this.overlay = new OverlayHost(() => this.tui.requestRender());
    this.tui = new TUI(this.terminal, options.scheduler);
    this.surface = new InteractiveSurface({
      facts: () =>
        readStatusFacts(this.options.runtimeContext, {
          agentMode: this.options.sessionRuntime.getAgentMode(),
          permissionScope: this.options.sessionRuntime.getPermissionScope(),
          queued: this.queue.length,
          peers: readAmbientFacts(this.options.runtimeContext.session.id).peerSessions,
        }),
      statusItems: () => this.previewItems ?? this.statusItems,
      activity: () => this.sink.activity(),
      busy: () => this.busy,
      queuedCount: () => this.queue.length,
      now: () => Date.now(),
      ambient: () => readAmbientFacts(this.options.runtimeContext.session.id),
      newlineKey: () => newlineKeyFor(this.terminal.keyboardProtocol ?? "legacy"),
      cancelArmed: () => this.isCancelArmed(),
      overlayFullScreen: () => this.pager.active || this.overlay.fullScreen,
      overlayRows: (width, height) =>
        this.pager.active ? this.pager.render(width, height) : this.overlay.render(width, height),
      selection: () => this.pointer.selection,
    });
    this.pointer = new Pointer({
      surface: this.surface,
      rows: () => this.tui.screenRows(),
      copy: (text) => this.clipboard.copy(text),
      redraw: () => this.tui.requestRender(),
    });
    this.sink = new TurnSink(this.surface.transcript, () => {
      // New output brings the window back to the newest rows — unless the user has
      // scrolled away, which is a statement that they are reading something else.
      if (this.surface.scrolledBack === 0) this.surface.scrollToEnd();
      this.tui.requestRender();
    });
    this.questions = new QuestionBridge({
      ask: (question) => this.onQuestion(question),
      settle: () => this.onQuestionSettled(),
    });
    this.readline = this.questions.asReadline(() => this.stop());
    this.options.setReadline?.(this.readline);
    this.tui.setFrameProvider(this.surface);
    this.surface.editor.placeholder = DEFAULT_PLACEHOLDER;
    // A chip token deletes whole: the caret sits at its end, and one Backspace
    // removes the token — and with it the attachment — instead of half a symbol.
    this.surface.editor.atomicTokenStart = (line, column) => {
      const before = line.slice(0, column);
      const match = /(?:⎘ #\d+|\[#\d+ [^\]]*\])$/.exec(before);
      return match ? column - match[0].length : undefined;
    };
    const diskHistory = loadPromptHistory(options.runtimeContext.projectRoot);
    this.surface.editor.loadHistory(diskHistory);
    const sessionTurns = options.runtimeContext.session.turns
      ?.filter((t) => t.role === "user" && t.content?.trim())
      .map((t) => t.content.trim()) ?? [];
    this.surface.editor.loadHistory(sessionTurns);
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
    this.stdin.onMouse((report) => this.pointer.handle(report));
    this.stdin.onPaste((text) => {
      // A paste while the full-screen editor is up belongs to it, whole; a paste
      // into the prompt is held aside once it is long enough to bury the draft.
      // Pasting the same thing twice in quick succession means "show it in full":
      // the first press left a placeholder, and the second replaces it with the text.
      const repeat = this.surface.pastes.expandOnRepeat(text);
      if (repeat) {
        // The placeholder may have been deleted since the first paste; a replace
        // would then silently drop the second paste. Re-insert in that case.
        const draft = this.surface.editor.getText();
        // A string replacer would interpret $&, $1, $$ and ${...} inside the
        // pasted code as substitution patterns and silently rewrite them away.
        const replaced = replaceLiteral(draft, repeat.find, repeat.text);
        if (replaced === draft) {
          this.surface.editor.insert(this.surface.pastes.holdIfLong(text));
        } else {
          this.surface.editor.setText(replaced);
        }
      } else {
        this.surface.editor.insert(this.surface.pastes.holdIfLong(text));
        this.syncSuggestions(false);
      }
      this.tui.requestRender();
    });
    this.tui.onInput((data) => this.stdin.feed(data));
    this.options.sessionRuntime.observeEvents((event) => this.sink.handleEvent(event));
    this.tui.start();
  }

  stop(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
    this.clipboard.release();
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
    // The pager owns every key while it is up, including Escape.
    if (this.pager.handleKey(event.keyId, event.text, this.terminal.getDimensions().rows)) {
      this.tui.requestRender();
      return;
    }
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
        cyclePermissionScope: () => this.cyclePermissionScope(),
        scroll: (rows) => {
          this.surface.scroll(rows);
          this.tui.requestRender();
        },
        scrollPage: (direction) => {
          this.surface.scrollPage(direction);
          this.tui.requestRender();
        },
        scrollToEnd: () => {
          this.surface.scrollToEnd();
          this.tui.requestRender();
        },
        retry: () => this.onSubmit("/retry"),
        openRewind: () => this.openPicker("rewind"),
        redrawAfter: (delayMs) => {
          setTimeout(() => this.tui.requestRender(), delayMs).unref?.();
        },
        syncSuggestions: (mayOpen) => this.syncSuggestions(mayOpen),
        copySelection: () => this.pointer.copySelection(),
      },
    });
  }

  /** Publish a runtime question as a transcript block and retarget the prompt. */
  private onQuestion(question: string): void {
    this.surface.transcript.append(textBlock("notice", question));
    this.surface.editor.placeholder = "Answer above, then press Enter";
    this.tui.requestRender();
  }

  private onQuestionSettled(): void {
    this.surface.editor.placeholder = DEFAULT_PLACEHOLDER;
    this.tui.requestRender();
  }

  /**
   * Recompute completions.
   *
   * A closed list reopens on typing, on Tab, and on any edit that leaves a draft
   * which could still become a command — that last case is what brings the list
   * back after a typo is deleted, since a backspace carries no text of its own.
   * History recall is excluded, so the arrows keep working on a recalled prompt.
   */
  private syncSuggestions(mayOpen: boolean): void {
    const draft = this.surface.editor.getText();
    const matches = slashSuggestions(draft);
    if (!matches) {
      this.surface.setSuggesting(false);
      return;
    }
    if (!mayOpen && !this.surface.suggestionsOpen && !couldBeCommand(draft)) return;
    this.surface.suggestions.setItems(matches);
    this.surface.setSuggesting(true);
  }

  private onSubmit(text: string): void {
    appendPromptHistory(this.options.runtimeContext.projectRoot, text);
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
    // The elapsed time is computed at paint time, and paints are driven by events.
    // Between two events there are none, so without a clock of its own the timer
    // sits at whatever it read when the turn began.
    this.tick ??= setInterval(() => this.tui.requestRender(), ACTIVITY_TICK_MS);
    this.tick.unref?.();
    let exiting = false;
    let retrying: string | undefined;
    let clearing = false;
    let opened = false;
    // `begin` clears the failure flag for the turn that is starting, so whether
    // the *previous* turn failed has to be read before that happens.
    const previousTurnFailed = this.sink.lastTurnFailed;
    if (!text.startsWith("/")) this.lastPrompt = text;
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
        modifierKeysReported: (this.terminal.keyboardProtocol ?? "legacy") !== "legacy",
        setActiveNonInteractiveApprovalMode:
          this.options.setActiveNonInteractiveApprovalMode ?? (() => {}),
      });
      this.turnNumber = result.turnNumber;
      if (result.exitRequested) exiting = true;
      if (result.retryRequested) retrying = this.sink.retryTarget(this.lastPrompt, previousTurnFailed);
      if (result.clearRequested) clearing = true;
      if (result.sessionOpened) opened = true;
    } catch (error) {
      this.surface.transcript.append(
        textBlock("error", error instanceof Error ? error.message : String(error), "error"),
      );
    } finally {
      this.options.renderer.clearSink();
      if (this.tick) clearInterval(this.tick);
      this.tick = undefined;
      // Long command output gets a view of its own: it is read once, and reading it
      // should not cost the conversation its place on screen.
      const output = this.sink.commandOutput;
      if (output) pageLongOutput(this.pager, output.title, output.block);
      this.sink.end();
      this.busy = false;
      if (exiting) {
        this.shutdown();
        return;
      }
      if (clearing) {
        startFreshSession(this.historyTarget());
        this.sink.end(true);
        this.tui.requestRender({ force: true });
      } else if (opened) {
        showConversation(this.historyTarget());
        this.tui.requestRender({ force: true });
      }
      this.tui.requestRender();
      const next = retrying ?? this.queue.shift();
      if (next !== undefined) void this.run(next);
    }
  }

  /** What the history helpers need: the transcript, the store, and the context. */
  private historyTarget(): HistoryTarget {
    return {
      transcript: this.surface.transcript,
      editor: this.surface.editor,
      sessionManager: this.options.sessionManager,
      context: this.options.runtimeContext,
    };
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
      commandContext: {
        cwd: this.options.runtimeContext.cwd,
        sessionId: this.options.runtimeContext.session.id,
        modifierKeysReported: (this.terminal.keyboardProtocol ?? "legacy") !== "legacy",
      },
      transcript: this.surface.transcript,
      sessionManager: this.options.sessionManager,
      mcpGateway: this.options.initialMcpGateway,
      approvalTrustPolicy: this.options.approvalTrustPolicy,
      projectRoot: this.options.runtimeContext.projectRoot,
      statusItems: this.statusItems,
      resumeSession: (sessionId) => this.runCommandLine(`/resume ${sessionId}`),
      deleteSession: (sessionId) => {
        this.options.sessionManager.deleteSession(sessionId);
        return undefined;
      },
      renameSession: (sessionId, title) => {
        this.options.sessionManager.renameSession(sessionId, title);
        return undefined;
      },
      refreshServer: (serverName) => this.runCommandLine(`/mcp refresh ${serverName}`),
      revokeGrant: (key) => this.runCommandLine(`/permissions revoke ${key}`),
      sessionTurns: () =>
        this.options.sessionManager.getSession(this.options.runtimeContext.session.id)?.turns ?? [],
      rewind: async (point) => {
        const dropped = this.options.sessionManager.rewindTo(
          this.options.runtimeContext.session.id,
          point.turnIndex,
        );
        showConversation(this.historyTarget());
        this.tui.requestRender({ force: true });
        return dropped > 0
          ? "Went back. Files are untouched — /undo reverts what was written."
          : "Already at that point in the conversation.";
      },
      previewStatusItems: (items) => {
        this.previewItems = items;
        this.tui.requestRender();
      },
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

  /**
   * Widen or narrow what a turn may do without asking.
   *
   * Separate from the agent mode on purpose, and announced in the transcript
   * rather than only in the band: quietly moving to a scope where nothing is put
   * to the user is not something to learn by noticing a colour change.
   */
  private cyclePermissionScope(): void {
    const next = nextScope(this.options.sessionRuntime.getPermissionScope());
    this.options.sessionRuntime.setPermissionScope(next);
    this.sink.notify(`Permission scope is now ${scopeLabel(next)} — ${scopeMeaning(next)}.`);
    this.tui.requestRender();
  }

  /** Drop the visible transcript and the terminal's scrollback together. */
  private clearScreen(): void {
    this.surface.transcript.clear();
    this.tui.requestRender({ force: true });
  }

  private shutdown(): void {
    this.stop();
    handleShellClose({
      sessionRuntime: this.options.sessionRuntime,
      renderer: this.options.renderer,
      runtimeContext: this.options.runtimeContext,
      sessionManager: this.options.sessionManager,
      exit: this.options.exit,
    });
  }
}
