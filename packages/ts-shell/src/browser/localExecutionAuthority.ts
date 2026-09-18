import type { BrowserExecutorKind } from "./executor.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import type { BrowserLocalFixture } from "./localFixture.js";

export type BrowserLocalExecutionMode =
  | "disabled"
  | "fake-test"
  | "local-fixture"
  | "explicit-local"
  | "future-external";

export type BrowserLocalExecutionDecisionStatus =
  | "allowed"
  | "blocked-disabled"
  | "blocked-nonlocal"
  | "blocked-missing-fixture"
  | "blocked-unsafe-action"
  | "blocked-confirmation-required"
  | "future-external-required";

export interface BrowserLocalExecutionAuthority {
  readonly mode: BrowserLocalExecutionMode;
  readonly allowedFixtureIds: readonly string[];
  readonly evidence: readonly string[];
}

export interface BrowserLocalExecutionDecision {
  readonly status: BrowserLocalExecutionDecisionStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserLocalExecutionAuthority(
  input: Partial<BrowserLocalExecutionAuthority> = {},
): BrowserLocalExecutionAuthority {
  const mode = input.mode ?? "disabled";
  return {
    mode,
    allowedFixtureIds: input.allowedFixtureIds ?? [],
    evidence: [
      ...(input.evidence ?? []),
      "browser-local-execution-authority:deterministic",
      "browser-local-execution-authority:default-deny",
      "browser-local-execution-authority:no-external-network",
    ],
  };
}

export function decideBrowserLocalExecutionAuthority(input: {
  readonly request: BrowserExecutionRequest;
  readonly authority?: BrowserLocalExecutionAuthority;
  readonly executorKind: BrowserExecutorKind;
  readonly fixture?: BrowserLocalFixture;
}): BrowserLocalExecutionDecision {
  const authority = input.authority ?? createBrowserLocalExecutionAuthority();
  if (authority.mode === "disabled") {
    return decision("blocked-disabled", authority, {
      reason: "Local browser execution authority is disabled.",
      nextAction: "Inject local-fixture authority before bounded local execution.",
    });
  }
  if (isUnsafeAction(input.request.actionKind)) {
    return decision("blocked-unsafe-action", authority, {
      reason: `Browser action ${input.request.actionKind} is blocked for local execution.`,
      nextAction: "Keep auth, payment, destructive, upload, download, and screenshot actions blocked.",
    });
  }
  if (input.request.actionKind === "click" || input.request.actionKind === "type") {
    return decision("blocked-confirmation-required", authority, {
      reason: "State-changing browser actions require a later confirmation route.",
      nextAction: "Use observe/extract local fixture execution only in this route.",
    });
  }
  if (authority.mode === "future-external") {
    return decision("future-external-required", authority, {
      reason: "External browser execution remains deferred.",
      nextAction: "Keep external targets blocked until a later external-network opt-in route.",
    });
  }
  if (authority.mode === "fake-test") {
    return decision(input.executorKind === "fake-test" ? "allowed" : "blocked-nonlocal", authority, {
      reason: input.executorKind === "fake-test"
        ? "Fake/test authority allows the fake executor."
        : "Fake/test authority cannot run a non-fake executor.",
      nextAction: "Use a matching fake/test executor or local-fixture authority.",
    });
  }
  if (authority.mode === "local-fixture") {
    if (!input.fixture) {
      return decision("blocked-missing-fixture", authority, {
        reason: "Local fixture execution requires a deterministic fixture.",
        nextAction: "Inject a local fixture with bounded safe summaries.",
      });
    }
    if (
      authority.allowedFixtureIds.length > 0 &&
      !authority.allowedFixtureIds.includes(input.fixture.fixtureId)
    ) {
      return decision("blocked-missing-fixture", authority, {
        reason: `Fixture ${input.fixture.fixtureId} is not allowed by local authority.`,
        nextAction: "Use an explicitly allowed local fixture id.",
      });
    }
    if (!input.fixture.allowedActions.includes(actionForFixture(input.request.actionKind))) {
      return decision("blocked-unsafe-action", authority, {
        reason: `Fixture ${input.fixture.fixtureId} does not allow ${input.request.actionKind}.`,
        nextAction: "Use a fixture scoped to the requested read-only browser action.",
      });
    }
    return decision("allowed", authority, {
      reason: "Local fixture authority allows this bounded browser action.",
      nextAction: "Execute only against sanitized local fixture evidence.",
    });
  }
  return decision("allowed", authority, {
    reason: "Explicit local authority is represented for future local runtime work.",
    nextAction: "Continue only after sandbox and fixture gates pass.",
  });
}

function isUnsafeAction(actionKind: BrowserExecutionRequest["actionKind"]): boolean {
  return ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(actionKind);
}

function actionForFixture(
  actionKind: BrowserExecutionRequest["actionKind"],
): BrowserLocalFixture["allowedActions"][number] {
  if (actionKind === "navigate") {
    return "navigate-local";
  }
  if (actionKind === "extract") {
    return "extract";
  }
  return "observe";
}

function decision(
  status: BrowserLocalExecutionDecisionStatus,
  authority: BrowserLocalExecutionAuthority,
  input: {
    readonly reason: string;
    readonly nextAction: string;
  },
): BrowserLocalExecutionDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...authority.evidence,
      `browser-local-execution-authority:decision:${status}`,
    ],
  };
}
