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
import type { QueryRuntimeStateSeed } from "../query/runtime/state.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import {
  createRuntimeEventDigest,
  renderSessionQueryEventSurface,
  type RuntimeEventDigest,
  updateRuntimeEventDigest,
} from "./sessionEventSurface.js";
import { buildPromptWithFutureTurnInjections } from "./sessionFutureTurnProjection.js";
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
import type { PermissionScope } from "../../cli/approval/permissionScope.js";
import type { CompactionOutcome } from "./compaction.js";
import type { TurnInput } from "../../turn/session.js";

/**
 * What travels with a prompt beside its text.
 *
 * Images are held apart from the words because they are not part of the
 * sentence: the placeholder that stood for one in the draft expands back to
 * nothing, so the picture has to be carried here or not at all.
 */
export interface PromptAttachments {
  readonly images: readonly ImageContent[];
}

/**
 * A prompt in flight: its event stream, and the handle through which input
 * typed while it runs reaches it. A bare stream is a run that takes no input.
 */
export type PromptRun =
  | AsyncIterable<QueryEvent>
  | { readonly events: AsyncIterable<QueryEvent>; readonly input?: TurnInput; readonly sourceEntryId?: () => string | undefined };

export interface SessionRuntimeDependencies {
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runPrompt: (
    prompt: string,
    signal: AbortSignal,
    runtimeSeed?: QueryRuntimeStateSeed,
    continuityState?: SessionContinuitySnapshot,
    attachments?: PromptAttachments,
    continuityContext?: string,
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
  ) => Promise<string | undefined>;
}

export type QueryEventObserver = (event: QueryEvent) => void;

export class ShellSessionRuntime {
  private readonly deps: SessionRuntimeDependencies;
  private readonly stateMachine = new ShellStateMachine();
  private readonly eventObservers = new Set<QueryEventObserver>();
  private currentRunController: AbortController | null = null;
  private currentInput: TurnInput | undefined;
  private currentRun: Promise<string> | null = null;
  private lastRun: Promise<string> | null = null;
  private viewMode: "compact" | "verbose" = "compact";
  private permissionScope: PermissionScope = "ask";
  private agentMode: "plan" | "build" = "build";

  constructor(deps: SessionRuntimeDependencies) {
    this.deps = deps;
  }

  /**
   * Observe the raw query event stream. A structured observer replaces the prose
   * event surface for interactive runs: both channels describe the same events,
   * so rendering both would duplicate every tool call and every token.
   */
  observeEvents(observer: QueryEventObserver): () => void {
    this.eventObservers.add(observer);
    return () => this.eventObservers.delete(observer);
  }

  getState() {
    return this.stateMachine.getState();
  }

  getCurrentRunController(): AbortController | null {
    return this.currentRunController;
  }

  /** Where input typed during the active run goes; nothing when no run takes input. */
  input(): TurnInput | undefined {
    return this.currentInput;
  }

  /** Settles when the active run finishes, or immediately when idle. */
  waitForIdle(): Promise<void> {
    const run = this.currentRun ?? this.lastRun;
    if (!run) return Promise.resolve();
    return run.then(
      () => undefined,
      (error) => {
        throw error;
      },
    );
  }

  /** Abort the active run and wait until it has settled. */
  async cancelAndWait(): Promise<void> {
    this.cancelCurrentRun();
    await this.waitForIdle().catch(() => undefined);
  }


  getViewMode(): "compact" | "verbose" {
    return this.viewMode;
  }

  setViewMode(mode: "compact" | "verbose"): void {
    this.viewMode = mode;
  }

  getAgentMode(): "plan" | "build" {
    return this.agentMode;
  }

  setAgentMode(mode: "plan" | "build"): void {
    this.agentMode = mode;
  }

  /** How much this session may do before it has to ask. */
  getPermissionScope(): PermissionScope {
    return this.permissionScope;
  }

  setPermissionScope(scope: PermissionScope): void {
    this.permissionScope = scope;
  }

  async executePrompt(
    sessionId: string,
    prompt: string,
    options?: {
      runtimeSeed?: QueryRuntimeStateSeed;
      continuityState?: SessionContinuitySnapshot;
      outputMode?: "interactive" | "print";
      attachments?: PromptAttachments;
    },
  ): Promise<string> {
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
    const structuredOutput = !printMode && this.eventObservers.size > 0;
    let sourceEntryId: (() => string | undefined) | undefined;

    try {
      const continuityBuilder = (
        this.deps.sessionManager as SessionManager & {
          buildPromptContinuitySnapshot?: (
            sessionId: string,
            currentPrompt: string,
          ) => SessionContinuitySnapshot | undefined;
          buildContinuitySnapshot?: (
            sessionId: string,
          ) => SessionContinuitySnapshot;
        }
      ).buildPromptContinuitySnapshot;
      const activeContinuityBuilder = (
        this.deps.sessionManager as SessionManager & {
          buildContinuitySnapshot?: (
            sessionId: string,
          ) => SessionContinuitySnapshot;
        }
      ).buildContinuitySnapshot;
      const outputMode = options?.outputMode ?? "interactive";
      let continuityState = options?.continuityState;
      if (!continuityState) {
        continuityState =
          !options?.runtimeSeed && outputMode === "interactive"
            ? typeof activeContinuityBuilder === "function"
              ? activeContinuityBuilder.call(
                  this.deps.sessionManager,
                  sessionId,
                )
              : typeof continuityBuilder === "function"
                ? continuityBuilder.call(
                    this.deps.sessionManager,
                    sessionId,
                    prompt,
                  )
                : undefined
            : !options?.runtimeSeed && typeof continuityBuilder === "function"
              ? continuityBuilder.call(
                  this.deps.sessionManager,
                  sessionId,
                  prompt,
                )
              : undefined;
      }

      const promptForModel = !options?.runtimeSeed
        ? await buildPromptWithFutureTurnInjections({
            deps: this.deps,
            sessionId,
            prompt,
          })
        : prompt;
      // Classify the submitted request, before any injected historical text can
      // supply a continuation cue of its own.
      const continuityContext = continuityState
        ? buildSessionResumeContext({ currentPrompt: prompt, snapshot: continuityState })
        : undefined;

      if (!options?.runtimeSeed) {
        this.deps.sessionManager.persistUserPromptBarrier(sessionId, prompt);
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
        promptForModel,
        signal,
        options?.runtimeSeed,
        continuityState,
        options?.attachments,
        continuityContext,
      );
      const events = Symbol.asyncIterator in run ? run : run.events;
      this.currentInput = Symbol.asyncIterator in run ? undefined : run.input;
      sourceEntryId = Symbol.asyncIterator in run ? undefined : run.sourceEntryId;
      for await (const event of events) {
        if (!enteredQueryPhase) {
          enteredQueryPhase = true;
          this.deps.sessionManager.markTurnActive(sessionId);
        }
        this.deps.sessionManager.appendQueryEvent(sessionId, event, sourceEntryId ? { entryId: sourceEntryId() } : undefined);
        updateRuntimeEventDigest(eventDigest, event);
        for (const observer of this.eventObservers) observer(event);
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
            sawTerminalEvent = true;
            break;
          case "query.failed":
            sawTerminalEvent = true;
            throw new Error(event.error);
          default:
            break;
        }
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

      if (!sawTerminalEvent) {
        throw new Error("Query runtime ended without a terminal event");
      }

      if (terminalState.terminalStatus === "completed") {
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
      this.currentRunController = null;
      this.currentInput = undefined;
      return terminalState.finalOutput;
    } catch (error) {
      if (signal.aborted) {
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: "lifecycle.cancelled",
          reason: "AbortSignal triggered during shell session runtime",
        }, { entryId: sourceEntryId?.() });
        this.deps.sessionManager.saveInterrupted(
          sessionId,
          enteredQueryPhase ? "turn" : "prompt",
        );
        this.stateMachine.interruptRun();
      } else {
        const errorSave = projectRuntimeFailureSessionSave({
          error,
          lastContinuationReason: terminalState.lastContinuationReason,
        });
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: "lifecycle.error",
          error: errorSave.error,
        }, { entryId: sourceEntryId?.() });
        this.deps.sessionManager.saveError(
          sessionId,
          errorSave.error,
          errorSave.options,
        );
        this.stateMachine.failRun();
      }
      this.currentRunController = null;
      this.currentInput = undefined;
      throw error;
    }
  }

  cancelCurrentRun(): void {
    this.currentRunController?.abort();
    this.stateMachine.interruptRun();
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
    if (this.stateMachine.getState() === "running") return { status: "busy" };
    const controller = new AbortController();
    this.currentRunController = controller;
    try {
      return await this.deps.compactHistory(sessionId, controller.signal, instructions);
    } finally {
      if (this.currentRunController === controller) this.currentRunController = null;
    }
  }

  /**
   * Condense turns the user stepped back past.
   *
   * Returns nothing rather than failing when no provider can summarize: the
   * rewind itself is the user's decision and must not depend on a summary
   * being available.
   */
  async summarizeAbandonedTurns(messages: readonly SessionMessage[]): Promise<string | undefined> {
    if (!this.deps.summarizeAbandonedTurns) return undefined;
    return this.deps.summarizeAbandonedTurns(messages);
  }

  terminate(sessionId: string): void {
    this.stateMachine.terminate();
    this.deps.sessionManager.saveTerminated(sessionId);
  }
}
