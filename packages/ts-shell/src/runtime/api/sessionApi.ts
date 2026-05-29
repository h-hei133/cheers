import type { RuntimeEvidenceSavePoint } from "../../evidence/runtimeSavePoint.js";
import type { RuntimeResultFactsProjection } from "../events/runtimeEventProjection.js";
import type { RuntimeProjectionEvent } from "../events/runtimeEventProjection.js";
import {
  projectJsonRuntimeEventStream,
  type JsonRuntimeEventStreamEntry,
} from "../events/jsonEventStream.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";

export type RuntimeSessionOperation =
  | "start-session"
  | "submit-prompt"
  | "observe-events"
  | "abort"
  | "stop"
  | "get-session-projection"
  | "get-result-projection"
  | "get-capabilities";

export interface RuntimeSessionApiCapabilities {
  readonly startSession: "available" | "not-supported";
  readonly submitPrompt: "available" | "not-supported";
  readonly observeEvents: "available";
  readonly abort: "available" | "not-supported";
  readonly stop: "available" | "not-supported";
  readonly getSessionProjection: "available" | "not-supported";
  readonly getResultProjection: "available" | "not-supported";
  readonly sdkPackage: "not-provided";
  readonly rpcServer: "not-provided";
  readonly tuiHost: "not-provided";
}

export interface RuntimeSessionApiContract {
  readonly ownerDomain: "runtime";
  readonly hostBoundary: "host-neutral-api";
  readonly cliRole: "host-adapter";
  readonly operations: readonly RuntimeSessionOperation[];
  readonly capabilities: RuntimeSessionApiCapabilities;
  readonly redaction: {
    readonly status: "report-safe";
    readonly excluded: readonly string[];
  };
  readonly truthfulness: {
    readonly observationOnly: true;
    readonly terminalSuccessClaim: false;
    readonly successOwner: "evidence-result-verdict";
  };
  readonly notProvenClaims: readonly string[];
}

export interface RuntimeSessionApiOperationProjection {
  readonly operation: RuntimeSessionOperation;
  readonly status: "accepted" | "not-supported";
  readonly sessionIdentity?: string;
  readonly eventStream?: readonly JsonRuntimeEventStreamEntry[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly resultProjection?: RuntimeResultFactsProjection;
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface RuntimeSessionApiDriver {
  readonly startSession?: () => Promise<{ readonly sessionIdentity: string }>;
  readonly submitPrompt?: (input: {
    readonly sessionIdentity: string;
    readonly prompt: string;
  }) => Promise<{
    readonly sessionIdentity: string;
    readonly events?: readonly RuntimeProjectionEvent[];
    readonly savePoint?: RuntimeEvidenceSavePoint;
  }>;
  readonly abort?: (sessionIdentity: string) => Promise<void>;
  readonly stop?: (sessionIdentity: string) => Promise<void>;
  readonly getSessionProjection?: (
    sessionIdentity: string,
  ) => SessionTreeProjection | undefined;
  readonly getResultProjection?: (
    sessionIdentity: string,
  ) => RuntimeResultFactsProjection | undefined;
  readonly getEvents?: (
    sessionIdentity: string,
  ) => readonly RuntimeProjectionEvent[];
}

export interface RuntimeSessionApi {
  readonly contract: RuntimeSessionApiContract;
  readonly getCapabilities: () => RuntimeSessionApiOperationProjection;
  readonly startSession: () => Promise<RuntimeSessionApiOperationProjection>;
  readonly submitPrompt: (input: {
    readonly sessionIdentity: string;
    readonly prompt: string;
  }) => Promise<RuntimeSessionApiOperationProjection>;
  readonly observeEvents: (
    sessionIdentity: string,
  ) => RuntimeSessionApiOperationProjection;
  readonly abort: (
    sessionIdentity: string,
  ) => Promise<RuntimeSessionApiOperationProjection>;
  readonly stop: (
    sessionIdentity: string,
  ) => Promise<RuntimeSessionApiOperationProjection>;
  readonly getSessionProjection: (
    sessionIdentity: string,
  ) => RuntimeSessionApiOperationProjection;
  readonly getResultProjection: (
    sessionIdentity: string,
  ) => RuntimeSessionApiOperationProjection;
}

export function createRuntimeSessionApi(input: {
  readonly driver?: RuntimeSessionApiDriver;
} = {}): RuntimeSessionApi {
  const driver = input.driver ?? {};
  const contract = projectRuntimeSessionApiContract({ driver });

  return {
    contract,
    getCapabilities: () =>
      projectOperation({
        operation: "get-capabilities",
        status: "accepted",
        notProvenClaims: contract.notProvenClaims,
      }),
    startSession: async () => {
      if (!driver.startSession) {
        return unsupported("start-session");
      }
      const started = await driver.startSession();
      return projectOperation({
        operation: "start-session",
        status: "accepted",
        sessionIdentity: sanitizeText(started.sessionIdentity),
      });
    },
    submitPrompt: async (promptInput) => {
      if (!driver.submitPrompt) {
        return unsupported("submit-prompt", promptInput.sessionIdentity);
      }
      const result = await driver.submitPrompt(promptInput);
      return projectOperation({
        operation: "submit-prompt",
        status: "accepted",
        sessionIdentity: sanitizeText(result.sessionIdentity),
        eventStream: projectJsonRuntimeEventStream({
          events: result.events ?? [],
          streamId: result.sessionIdentity,
        }),
        savePoint: result.savePoint,
        notProvenClaims: ["terminal-success", "prompt-task-success"],
      });
    },
    observeEvents: (sessionIdentity) =>
      projectOperation({
        operation: "observe-events",
        status: "accepted",
        sessionIdentity: sanitizeText(sessionIdentity),
        eventStream: projectJsonRuntimeEventStream({
          events: driver.getEvents?.(sessionIdentity) ?? [],
          streamId: sessionIdentity,
        }),
        notProvenClaims: ["terminal-success", "runtime-event-completeness"],
      }),
    abort: async (sessionIdentity) => {
      if (!driver.abort) {
        return unsupported("abort", sessionIdentity);
      }
      await driver.abort(sessionIdentity);
      return projectOperation({
        operation: "abort",
        status: "accepted",
        sessionIdentity: sanitizeText(sessionIdentity),
        notProvenClaims: ["terminal-success", "abort-completion"],
      });
    },
    stop: async (sessionIdentity) => {
      if (!driver.stop) {
        return unsupported("stop", sessionIdentity);
      }
      await driver.stop(sessionIdentity);
      return projectOperation({
        operation: "stop",
        status: "accepted",
        sessionIdentity: sanitizeText(sessionIdentity),
        notProvenClaims: ["terminal-success", "stop-completion"],
      });
    },
    getSessionProjection: (sessionIdentity) => {
      const sessionProjection = driver.getSessionProjection?.(sessionIdentity);
      return projectOperation({
        operation: "get-session-projection",
        status: sessionProjection ? "accepted" : "not-supported",
        sessionIdentity: sanitizeText(sessionIdentity),
        sessionProjection,
        notProvenClaims: ["terminal-success", "session-projection-success"],
      });
    },
    getResultProjection: (sessionIdentity) => {
      const resultProjection = driver.getResultProjection?.(sessionIdentity);
      return projectOperation({
        operation: "get-result-projection",
        status: resultProjection ? "accepted" : "not-supported",
        sessionIdentity: sanitizeText(sessionIdentity),
        resultProjection,
        notProvenClaims: ["terminal-success"],
      });
    },
  };
}

export function projectRuntimeSessionApiContract(input: {
  readonly driver?: RuntimeSessionApiDriver;
} = {}): RuntimeSessionApiContract {
  const driver = input.driver ?? {};
  return deepFreeze({
    ownerDomain: "runtime",
    hostBoundary: "host-neutral-api",
    cliRole: "host-adapter",
    operations: [
      "start-session",
      "submit-prompt",
      "observe-events",
      "abort",
      "stop",
      "get-session-projection",
      "get-result-projection",
      "get-capabilities",
    ],
    capabilities: {
      startSession: driver.startSession ? "available" : "not-supported",
      submitPrompt: driver.submitPrompt ? "available" : "not-supported",
      observeEvents: "available",
      abort: driver.abort ? "available" : "not-supported",
      stop: driver.stop ? "available" : "not-supported",
      getSessionProjection: driver.getSessionProjection
        ? "available"
        : "not-supported",
      getResultProjection: driver.getResultProjection
        ? "available"
        : "not-supported",
      sdkPackage: "not-provided",
      rpcServer: "not-provided",
      tuiHost: "not-provided",
    },
    redaction: {
      status: "report-safe",
      excluded: [
        "api-keys",
        "provider.env",
        "raw-provider-output",
        "oldText",
        "newText",
        "unredacted-command-output",
        "hidden-reasoning",
        "full-transcript",
        "unsafe-file-contents",
      ],
    },
    truthfulness: {
      observationOnly: true,
      terminalSuccessClaim: false,
      successOwner: "evidence-result-verdict",
    },
    notProvenClaims: [
      "sdk-package",
      "rpc-server",
      "tui-host",
      "terminal-success",
      "provider-success",
      "tool-success",
      "verification-success",
    ],
  });
}

function unsupported(
  operation: RuntimeSessionOperation,
  sessionIdentity?: string,
): RuntimeSessionApiOperationProjection {
  return projectOperation({
    operation,
    status: "not-supported",
    ...(sessionIdentity ? { sessionIdentity: sanitizeText(sessionIdentity) } : {}),
    notProvenClaims: ["terminal-success", `${operation}-support`],
  });
}

function projectOperation(input: {
  readonly operation: RuntimeSessionOperation;
  readonly status: "accepted" | "not-supported";
  readonly sessionIdentity?: string;
  readonly eventStream?: readonly JsonRuntimeEventStreamEntry[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly resultProjection?: RuntimeResultFactsProjection;
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly notProvenClaims?: readonly string[];
}): RuntimeSessionApiOperationProjection {
  return deepFreeze({
    operation: input.operation,
    status: input.status,
    ...(input.sessionIdentity
      ? { sessionIdentity: sanitizeText(input.sessionIdentity) }
      : {}),
    ...(input.eventStream ? { eventStream: input.eventStream } : {}),
    ...(input.sessionProjection
      ? { sessionProjection: input.sessionProjection }
      : {}),
    ...(input.resultProjection ? { resultProjection: input.resultProjection } : {}),
    ...(input.savePoint ? { savePoint: input.savePoint } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: Array.from(
      new Set(["terminal-success", ...(input.notProvenClaims ?? [])]),
    ),
  });
}

function sanitizeText(input: string): string {
  return input
    .replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]")
    .replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
