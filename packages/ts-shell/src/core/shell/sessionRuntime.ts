import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  SessionContinuitySnapshot,
  SessionManager,
} from "../../session/SessionManager.js";
import type { CompactLiveCheckpointStore } from "../context/compact/checkpoint/compactLiveCheckpoint.js";
import type { CompactInjectionStateStore } from "../context/compact/injection/compactInjectionState.js";
import type { ProjectMemoryInjectionStateStore } from "../context/memory/projectMemoryInjectionState.js";
import type { ProjectMemoryStore } from "../context/memory/projectMemoryStoreContract.js";
import type { QueryEvent } from "../query/runtime/events.js";
import type { QueryRuntimeStateSeed } from "../query/runtime/state.js";
import {
  createRuntimeEventDigest,
  renderSessionQueryEventSurface,
  type RuntimeEventDigest,
  updateRuntimeEventDigest,
} from "./sessionEventSurface.js";
import { buildPromptWithFutureTurnInjections } from "./sessionFutureTurnProjection.js";
import {
  projectAssistantTurnPersistence,
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

export interface SessionRuntimeDependencies {
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runPrompt: (
    prompt: string,
    signal: AbortSignal,
    runtimeSeed?: QueryRuntimeStateSeed,
    continuityState?: SessionContinuitySnapshot,
  ) => AsyncIterable<QueryEvent>;
  readonly compactCheckpointStore?: CompactLiveCheckpointStore;
  readonly compactInjectionStateStore?: CompactInjectionStateStore;
  readonly projectMemoryInjectionStateStore?: ProjectMemoryInjectionStateStore;
  readonly projectMemoryStore?: ProjectMemoryStore;
}

export type QueryEventObserver = (event: QueryEvent) => void;

export class ShellSessionRuntime {
  private readonly deps: SessionRuntimeDependencies;
  private readonly stateMachine = new ShellStateMachine();
  private readonly eventObservers = new Set<QueryEventObserver>();
  private currentRunController: AbortController | null = null;
  private viewMode: "compact" | "verbose" = "compact";
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

  async executePrompt(
    sessionId: string,
    prompt: string,
    options?: {
      runtimeSeed?: QueryRuntimeStateSeed;
      continuityState?: SessionContinuitySnapshot;
      outputMode?: "interactive" | "print";
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

      for await (const event of this.deps.runPrompt(
        promptForModel,
        signal,
        options?.runtimeSeed,
        continuityState,
      )) {
        if (!enteredQueryPhase) {
          enteredQueryPhase = true;
          this.deps.sessionManager.markTurnActive(sessionId);
        }
        this.deps.sessionManager.appendQueryEvent(sessionId, event);
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

      const assistantTurn = projectAssistantTurnPersistence(terminalState);
      if (assistantTurn) {
        this.deps.sessionManager.addTurn(sessionId, assistantTurn);
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
      return terminalState.finalOutput;
    } catch (error) {
      if (signal.aborted) {
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: "lifecycle.cancelled",
          reason: "AbortSignal triggered during shell session runtime",
        });
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
        });
        this.deps.sessionManager.saveError(
          sessionId,
          errorSave.error,
          errorSave.options,
        );
        this.stateMachine.failRun();
      }
      this.currentRunController = null;
      throw error;
    }
  }

  cancelCurrentRun(): void {
    this.currentRunController?.abort();
    this.stateMachine.interruptRun();
  }

  terminate(sessionId: string): void {
    this.stateMachine.terminate();
    this.deps.sessionManager.saveTerminated(sessionId);
  }
}
