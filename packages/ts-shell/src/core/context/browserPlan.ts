import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type BrowserTxnOperationKind =
  | "observe"
  | "extract"
  | "click"
  | "type"
  | "re-observe";

export type BrowserTxnPlanConfidence = "high" | "medium" | "low";

export interface BrowserTxnStepPlan {
  readonly kind: BrowserTxnOperationKind;
  readonly target?: string;
  readonly selector?: string;
  readonly text?: string;
  readonly valueClassification?: "safe-test-text";
  readonly extractionKind?: "visible-text" | "status" | "heading";
}

export interface BrowserTxnPlannerDecision {
  readonly targetSummary: string;
  readonly requiredPolicyLevel: "controlled-local";
  readonly reason: string;
  readonly confidence: BrowserTxnPlanConfidence;
  readonly repairAllowed: boolean;
  readonly evidence: readonly string[];
}

export interface BrowserTxnPlan {
  readonly transactionId: string;
  readonly controlledTarget: string;
  readonly steps: readonly BrowserTxnStepPlan[];
  readonly planner: BrowserTxnPlannerDecision;
  readonly timeoutMs?: number;
}

export function planBrowserTransaction(input: {
  readonly prompt: string;
}): BrowserTxnPlan | undefined {
  const normalized = input.prompt.toLowerCase();
  if (!hasBrowserCue(normalized)) {
    return undefined;
  }

  const publicUrl = extractFirstUrl(input.prompt);
  if (publicUrl && isPublicWebUrl(publicUrl)) {
    return buildPlan({
      controlledTarget: publicUrl,
      steps: [{ kind: "observe", target: "public-web" }],
      reason: "public web browser request routed to transaction policy gate",
      confidence: "medium",
      repairAllowed: false,
      evidence: ["browser-transaction-planner:public-web-policy-test"],
    });
  }

  const controlledTarget = selectFixture(normalized, input.prompt);
  const repairAllowed = /\brepair\b|selector repair|one-step repair|\u4fee\u590d/u.test(normalized);
  const timeoutMs = /timeout|timed out|\u8d85\u65f6/u.test(normalized) ? 250 : undefined;

  if (/\bclick\b|\bpress\b|\u70b9\u51fb/u.test(normalized)) {
    const target = /repair fail|repair failure|unrepairable/i.test(input.prompt)
      ? "Definitely missing"
      : /missing target|target missing|not found|selector repair/i.test(input.prompt)
        ? "Missing target"
        : "Save draft";
    const steps: BrowserTxnStepPlan[] = [
      { kind: "observe", target: "visible-text" },
      { kind: "click", target },
    ];
    if (/stale|re-?observe|\u91cd\u65b0\u89c2\u5bdf/u.test(normalized)) {
      steps.push({ kind: "re-observe", target: "visible-text" });
    }
    steps.push({ kind: "extract", extractionKind: "visible-text", target: "visible-text" });
    return buildPlan({
      controlledTarget,
      steps,
      reason: "controlled local click transaction",
      confidence: "high",
      repairAllowed,
      timeoutMs,
      evidence: ["browser-transaction-planner:click-extract"],
    });
  }

  if (/\btype\b|\benter\b|\bfill\b|\u8f93\u5165/u.test(normalized)) {
    return buildPlan({
      controlledTarget,
      steps: [
        { kind: "observe", target: "visible-text" },
        {
          kind: "type",
          target: "Safe note",
          text: "safe local note",
          valueClassification: "safe-test-text",
        },
        { kind: "extract", extractionKind: "visible-text", target: "visible-text" },
      ],
      reason: "controlled local type transaction",
      confidence: "high",
      repairAllowed,
      timeoutMs,
      evidence: ["browser-transaction-planner:type-extract"],
    });
  }

  if (/\bextract\b|\breport\b|rendered text|visible text|inspect|summarize|\u6587\u672c/u.test(normalized)) {
    return buildPlan({
      controlledTarget,
      steps: [
        { kind: "observe", target: "visible-text" },
        { kind: "extract", extractionKind: "visible-text", target: "visible-text" },
      ],
      reason: "controlled local observe/extract transaction",
      confidence: "high",
      repairAllowed: false,
      timeoutMs,
      evidence: ["browser-transaction-planner:observe-extract"],
    });
  }

  return buildPlan({
    controlledTarget,
    steps: [{ kind: "observe", target: "visible-text" }],
    reason: "browser prompt did not match a controlled transaction template",
    confidence: "low",
    repairAllowed: false,
    timeoutMs,
    evidence: ["browser-transaction-planner:low-confidence"],
  });
}

function buildPlan(input: {
  readonly controlledTarget: string;
  readonly steps: readonly BrowserTxnStepPlan[];
  readonly reason: string;
  readonly confidence: BrowserTxnPlanConfidence;
  readonly repairAllowed: boolean;
  readonly timeoutMs?: number;
  readonly evidence: readonly string[];
}): BrowserTxnPlan {
  const target = sanitizeBrowserText(input.controlledTarget, 180);
  return {
    transactionId: stableTxnId(`${target}|${input.reason}|${input.steps.map((step) => step.kind).join(">")}`),
    controlledTarget: target,
    steps: input.steps,
    planner: {
      targetSummary: target,
      requiredPolicyLevel: "controlled-local",
      reason: sanitizeBrowserText(input.reason, 180),
      confidence: input.confidence,
      repairAllowed: input.repairAllowed,
      evidence: [
        ...input.evidence,
        `browser-transaction-planner:confidence:${input.confidence}`,
        `browser-transaction-planner:repair:${input.repairAllowed ? "allowed" : "disabled"}`,
        "browser-transaction-planner:deterministic",
        "browser-transaction-planner:no-provider-or-model-call",
        "browser-transaction-planner:no-stagehand-planner",
      ],
    },
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  };
}

function hasBrowserCue(normalized: string): boolean {
  return /\bbrowser\b|\bplaywright\b|local fixture|local-fixture|rendered text|\u6d4f\u89c8\u5668/u.test(normalized);
}

function selectFixture(normalized: string, original: string): string {
  if (/repair fail|repair failure|unrepairable/u.test(normalized)) {
    return "local-fixture://txn/target-missing";
  }
  if (/repair|selector repair/u.test(normalized)) {
    return "local-fixture://txn/repair";
  }
  if (/timeout|timed out|\u8d85\u65f6/u.test(normalized)) {
    return "local-fixture://pw/timeout";
  }
  if (/secret|redaction|token|api[_ -]?key/u.test(normalized)) {
    return "local-fixture://pw/redaction";
  }
  if (/js|javascript|rendered/u.test(normalized)) {
    return "local-fixture://pw/js";
  }
  return extractLocalFixture(original) ?? "local-fixture://pw/static";
}

function extractLocalFixture(prompt: string): string | undefined {
  return prompt.match(/local-fixture:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/)?.[0];
}

function extractFirstUrl(prompt: string): string | undefined {
  return prompt.match(/https?:\/\/[^\s"'<>]+/)?.[0];
}

function isPublicWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1" &&
        parsed.hostname !== "::1");
  } catch {
    return false;
  }
}

function stableTxnId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `browser-txn-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
