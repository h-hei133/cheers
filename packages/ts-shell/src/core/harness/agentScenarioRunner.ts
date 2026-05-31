import { routeSlashCommand } from "../commands/slashRouter.js";
import {
  getCompactInjectionState,
  type CompactInjectionStateStore,
} from "../context/compactInjectionState.js";
import {
  getLatestCompactCheckpoint,
  type CompactLiveCheckpointStore,
} from "../context/compactLiveCheckpoint.js";
import { planCompactFutureTurnInjection } from "../context/compactFutureTurnInjection.js";
import type { ProjectMemoryInjectionStateStore } from "../context/memory/projectMemoryInjectionState.js";
import { planProjectMemoryFutureTurnInjection } from "../context/memory/projectMemoryFutureTurnInjection.js";
import { evaluateAgentScenarioAssertion } from "./agentScenarioAssertions.js";
import { seedProjectMemoryRecord, createValidationEvidenceFixture } from "./agentScenarioFixtures.js";
import {
  mergeScenarioEvidence,
  summarizeScenarioOutput,
  type AgentScenario,
  type AgentScenarioAssertionResult,
  type AgentScenarioContext,
  type AgentScenarioResult,
  type AgentScenarioStatus,
  type AgentScenarioStep,
  type AgentScenarioStepResult,
} from "./agentScenarioModel.js";
import { runAgentScenarioSafetyChecks } from "./agentScenarioSafety.js";

export async function runAgentScenario(input: {
  readonly scenario: AgentScenario;
  readonly context: AgentScenarioContext;
}): Promise<AgentScenarioResult> {
  const startedAt = input.context.now();
  const steps: AgentScenarioStepResult[] = [];
  const assertions: AgentScenarioAssertionResult[] = [];
  const safetyChecks: AgentScenarioAssertionResult[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const step of input.scenario.steps) {
    const result = await runStep(step, input.context, steps);
    steps.push(result);
    assertions.push(...result.assertions);
    warnings.push(...result.warnings);
    blockers.push(...result.blockers);
    if (result.output) {
      const checks = runAgentScenarioSafetyChecks(result.output, {
        expectBrowserExecution:
          input.scenario.metadata?.capability?.includes("browser-fake-execution") === true ||
          input.scenario.metadata?.capability?.includes("browser-local-fixture-execution") === true,
      });
      safetyChecks.push(...checks);
      blockers.push(...checks.filter((check) => check.status !== "passed").map((check) => check.message));
    }
    if (
      result.status !== "passed" &&
      input.scenario.continueOnFailure !== true
    ) {
      break;
    }
  }

  for (const assertion of input.scenario.expectedOutcome?.assertions ?? []) {
    const result = evaluateAgentScenarioAssertion({
      assertion,
      steps,
      sidebarEvents: sidebarEvents(input.context),
    });
    assertions.push(result);
    if (result.status !== "passed") {
      blockers.push(result.message);
    }
  }

  const status = finalStatus({
    expectedStatus: input.scenario.expectedOutcome?.status,
    steps,
    assertions,
    safetyChecks,
    blockers,
  });
  const allEvidence = mergeScenarioEvidence([
    steps.flatMap((step) => step.evidence),
    assertions.flatMap((assertion) => assertion.evidence),
    safetyChecks.flatMap((check) => check.evidence),
    [
      "agent-scenario-runner:no-provider-call",
      input.scenario.metadata?.capability?.includes("browser-fake-execution") === true
        ? "agent-scenario-runner:fake-browser-execution-only"
        : input.scenario.metadata?.capability?.includes("browser-local-fixture-execution") === true
          ? "agent-scenario-runner:local-fixture-browser-execution-only"
        : "agent-scenario-runner:no-browser-execution",
    ],
  ]);
  return {
    scenarioId: input.scenario.id,
    name: input.scenario.name,
    status,
    startedAt,
    finishedAt: input.context.now(),
    steps,
    outputs: steps.map((step) =>
      summarizeScenarioOutput({
        stepId: step.stepId,
        kind: step.kind,
        output: step.output,
      }),
    ),
    assertions,
    safetyChecks,
    sidebarEvents: sidebarEvents(input.context),
    evidence: allEvidence,
    warnings,
    blockers: Array.from(new Set(blockers)),
    nextAction: extractNextAction(steps),
    redactions: Array.from(new Set(sidebarEvents(input.context).flatMap((event) => event.redactions))),
  };
}

async function runStep(
  step: AgentScenarioStep,
  context: AgentScenarioContext,
  previousSteps: readonly AgentScenarioStepResult[],
): Promise<AgentScenarioStepResult> {
  if (step.kind === "command") {
    const commandResult = await routeSlashCommand(step.input, context.commandContext);
    const output = commandResult?.kind === "local" ? commandResult.output : renderNonLocalCommand(commandResult);
    return stepResult({
      step,
      status: commandResult ? "passed" : "blocked",
      output,
      commandResult,
      evidence: [
        "agent-scenario-runner:slash-command",
        ...classifyCommandEvidence(step.input, output),
      ],
      blockers: commandResult ? [] : [`Command ${step.input} did not route.`],
    });
  }
  if (step.kind === "simulated-user-turn") {
    const result = await runSimulatedUserTurn(context, step.maxCompactContextChars, step.maxMemoryContextChars);
    return stepResult({
      step,
      status: "passed",
      output: result.output,
      evidence: result.evidence,
      warnings: result.warnings,
      blockers: result.blockers,
    });
  }
  if (step.kind === "assertion") {
    const assertion = evaluateAgentScenarioAssertion({
      assertion: step.assertion,
      steps: previousSteps,
      sidebarEvents: sidebarEvents(context),
    });
    return stepResult({
      step,
      status: assertion.status,
      output: assertion.message,
      assertions: [assertion],
      evidence: assertion.evidence,
      blockers: assertion.status === "passed" ? [] : [assertion.message],
    });
  }
  if (step.kind === "fixture") {
    if (step.fixture === "seed-memory-record") {
      const record = await seedProjectMemoryRecord(context, { id: step.recordId });
      return stepResult({
        step,
        status: "passed",
        output: `Fixture\n- Memory record: ${record.id}\n- Validation status: ready`,
        evidence: ["agent-scenario-fixture:seed-memory-record"],
      });
    }
    if (step.fixture === "validation-evidence") {
      return stepResult({
        step,
        status: "passed",
        output: "Fixture\n- Validation status: present",
        evidence: createValidationEvidenceFixture(),
      });
    }
    return stepResult({
      step,
      status: "passed",
      output: "Fixture\n- Route metadata: present",
      evidence: ["agent-scenario-fixture:route-metadata"],
    });
  }
  return stepResult({
    step,
    status: "passed",
    output: `Checkpoint\n- Next action: ${step.label}`,
    evidence: ["agent-scenario-runner:checkpoint"],
  });
}

async function runSimulatedUserTurn(
  context: AgentScenarioContext,
  maxCompactContextChars = 4000,
  maxMemoryContextChars = 4000,
): Promise<{
  readonly output: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
}> {
  const compactStore = context.commandContext.compactCheckpointStore as CompactLiveCheckpointStore | undefined;
  const compactInjectionStore = context.commandContext.compactInjectionStateStore as CompactInjectionStateStore | undefined;
  const memoryInjectionStore = context.commandContext.projectMemoryInjectionStateStore as ProjectMemoryInjectionStateStore | undefined;
  const compactPlan =
    compactStore && compactInjectionStore
      ? planCompactFutureTurnInjection({
          checkpoint: getLatestCompactCheckpoint(compactStore, context.sessionScopeId),
          injectionState: getCompactInjectionState(compactInjectionStore, context.sessionScopeId),
          maxInjectedContextChars: maxCompactContextChars,
          markInjected: compactInjectionStore.markInjected,
          markConsumed: compactInjectionStore.markConsumed,
          markInvalid: compactInjectionStore.markInvalid,
        })
      : undefined;
  const memoryState = memoryInjectionStore?.get(context.sessionScopeId);
  const memoryPlan =
    memoryInjectionStore && memoryState
      ? await planProjectMemoryFutureTurnInjection({
          memoryStore: context.commandContext.projectMemoryStore,
          injectionState: memoryState,
          maxInjectedContextChars: maxMemoryContextChars,
          markInjected: memoryInjectionStore.markInjected,
          markConsumed: memoryInjectionStore.markConsumed,
          markInvalid: memoryInjectionStore.markInvalid,
        })
      : undefined;
  const warnings = [
    ...(compactPlan?.warnings.map((warning) => warning.message) ?? []),
    ...(memoryPlan?.warnings.map((warning) => warning.message) ?? []),
  ];
  return {
    output: [
      "Simulated user turn",
      "- Provider/model call: none",
      "- Browser execution: none",
      `- Compact injected: ${compactPlan?.shouldInject ? "yes" : "no"}`,
      `- Memory injected: ${memoryPlan?.shouldInject ? "yes" : "no"}`,
      "- Memory auto-injection: no",
      "- Startup auto-load: no",
      "- Next action: continue deterministic local scenario",
    ].join("\n"),
    evidence: [
      "agent-scenario-runner:simulated-user-turn",
      ...(compactPlan?.evidence ?? []),
      ...(memoryPlan?.evidence ?? []),
    ],
    warnings,
    blockers: [],
  };
}

function stepResult(input: {
  readonly step: AgentScenarioStep;
  readonly status: AgentScenarioStatus;
  readonly output?: string;
  readonly commandResult?: Awaited<ReturnType<typeof routeSlashCommand>>;
  readonly assertions?: readonly AgentScenarioAssertionResult[];
  readonly evidence?: readonly string[];
  readonly warnings?: readonly string[];
  readonly blockers?: readonly string[];
}): AgentScenarioStepResult {
  return {
    stepId: input.step.id,
    kind: input.step.kind,
    status: input.status,
    output: input.output,
    commandResult: input.commandResult,
    assertions: input.assertions ?? [],
    evidence: input.evidence ?? [],
    warnings: input.warnings ?? [],
    blockers: input.blockers ?? [],
  };
}

function renderNonLocalCommand(
  result: Awaited<ReturnType<typeof routeSlashCommand>>,
): string {
  if (!result) {
    return "";
  }
  if (result.kind === "local") {
    return result.output;
  }
  if (result.kind === "prompt") {
    return result.prompt;
  }
  return [
    "Shell action",
    `- Action: ${result.action}`,
    "- Provider/model call: none",
  ].join("\n");
}

function classifyCommandEvidence(
  input: string,
  output: string,
): readonly string[] {
  const command = input.split(/\s+/)[0] ?? "";
  const evidence = [`agent-scenario-command:${command.replace("/", "") || "unknown"}`];
  if (input.startsWith("/compact") || /Compact v2/i.test(output)) {
    evidence.push("agent-scenario-command:compact-evidence");
  }
  if (input.startsWith("/memory") || /Project memory/i.test(output)) {
    evidence.push("agent-scenario-command:memory-evidence");
  }
  if (input.startsWith("/warmup") || /Startup warm context/i.test(output)) {
    evidence.push("agent-scenario-command:warmup-evidence");
  }
  if (input.startsWith("/browser") || /Browser dry-run/i.test(output)) {
    evidence.push("agent-scenario-command:browser-evidence");
  }
  if (input.startsWith("/sidebar") || /Visible agent state/i.test(output)) {
    evidence.push("agent-scenario-command:sidebar-evidence");
  }
  return evidence;
}

function sidebarEvents(context: AgentScenarioContext) {
  return (
    context.commandContext.sidebarLiveEventStore?.listRecent({
      sessionScopeId: context.sessionScopeId,
      maxEvents: 40,
      includeDeveloperOnly: true,
    }).events ?? []
  );
}

function finalStatus(input: {
  readonly expectedStatus?: AgentScenarioStatus;
  readonly steps: readonly AgentScenarioStepResult[];
  readonly assertions: readonly AgentScenarioAssertionResult[];
  readonly safetyChecks: readonly AgentScenarioAssertionResult[];
  readonly blockers: readonly string[];
}): AgentScenarioStatus {
  if (input.blockers.length > 0) {
    return "failed";
  }
  if (input.steps.some((step) => step.status === "blocked")) {
    return "blocked";
  }
  if (
    [...input.assertions, ...input.safetyChecks].some(
      (assertion) => assertion.status !== "passed",
    )
  ) {
    return "failed";
  }
  return input.expectedStatus ?? "passed";
}

function extractNextAction(steps: readonly AgentScenarioStepResult[]): string | undefined {
  for (const step of [...steps].reverse()) {
    const match = step.output?.match(/(?:DoNext|Next action):\s*(.+)$/im);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}
