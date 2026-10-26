import { sessionPickerHost } from './picker/session/host.js';
import { quoteCompletion } from './completion.js';
import { sessionManagementPicker } from './picker/session/management.js';
import type { ShellActionResult } from '../../core/commands/types.js';
import { CatalogController } from "./completion/controller.js";
import type { StartupSurface } from './startup.js';
import { catalogIdentity, createCatalogLoader } from "./completion/catalog.js";
import { refreshShellRuntimeConfig } from "../../core/shell/runtimeContext.js";
import { configurationAdmission } from '../../core/shell/configuration.js';
import { renderTaskNotice } from '../../workflow/jobs/local/projection.js';
import { jobsFor, watchJobsFor } from '../runtime/jobs.js';
import { createBackgroundFollowUp } from './backgroundNotice.js';
import { jobsControl, runJobsControl } from '../jobs/control.js';
import type { Interface as ReadlineInterface } from "node:readline";
import path from "node:path";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { detectImageProtocol, windowTitle, idleNotification, bell } from "../../presentation/tui/image.js";
import type { EscalationPrompt } from "../../core/shell/approval/contract.js";
import { handleShellClose } from "../../core/shell/signalHandlers.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { loadPromptHistory, appendPromptHistory } from "./historyStore.js";
import type { StatusItemId } from "../../presentation/tui/chrome/items.js";
import type { SourceSelection } from "../../presentation/tui/composer/contract.js";
import { renderWelcome } from "../../presentation/tui/chrome/welcome.js";
import { MAX_PASTE_BYTES, StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { nextScope } from "../approval/permissionScope.js";
import { Clipboard } from "./clipboard.js";
import { Pointer } from "./pointer.js";
import { TUI } from "../../presentation/tui/render/engine.js";
import { processTerminal, type TerminalDevice } from "../../presentation/tui/terminal.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import { transcriptLineRenderer } from "../../presentation/tui/transcript/output.js";
import { runConnectCommand } from '../../core/commands/connectCommandRuntime.js';
import { renderSignInProgress } from '../output/command.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { reportText } from '../../core/commands/report/projection.js';
import { toolPoolFor } from '../runtime/tools.js';
import type { RenderScheduler } from "../../presentation/tui/render/frame.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import { replaceLiteral } from "../../presentation/tui/pastes.js";
import { goalCommandFor, isGoalControl } from '../runtime/goal.js';
import { attachGoalSubmission, schedulerForRuntime } from '../runtime/goalScheduling.js';
import { attachSubmissionQueue, isQueueControl, queueCommandFor } from '../runtime/inputQueue.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { isPlanningControl, planningCommandFor } from '../runtime/planning.js';
import { usageCommandFor } from '../runtime/usage.js';
import { settingsCommandFor } from '../runtime/settings.js';
import { handoffControl, handoffCommandFor } from '../runtime/handoff.js';
import { directorControl, directorCommandFor, directorInterruptible } from '../runtime/director.js';
import { evaluationCommandFor, evaluationInterruptible, cancelEvaluationFor, evaluationControl } from '../runtime/evaluation.js';
import { mediaCommandFor, mediaControl, cancelMediaCommand, mediaInterruptible, excludeRecordingInput, recordingFrameProvider } from '../runtime/media.js';
import { isSecurityControl, securityCommandFor, securityInspectorFor } from '../runtime/security.js';
import { isAgentsControl, agentsCommandFor, agentDefinitionsFor, agentDiscoveryFor } from '../runtime/agents.js';
import { isCollaborationControl, runCollaborationControl } from '../collaboration/control.js';
import { sshControl, runSshControl } from '../ssh/control.js';
import { isExtensionControl, extensionCommandFor, extensionManagerFor } from '../runtime/extensions.js';
import { isMcpRequest, isMcpConfiguration, mcpControl } from '../mcp/content.js';
import { runMcpConfigurationControl } from '../mcp/control.js';
import { cancelMcpFor, mcpDefinitionFor } from '../runtime/mcp.js';
import { runCliMcpCommand } from '../../entrypoints/cliMcpModule.js';
import { isAdvisorControl, advisorCommandFor } from '../runtime/advisor.js';
import { decodeAdvisor } from '../../advisor/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { isResearchControl, researchCommandFor } from '../runtime/research.js';
import { gitWorkbenchFor } from '../runtime/git.js';
import { SubmissionQueue } from './inputQueue.js';
import { openSettings } from "./settings.js";
import { InteractiveSurface } from "../../presentation/tui/surface/view.js";
import { createViewState, type ViewState } from "../../presentation/tui/surface/contract.js";
import { promptApproval, type InteractiveApprovalResult } from "./picker/approval.js";
import { resetVimState, routeKey } from "./keymap.js";
import { InputPreferences } from "./inputPreferences.js";
import { QuestionBridge } from "./questionBridge.js";
import { readAmbientFacts } from "./ambientFacts.js";
import { appendConversation, showConversation, startFreshSession, type HistoryTarget } from "./history.js";
import { startupObservers, time } from '../../observability/startupTiming.js';
import { Pager, pageLongOutput } from "../../presentation/tui/chrome/pager.js";
import { TranscriptSearch } from "../../presentation/tui/transcript/searchState.js";
import { routeSearchKey, styleSearchRow } from "../../presentation/tui/transcript/searchHost.js";
import { OverlayHost, type Picker } from "./overlay.js";
import { pickerIsCurrent } from './picker/current.js';
import { opensPicker, pickerFor, type PickerHost } from "./picker/registry.js";
import { PickerLifecycles } from './picker/lifecycle.js';
import { catalogScope } from './catalogScope.js';
import { ComposerPreference, readStatusItems, writeStatusItems } from "./tuiSettings.js";
import type { ImageContent } from "../../model-adapters/multimodal.js";
import { readStatusFacts, readWelcomeState } from "./sessionFacts.js";
import { couldBeCommand, slashArgumentHint, slashSuggestions } from "./slashSuggestions.js";
import { couldBeFileReference } from "./fileSuggestions.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { needsComposition } from '../../core/commands/composition.js';
import { createCommandRegistry } from '../../core/commands/registry.js';
import { catalogContributions } from '../../core/catalog/contributions.js';
import { TurnSink } from "./turnSink.js";
import { reportWriter, reportSaveNotice } from '../output/reports.js';
import { undoPickerHost } from '../runtime/undo.js';
import { updateAppearance } from "../../presentation/theme/selection.js";
import { followTheme, type ThemeFollower } from "../../presentation/themes/watch.js";
import { themePreferences } from "../../presentation/theme/preview.js";
import { createContextController } from './context/controller.js';
import { previewContext } from '../runtime/context/preview.js';
import { navigateSession, readBackSource, type SessionNavigationResult } from "../runtime/navigation.js";
import { contextSelectionIdentity } from '../../session/context/selection.js';

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

/** Turns shorter than this finish before anyone could have looked away. */
const ATTENTION_AFTER_MS = 30_000;

export interface InteractiveModeOptions {
  readonly startup?: StartupSurface;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  /** Runs once after the first frame write has reached the output stream. */
  readonly onFirstFrame?: () => void;
  /** Lets startup suggestions yield to a user selection or submission. */
  readonly onUserIntent?: () => void;
  /** Installs a transcript writer for notices that arrive outside a turn. */
  readonly setStartupNotice?: (
    notice: ((line: string) => void) | undefined,
  ) => void;
  readonly initialMcpGateway: CliMcpGateway;
  readonly setReadline?: (readline: ReadlineInterface | null) => void;
  readonly setInteractiveApprovalPrompt?: (
    handler: ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined,
  ) => void;
  readonly setActiveNonInteractiveApprovalMode?: (mode: ApprovalModeObject | undefined) => void;
  readonly exit?: (code?: number) => void;
  /** Theme paths this run was started with, so `/theme` can still select them. */
  readonly themePaths?: readonly string[];
  /** Output device; defaults to the process terminal. */
  readonly terminal?: TerminalDevice;
  /** Frame scheduler; defaults to real timers. */
  readonly scheduler?: RenderScheduler;
}

export class InteractiveMode {
  private readonly promptContext: ReturnType<typeof createContextController>;
  private readonly terminal: TerminalDevice;
  private readonly tui: TUI;
  private readonly view: InteractiveSurface;
  /** The transcript, draft, pastes, and completions the surface projects. */
  private readonly state: ViewState;
  private readonly stdin: StdinBuffer;
  private readonly sink: TurnSink;
  private readonly questions: QuestionBridge;
  private readonly readline: ReadlineInterface;
  private readonly gesture: { lastCancelAt?: number; lastEscapeAt?: number } = {};
  private vimSelection: SourceSelection | undefined;
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
    adoptDraft: (text) => {
      this.replaceExternalDraft(text);
    },
    redraw: () => this.tui.requestRender(),
    attachImage: (image) => {
      // The placeholder goes in the draft and the bytes are held beside it: the
      // sentence keeps a short token, and the picture travels as a block.
      resetVimState(this.state.editor);
      this.vimSelection = undefined;
      try {
        this.state.editor.insert(
          this.state.pastes.holdImage({
            type: "image",
            data: image.bytes.toString("base64"),
            mimeType: image.mimeType,
          }),
        );
      } catch {
        this.state.transcript.append(textBlock("notice", "Attached image is too large to accept."));
      }
      this.tui.requestRender();
    },
  });
  private readonly overlay: OverlayHost;
  private readonly pager = new Pager();
  private readonly search = new TranscriptSearch();
  private readonly pointer: Pointer;
  private readonly clipboard: Clipboard;
  private readonly composerPreference: ComposerPreference;
  private statusItems: readonly StatusItemId[];
  /**
   * The band a still-open chooser is proposing. Present only while the chooser is
   * open, so the band shows what a toggle would do without the choice being made
   * — Escape leaves the saved band exactly as it was.
   */
  private previewItems: readonly StatusItemId[] | undefined;
  private previewItemsRevision: number | undefined;
  private stopped = false;
  private closing = false;
  private selectionRevision = 0;
  private readonly alternateScreen: boolean;
  private busy = false;
  private pickerPending = false;
  private readonly pickerInputPending = new Map<number, number>();
  private readonly pickerLifecycles = new PickerLifecycles();
  private toast?: string;
  private completionStatus?: string;
  private readonly catalogs: CatalogController;
  /** What the terminal said it can draw, read once from its environment. */
  private readonly imageProtocol = detectImageProtocol();
  private tick: ReturnType<typeof setInterval> | undefined;
  private turnNumber = 0;
  /** The last thing submitted that was a prompt rather than a command. */
  private lastPrompt: string | undefined;
  private lastAttachments?: { readonly images: readonly ImageContent[] };
  /**
   * Input submitted while a run that takes none is in flight — a slash
   * command, say. It runs as its own turn once the current one settles. A
   * model turn takes input directly: steering reaches it before its next step
   * and follow-ups run after it, both through the runtime's input handle.
   */
  private readonly queue = new SubmissionQueue(() => this.options.runtimeContext.session, (text, attachments) => {
    const images = attachments?.images.map(image => this.state.pastes.holdImage(image)).join(' ') ?? '';
    this.replaceExternalDraft([text, images, this.state.editor.getText()].filter(Boolean).join('\n\n'));
    this.state.transcript.append(textBlock('error', 'Queued input was not executed because the session changed; it was returned to the draft.'));
  });
  /** Stops the background-completion notice from reaching a disposed session. */
  private readonly stopWatchingBackground: () => void;
  private releaseEvents: (() => void) | undefined;
  private releaseGoalSubmission?: () => void;
  private releaseInputQueue?: () => void;
  /**
   * The theme file being followed, when the theme in use came from one.
   *
   * Held for the life of the session: a reload after `/theme` changes which file
   * matters, and a watcher left on the previous one would keep repainting for a
   * theme nobody is looking at.
   */
  private readonly theme: ThemeFollower;


  constructor(private readonly options: InteractiveModeOptions) {
    this.alternateScreen = options.runtimeContext.runtimeConfig.tuiMode !== "regular";
    this.terminal = options.startup?.terminal ?? options.terminal ?? processTerminal;
    this.composerPreference = new ComposerPreference(
      () => this.options.runtimeContext.runtimeConfig,
      () => {
        this.view.invalidateLayout();
        this.tui.requestRender();
      },
      () => this.options.runtimeContext.configuration.current.revision,
    );
    this.statusItems = readStatusItems(options.runtimeContext.projectRoot, options.runtimeContext.runtimeConfig);
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
    this.overlay = new OverlayHost(() => this.tui.requestRender(), this.preferences.keybindings);
    this.tui = options.startup?.tui ?? new TUI(this.terminal, options.scheduler);
    this.theme = followTheme({
      workspaceRoot: options.runtimeContext.projectRoot,
      ...(options.themePaths ? { extraPaths: options.themePaths } : {}),
      // A reload replaces the palette on a surface that is already rendered, and
      // nothing redraws on its own. Without this the file changes and the screen
      // does not.
      onReload: () => this.tui.requestRender({ force: true }),
    });
    this.stdin = options.startup?.input ?? new StdinBuffer({
      ...(options.scheduler ? {
        setTimer: (callback: () => void, delayMs: number) => options.scheduler?.setTimeout(callback, delayMs),
        clearTimer: (handle: unknown) => options.scheduler?.clearTimeout(handle),
      } : {}),
    });
    this.stdin.onAppearance(appearance => {
      if (!updateAppearance(appearance)) return;
      this.theme.refresh();
      this.tui.requestRender({ force: true });
    });
    this.tui.setDisconnectHandler(() => { void this.shutdown(); });
    // Build the transcript before subscribing to the live job owner. A native
    // runner may settle during construction; completion notices must have a
    // valid storage target even in that narrow window.
    this.state = options.startup?.state ?? createViewState();
    excludeRecordingInput(options.runtimeContext, () => this.stopped || Boolean(this.state.editor.getText() || this.questions.question() || this.overlay.active || this.pager.active || this.search.active));
    // Completion is a scoped local notice. Output does not become new user intent
    // or silently dispatch a model request; taskOutput exposes the retained facts.
    const backgroundFollowUp = createBackgroundFollowUp({
      enabled: () => options.runtimeContext.runtimeConfig.backgroundFollowUp === true,
    });
    this.stopWatchingBackground = watchJobsFor(options.runtimeContext, (task) => {
      this.state.transcript.append(textBlock('notice', renderTaskNotice(task)));
      this.tui.requestRender();
      const text = backgroundFollowUp(task);
      if (text) this.options.sessionRuntime.input?.()?.followUp(text, `background:${task.id}`);
    });
    this.promptContext = createContextController({
      identity: () => this.busy || this.stopped || this.pickerPending ? undefined : JSON.stringify([
        this.options.runtimeContext.session.id, this.options.runtimeContext.session.createdAt, this.options.runtimeContext.cwd,
        this.options.runtimeContext.configuration.current.revision, this.state.editor.textRevision,
        this.options.runtimeContext.workspaceRevision, this.options.sessionRuntime.getAgentMode(), this.options.sessionRuntime.getPermissionScope(),
        this.options.runtimeContext.peekForcedTool?.(), this.options.runtimeContext.promptIdentity,
        contextSelectionIdentity(this.options.runtimeContext.session),
        this.options.runtimeContext.contextAttachments?.map(entry => [entry.path, entry.digest]),
        this.options.runtimeContext.transientContextAttachments?.map(entry => [entry.path, entry.digest]),
      ]),
      load: signal => {
        const draft = this.state.editor.getText();
        const images = this.state.pastes.imagesIn(draft);
        return previewContext(this.options.runtimeContext, this.options.sessionManager, this.options.initialMcpGateway,
          this.state.pastes.expand(draft), images.length ? { images } : undefined,
          this.options.sessionRuntime.getAgentMode(), this.options.sessionRuntime.getPermissionScope(), signal);
      },
      repaint: () => { if (!this.stopped) this.tui.requestRender(); },
    });
    this.view = new InteractiveSurface(
      {
        facts: () =>
          readStatusFacts(this.options.runtimeContext, {
            agentMode: this.options.sessionRuntime.getAgentMode(),
            permissionScope: this.options.sessionRuntime.getPermissionScope(),
            queued: this.queue.length + (this.options.sessionRuntime.input?.()?.pending().followUps.length ?? 0),
            peers: readAmbientFacts(this.options.runtimeContext.session.id).peerSessions,
            ...(!this.busy ? { promptContext: this.promptContext.read() } : {}),
          }),
        statusItems: () => {
          const revision = this.options.runtimeContext.configuration.current.revision;
          if (this.previewItemsRevision !== undefined && this.previewItemsRevision !== revision) {
            this.previewItems = undefined;
            this.previewItemsRevision = undefined;
          }
          return this.previewItems ?? readStatusItems(this.options.runtimeContext.projectRoot, this.options.runtimeContext.runtimeConfig);
        },
        composerShape: this.composerPreference.read,
        activity: () => this.sink.activity(),
        busy: () => this.busy,
        // Follow-ups wait in two places: the turn's own queue and, for input a
        // command run cannot take, the host's.
        queuedCount: () => this.queue.length + (this.options.sessionRuntime.input?.()?.pending().followUps.length ?? 0),
        steeringCount: () => this.options.sessionRuntime.input?.()?.pending().steering.length ?? 0,
        now: () => Date.now(),
        ambient: () => readAmbientFacts(this.options.runtimeContext.session.id, jobsFor(this.options.runtimeContext)?.registry),
        cancelArmed: () =>
          this.gesture.lastCancelAt !== undefined &&
          Date.now() - this.gesture.lastCancelAt < CANCEL_ARMED_MS,
        overlayFullScreen: () => this.pager.fullScreen || this.overlay.fullScreen,
        overlayPointerMotion: () => this.overlay.active && !this.pager.active,
        overlayRows: (width, height, availableRows) =>
          this.pager.active ? this.pager.render(width, height, availableRows) : this.overlay.render(width, height, availableRows),
        selection: () => this.pointer.selection,
        composerSelection: () => this.pointer.composerSelection ?? this.vimSelection,
        hintStatus: () => ({ toast: this.toast, completion: this.completionStatus }),
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
        // Read once: the terminal does not change while the session lives, and
        // the renderer asks on every frame — a function per frame would re-run
        // the environment probe that never has a different answer.
        imageProtocol: () => this.imageProtocol,
      },
      this.state,
    );
    this.catalogs = new CatalogController({
      scope: () => catalogScope(this.options.runtimeContext),
      identity: () => catalogIdentity(this.options.runtimeContext, this.options.themePaths) + this.options.sessionRuntime.getPermissionScope() + this.options.sessionRuntime.getAgentMode(),
      draft: () => this.state.editor.snapshot(),
      load: createCatalogLoader(() => this.options.runtimeContext, this.options.initialMcpGateway, this.options.themePaths ?? [], this.options.sessionManager, this.options.approvalTrustPolicy),
      publish: (items, status) => {
        if (this.stopped) return;
        this.completionStatus = status;
        this.state.suggestions.setItems(items);
        this.view.setSuggesting(items.length > 0);
        this.tui.requestRender();
      },
    });
    this.pointer = new Pointer({
      capture: (report) => {
        const region = this.view.choiceRegions?.overlay;
        const top = region && report.row >= (region.visibleTop ?? region.top) &&
          (region.height === undefined || report.row < region.top + region.height) ? region.top : undefined;
        if (this.pager.handlePointer(report)) { this.tui.requestRender(); return true; }
        return this.overlay.handlePointer(report, top);
      },
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
    this.readline = this.questions.asReadline(() => { void this.shutdown(); });
    this.options.setReadline?.(this.readline);
    this.options.setInteractiveApprovalPrompt?.((prompt) => promptApproval(prompt,
      { pager: this.pager, overlay: this.overlay, render: () => this.tui.requestRender() }));
    this.tui.setFrameProvider(recordingFrameProvider(options.runtimeContext, this.view));
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
    const session = this.options.runtimeContext.session;
    if (session.turns?.length || session.reports?.length) appendConversation(this.state, session);
    for (const diagnostic of this.options.runtimeContext.runtimeConfig.configDiagnostics) {
      this.state.transcript.append(textBlock("notice", `Warning: ${diagnostic}`));
    }
    // A tab among many needs to say which conversation it holds. The title is
    // session and project — the two things that identify a conversation — and
    // it is written once, here: the terminal owns it after that.
    this.terminal.write(
      windowTitle(
        `cheers — ${path.basename(this.options.runtimeContext.projectRoot)} — ${this.options.runtimeContext.session.id}`,
      ),
    );
    this.stdin.onKey((event) => this.onKey(event));
    this.stdin.onMouse((report) => {
      if (report.kind !== 'move') {
        this.options.onUserIntent?.();
        this.vimSelection = undefined;
      }
      if (this.alternateScreen || this.pager.active || this.overlay.fullScreen) this.pointer.handle(report);
    });
    this.stdin.onPaste((text, issue) => {
      this.options.onUserIntent?.();
      if (issue) {
        resetVimState(this.state.editor);
        this.vimSelection = undefined;
        this.state.transcript.append(textBlock("notice",
          `Paste was too large to accept (${MAX_PASTE_BYTES / (1024 * 1024)} MiB limit).`));
        this.tui.requestRender();
        return;
      }
      if (this.pager.handlePaste(text)) { this.tui.requestRender(); return; }
      if (this.overlay.handlePaste(text) || this.pickerInputPending.has(this.overlay.revision)) return;
      resetVimState(this.state.editor);
      this.vimSelection = undefined;
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
          this.replaceExternalDraft(replaced);
        }
      } else {
        this.state.editor.insert(this.state.pastes.holdIfLong(text));
        this.syncSuggestions(false);
      }
      this.tui.requestRender();
    });
    this.tui.onInput((data) => this.stdin.feed(data));
    this.releaseEvents = this.options.sessionRuntime.observeEvents((event) => this.sink.handleEvent(event));
    this.releaseInputQueue = attachSubmissionQueue(this.options.sessionRuntime, this.queue, text => this.run(text, this.queue.takeAttachments()),
      () => !(this.busy || this.pickerPending || this.overlay.active || this.stopped || this.questions.question()));
    this.releaseGoalSubmission = attachGoalSubmission(this.options.sessionRuntime, {
      ready: () => !this.stopped && !this.closing && !this.busy && !this.pickerPending && !this.overlay.active
        && !this.questions.question() && this.queue.length === 0 && !this.state.editor.getText().trim()
        && !this.state.pastes.hasImages(this.state.editor.getText()),
      submit: (prompt, metadata) => this.run(prompt, undefined, metadata),
      settled: () => {
        this.busy = this.pickerPending;
        const next = this.pickerPending || this.overlay.active || this.stopped ? undefined : this.queue.shift();
        if (next !== undefined) void this.run(next, this.queue.takeAttachments());
        this.tui.requestRender();
      },
    });
    this.preferences.reload();
    this.options.setStartupNotice?.((line) => {
      if (this.stopped) return;
      this.state.transcript.append(textBlock("notice", line));
      this.view.scrollToEnd();
      this.tui.requestRender({ force: true });
    });
    // `regular` keeps the conversation in the terminal's own scrollback, so a
    // session that ends leaves something to scroll back through. `fullscreen` is
    // the private screen.
    const observers = startupObservers();
    const onFirstWrite = observers.onFirstWrite;
    if (this.options.startup) {
      this.options.startup.adopt(this.alternateScreen, () => {
        time('runtime frame write completed');
        this.options.onFirstFrame?.();
      });
      time('runtime input adopted');
      this.tui.renderNow();
    } else this.tui.start({
      useAlternateScreen: this.alternateScreen,
      ...observers,
      onInputReady: () => {
        observers.onInputReady?.();
        time('runtime input adopted');
      },
      onFirstWrite: () => {
        onFirstWrite?.();
        time('runtime frame write completed');
        this.options.onFirstFrame?.();
      },
    });
    // After the first frame, not before it: the first paint decides what the
    // surface looks like, and a reload landing in the middle of it would be
    // recolouring something not yet on screen.
    this.theme.refresh();
    this.promptContext.start();
  }


  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.promptContext.stop();
    this.pickerLifecycles.abortAll();
    this.options.setStartupNotice?.(undefined);
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
    this.pager.close();
    this.overlay.close();
    this.theme.stop();
    this.catalogs.invalidate();
    this.releaseEvents?.();
    this.releaseEvents = undefined;
    this.releaseGoalSubmission?.();
    this.releaseGoalSubmission = undefined;
    this.releaseInputQueue?.(); this.releaseInputQueue = undefined;
    // The registry outlives this surface, so the subscription has to be given
    // back or a later command would be announced to a session already gone.
    this.stopWatchingBackground();
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
    this.options.onUserIntent?.();
    if (this.pickerInputPending.has(this.overlay.revision) && !this.overlay.active) {
      const action = this.preferences.keybindings.actionFor(event.keyId);
      if (!this.options.sessionRuntime.commands?.current || (action !== 'app.interrupt' && action !== 'app.clear')) return;
    }
    this.catalogs.cancel();
    this.completionStatus = undefined;
    // An open picker owns the keyboard: it needs the arrows, Enter, Escape, and
    // every printable character for its filter.
    // The pager owns every key while it is up, including Escape.
    if (this.pager.handleKey(event.keyId, event.text, this.terminal.getDimensions().rows)) {
      this.tui.requestRender();
      return;
    }
    if (this.overlay.handleKey(event, (picker, ids) => this.applyPicker(picker, ids))) {
      if (!this.overlay.active && !this.busy) {
        const next = this.queue.shift();
        if (next !== undefined) void this.run(next, this.queue.takeAttachments());
      }
      return;
    }
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
      interruptible: Boolean(this.options.sessionRuntime.commands?.current)
        || Boolean(schedulerForRuntime(this.options.sessionRuntime)?.ownerToken()) || directorInterruptible(this.options.runtimeContext),
      now: () => Date.now(),
      gesture: this.gesture,
      keybindings: this.preferences.keybindings,
      vimMode: this.options.runtimeContext.runtimeConfig.vimMode === true && !this.questions.question(),
      slashScope: catalogScope(this.options.runtimeContext),
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
          if (!this.alternateScreen) {
            this.toast = "Transcript search requires fullscreen mode; use terminal search here.";
            this.tui.requestRender();
            return;
          }
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
        copySelection: selection => selection ? this.copySourceSelection(selection) : this.pointer.copySelection(),
        reportNotice: (message) => {
          this.state.transcript.append(textBlock("notice", message));
        },
        setSourceSelection: selection => { this.vimSelection = selection; },
        toggleCollapsed: (only) => this.view.toggleCollapsed(only),
        openExternalEditor: () => this.preferences.openExternalEditor(this.state.editor.getText()),
        attachClipboardImage: () => void this.preferences.attachClipboardImage(),
      },
    });
  }

  /** Publish a runtime question as a transcript block and retarget the prompt. */
  private onQuestion(question: string): void {
    this.pager.close();
    this.overlay.close();
    this.state.transcript.append(textBlock("notice", question));
    this.state.editor.placeholder = "Answer above, then press Enter";
    this.tui.requestRender();
  }

  private onQuestionSettled(): void {
    this.state.editor.placeholder = DEFAULT_PLACEHOLDER;
    this.tui.requestRender();
  }

  /**
   *
   * A closed list reopens on typing, on Tab, and on any edit that leaves a draft
   * which could still become a command — that last case is what brings the list
   * back after a typo is deleted, since a backspace carries no text of its own.
   * History recall is excluded, so the arrows keep working on a recalled prompt.
   */
  private syncSuggestions(mayOpen: boolean): void {
    this.promptContext.update();
    const snapshot = this.state.editor.snapshot();
    const draft = snapshot.text;
    this.completionStatus = undefined;
    if (this.catalogs.update(snapshot)) return;
    const scope = catalogScope(this.options.runtimeContext);
    const matches = slashSuggestions(draft, snapshot, scope);
    if (!matches) {
      this.completionStatus = slashArgumentHint(snapshot, scope);
      this.view.setSuggesting(false);
      return;
    }
    const prefix = draft.slice(0, snapshot.cursor);
    const couldStillBecomeSomething = couldBeCommand(prefix) || couldBeFileReference(prefix) ||
      (matches[0]?.edit?.from ?? 0) > 0;
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
    this.completionStatus = undefined;
    this.catalogs.invalidate();
    appendPromptHistory(this.options.runtimeContext.projectRoot, text);
    const controlSource = text.startsWith('/') ? text : '';
    if (isQueueControl(controlSource)) {
      this.state.transcript.append(textBlock('user', text));
      const context = this.options.runtimeContext;
      const rawCommandArgs = text.trim().replace(/^\/queue(?:\s|$)/i, '');
      void queueCommandFor(context, this.options.sessionRuntime)(tokenizeCommandArgs(rawCommandArgs), {
        cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true, rawCommandArgs,
      }).then(result => {
        if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, '/queue'));
        this.tui.requestRender();
      });
      return;
    }
    if (isGoalControl(controlSource) && (this.busy || this.questions.question())) {
      this.state.transcript.append(textBlock('user', text));
      const context = this.options.runtimeContext;
      void goalCommandFor(context, this.options.sessionManager)(text.trim().split(/\s+/).slice(1), {
        cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
      }).then(result => {
        this.state.transcript.append(textBlock('command', result.output, text.split(/\s+/)[0]));
        this.tui.requestRender();
      }, error => {
        this.state.transcript.append(textBlock('error', error instanceof Error ? error.message : String(error)));
        this.tui.requestRender();
      });
      return;
    }
    if (handoffControl(controlSource) && (this.busy || this.questions.question())) {
      const context = this.options.runtimeContext;
      void handoffCommandFor(context, this.options.sessionManager, this.options.sessionRuntime)(tokenizeCommandArgs(text.trim().replace(/^\/handover\s*/i, '')), {
        cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
      }).then(result => {
        this.state.transcript.append(textBlock('command', result.output, '/handover')); this.tui.requestRender();
      });
      return;
    }
    const evaluation = evaluationControl(controlSource);
    const media = mediaControl(controlSource);
    if (media?.stop) this.queue.cancelWhere(value => new RegExp(`^/${media.name}(?:\\s|$)`, 'i').test(value.trim()));
    if (media && (this.busy || this.questions.question())) {
      if (media.stop) cancelMediaCommand(this.options.runtimeContext, media.name, media.args[0]?.toLowerCase() === 'stop' ? 'stopped' : 'cancelled');
      const context = this.options.runtimeContext;
      void mediaCommandFor(context)(media.name, media.args, { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true })
        .then(result => { if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, `/${media.name}`)); this.tui.requestRender(); });
      return;
    }
    if (evaluation === 'stop') { this.queue.cancelWhere(value => /^\/improve(?:\s|$)/i.test(value.trim())); cancelEvaluationFor(this.options.runtimeContext); }
    if (evaluation && (this.busy || this.questions.question())) {
      const context = this.options.runtimeContext;
      void evaluationCommandFor(context)(tokenizeCommandArgs(text.trim().replace(/^\/improve\s*/i, '')), {
        cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
      }).then(result => { this.state.transcript.append(textBlock('command', result.output, '/improve')); this.tui.requestRender(); });
      return;
    }
    if (directorControl(controlSource) && (this.busy || this.questions.question())) {
      if (this.questions.question() && !/^\/director(?:\s+(?:status|off|show|output)(?:\s|$)|\s*$)/i.test(text.trim())) {
        this.state.transcript.append(textBlock('command', 'Director assignment waits for the pending approval or question.', '/director'));
        this.tui.requestRender(); return;
      }
      const context = this.options.runtimeContext;
      void directorCommandFor(context)([], { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
        rawCommandArgs: text.trim().replace(/^\/director\s*/i, '') }).then(result => {
        this.state.transcript.append(textBlock('command', result.output, '/director')); this.tui.requestRender();
      });
      return;
    }
    if (isPlanningControl(controlSource) && (this.busy || this.questions.question())) {
      const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim())!;
      const context = this.options.runtimeContext;
      void planningCommandFor(context, this.options.sessionManager, this.options.sessionRuntime, this.readline)(
        match[1] as 'plan' | 'plan-review' | 'guided-goal', tokenizeCommandArgs(match[2] ?? ''), {
          cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true, rawCommandArgs: match[2] ?? '',
        }).then(result => {
          if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, `/${match[1]}`));
          this.tui.requestRender();
        });
      return;
    }
    const mcp = mcpControl(controlSource);
    if (jobsControl(controlSource) && (this.busy || this.questions.question())) {
      void runJobsControl(text, this.options.runtimeContext, transcriptLineRenderer(this.state.transcript, this.tui, '/jobs'),
        Boolean(this.questions.question() || this.overlay.active)); return;
    }
    const ssh = sshControl(controlSource);
    if (ssh && (this.busy || this.questions.question() || ssh.action === 'cancel-pending')) {
      if (ssh.action === 'cancel-pending') this.queue.cancelWhere(value => /^\/ssh(?:\s|$)/i.test(value.trim()));
      void runSshControl(text, this.options.runtimeContext, transcriptLineRenderer(this.state.transcript, this.tui, '/ssh'),
        Boolean(this.questions.question() || this.overlay.active)); return;
    }
    if (isCollaborationControl(controlSource) && (this.busy || this.questions.question())) {
      void runCollaborationControl(text, this.options.runtimeContext, transcriptLineRenderer(this.state.transcript, this.tui, '/collab'), Boolean(this.questions.question() || this.overlay.active));
      return;
    }
    if (mcp && (mcp.action === 'cancel' || this.busy || this.questions.question())) {
      if (mcp.action === 'cancel') { this.queue.cancelWhere(isMcpRequest); cancelMcpFor(this.options.runtimeContext); }
      void runCliMcpCommand({ gateway: this.options.initialMcpGateway,
        projectRoot: this.options.runtimeContext.cwd,
        admission: configurationAdmission(this.options.runtimeContext),
        renderer: transcriptLineRenderer(this.state.transcript, this.tui, '/mcp'),
        mcpAction: mcp.action, mcpTarget: mcp.target,
      });
      return;
    }
    if (isMcpConfiguration(controlSource) && (this.busy || this.questions.question())) {
      void runMcpConfigurationControl(text, this.options.runtimeContext, transcriptLineRenderer(this.state.transcript, this.tui, '/mcp'), Boolean(this.questions.question()));
      return;
    }
    if (isAgentsControl(controlSource) && (this.busy || this.questions.question())) {
      if (this.questions.question() || this.overlay.active) {
        this.state.transcript.append(textBlock('command', 'Agent control refused while another approval or question is pending; answer it first.', '/agents'));
        this.tui.requestRender(); return;
      }
      const context = this.options.runtimeContext;
      void agentsCommandFor(context)(tokenizeCommandArgs(text.trim().replace(/^\/agents(?:\s|$)/i, '')), {
        cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
      }).then(result => {
        if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, '/agents'));
        this.tui.requestRender();
      }, error => {
        this.state.transcript.append(textBlock('error', error instanceof Error ? error.message : 'Agent control failed.'));
        this.tui.requestRender();
      });
      return;
    }
    if (isSecurityControl(controlSource) && (this.busy || this.questions.question())) {
      const context = this.options.runtimeContext;
      void securityCommandFor(context)(tokenizeCommandArgs(text.trim().replace(/^\/security(?:\s|$)/i, '')), {
        cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
      }).then(result => {
        if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, '/security'));
        this.tui.requestRender();
      });
      return;
    }
    if (isExtensionControl(controlSource) && (this.busy || this.questions.question())) {
      const context = this.options.runtimeContext;
      const args = /^\/reload-plugins/i.test(text.trim()) ? ['reload'] : tokenizeCommandArgs(text.trim().replace(/^\/\S+(?:\s|$)/, ''));
      void extensionCommandFor(context)('plugin', args, { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true }).then(result => {
        this.state.transcript.append(textBlock('command', result.output, '/plugin')); this.tui.requestRender();
      });
      return;
    }
    if (isAdvisorControl(controlSource) && (this.busy || this.questions.question())) {
      const context = this.options.runtimeContext;
      void advisorCommandFor(context, this.options.sessionManager, this.options.sessionRuntime, this.options.renderer)(
        tokenizeCommandArgs(text.trim().replace(/^\/advisor(?:\s|$)/i, '')), {
          cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
        }).then(result => {
          if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, '/advisor'));
          this.tui.requestRender();
        });
      return;
    }
    if (isResearchControl(controlSource) && (this.busy || this.questions.question())) {
      const context = this.options.runtimeContext;
      void researchCommandFor(context, this.options.sessionManager, this.options.sessionRuntime, this.options.renderer)(
        tokenizeCommandArgs(text.trim().replace(/^\/\S+(?:\s|$)/, '')), {
          cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true,
        }).then(result => {
          if (result.kind === 'local') this.state.transcript.append(textBlock('command', result.output, '/deep-research'));
          this.tui.requestRender();
        });
      return;
    }
    if (this.questions.answer(text)) {
      this.tui.requestRender();
      return;
    }
    if (text.startsWith('/') && this.busy && !this.pickerPending && !this.questions.question() && !this.overlay.active && /^\/(?:cleanse|debug)$/i.test(text.trim())) {
      this.openPicker(text);
      return;
    }
    if (!this.busy && opensPicker(text, catalogScope(this.options.runtimeContext))) {
      this.openPicker(text);
      return;
    }
    this.state.transcript.append(
      attachments && attachments.images.length > 0
        ? { ...textBlock("user", text), images: attachments.images }
        : textBlock("user", text),
    );
    // Sending is a statement that the user is done reading back: the window
    // returns to the newest rows so the echo and the answer are in view.
    this.view.scrollToEnd();
    if (this.busy) {
      // A new message means the user is waiting on the model, not on a
      // foreground command: promote that command in place rather than kill it.
      jobsFor(this.options.runtimeContext)?.registry.promoteForeground?.();
      // A command is never steered: it is not a message for the model, so it
      // waits for the run boundary, like any input to a run that takes none.
      const composed = needsComposition(text, [...createCommandRegistry(this.options.runtimeContext.cwd, this.options.runtimeContext.runtimeConfig).values(),
        ...catalogContributions(this.options.runtimeContext.cwd, this.options.runtimeContext.session.id).flatMap(entry => entry.commands)]);
      const input = text.startsWith("/") || composed || attachments?.images.length ? undefined : this.options.sessionRuntime.input?.();
      if (!input) this.queue.push(text, attachments);
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
    promptMetadata?: Record<string, unknown>,
    sessionSelection?: import('../../session/navigation/selection.js').SavedSessionSelection,
  ): Promise<void> {
    const automatic = promptMetadata !== undefined;
    if (!automatic) this.options.onUserIntent?.();
    this.pager.close();
    this.overlay.close();
    // Queued input reaches this same dispatch point after the current operation
    // settles. A chooser still needs confirmation, even if its command waited.
    if (opensPicker(text, catalogScope(this.options.runtimeContext))) {
      this.openPicker(text, true);
      return;
    }
    this.busy = true;
    // When the turn began, so an idle signal can say how long the work took
    // rather than firing on every turn however brief.
    const turnStartedAt = Date.now();
    const attentionEnabled = this.options.runtimeContext.runtimeConfig.attentionOnIdle === true;
    // The elapsed time is computed at paint time, and paints are driven by events.
    // Between two events there are none, so without a clock of its own the timer
    // sits at whatever it read when the turn began.
    this.tick ??= setInterval(() => this.tui.requestRender(), ACTIVITY_TICK_MS);
    this.tick.unref?.();
    let exiting = false;
    let retrying: string | undefined;
    let clearing = false;
    let opened = false;
    let navigation: SessionNavigationResult | undefined;
    let sessionManagement: ShellActionResult | undefined;
    // `begin` clears the failure flag for the turn that is starting, so whether
    // the *previous* turn failed has to be read before that happens.
    const previousTurnFailed = this.sink.lastTurnFailed;
    const command = text.startsWith("/") ? text.split(/\s+/)[0]! : "turn";
    const configurationRevision = this.options.runtimeContext.configuration.current.revision;
    this.sink.begin(text.startsWith("/") ? "command" : "turn", command);
    this.options.renderer.setSink(this.sink);
    try {
      const result = await routeInteractiveCommand({
        ...(promptMetadata ? { promptMetadata } : {}),
        prompt: text,
        ...(attachments ? { attachments } : {}),
        ...(sessionSelection ? { sessionSelection } : {}),
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
        keyGuide: this.preferences.keybindings.guide(this.alternateScreen),
        setActiveNonInteractiveApprovalMode:
          this.options.setActiveNonInteractiveApprovalMode ?? (() => {}),
        refreshKeybindings: () => this.preferences.reload(),
      });
      this.catalogs.invalidate();
      if (!automatic && result.turnNumber > this.turnNumber) {
        this.lastPrompt = text;
        this.lastAttachments = attachments;
      }
      this.turnNumber = result.turnNumber;
      if (result.retryDraft !== undefined) {
        const images = attachments?.images.map(image => this.state.pastes.holdImage(image)).join(' ') ?? '';
        this.replaceExternalDraft([result.retryDraft, images, this.state.editor.getText()].filter(Boolean).join('\n\n'));
      }
      if (configurationRevision !== this.options.runtimeContext.configuration.current.revision) this.view.invalidateLayout();
      if (result.refreshMcpGateway) await this.options.initialMcpGateway.syncWorkspace?.();
      // `/theme` and `/reload` both change which file is worth following, and the
      // watcher would otherwise keep repainting for the theme that was replaced.
      if (result.themeChanged) this.theme.refresh();
      if (result.exitRequested) exiting = true;
      if (result.retryRequested) retrying = this.sink.retryTarget(this.lastPrompt, previousTurnFailed);
      if (result.clearRequested) clearing = true;
      if (result.sessionOpened) opened = true;
      navigation = result.navigation;
      sessionManagement = result.sessionManagement;
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
      if (output) pageLongOutput(this.pager, output.title, output.block, this.state.transcript);
      this.sink.end();
      this.busy = automatic || this.pickerPending;
      if (sessionManagement && !this.stopped) this.overlay.open(sessionManagementPicker(this.pickerHost(), sessionManagement));
      if (exiting) {
        this.shutdown();
        return;
      }
      if (clearing) {
        try {
          startFreshSession(this.historyTarget());
          this.sink.end(true);
        } catch (error) {
          this.state.transcript.append(textBlock('error', error instanceof Error ? error.message : String(error), 'error'));
        }
        this.tui.requestRender({ force: true });
      } else if (opened || navigation?.changed) {
        showConversation(this.historyTarget(), navigation?.changed ? this.options.runtimeContext.session : undefined);
        this.tui.requestRender({ force: true });
      }
      if (navigation?.changed) {
        this.state.transcript.append(textBlock("command", navigation.output, "/tree"));
        if (navigation.draft !== undefined) this.replaceExternalDraft(navigation.draft);
      }
      this.tui.requestRender();
      const next = automatic || this.pickerPending || sessionManagement ? undefined : retrying ?? this.queue.shift();
      // The attention pair, when the user asked for it and the turn was long
      // enough that they may have looked away. A queued follow-up keeps the
      // conversation running, so the signal waits for the turn that ends it.
      if (!this.stopped && !this.busy && next === undefined && attentionEnabled) {
        const tookMs = Date.now() - turnStartedAt;
        if (tookMs >= ATTENTION_AFTER_MS) {
          this.terminal.write(
            `${bell()}${idleNotification(`Turn finished (${Math.round(tookMs / 1000)}s)`)}`,
          );
        }
      }
      if (next !== undefined) void this.run(next, retrying !== undefined ? this.lastAttachments : this.queue.takeAttachments());
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
  private openPicker(command: string, waitForApply = false): void {
    const controller = this.pickerLifecycles.begin();
    const picker = pickerFor(command, this.pickerHost(controller.signal));
    if (!picker) {
      this.pickerLifecycles.abort(controller);
      return;
    }
    const tracked = this.pickerLifecycles.track(picker, controller, waitForApply);
    // Picker getters may depend on load/search completing; keep them lazy.
    this.overlay.open(tracked);
  }

  /** Hand the choice to the picker that produced it and surface what it reports. */
  private applyPicker(picker: Picker, ids: readonly string[]): void {
    this.options.onUserIntent?.();
    const revision = this.overlay.revision;
    const persistReport = reportWriter(this.options.sessionManager, this.options.runtimeContext.session.id);
    let continuation: AbortController | undefined;
    if (picker.holdInput) this.pickerInputPending.set(revision, (this.pickerInputPending.get(revision) ?? 0) + 1);
    if (picker.exclusive) {
      this.pickerPending = true;
      this.busy = true;
    }
    void picker
      .apply(ids)
      .then((outcome) => {
        if (picker.isCurrent && (this.stopped || this.overlay.revision !== revision || !pickerIsCurrent(picker))) return;
        if (outcome?.note) {
          this.state.transcript.append(textBlock("command", outcome.note, picker.title));
        }
        if (outcome?.report && !this.stopped && this.overlay.revision === revision) {
          if (outcome.reportRetained) {
            pageLongOutput(this.pager, outcome.report.title,
              { text: reportText(outcome.report), report: outcome.report }, this.state.transcript);
            return;
          }
          const block = { ...textBlock('command', reportText(outcome.report), picker.title), report: outcome.report };
          this.state.transcript.append(block);
          pageLongOutput(this.pager, outcome.report.title, block, this.state.transcript);
          const notice = reportSaveNotice(persistReport(outcome.report));
          if (notice) this.state.transcript.append(textBlock('notice', notice));
        }
        if (outcome?.draft && !this.stopped && this.overlay.revision === revision) {
          // Insertion requires another explicit submission. Usage is only a
          // hint; loading argument candidates here could perform network I/O.
          this.replaceExternalDraft(outcome.draft);
          this.view.setSuggesting(false);
          this.completionStatus = slashArgumentHint(this.state.editor.snapshot(),
            catalogScope(this.options.runtimeContext));
        }
        if (outcome?.next && !this.stopped && this.overlay.revision === revision) {
          const controller = this.pickerLifecycles.controllerFor(picker);
          if (controller) {
            const tracked = this.pickerLifecycles.track(outcome.next, controller, false);
            this.overlay.open(tracked);
            continuation = controller;
          } else this.overlay.open(outcome.next);
        }
      })
      .catch((error: unknown) => {
        if (picker.isCurrent && (this.stopped || this.overlay.revision !== revision || !pickerIsCurrent(picker))) return;
        this.state.transcript.append(
          textBlock("error", error instanceof Error ? error.message : String(error), picker.title),
        );
      })
      .finally(() => {
        this.pickerLifecycles.finish(picker, continuation);
        if (picker.holdInput) {
          const pending = (this.pickerInputPending.get(revision) ?? 1) - 1;
          if (pending) this.pickerInputPending.set(revision, pending);
          else this.pickerInputPending.delete(revision);
        }
        this.catalogs.invalidate();
        if (picker.exclusive) {
          this.pickerPending = false;
          this.busy = false;
        }
        this.tui.requestRender();
        const next = picker.exclusive && !this.stopped && !this.overlay.active ? this.queue.shift() : undefined;
        if (next !== undefined) void this.run(next, this.queue.takeAttachments());
      });
  }

  /** Everything the pickers need from the session, resolved lazily. */
  private pickerHost(signal?: AbortSignal): PickerHost {
    const admission = configurationAdmission(this.options.runtimeContext);
    const selectionRevision = this.selectionRevision;
    const selectionAdmission = (): string | undefined => {
      if (this.stopped || this.closing || this.selectionRevision !== selectionRevision
        || this.options.sessionRuntime.getCurrentRunController()?.signal.aborted) {
        return 'The session selection was cancelled or its surface closed. Reopen the picker.';
      }
      return admission();
    };
    return {
      commandContext: {
        runCancellable: operation => this.options.sessionRuntime.commands.run(operation),
        admission: selectionAdmission,
        ...(signal ? { signal } : {}),
        projectRoot: this.options.runtimeContext.projectRoot,
        runtimeConfig: this.options.runtimeContext.runtimeConfig,
        resolveConfigTarget: this.options.runtimeContext.resolveConfigTarget,
        ...(this.options.runtimeContext.promptIdentity
          ? { promptIdentity: this.options.runtimeContext.promptIdentity }
          : {}),
        readConfiguration: () => this.options.runtimeContext.configuration.current,
        getToolPool: toolPoolFor(this.options.runtimeContext, this.options.initialMcpGateway),
        refreshRuntimeConfig: scope => refreshShellRuntimeConfig(this.options.runtimeContext, scope),
        cwd: this.options.runtimeContext.cwd,
        sessionId: this.options.runtimeContext.session.id,
        interactive: true,
        workspaceRoots: this.options.runtimeContext.session.workspaceRoots,
        agentsCommand: agentsCommandFor(this.options.runtimeContext),
        usageCommand: usageCommandFor(this.options.runtimeContext),
        settingsCommand: settingsCommandFor(this.options.runtimeContext),
        planningCommand: planningCommandFor(this.options.runtimeContext, this.options.sessionManager,
          this.options.sessionRuntime, this.readline),
        ...(this.options.runtimeContext.skillOptions
          ? { skillOptions: this.options.runtimeContext.skillOptions }
          : {}),
        ...(this.options.themePaths ? { themePaths: this.options.themePaths } : {}),
        modifierKeysReported: (this.terminal.keyboardProtocol ?? "legacy") !== "legacy",
        keyGuide: this.preferences.keybindings.guide(this.alternateScreen),
      },
      transcript: this.state.transcript,
      sessionManager: this.options.sessionManager,
      mcpGateway: this.options.initialMcpGateway,
      approvalTrustPolicy: this.options.approvalTrustPolicy,
      projectRoot: this.options.runtimeContext.projectRoot,
      statusItems: readStatusItems(this.options.runtimeContext.projectRoot, this.options.runtimeContext.runtimeConfig),
      undo: undoPickerHost({ runtimeContext: this.options.runtimeContext, sessionManager: this.options.sessionManager,
        busy: () => this.stopped || this.closing || (this.busy && !this.pickerPending) || this.options.sessionRuntime.getCurrentRunController() !== null }),
      gitWorkbench: gitWorkbenchFor(this.options.runtimeContext),
      security: securityInspectorFor(this.options.runtimeContext),
      extensions: extensionManagerFor(this.options.runtimeContext),
      jobs: jobsFor(this.options.runtimeContext),
      agentDefinitions: () => agentDefinitionsFor(this.options.runtimeContext),
      agentDiscovery: () => agentDiscoveryFor(this.options.runtimeContext),
      advisorState: () => decodeAdvisor(readBoundSessionState(this.options.sessionManager, this.options.runtimeContext.session).state.advisor),
      ...sessionPickerHost({ runtimeContext: this.options.runtimeContext, sessionManager: this.options.sessionManager,
        admission: selectionAdmission,
        busy: () => this.stopped || this.closing || (this.busy && !this.pickerPending) || this.options.sessionRuntime.getCurrentRunController() !== null,
        resume: (sessionId, selection) => this.runCommandLine(`/resume -- ${quoteCompletion(sessionId, '')}`, selection),
      }),
      refreshServer: (serverName, expected, admission) => this.options.sessionRuntime.commands.run(signal => this.options.initialMcpGateway.refresh(serverName,
        { exactTarget: true, expectedConfig: expected, signal, ...(admission ? { admission } : {}) })),
      signIn: args => this.runCommandLine(`/connect ${args.map(arg => quoteCompletion(arg, '"')).join(' ')}`),
      modelSignIn: async (provider, key) => {
        const commands = this.pickerHost().commandContext;
        const refusal = commands.admission?.();
        if (refusal) return { context: commands, note: refusal };
        const progress = transcriptLineRenderer(this.state.transcript, this.tui, 'Account sign-in');
        let note: string;
        try {
          const args = key ? ['login', provider, '--api-key', key.apiKey, '--model', key.model, '--label', key.label,
            ...(key.baseUrl ? ['--base-url', key.baseUrl] : [])] : ['login', provider, '--account'];
          const result = await runConnectCommand(args, { ...commands,
            signInProgress: value => renderSignInProgress(progress, value) });
          note = key ? result.output.split('\n').filter(line => !line.startsWith('Saved key:')).join('\n') : result.output;
        } catch (error) {
          note = error instanceof ConfigWriteError ? error.message
            : `${key ? 'Connection save' : 'Account sign-in'} outcome is unverified. Inspect the saved connections before retrying.`;
        }
        this.catalogs.invalidate(); this.view.invalidateLayout();
        return { context: this.pickerHost().commandContext, note };
      },
      addMcpServer: mcpDefinitionFor(this.options.runtimeContext),
      revokeGrant: (key) => this.runCommandLine(`/permissions revoke ${key}`),
      sessionTurns: signal => readBackSource(this.options.runtimeContext, signal),
      rewind: async (point) => {
        const result = await navigateSession(this.options, point.entryId, point.version, selectionAdmission);
        if (result.changed) {
          showConversation(this.historyTarget(), this.options.runtimeContext.session);
          this.tui.requestRender({ force: true });
        }
        return { note: result.output, ...(result.draft !== undefined ? { draft: result.draft } : {}) };
      },
      fork: (entryId, version) => {
        if (!version) return Promise.resolve(undefined);
        return this.runCommandLine(`/fork here --from ${quoteCompletion(entryId, '')}`, {
          sessionId: this.options.runtimeContext.session.id, version,
          admission: selectionAdmission,
        });
      },
      previewStatusItems: (items) => {
        this.previewItems = items;
        this.previewItemsRevision = items === undefined ? undefined : this.options.runtimeContext.configuration.current.revision;
        this.tui.requestRender();
      },
      previewComposerShape: this.composerPreference.propose,
      themes: themePreferences({
        workspaceRoot: this.options.runtimeContext.projectRoot,
        extraPaths: this.options.themePaths,
        follower: this.theme,
        redraw: () => this.tui.requestRender({ force: true }),
      }),
      configurationRevision: () => this.options.runtimeContext.configuration.current.revision,
      saveStatusItems: async (items) => {
        const written = writeStatusItems(this.options.runtimeContext.projectRoot, items);
        this.statusItems = items;
        this.options.runtimeContext.configuration.recordDisplay({ tui: { ...this.options.runtimeContext.runtimeConfig.tui, statusItems: items } });
        return written.scope === "project"
          ? `Status band items saved to ${written.path} (this project's file, which wins over your own)`
          : `Status band items saved to ${written.path}`;
      },
      openSettings: (scope) => openSettings(this.options.runtimeContext, () => this.theme.refresh(), scope),
    };
  }

  /** Route a command line as if the user had typed it, reusing the same path. */
  private async runCommandLine(line: string, selection?: import('../../session/navigation/selection.js').SavedSessionSelection): Promise<undefined> {
    this.state.transcript.append(textBlock("user", line));
    this.view.scrollToEnd();
    if (selection) await this.run(line, undefined, undefined, selection);
    else await this.run(line);
    return undefined;
  }

  /**
   * Stop the run. Input it had not yet taken comes back to the prompt rather
   * than running against a turn the user just cancelled.
   */
  private async interrupt(): Promise<void> {
    this.selectionRevision++;
    if (!this.busy) {
      if (this.options.sessionRuntime.commands?.current) {
        await this.options.sessionRuntime.cancelAndWait();
        return;
      }
      if (schedulerForRuntime(this.options.sessionRuntime)?.ownerToken() || directorInterruptible(this.options.runtimeContext) || evaluationInterruptible(this.options.runtimeContext) || mediaInterruptible(this.options.runtimeContext)) this.options.sessionRuntime.cancelCurrentRun();
      return;
    }
    this.sink.markCancelling();
    const undelivered = [...(this.options.sessionRuntime.input?.()?.clearQueue() ?? []), ...this.queue.release().map(submission => {
      const images = submission.attachments?.images.map(image => this.state.pastes.holdImage(image)).join(' ');
      return [submission.text, images].filter(Boolean).join('\n\n');
    })];
    await this.options.sessionRuntime.cancelAndWait();
    if (undelivered.length === 0) return;
    const draft = this.state.editor.getText();
    this.replaceExternalDraft([...undelivered, draft].filter((part) => part.trim()).join("\n\n"));
    this.tui.requestRender();
  }

  /** Programmatic replacements start a fresh Vim mode and undo-safe draft. */
  private replaceExternalDraft(text: string): void {
    resetVimState(this.state.editor);
    this.vimSelection = undefined;
    this.state.editor.setDraftText(text);
  }

  private copySourceSelection(selection: SourceSelection): boolean {
    const snapshot = this.state.editor.snapshot();
    this.vimSelection = undefined;
    if (selection.sourceRevision !== snapshot.revision || selection.start < 0
      || selection.end > snapshot.text.length || selection.start >= selection.end) return false;
    const text = snapshot.text.slice(selection.start, selection.end);
    if (!text) return false;
    this.clipboard.copy(text);
    return true;
  }

  /**
   * Swap between planning and building. This replaces four commands that each
   * did one leg of the same toggle, and puts it on a key so the mode can be
   * changed mid-thought without abandoning the draft.
   */
  private cycleAgentMode(): void {
    this.catalogs.invalidate();
    this.completionStatus = undefined;
    this.view.setSuggesting(false);
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
    this.catalogs.invalidate();
    this.completionStatus = undefined;
    this.view.setSuggesting(false);
    const next = nextScope(this.options.sessionRuntime.getPermissionScope());
    this.options.sessionRuntime.setPermissionScope(next);
    this.tui.requestRender();
  }

  /**
   * Drop the transcript the surface holds.
   *
   * On the alternate screen this empties what the session shows. On the
   * terminal's own screen the rows already written are history, and history
   * cannot be erased by a repaint — rewriting those rows would append a second
   * copy of them, which is the one thing this mode must not do. There the
   * conversation stays in the scrollback, and clearing the terminal itself is
   * the user's to do; saying so here is honest, pretending it was cleared is
   * not.
   */
  private clearScreen(): void {
    this.state.transcript.clear();
    this.tui.requestRender({ force: true });
  }

  private async shutdown(): Promise<void> {
    if (this.closing || this.stopped) return;
    this.closing = true;
    // A single stdin chunk can contain the exit key and further complete keys,
    // paste or mouse events. Detach dispatch before yielding to the drain.
    this.stdin.dispose();
    try {
      if (this.terminal.drainInput) await this.terminal.drainInput();
    } catch {
      // A disconnected terminal must still reach synchronous cleanup.
    }
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
