import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";

export type ProviderPromptAuditStatus = "pass" | "fail";
export type ProviderPromptSizeClass = "small" | "medium" | "large" | "over-budget";

export interface ProviderPromptAudit {
  readonly auditId: string;
  readonly status: ProviderPromptAuditStatus;
  readonly contextBudgetStatus: "within-budget" | "over-budget";
  readonly targetCoverage: "present" | "missing";
  readonly analysisEvidenceCoverage: "present" | "missing";
  readonly hiddenContentExclusion: "confirmed" | "risk";
  readonly secretRedaction: "confirmed" | "risk";
  readonly providerConfigExclusion: "confirmed" | "risk";
  readonly promptSizeClass: ProviderPromptSizeClass;
  readonly omittedContextReasons: readonly string[];
  readonly verificationExpectationPresence: "present" | "missing";
  readonly safetyConstraintsPresence: "present" | "missing";
  readonly blockedReasons: readonly string[];
  readonly summary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\/home\/wang\/\.private-agents-real/i,
  /private_agents_real_home/i,
  /authorization:\s*bearer\s+[a-z0-9._-]+/i,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\s*[:=]\s*[a-z0-9._-]{8,}/i,
  /-----begin (?:open)?ssh private key-----/i,
];

const HIDDEN_CONTENT_PATTERNS: readonly RegExp[] = [
  /hidden (?:chain[- ]of[- ]thought|reasoning)/i,
  /raw unbounded file/i,
  /full workspace dump/i,
  /browser\/page content/i,
];

export function auditProviderPrompt(input: {
  readonly requestId: string;
  readonly promptContext: ContextAwareProviderPromptContext;
  readonly maxPromptChars?: number;
}): ProviderPromptAudit {
  const maxPromptChars = input.maxPromptChars ?? 8000;
  const prompt = input.promptContext.providerPrompt;
  const secretRisk = SECRET_PATTERNS.some((pattern) => pattern.test(prompt));
  const hiddenContentRisk = HIDDEN_CONTENT_PATTERNS.some((pattern) =>
    pattern.test(prompt),
  );
  const privateConfigRisk =
    /\/home\/wang\/\.private-agents-real|private_agents_real_home/i.test(prompt);
  const blockedReasons = [
    ...(prompt.length > maxPromptChars ? ["prompt-over-budget"] : []),
    ...(secretRisk ? ["secret-or-private-config-risk"] : []),
    ...(hiddenContentRisk ? ["hidden-or-raw-content-risk"] : []),
    ...(input.promptContext.target.pathLabel ? [] : ["missing-target"]),
    ...(input.promptContext.analysisBriefId ? [] : ["missing-analysis-brief"]),
    ...(input.promptContext.verificationExpectation === "review-before-apply" ? [] : ["missing-verification-expectation"]),
    ...(input.promptContext.mutationAuthority === "not-granted" ? [] : ["missing-no-write-constraint"]),
  ];
  const status: ProviderPromptAuditStatus = blockedReasons.length ? "fail" : "pass";
  const promptSizeClass = classifyPromptSize(prompt.length, maxPromptChars);
  const auditId = [
    "provider_prompt_audit",
    input.requestId,
    status,
    promptSizeClass,
    input.promptContext.contextPacketId,
    input.promptContext.agentPlanId,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const summary = [
    `provider-prompt-audit ${auditId}`,
    `status=${status}`,
    `size=${promptSizeClass}`,
    `target=${input.promptContext.target.pathLabel || "missing"}`,
    `analysis=${input.promptContext.analysisBriefId ?? "missing"}`,
    `omitted=${input.promptContext.omittedContentReasons.length}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    auditId,
    status,
    contextBudgetStatus: prompt.length > maxPromptChars ? "over-budget" : "within-budget",
    targetCoverage: input.promptContext.target.pathLabel ? "present" : "missing",
    analysisEvidenceCoverage: input.promptContext.analysisBriefId ? "present" : "missing",
    hiddenContentExclusion: hiddenContentRisk ? "risk" : "confirmed",
    secretRedaction: secretRisk ? "risk" : "confirmed",
    providerConfigExclusion: privateConfigRisk ? "risk" : "confirmed",
    promptSizeClass,
    omittedContextReasons: input.promptContext.omittedContentReasons,
    verificationExpectationPresence: input.promptContext.verificationExpectation === "review-before-apply" ? "present" : "missing",
    safetyConstraintsPresence: input.promptContext.mutationAuthority === "not-granted" ? "present" : "missing",
    blockedReasons,
    summary,
    mutationAuthority: "not-granted",
    evidence: [
      `provider-prompt-audit:id:${auditId}`,
      `provider-prompt-audit:status:${status}`,
      `provider-prompt-audit:size:${promptSizeClass}`,
      `provider-prompt-audit:context-budget:${prompt.length > maxPromptChars ? "over-budget" : "within-budget"}`,
      `provider-prompt-audit:target:${input.promptContext.target.pathLabel ? "present" : "missing"}`,
      `provider-prompt-audit:analysis:${input.promptContext.analysisBriefId ? "present" : "missing"}`,
      `provider-prompt-audit:redaction:${status === "pass" ? "confirmed" : "risk"}`,
      "provider-prompt-audit:provider-config-excluded",
      "provider-prompt-audit:hidden-content-excluded",
      "provider-prompt-audit:mutation-authority:not-granted",
    ],
  };
}

function classifyPromptSize(length: number, maxPromptChars: number): ProviderPromptSizeClass {
  if (length > maxPromptChars) return "over-budget";
  if (length > maxPromptChars * 0.75) return "large";
  if (length > maxPromptChars * 0.35) return "medium";
  return "small";
}
