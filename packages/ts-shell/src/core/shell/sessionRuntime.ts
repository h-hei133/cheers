import type { ImageContent } from "../../model-adapters/multimodal.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type {
  SessionContinuitySnapshot,
  SessionManager,
} from "../../session/SessionManager.js";
import type { CompactLiveCheckpointStore } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import type { CompactInjectionStateStore } from "../../context/compact/injection/compactInjectionState.js";
import type { ProjectMemoryInjectionStateStore } from "../../memory/projectMemoryInjectionState.js";
import type { ProjectMemoryStore } from "../../memory/projectMemoryStoreContract.js";
import type { QueryEvent } from "../query/runtime/events.js";
import { isDurableQueryEvent } from "../query/runtime/events.js";
import { notifyObservers } from './observers.js';
import type { QueryRuntimeStateSeed } from "../query/runtime/state.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { PromptPublicationError } from '../../session/store/prompt/intent.js';
import {
  createRuntimeEventDigest,
  renderSessionQueryEventSurface,
  type RuntimeEventDigest,
  updateRuntimeEventDigest,
} from "./sessionEventSurface.js";
import { buildPromptWithFutureTurnInjections, selectPromptContinuity } from "./sessionFutureTurnProjection.js";
import { buildSessionResumeContext } from "../../session/continuation/sessionPromptContinuity.js";
import {
  projectCompletedSessionSave,
  projectErrorSessionSave,
  projectRuntimeFailureSessionSave,
} from "./sessionPersistenceProjection.js";
import {
  applyTerminalQueryEvent,
  createSessionTerminalState,
  renderSessionTerminalSurface,
} from "./sessionTerminalState.js";
import { ShellStateMachine } from "./stateMachine.js";
import { ShellCommandRuntime } from "./command.js";
import type { PermissionScope } from "./approval/scope.js";
import type { CompactionOutcome } from "./compaction.js";
import type { TurnInput } from "../../turn/session.js";
import { hasUnfinishedSessionWork } from "../../session/recovery/work.js";
import { normalizePathIdentity } from '../../session/continuation/roots.js';
import type {CaptureQueuedPromptInput, PreparedPromptInput, PromptInputRequest} from './input/contract.js';
import {InputPreparationError} from './input/contract.js';
import type {InputAdmissionReceipt} from '../hooks/input/receipt.js';
import {bindQueuedPromptInput, capturePromptInput} from './input/capture.js';

/**
 * What travels with a prompt beside its text.
 *
 * Images are held apart from the words because they are not part of the
 * sentence: the placeholder that stood for one in the draft expands back to
 * nothing, so the picture has to be carried here or not at all.
 * A remote trace parent also travels with its submission and is kept out of the prompt.
 */
export interface PromptAttachments {
  readonly images: readonly ImageContent[];
  readonly traceParent?: string;
}

/**
 * A prompt in flight: its event stream, and the handle through which input
 * typed while it runs reaches it. A bare stream is a run that takes no input.
 */
export type PromptRun =
  | AsyncIterable<QueryEvent>
  | { readonly events: AsyncIterable<QueryEvent>; readonly input?: TurnInput; readonly sourceEntryId?: () => string | undefined;
      readonly settled?: (outcome: { readonly status: 'completed' | 'completed_unproven' | 'error'; readonly finalOutput: string }) => void };

export interface SessionRuntimeDependencies {
  readonly prepareInput?: (input: PromptInputRequest) => Promise<PreparedPromptInput>;
  readonly captureQueuedInput?: CaptureQueuedPromptInput;
  readonly inputSource?: PromptInputRequest['source'];
  /** Native provenance owner may validate a one-use submission before durable prompt publication. */
  readonly admitPrompt?: (prompt: string, metadata: Record<string, unknown> | undefined, signal: AbortSignal) => Promise<void>;
  readonly promptSettled?: (metadata: Record<string, unknown> | undefined, signal: AbortSignal, outcome: 'completed' | 'completed_unproven' | 'failed' | 'cancelled' | 'unknown') => Promise<void>;
  /** Cancellation reaches the owner of work scheduled across individual prompts. */
  readonly onCancelRequested?: () => void;
  readonly configuredAgentMode?: () => 'plan' | 'build' | undefined;
  /** Live project binding for a runtime that can switch sessions or workspaces. */
  readonly projectBinding?: () => { readonly root: string; readonly revision: number };
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runPrompt: (
    prompt: string,
    signal: AbortSignal,
    runtimeSeed?: QueryRuntimeStateSeed,
    continuityState?: SessionContinuitySnapshot,
    attachments?: PromptAttachments,
    continuityContext?: string,
    onPromptAccepted?: () => void,
    inputAdmission?: InputAdmissionReceipt,
    effectiveInput?: string,
  ) => PromptRun;
  readonly compactCheckpointStore?: CompactLiveCheckpointStore;
  readonly compactInjectionStateStore?: CompactInjectionStateStore;
  readonly projectMemoryInjectionStateStore?: ProjectMemoryInjectionStateStore;
  readonly projectMemoryStore?: ProjectMemoryStore;
  /** Condense the session's history; absent when no provider can summarize. */
  readonly compactHistory?: (
    sessionId: string,
    signal: AbortSignal,
    instructions?: string,
  ) => Promise<CompactionOutcome>;
  /**
   * Condense turns the user stepped back past, so what they established is not
   * lost with them. Absent when no provider can summarize.
   */
  readonly summarizeAbandonedTurns?: (
    messages: readonly SessionMessage[],
    signal?: AbortSignal,
    options?: { readonly instructions?: string; readonly prompt?: string },
  ) => Promise<string | undefined>;
}

/** Display notification only; returned asynchronous work is isolated and not awaited. */
export type QueryEventObserver = (event: QueryEvent) => void;

export class ShellSessionRuntime {
  readonly commands = new ShellCommandRuntime();
  private readonly deps: SessionRuntimeDependencies;
  private readonly stateMachine = new ShellStateMachine();
  private readonly eventObservers = new Set<QueryEventObserver>();
  private readonly renderingObservers = new Set<QueryEventObserver>();
  private currentRunController: AbortController | null = null;
  private currentInput: TurnInput | undefined;
  private currentRun: Promise<string> | null = null;
  private lastRun: Promise<string> | null = null;
  private viewMode: "compact" | "verbose" = "compact";
  private permissionScope: PermissionScope = "ask";
  private permissionScopeProject?: { readonly root: string | undefined; readonly revision: number };
  private agentMode?: "plan" | "build";

  constructor(deps: SessionRuntimeDependencies) {
    this.deps = deps;
  }

  /**
   * Observe the raw query event stream. A structured observer replaces the prose
   * event surface for interactive runs: both channels describe the same events,
   * so rendering both would duplicate every tool call and every token.
   */
  observeEvents(observer: QueryEventObserver, options?: { readonly renders?: boolean }): () => void {
    this.eventObservers.add(observer);
    if (options?.renders !== false) this.renderingObservers.add(observer);
    return () => { this.eventObservers.delete(observer); this.renderingObservers.delete(observer); };
  }

  getState() {
    return this.stateMachine.getState();
  }

  getCurrentRunController(): AbortController | null {
    return this.currentRunController ?? this.commands.current?.controller ?? null;
  }

  /** Includes durable and observer settlement after provider dispatch has ended. */
  isRunning(): boolean {
    return this.currentRun !== null || this.getCurrentRunController() !== null;
  }

  /** Where input typed during the active run goes; nothing when no run takes input. */
  input(): TurnInput | undefined {
    return this.currentInput;
  }

  /** Settles when the active run finishes, or immediately when idle. */
  waitForIdle(): Promise<void> {
    const command = this.commands.current?.settled;
    const run = this.currentRun ?? (command ? null : this.lastRun);
    return Promise.allSettled([run, command]).then(results => {
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    });
  }

  /** Abort the active run and wait until it has settled. */
  async cancelAndWait(): Promise<void> {
    const settled = this.waitForIdle().catch(() => undefined);
    try { this.cancelCurrentRun(); }
    finally { await settled; }
  }


  getViewMode(): "compact" | "verbose" {
    return this.viewMode;
  }

  setViewMode(mode: "compact" | "verbose"): void {
    this.viewMode = mode;
  }

  getAgentMode(): "plan" | "build" {
    return this.agentMode ?? this.deps.configuredAgentMode?.() ?? 'build';
  }

  setAgentMode(mode: "plan" | "build"): void {
    this.agentMode = mode;
  }

  /** How much this session may do before it has to ask. */
  getPermissionScope(): PermissionScope {
    const project = this.deps.projectBinding?.();
    if (project && (normalizePathIdentity(project.root) !== this.permissionScopeProject?.root
      || project.revision !== this.permissionScopeProject?.revision)) {
      this.permissionScope = 'ask';
    }
    return this.permissionScope;
  }

  setPermissionScope(scope: PermissionScope): void {
    const project = this.deps.projectBinding?.();
    this.permissionScopeProject = project ? { root: normalizePathIdentity(project.root), revision: project.revision } : undefined;
    this.permissionScope = project && this.permissionScopeProject?.root === undefined ? 'ask' : scope;
  }

  async executePrompt(
    sessionId: string,
    prompt: string,
    options?: {
      runtimeSeed?: QueryRuntimeStateSeed;
      continuityState?: SessionContinuitySnapshot;
      outputMode?: "interactive" | "print";
      attachments?: PromptAttachments;
      promptMetadata?: Record<string, unknown>;
      inputSource?: PromptInputRequest['source'];
    },
  ): Promise<string> {
    if (this.isRunning()) throw new Error('A session operation is still running.');
    const run = this.trackRun(this.drivePrompt(sessionId, prompt, options));
    return run;
  }

  private trackRun(run: Promise<string>): Promise<string> {
    this.currentRun = run;
    run.then(
      () => {
        if (this.currentRun === run) this.currentRun = null;
        this.lastRun = run;
      },
      () => {
        if (this.currentRun === run) this.currentRun = null;
        this.lastRun = run;
      },
    );
    // Mark the rejection handled up front: waitForIdle() still surfaces it
    // to explicit awaiters, but callers that only await executePrompt() no
    // longer trigger an unhandledRejection warning.
    run.catch(() => {});
    return run;
  }

  private async drivePrompt(
    sessionId: string,
    prompt: string,
    options?: {
      runtimeSeed?: QueryRuntimeStateSeed;
      continuityState?: SessionContinuitySnapshot;
      outputMode?: "interactive" | "print";
      attachments?: PromptAttachments;
      promptMetadata?: Record<string, unknown>;
      inputSource?: PromptInputRequest['source'];
    },
  ): Promise<string> {
    this.currentRunController = new AbortController();
    const signal = this.currentRunController.signal;
    this.stateMachine.startRun();
    const terminalState = createSessionTerminalState();
    let startedRendering = false;
    const printMode = options?.outputMode === "print";
    let enteredQueryPhase = false;
    const eventDigest: RuntimeEventDigest = createRuntimeEventDigest();
    const structuredOutput = !printMode && this.renderingObservers.size > 0;
    let sourceEntryId: (() => string | undefined) | undefined;
    let settled: Exclude<PromptRun, AsyncIterable<QueryEvent>>['settled'];
    let provenanceOutcome: 'completed' | 'completed_unproven' | 'failed' | 'cancelled' | 'unknown' = 'unknown';
    /** The run's outcome was decided; a later throw is a storage failure. */
    let terminalOutcomeRecorded = false;
    let preparingInput = !options?.runtimeSeed && this.deps.prepareInput !== undefined;
    let promptMetadata: Record<string, unknown> | undefined;
    let refusedInputSource = false;
    let preparedInput: PreparedPromptInput | undefined;
    let provenancePending = false;

    try {
      const captured = preparingInput ? capturePromptInput({prompt, metadata:options?.promptMetadata, images:options?.attachments?.images}) : undefined;
      promptMetadata = captured ? captured.metadata : options?.promptMetadata;
      preparedInput = preparingInput ? await this.deps.prepareInput!({sessionId, prompt:captured!.prompt,
        images:captured!.images, source:options?.inputSource ?? this.deps.inputSource ?? 'cli',
        metadata:promptMetadata, signal}) : undefined;
      preparedInput?.check();
      if (preparedInput?.status === 'handled') {
        this.stateMachine.completeRun();
        this.currentRunController = null;
        notifyObservers(this.eventObservers, {type:'input.handled', sessionId});
        return '';
      }
      const effectivePrompt = preparedInput?.prompt ?? prompt;
      const traceParent = options?.attachments?.traceParent;
      const attachments = preparedInput
        ? preparedInput.images || traceParent
          ? { images: preparedInput.images ?? [], ...(traceParent ? { traceParent } : {}) }
          : undefined
        : options?.attachments;
      const continuityState = selectPromptContinuity(this.deps.sessionManager, sessionId, effectivePrompt,
        effectivePrompt === prompt ? options : {...options, continuityState:undefined});

      const preparedPrompt = !options?.runtimeSeed
        ? await buildPromptWithFutureTurnInjections({
            deps: this.deps,
            sessionId,
            prompt:effectivePrompt,
          })
        : undefined;
      // Classify the submitted request, before any injected historical text can
      // supply a continuation cue of its own.
      const continuityContext = continuityState
        ? buildSessionResumeContext({ currentPrompt: effectivePrompt, snapshot: continuityState })
        : undefined;

      if (!options?.runtimeSeed) {
        preparedInput?.check();
        provenancePending = this.deps.admitPrompt !== undefined;
        await this.deps.admitPrompt?.(effectivePrompt, promptMetadata, signal);
        preparedInput?.check();
        preparingInput = false;
        if (preparedInput?.checkWrite) {
          this.deps.sessionManager.persistUserPromptBarrier(sessionId, effectivePrompt, promptMetadata, attachments?.images, preparedInput.checkWrite);
        } else if (attachments?.images.length) {
          this.deps.sessionManager.persistUserPromptBarrier(sessionId, effectivePrompt, promptMetadata, attachments.images);
        } else {
          this.deps.sessionManager.persistUserPromptBarrier(sessionId, effectivePrompt, promptMetadata);
        }
        if (preparedInput) {
          try {preparedInput.published();} catch (error) {refusedInputSource = true; throw error;}
        }
      }

      let sawTerminalEvent = false;

      if (
        options?.runtimeSeed &&
        options.runtimeSeed.recoveryBoundary !== "fresh-entry"
      ) {
        this.deps.sessionManager.markRecoveryReentry(
          sessionId,
          options.runtimeSeed.recoveryBoundary,
        );
        enteredQueryPhase =
          options.runtimeSeed.recoveryBoundary === "mid-turn-reentry";
      }

      const run = this.deps.runPrompt(
        preparedPrompt?.prompt ?? effectivePrompt,
        signal,
        options?.runtimeSeed,
        continuityState,
        attachments,
        continuityContext,
        preparedPrompt?.accept,
        preparedInput?.admission,
        effectivePrompt,
      );
      const events = Symbol.asyncIterator in run ? run : run.events;
      const input = Symbol.asyncIterator in run ? undefined : run.input;
      const bound = input && this.deps.captureQueuedInput ? bindQueuedPromptInput(input, sessionId, () => {
        signal.throwIfAborted();
        if (this.currentRunController?.signal !== signal || this.currentInput !== bound) throw new InputPreparationError();
      }, this.deps.captureQueuedInput) : input;
      this.currentInput = bound;
      sourceEntryId = Symbol.asyncIterator in run ? undefined : run.sourceEntryId;
      settled = Symbol.asyncIterator in run ? undefined : run.settled;
      for await (const event of events) {
        if (preparedInput && !enteredQueryPhase) {
          try {preparedInput.check();} catch (error) {refusedInputSource = true; throw error;}
        }
        if (!enteredQueryPhase) {
          enteredQueryPhase = true;
          this.deps.sessionManager.markTurnActive(sessionId);
        }
        // Observers run first. A delta is a display increment, and putting the
        // durable append in front of it meant every token paid for a full
        // transcript read, a state snapshot write and a file lock before the
        // screen could move — which on a long session is the difference between
        // text appearing as it arrives and appearing all at once when the turn
        // ends.
        //
        // An observer that throws must not cost the transcript an event. A
        // rendering bug in the surface is exactly the kind of failure that
        // happens mid-turn, and it must not be able to swallow a terminal
        // event — the run would then look like it never ended.
        updateRuntimeEventDigest(eventDigest, event);
        notifyObservers(this.eventObservers, event);
        if (isDurableQueryEvent(event)) {
          terminalOutcomeRecorded = event.type === "query.completed" || event.type === "query.completed_unproven"
            || event.type === "query.failed";
          this.deps.sessionManager.appendQueryEvent(sessionId, event, sourceEntryId ? { entryId: sourceEntryId() } : undefined);
          terminalOutcomeRecorded = false;
        }
        if (!structuredOutput) {
          const renderResult = renderSessionQueryEventSurface({
            renderer: this.deps.renderer,
            event,
            digest: eventDigest,
            printMode,
            viewMode: this.viewMode,
            startedRendering,
          });
          startedRendering = renderResult.startedRendering;
        }
        applyTerminalQueryEvent(terminalState, event);
        switch (event.type) {
          case "query.completed":
          case "query.completed_unproven":
            sawTerminalEvent = true;
            break;
          case "query.failed":
            sawTerminalEvent = true;
            throw new Error(event.error);
          default:
            break;
        }
      }

      if (!sawTerminalEvent) {
        throw new Error("Query runtime ended without a terminal event");
      }

      if (!structuredOutput) {
        renderSessionTerminalSurface({
          renderer: this.deps.renderer,
          terminalState,
          eventDigest,
          printMode,
          viewMode: this.viewMode,
          startedRendering,
          continuityState,
        });
      }

      // The run's outcome is decided before persistence is attempted. A storage
      // failure below must not be reported as a different outcome: the query
      // finished, and appending a cancellation or error would make the durable
      // record disagree with what actually happened.
      terminalOutcomeRecorded = true;
      if (terminalState.terminalStatus === "completed" || terminalState.terminalStatus === 'completed_unproven') {
        this.deps.sessionManager.saveCompleted(
          sessionId,
          projectCompletedSessionSave(terminalState),
        );
      } else {
        const errorSave = projectErrorSessionSave(terminalState);
        this.deps.sessionManager.saveError(
          sessionId,
          errorSave.error,
          errorSave.options,
        );
      }
      this.stateMachine.completeRun();
      provenanceOutcome = terminalState.terminalStatus === 'completed_unproven' ? 'completed_unproven'
        : terminalState.terminalStatus === 'completed' ? 'completed' : 'failed';
      this.currentRunController = null;
      this.currentInput = undefined;
      settled?.({ status: terminalState.terminalStatus === 'completed_unproven' ? 'completed_unproven'
        : terminalState.terminalStatus === 'completed' ? 'completed' : 'error', finalOutput: terminalState.finalOutput });
      return terminalState.finalOutput;
    } catch (error) {
      if (error instanceof PromptPublicationError) {
        if (error.kind === 'prompt' && error.persistence === 'unchanged' && !terminalOutcomeRecorded) {
          provenanceOutcome = signal.aborted ? 'cancelled' : 'failed';
        }
        if (signal.aborted) this.stateMachine.interruptRun(); else this.stateMachine.failRun();
        throw error;
      }
      if (preparedInput && !enteredQueryPhase && !preparingInput) {
        try {preparedInput.check();} catch {refusedInputSource = true;}
      }
      if (refusedInputSource) {
        this.currentRunController = null; this.currentInput = undefined;
        provenanceOutcome = signal.aborted ? 'cancelled' : 'failed';
        if (signal.aborted) this.stateMachine.interruptRun(); else this.stateMachine.failRun();
        throw error;
      }
      if (preparingInput) {
        if (provenancePending) provenanceOutcome = signal.aborted ? 'cancelled' : 'failed';
        this.currentRunController = null; this.currentInput = undefined;
        if (signal.aborted) this.stateMachine.interruptRun(); else this.stateMachine.failRun();
        throw error;
      }
      // A failure after the terminal state was decided is a storage failure, not
      // a query failure. Report it as such and leave the durable terminal record
      // alone, rather than appending a contradicting cancellation or error.
      //
      // The outcome stays `unknown`, not `failed`. The query itself reached a
      // terminal state; what is unverified is whether that state was written
      // down. Telling a consumer the run failed would replace a question about
      // durability with a claim about the work, and every downstream record —
      // a collaboration proposal, a goal round — would then record a failure
      // that never happened.
      if (terminalOutcomeRecorded) {
        this.currentRunController = null;
        this.currentInput = undefined;
        throw error;
      }
      let cancellation: Extract<QueryEvent, { type: "lifecycle.cancelled" }> | undefined;
      if (signal.aborted) {
        cancellation = {
          type: "lifecycle.cancelled",
          reason: "AbortSignal triggered during shell session runtime",
        };
        this.deps.sessionManager.saveInterrupted(
          sessionId,
          enteredQueryPhase ? "turn" : "prompt",
          { event: cancellation, sourceEntryId: sourceEntryId?.() },
        );
        this.stateMachine.interruptRun();
        provenanceOutcome = 'cancelled';
      } else {
        const errorSave = terminalState.terminalClassification === 'stopped' ? projectErrorSessionSave(terminalState) : projectRuntimeFailureSessionSave({
          error,
          lastContinuationReason: terminalState.lastContinuationReason,
        });
        this.deps.sessionManager.saveError(
          sessionId,
          errorSave.error,
          errorSave.options,
          { event: { type: "lifecycle.error", error: errorSave.error }, sourceEntryId: sourceEntryId?.() },
        );
        this.stateMachine.failRun();
        provenanceOutcome = 'failed';
      }
      this.currentRunController = null;
      this.currentInput = undefined;
      if (cancellation) {
        notifyObservers(this.eventObservers, cancellation);
      }
      throw error;
    } finally {
      if (this.currentRunController?.signal === signal) {
        this.currentRunController = null; this.currentInput = undefined;
        if (provenanceOutcome === 'unknown') this.stateMachine.failRun();
      }
      if (!preparingInput || provenancePending) await this.deps.promptSettled?.(promptMetadata, signal, provenanceOutcome);
    }
  }

  cancelCurrentRun(): void {
    const command = this.commands.current?.controller;
    const run = this.currentRunController;
    try { this.deps.onCancelRequested?.(); }
    finally {
      command?.abort();
      run?.abort();
      if (this.currentRunController === run && this.commands.current?.controller === command) {
        this.stateMachine.interruptRun();
      }
    }
  }

  /**
   * Condense the history behind the next request. Refused while a run is in
   * flight, since that run is still adding to the history being condensed; the
   * cancel gesture aborts the summarization the same way it aborts a run.
   */
  async compactHistory(sessionId: string, instructions?: string): Promise<CompactionOutcome> {
    if (!this.deps.compactHistory) {
      return { status: "failed", reason: "No provider is available to summarize the conversation." };
    }
    if (this.isRunning()) return { status: "busy" };
    return this.commands.run(signal => this.deps.compactHistory!(sessionId, signal, instructions), 'compaction');
  }

  /**
   * Condense turns the user stepped back past.
   *
   * Returns nothing rather than failing when no provider can summarize: the
   * rewind itself is the user's decision and must not depend on a summary
   * being available.
   */
  async summarizeAbandonedTurns(messages: readonly SessionMessage[], signal?: AbortSignal, options?: { readonly instructions?: string; readonly prompt?: string }): Promise<string | undefined> {
    if (!this.deps.summarizeAbandonedTurns) return undefined;
    if (this.isRunning()) return undefined;
    return this.commands.run(owned => this.deps.summarizeAbandonedTurns!(messages, owned, options), 'compaction', signal);
  }

  terminate(sessionId: string): void {
    this.stateMachine.terminate();
    // The host closes before its bounded resource join cancels active work.
    // Keep its prompt and uncertain outcomes until their owner settles them.
    if (this.isRunning()
      || hasUnfinishedSessionWork(this.deps.sessionManager.getRecoverySnapshot(sessionId))) return;
    this.deps.sessionManager.saveTerminated(sessionId);
  }
}
