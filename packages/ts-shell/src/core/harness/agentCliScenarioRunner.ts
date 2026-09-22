import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  evaluateAgentCliAssertion,
  runAgentCliSafetyChecks,
  selectCliProcessForAssertion,
} from "./agentCliScenarioAssertions.js";
import {
  buildProjectCliProcessSpec,
  runAgentCliProcess,
} from "./agentCliProcess.js";
import {
  deterministicCliScenarioTimestamp,
  mergeCliEvidence,
  type AgentCliAssertionResult,
  type AgentCliScenario,
  type AgentCliScenarioResult,
  type AgentCliScenarioStatus,
  type AgentCliScenarioStepResult,
} from "./agentCliScenarioModel.js";

export interface RunAgentCliScenarioInput {
  readonly scenario: AgentCliScenario;
  readonly projectPath: string;
  readonly homeDir?: string;
  readonly cwd?: string;
  readonly now?: () => string;
}

export async function runAgentCliScenario(
  input: RunAgentCliScenarioInput,
): Promise<AgentCliScenarioResult> {
  const now = input.now ?? (() => deterministicCliScenarioTimestamp());
  const homeDir =
    input.homeDir ??
    fs.mkdtempSync(path.join(os.tmpdir(), "cheers-cli-scenario-home-"));
  const startedAt = now();
  const steps: AgentCliScenarioStepResult[] = [];
  const assertions: AgentCliAssertionResult[] = [];
  const safetyChecks: AgentCliAssertionResult[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const step of input.scenario.steps) {
    const process = await runAgentCliProcess(
      buildProjectCliProcessSpec({
        prompt: step.prompt,
        projectPath: input.projectPath,
        homeDir,
        cwd: step.cwd ?? input.cwd,
        timeoutMs: step.timeoutMs,
        args: step.args,
        env: step.env,
      }),
    );
    const stepAssertions = [
      evaluateAgentCliAssertion({
        assertion: {
          id: `${step.id}:exit-code`,
          kind: "exit-code",
          expectedExit: step.expectedExit ?? { kind: "code", code: 0 },
        },
        process,
      }),
      ...(step.assertions ?? []).map((assertion) =>
        evaluateAgentCliAssertion({ assertion, process }),
      ),
    ];
    const stepSafetyChecks = runAgentCliSafetyChecks(process);
    const stepBlockers = [
      ...stepAssertions,
      ...stepSafetyChecks,
    ]
      .filter((assertion) => assertion.status !== "passed")
      .map((assertion) => assertion.message);
    const status = stepStatus(process, stepBlockers);
    const result: AgentCliScenarioStepResult = {
      stepId: step.id,
      status,
      process,
      assertions: stepAssertions,
      evidence: [
        ...process.evidence,
        `agent-cli-scenario-runner:step:${step.id}`,
      ],
      warnings: process.warnings,
      blockers: stepBlockers,
    };
    steps.push(result);
    assertions.push(...stepAssertions);
    safetyChecks.push(...stepSafetyChecks);
    warnings.push(...process.warnings);
    blockers.push(...stepBlockers);
    if (
      status !== "passed" &&
      step.critical !== false &&
      input.scenario.continueOnFailure !== true
    ) {
      break;
    }
  }

  for (const assertion of input.scenario.expectedOutcome?.assertions ?? []) {
    const process = selectCliProcessForAssertion(assertion, steps);
    if (!process) {
      const result: AgentCliAssertionResult = {
        assertionId: assertion.id,
        kind: assertion.kind,
        status: "failed",
        message: "No CLI process result was available for assertion.",
        evidence: ["agent-cli-scenario-assertions:missing-process"],
      };
      assertions.push(result);
      blockers.push(result.message);
      continue;
    }
    const result = evaluateAgentCliAssertion({ assertion, process });
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
  return {
    scenarioId: input.scenario.id,
    name: input.scenario.name,
    status,
    startedAt,
    finishedAt: now(),
    steps,
    assertions,
    safetyChecks,
    evidence: mergeCliEvidence([
      steps.flatMap((step) => step.evidence),
      assertions.flatMap((assertion) => assertion.evidence),
      safetyChecks.flatMap((check) => check.evidence),
      [
        "agent-cli-scenario-runner:real-cli-child-process",
        "agent-cli-scenario-runner:no-provider-model-call",
        "agent-cli-scenario-runner:no-browser-launch",
      ],
    ]),
    warnings: Array.from(new Set(warnings)),
    blockers: Array.from(new Set(blockers)),
    nextAction: extractNextAction(steps),
    redactions: Array.from(
      new Set(steps.flatMap((step) => step.process.redactions)),
    ),
  };
}

function stepStatus(
  process: { readonly timedOut: boolean; readonly exitCode: number | null },
  blockers: readonly string[],
): AgentCliScenarioStatus {
  if (process.timedOut) {
    return "blocked";
  }
  if (blockers.length > 0) {
    return "failed";
  }
  return "passed";
}

function finalStatus(input: {
  readonly expectedStatus?: AgentCliScenarioStatus;
  readonly steps: readonly AgentCliScenarioStepResult[];
  readonly assertions: readonly AgentCliAssertionResult[];
  readonly safetyChecks: readonly AgentCliAssertionResult[];
  readonly blockers: readonly string[];
}): AgentCliScenarioStatus {
  if (input.steps.some((step) => step.status === "blocked")) {
    return "blocked";
  }
  if (
    input.blockers.length > 0 ||
    [...input.assertions, ...input.safetyChecks].some(
      (assertion) => assertion.status !== "passed",
    )
  ) {
    return "failed";
  }
  return input.expectedStatus ?? "passed";
}

function extractNextAction(
  steps: readonly AgentCliScenarioStepResult[],
): string | undefined {
  for (const step of [...steps].reverse()) {
    const match = step.process.output.combined.match(
      /(?:DoNext|Next action):?\s*(.+)$/im,
    );
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}
