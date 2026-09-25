import { messageToText } from "../../model-adapters/multimodal.js";
import type { Interface as ReadlineInterface } from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { EscalationPrompt } from "../../sandbox/index.js";
import { handleShellClose } from "../../core/shell/signalHandlers.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { newlineKeyFor } from "../../presentation/tui/chrome/hints.js";
import { loadPromptHistory, appendPromptHistory } from "./historyStore.js";
import type { StatusItemId } from "../../presentation/tui/chrome/items.js";
import { renderWelcome } from "../../presentation/tui/chrome/welcome.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { nextScope } from "../approval/permissionScope.js";
import { Clipboard } from "./clipboard.js";
import { Pointer } from "./pointer.js";
import { TUI } from "../../presentation/tui/render/engine.js";
import { processTerminal, type TerminalDevice } from "../../presentation/tui/terminal.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import type { RenderScheduler } from "../../presentation/tui/render/frame.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import { replaceLiteral } from "../../presentation/tui/pastes.js";
import { InteractiveSurface } from "../../presentation/tui/surface/view.js";
import { createViewState, type ViewState } from "../../presentation/tui/surface/contract.js";
import { approvalPicker, type InteractiveApprovalResult } from "./picker/approval.js";
import { routeKey } from "./keymap.js";
import { InputPreferences } from "./inputPreferences.js";
import { QuestionBridge } from "./questionBridge.js";
import { readAmbientFacts } from "./ambientFacts.js";
import { showConversation, startFreshSession, type HistoryTarget } from "./history.js";
import { Pager, pageLongOutput } from "../../presentation/tui/chrome/pager.js";
import { TranscriptSearch } from "../../presentation/tui/transcript/searchState.js";
import { routeSearchKey, styleSearchRow } from "../../presentation/tui/transcript/searchHost.js";
import { OverlayHost, type Picker } from "./overlay.js";
import { opensPicker, pickerFor, type PickerHost } from "./picker/registry.js";
import { readStatusItems, writeStatusItems } from "./tuiSettings.js";
import type { ImageContent } from "../../model-adapters/multimodal.js";
import { readStatusFacts, readWelcomeState } from "./sessionFacts.js";
import { couldBeCommand, slashSuggestions } from "./slashSuggestions.js";
import { couldBeFileReference, fileSuggestions } from "./fileSuggestions.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { TurnSink } from "./turnSink.js";

/**
 * Interactive session host.
 *
 * Owns the terminal for the lifetime of the session and mediates between three
 * parties that would otherwise collide: raw stdin, the differential renderer,
 * and runtime code that expects to write prose and ask readline questions. It
 * runs on a screen of its own, the alternate buffer, so the transcript is ours
 * to scroll and nothing the user had in the terminal is disturbed.
 */

const DEFAULT_PLACEHOLDER = "Ask anything, or / for commands";

/** How often the activity row is repainted while a turn runs, for its clock. */
const ACTIVITY_TICK_MS = 100;

/** Window in which the exit hint stays on screen after one cancel press. */
const CANCEL_ARMED_MS = 600;

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
  readonly setInteractiveApprovalPrompt?: (
    handler: ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined,
  ) => void;
  readonly setActiveNonInteractiveApprovalMode?: (mode: ApprovalModeObject | undefined) => void;
  readonly exit?: (code?: number) => never;
  /** Theme paths this run was started with, so `/theme` can still select them. */
  readonly themePaths?: readonly string[];
  /** Output device; defaults to the process terminal. */
  readonly terminal?: TerminalDevice;
  /** Frame scheduler; defaults to real timers. */
  readonly scheduler?: RenderScheduler;
}

export class InteractiveMode {
  private readonly terminal: TerminalDevice;
  private readonly tui: TUI;
  private readonly view: InteractiveSurface;
  /** The transcript, draft, pastes, and completions the surface projects. */
  private readonly state: ViewState;
  private readonly stdin = new StdinBuffer();
  private readonly sink: TurnSink;
  private readonly questions: QuestionBridge;
  private readonly readline: ReadlineInterface;
  private readonly gesture: { lastCancelAt?: number; lastEscapeAt?: number } = {};
  /**
   * The bindings in force.
   *
   * Held rather than rebuilt per keystroke: routing asks this on every key, so it
   * is derived once at startup and again when /reload says the file changed.
   */
  private readonly preferences = new InputPreferences({
    report: (message) => {
      this.state.transcript.append(textBlock("notice", message));
      this.tui.requestRender();
    },
    suspendTerminal: (run) => this.tui.suspend(run),
    workspaceRoot: () => this.options.runtimeContext.projectRoot,
    adoptDraft: (text) => this.state.editor.setDraftText(text),
    redraw: () => this.tui.requestRender(),
    attachImage: (image) => {
      // The placeholder goes in the draft and the bytes are held beside it: the
      // sentence keeps a short token, and the picture travels as a block.
      this.state.editor.insert(
        this.state.pastes.holdImage({
          type: "image",
          data: image.bytes.toString("base64"),
          mimeType: image.mimeType,
        }),
      );
      this.tui.requestRender();
    },
  });
  private readonly overlay: OverlayHost;
  private readonly pager = new Pager();
  private readonly search = new TranscriptSearch();
  private readonly pointer: Pointer;
  private readonly clipboard: Clipboard;
  private statusItems: readonly StatusItemId[];
  /**
   * The band a still-open chooser is proposing. Present only while the chooser is
   * open, so the band shows what a toggle would do without the choice being made
   * — Escape leaves the saved band exactly as it was.
   */
  private previewItems: readonly StatusItemId[] | undefined;
  private stopped = false;
  private busy = false;
  private toast?: string;
  private tick: ReturnType<typeof setInterval> | undefined;
  private turnNumber = 0;
  /** The last thing submitted that was a prompt rather than a command. */
  private lastPrompt: string | undefined;
  /**
   * Input submitted while a run that takes none is in flight — a slash
   * command, say. It runs as its own turn once the current one settles. A
   * model turn takes input directly: steering reaches it before its next step
   * and follow-ups run after it, both through the runtime's input handle.
   */
  private readonly queue: string[] = [];
  private releaseEvents: (() => void) | undefined;

  constructor(private readonly options: InteractiveModeOptions) {
    this.terminal = options.terminal ?? processTerminal;
    this.statusItems = readStatusItems(options.runtimeContext.projectRoot);
    this.clipboard = new Clipboard({
      cwd: options.runtimeContext.cwd,
      sessionId: options.runtimeContext.session.id,
      notify: (text) => {
        if (this.busy) return;
        this.toast = text;
        this.tui.requestRender();
      },
      write: (data) => this.terminal.write(data),
    });
    this.overlay = new OverlayHost(() => this.tui.requestRender());
    this.tui = new TUI(this.terminal, options.scheduler);
    this.tui.setDisconnectHandler(() => this.stop());
    this.state = createViewState();
    this.view = new InteractiveSurface(
      {
        facts: () =>
          readStatusFacts(this.options.runtimeContext, {
            agentMode: this.options.sessionRuntime.getAgentMode(),
            permissionScope: this.options.sessionRuntime.getPermissionScope(),
            queued: this.queue.length + (this.options.sessionRuntime.input?.()?.pending().followUps.length ?? 0),
            peers: readAmbientFacts(this.options.runtimeContext.session.id).peerSessions,
          }),
        statusItems: () => this.previewItems ?? this.statusItems,
        activity: () => this.sink.activity(),
        busy: () => this.busy,
        // Follow-ups wait in two places: the turn's own queue and, for input a
        // command run cannot take, the host's.
        queuedCount: () => this.queue.length + (this.options.sessionRuntime.input?.()?.pending().followUps.length ?? 0),
        steeringCount: () => this.options.sessionRuntime.input?.()?.pending().steering.length ?? 0,
        now: () => Date.now(),
        ambient: () => readAmbientFacts(this.options.runtimeContext.session.id),
        newlineKey: () => newlineKeyFor(this.terminal.keyboardProtocol ?? "legacy"),
        cancelArmed: () =>
          this.gesture.lastCancelAt !== undefined &&
          Date.now() - this.gesture.lastCancelAt < CANCEL_ARMED_MS,
        overlayFullScreen: () => this.pager.active || this.overlay.fullScreen,
        overlayRows: (width, height) =>
          this.pager.active ? this.pager.render(width, height) : this.overlay.render(width, height),
        selection: () => this.pointer.selection,
        composerSelection: () => this.pointer.composerSelection,
        toast: () => this.toast,
        searchBar: () => {
          // Built before asking: the count and the position only exist once the
          // query has been matched against the rows that are on screen.
          if (this.search.active) this.search.indexFor(this.view.contentRows());
          return this.search.bar();
        },
        // A search opened before a run started is still open when rows begin to
        // arrive, and rows being appended would drag their highlight along with
        // them. The query and the counter stay; only the styling waits.
        highlightSearchMatches: (row, contentRow) =>
          this.busy ? row : styleSearchRow(this.search, row, contentRow),
      },
      this.state,
    );
    this.pointer = new Pointer({
      view: () => this.view,
      rows: () => this.view.contentRows(),
      copy: (text) => this.clipboard.copy(text),
      redraw: () => this.tui.requestRender(),
    });
    this.sink = new TurnSink(this.state.transcript, () => {
      // New output brings the window back to the newest rows — unless the user has
      // scrolled away, which is a statement that they are reading something else.
      if (this.view.scrolledBack === 0) this.view.scrollToEnd();
      this.tui.requestRender();
    });
    this.questions = new QuestionBridge({
      ask: (question) => this.onQuestion(question),
      settle: () => this.onQuestionSettled(),
    });
    this.readline = this.questions.asReadline(() => this.stop());
    this.options.setReadline?.(this.readline);
    this.options.setInteractiveApprovalPrompt?.((prompt) => this.promptApproval(prompt));
    this.tui.setFrameProvider(this.view);
    this.state.editor.placeholder = DEFAULT_PLACEHOLDER;
    // A chip token deletes whole: the caret sits at its end, and one Backspace
    // removes the token — and with it the attachment — instead of half a symbol.
    this.state.editor.atomicTokenStart = (line, column) => {
      const before = line.slice(0, column);
      const match = /(?:⎘ #\d+|\[#\d+ [^\]]*\])$/.exec(before);
      return match ? column - match[0].length : undefined;
    };
    const diskHistory = loadPromptHistory(options.runtimeContext.projectRoot);
    this.state.editor.loadHistory(diskHistory);
    const sessionTurns = options.runtimeContext.session.turns
      ?.filter((t) => t.role === "user" && messageToText(t.content).trim())
      .map((t) => messageToText(t.content).trim()) ?? [];
    this.state.editor.loadHistory(sessionTurns);
  }

  start(): void {
    // The intro renders itself at the frame width so a resize re-elides the path
    // instead of keeping the elision it was born with.
    this.state.transcript.append({
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
      const repeat = this.state.pastes.expandOnRepeat(text);
      if (repeat) {
        // The placeholder may have been deleted since the first paste; a replace
        // would then silently drop the second paste. Re-insert in that case.
        const draft = this.state.editor.getText();
        // A string replacer would interpret $&, $1, $$ and ${...} inside the
        // pasted code as substitution patterns and silently rewrite them away.
        const replaced = replaceLiteral(draft, repeat.find, repeat.text);
        if (replaced === draft) {
          this.state.editor.insert(this.state.pastes.holdIfLong(text));
        } else {
          this.state.editor.setDraftText(replaced);
        }
      } else {
        this.state.editor.insert(this.state.pastes.holdIfLong(text));
        this.syncSuggestions(false);
      }
      this.tui.requestRender();
    });
    this.tui.onInput((data) => this.stdin.feed(data));
    this.releaseEvents = this.options.sessionRuntime.observeEvents((event) => this.sink.handleEvent(event));
    this.preferences.reload();
    // `regular` keeps the conversation in the terminal's own scrollback, so a
    // session that ends leaves something to scroll back through. `fullscreen` is
    // the private screen, and `stream` is reserved without a defined meaning.
    this.tui.start({
      useAlternateScreen: this.options.runtimeContext.runtimeConfig.tuiMode !== "regular",
    });
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
    this.releaseEvents?.();
    this.releaseEvents = undefined;
    this.clipboard.release();
    this.questions.abandon();
    this.options.renderer.clearSink();
    this.stdin.dispose();
    // The conversation outlives the screen it was read on: rendered once more at
    // the full width, it is left in the terminal where the user can scroll back
    // to it and copy from it after the session is over.
    const width = Math.max(1, this.terminal.getDimensions().columns);
    this.tui.stop({ document: this.state.transcript.render(width).rows });
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
    // An open search owns the keyboard the way a picker does: the arrows move
    // between matches and every printable character belongs to the query, so it has
    // to be intercepted before the keymap turns them into editor input.
    const searchKey = routeSearchKey(this.search, event, {
      contentRows: () => this.view.contentRows(),
      scrollToContentRow: (row) => this.view.scrollToContentRow?.(row) ?? false,
    });
    if (searchKey.handled) {
      if (searchKey.redraw) this.tui.requestRender();
      return;
    }
    if ((this.pointer.selection || this.pointer.composerSelection) && event.keyId !== "ctrl+c") {
      this.pointer.clearSelection();
      this.tui.requestRender();
    }
    if (this.toast && (event.text || event.keyId === "backspace" || event.keyId === "delete" || event.keyId === "enter")) {
      this.toast = undefined;
      this.tui.requestRender();
    }
    routeKey(event, {
      view: this.view,
      busy: this.busy,
      now: () => Date.now(),
      gesture: this.gesture,
      keybindings: this.preferences.keybindings,
      actions: {
        submit: (text, disposition, attachments) => this.onSubmit(text, disposition, attachments),
        interrupt: () => void this.interrupt(),
        exit: () => this.shutdown(),
        redraw: () => this.tui.requestRender(),
        clearScreen: () => this.clearScreen(),
        cycleAgentMode: () => this.cycleAgentMode(),
        cyclePermissionScope: () => this.cyclePermissionScope(),
        scroll: (rows) => {
          this.view.scroll(rows);
          this.tui.requestRender();
        },
        scrollPage: (direction) => {
          this.view.scrollPage(direction);
          this.tui.requestRender();
        },
        openSearch: () => {
          // Not while a run is producing rows: the search matches the rows on
          // screen, and rows that are still being written would move under it and
          // carry their highlights with them.
          if (this.busy) return;
          this.search.begin();
          this.pointer.clearSelection();
          this.tui.requestRender();
        },
        scrollToEnd: () => {
          this.view.scrollToEnd();
          this.tui.requestRender();
        },
        retry: () => this.onSubmit("/retry"),
        openRewind: () => this.openPicker("back"),
        redrawAfter: (delayMs) => {
          setTimeout(() => this.tui.requestRender(), delayMs).unref?.();
        },
        syncSuggestions: (mayOpen) => this.syncSuggestions(mayOpen),
        copySelection: () => this.pointer.copySelection(),
        toggleCollapsed: (only) => this.view.toggleCollapsed(only),
        openExternalEditor: () => this.preferences.openExternalEditor(this.state.editor.getText()),
        attachClipboardImage: () => void this.preferences.attachClipboardImage(),
      },
    });
  }

  /** Publish a runtime question as a transcript block and retarget the prompt. */
  private onQuestion(question: string): void {
    this.state.transcript.append(textBlock("notice", question));
    this.state.editor.placeholder = "Answer above, then press Enter";
    this.tui.requestRender();
  }

  private onQuestionSettled(): void {
    this.state.editor.placeholder = DEFAULT_PLACEHOLDER;
    this.tui.requestRender();
  }

  private promptApproval(prompt: EscalationPrompt): Promise<InteractiveApprovalResult> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: InteractiveApprovalResult) => {
        if (settled) return;
        settled = true;
        this.overlay.close();
        resolve(result);
      };
      this.overlay.open(approvalPicker(prompt, settle));
    });
  }
  /**
   *
   * A closed list reopens on typing, on Tab, and on any edit that leaves a draft
   * which could still become a command — that last case is what brings the list
   * back after a typo is deleted, since a backspace carries no text of its own.
   * History recall is excluded, so the arrows keep working on a recalled prompt.
   */
  private syncSuggestions(mayOpen: boolean): void {
    const draft = this.state.editor.getText();
    // Files first: an `@` reference is unambiguous, while a leading slash could
    // still become either a command or a path.
    const matches =
      fileSuggestions(draft, this.options.runtimeContext.projectRoot) ??
      slashSuggestions(draft);
    if (!matches) {
      this.view.setSuggesting(false);
      return;
    }
    const couldStillBecomeSomething = couldBeCommand(draft) || couldBeFileReference(draft);
    if (!mayOpen && !this.view.suggestionsOpen && !couldStillBecomeSomething) return;
    this.state.suggestions.setItems(matches);
    this.view.setSuggesting(true);
  }



  private onSubmit(
    text: string,
    disposition?: "steer" | "followUp",
    attachments?: { readonly images: readonly ImageContent[] },
  ): void {
    this.toast = undefined;
    appendPromptHistory(this.options.runtimeContext.projectRoot, text);
    if (this.questions.answer(text)) {
      this.tui.requestRender();
      return;
    }
    if (!this.busy && opensPicker(text)) {
      this.openPicker(text);
      return;
    }
    this.state.transcript.append(textBlock("user", text));
    // Sending is a statement that the user is done reading back: the window
    // returns to the newest rows so the echo and the answer are in view.
    this.view.scrollToEnd();
    if (this.busy) {
      // A command is never steered: it is not a message for the model, so it
      // waits for the run boundary, like any input to a run that takes none.
      const input = text.startsWith("/") ? undefined : this.options.sessionRuntime.input?.();
      if (!input) this.queue.push(text);
      else if (disposition === "steer") input.steer(text);
      else input.followUp(text);
      this.tui.requestRender();
      return;
    }
    void this.run(text, attachments);
  }


  /** Execute one submission, then drain anything typed while it ran. */
  private async run(
    text: string,
    attachments?: { readonly images: readonly ImageContent[] },
  ): Promise<void> {
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
        refreshKeybindings: () => this.preferences.reload(),
      });
      this.turnNumber = result.turnNumber;
      if (result.exitRequested) exiting = true;
      if (result.retryRequested) retrying = this.sink.retryTarget(this.lastPrompt, previousTurnFailed);
      if (result.clearRequested) clearing = true;
      if (result.sessionOpened) opened = true;
    } catch (error) {
      this.state.transcript.append(
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
      transcript: this.state.transcript,
      editor: this.state.editor,
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
          this.state.transcript.append(textBlock("command", outcome.note, picker.title));
        }
        if (outcome?.draft) {
          // The next step needs a secret, so the picker hands over the exact
          // command with the caret after it rather than collecting it here.
          this.state.editor.setText(outcome.draft);
        }
      })
      .catch((error: unknown) => {
        this.state.transcript.append(
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
        ...(this.options.runtimeContext.skillOptions
          ? { skillOptions: this.options.runtimeContext.skillOptions }
          : {}),
        ...(this.options.themePaths ? { themePaths: this.options.themePaths } : {}),
        modifierKeysReported: (this.terminal.keyboardProtocol ?? "legacy") !== "legacy",
      },
      transcript: this.state.transcript,
      sessionManager: this.options.sessionManager,
      mcpGateway: this.options.initialMcpGateway,
      approvalTrustPolicy: this.options.approvalTrustPolicy,
      projectRoot: this.options.runtimeContext.projectRoot,
      statusItems: this.statusItems,
      resumeSession: (sessionId) => this.runCommandLine(`/resume ${sessionId}`),
      deleteSession: async (sessionId) => {
        this.options.sessionManager.deleteSession(sessionId);
        return undefined;
      },
      renameSession: async (sessionId, title) => {
        this.options.sessionManager.renameSession(sessionId, title);
        return undefined;
      },
      refreshServer: (serverName) => this.runCommandLine(`/mcp refresh ${serverName}`),
      revokeGrant: (key) => this.runCommandLine(`/permissions revoke ${key}`),
      sessionTurns: () =>
        this.options.sessionManager.getSession(this.options.runtimeContext.session.id)?.turns ?? [],
      rewind: async (point) => {
        const dropped = await this.options.sessionManager.revertTo(
          this.options.runtimeContext.session.id,
          point.entryId,
          (abandoned) => this.options.sessionRuntime.summarizeAbandonedTurns(abandoned),
        );
        showConversation(this.historyTarget());
        this.tui.requestRender({ force: true });
        // Says how far back, and that the rest is still there. "Went back"
        // alone left the user asking what the conversation now consisted of.
        return dropped > 0
          ? `Went back: this question is at the end of the conversation again, and the ${dropped === 1 ? "turn" : `${dropped} turns`} that followed ${dropped === 1 ? "is" : "are"} kept, not erased. Reopen it from /back.`
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
    this.state.transcript.append(textBlock("user", line));
    this.view.scrollToEnd();
    await this.run(line);
    return undefined;
  }

  /**
   * Stop the run. Input it had not yet taken comes back to the prompt rather
   * than running against a turn the user just cancelled.
   */
  private async interrupt(): Promise<void> {
    if (!this.busy) return;
    this.sink.markCancelling();
    const undelivered = [...(this.options.sessionRuntime.input?.()?.clearQueue() ?? []), ...this.queue.splice(0)];
    await this.options.sessionRuntime.cancelAndWait();
    if (undelivered.length === 0) return;
    const draft = this.state.editor.getText();
    this.state.editor.setText([...undelivered, draft].filter((part) => part.trim()).join("\n\n"));
    this.tui.requestRender();
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
   * Widen or narrow what a turn may do without asking. Separate from the agent
   * mode on purpose. The band is the only place it is shown: a transcript line
   * per press turned a quick toggle into clutter.
   */
  private cyclePermissionScope(): void {
    const next = nextScope(this.options.sessionRuntime.getPermissionScope());
    this.options.sessionRuntime.setPermissionScope(next);
    this.tui.requestRender();
  }

  /** Drop the visible transcript and the terminal's scrollback together. */
  private clearScreen(): void {
    this.state.transcript.clear();
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
