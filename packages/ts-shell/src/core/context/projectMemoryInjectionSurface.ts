import type { ProjectMemoryInjectionState } from "./projectMemoryInjectionState.js";

export interface ProjectMemoryInjectionSurfaceInput {
  readonly outcome: "staged" | "blocked" | "status";
  readonly state: ProjectMemoryInjectionState;
  readonly blocker?: string;
}

export function renderProjectMemoryInjectionSurface(
  input: ProjectMemoryInjectionSurfaceInput,
): string {
  return [
    "Project memory use",
    "Result",
    `- Outcome: ${input.outcome}`,
    ...(input.blocker ? [`- BlockerKind: memory-use-blocked`, `- Reason: ${safeLine(input.blocker)}`] : []),
    `- Injection status: ${input.state.injectionStatus}`,
    `- Injection id: ${input.state.memoryInjectionId ?? "none"}`,
    `- Mode: ${input.state.mode ?? "none"}`,
    `- Query: ${input.state.query ? safeLine(input.state.query) : "none"}`,
    `- Records selected: ${input.state.recordIds.length}`,
    `- Source: ${input.state.sourceCommand ?? "none"}`,
    "- Provider/model call: none",
    "- Persistence: none",
    "- Startup auto-load: not enabled",
    "- Auto-injected: no",
    "- Future-turn injection: explicit staged use only",
    "",
    "Warnings",
    ...warningLines(input.state),
    "",
    "Next action",
    nextAction(input),
  ].join("\n");
}

function warningLines(state: ProjectMemoryInjectionState): readonly string[] {
  const values = [
    ...state.warnings.map((warning) => `${warning.id}: ${warning.message}`),
    ...state.redactions.map((redaction) => `redaction:${redaction}`),
  ];
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${safeLine(value)}`);
}

function nextAction(input: ProjectMemoryInjectionSurfaceInput): string {
  if (input.outcome === "blocked") {
    return "- Save approved memories first, then retry /memory use or /memory use <query>.";
  }
  if (input.state.injectionStatus === "pending") {
    return "- Send the next normal prompt to inject this memory context once.";
  }
  if (input.state.injectionStatus === "consumed") {
    return "- Run /memory use again to stage fresh memory context.";
  }
  return "- Use /memory wake, /memory recall <query>, or /memory use.";
}

function safeLine(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED]")
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]")
    .replace(/\s+/g, " ")
    .trim();
}
