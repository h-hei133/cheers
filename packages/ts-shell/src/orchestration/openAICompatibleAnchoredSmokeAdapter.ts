import { OpenAIModelAdapter } from "../model-adapters/providers/openai/OpenAIModelAdapter.js";
import type { NormalizedProviderError, SchemaVersion } from "../model-adapters/types.js";
import type { ContextAwareProviderPromptContext } from "../provider/request/prompt.js";
import {
  buildProviderExactPatchSystemPrompt,
  parseProviderExactPatchOutput,
} from "./providerExactPatchContract.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
const CONTRACT_VERSION: SchemaVersion = "1.0.0";

export interface RealProviderProposalDryRunProvider {
  readonly proposeEdit: (
    context: ContextAwareProviderPromptContext,
  ) => ProviderEditRawProposal | Promise<ProviderEditRawProposal>;
}
export type OpenAICompatibleAnchoredSmokeProviderErrorClass =
  | "auth"
  | "missing-key"
  | "unsupported"
  | "network"
  | "timeout"
  | "malformed-response"
  | "unknown";

export class OpenAICompatibleAnchoredSmokeProviderError extends Error {
  readonly providerErrorClass: OpenAICompatibleAnchoredSmokeProviderErrorClass;

  constructor(
    providerErrorClass: OpenAICompatibleAnchoredSmokeProviderErrorClass,
    message: string,
    options?: {
      readonly cause?: unknown;
      readonly diagnosticEvidence?: readonly string[];
    },
  ) {
    super(message, options);
    this.name = "OpenAICompatibleAnchoredSmokeProviderError";
    this.providerErrorClass = providerErrorClass;
    this.diagnosticEvidence = options?.diagnosticEvidence ?? [];
  }

  readonly diagnosticEvidence: readonly string[];
}

export interface OpenAICompatibleAnchoredSmokeAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly providerSafeLabel?: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxOutputTokens?: number;
  readonly promptMode?: "anchored-smoke-fixture" | "context-only";
}

export function createOpenAICompatibleAnchoredSmokeAdapter(
  config: OpenAICompatibleAnchoredSmokeAdapterConfig,
): RealProviderProposalDryRunProvider {
  const apiKey = config.apiKey.trim();
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const model = config.model.trim();

  if (!apiKey) {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "missing-key",
      "OpenAI-compatible anchored smoke adapter requires an API key.",
    );
  }
  if (!baseUrl || !model) {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "unsupported",
      "OpenAI-compatible anchored smoke adapter requires base URL and model.",
    );
  }

  const adapter = new OpenAIModelAdapter(
    {
      provider: "openai-compatible",
      apiKey,
      baseUrl,
    },
    config.fetchImpl,
  );

  return {
    async proposeEdit(context: ContextAwareProviderPromptContext): Promise<ProviderEditRawProposal> {
      let text = "";
      try {
        for await (const event of adapter.streamResponse({
          schemaVersion: CONTRACT_VERSION,
          model,
          temperature: 0,
          maxOutputTokens: config.maxOutputTokens ?? 900,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(config.promptMode ?? "anchored-smoke-fixture"),
            },
            {
              role: "user",
              content: buildUserPrompt(
                context,
                config.promptMode ?? "anchored-smoke-fixture",
              ),
            },
          ],
        })) {
          if (event.type === "content.delta") {
            text += event.delta;
          }
        }
      } catch (error) {
        throw classifyAdapterError(error);
      }

      return parseProviderProposal(text, context);
    },
  };
}

export function classifyOpenAICompatibleAnchoredSmokeError(
  error: unknown,
): OpenAICompatibleAnchoredSmokeProviderErrorClass {
  if (error instanceof OpenAICompatibleAnchoredSmokeProviderError) {
    return error.providerErrorClass;
  }
  if (isNormalizedProviderError(error)) {
    if (error.kind === "authentication" || error.statusCode === 401 || error.statusCode === 403) {
      return "auth";
    }
    if (error.kind === "network") return "network";
    if (error.kind === "invalid_request" && /api key|credential/i.test(error.message)) {
      return "missing-key";
    }
    if (/timeout|abort/i.test(error.message)) return "timeout";
    return "unknown";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthorized|forbidden|authentication/i.test(message)) return "auth";
  if (/api key|credential|missing-key/i.test(message)) return "missing-key";
  if (/unsupported/i.test(message)) return "unsupported";
  if (/timeout|abort/i.test(message)) return "timeout";
  if (/network|fetch|econn|enotfound|unreachable|socket/i.test(message)) return "network";
  if (/malformed|json|parse/i.test(message)) return "malformed-response";
  return "unknown";
}

function classifyAdapterError(error: unknown): OpenAICompatibleAnchoredSmokeProviderError {
  const providerErrorClass = classifyOpenAICompatibleAnchoredSmokeError(error);
  return new OpenAICompatibleAnchoredSmokeProviderError(
    providerErrorClass,
    `OpenAI-compatible anchored smoke provider failed with class ${providerErrorClass}.`,
    { cause: error },
  );
}

function buildSystemPrompt(
  mode: NonNullable<OpenAICompatibleAnchoredSmokeAdapterConfig["promptMode"]>,
): string {
  if (mode === "context-only") {
    return [
      buildProviderExactPatchSystemPrompt(),
      "This is a dry-run proposal only; mutation authority is not granted.",
    ].join("\n");
  }
  return [
    "You generate review-only edit proposals for a no-write smoke test.",
    "Return JSON only. Do not use markdown fences.",
    "Do not claim that files were changed. Do not run commands. Do not request apply.",
    "The JSON shape is:",
    '{"operationKind":"exact-fenced-replacement","targets":[{"path":"src/smoke.ts","summary":"...","oldText":"...","newText":"..."}],"confidence":"medium","riskSummary":"...","verificationPlan":["..."]}',
    "Return exactly one target. The oldText and newText must be a bounded exact replacement block.",
  ].join("\n");
}

function buildUserPrompt(
  context: ContextAwareProviderPromptContext,
  mode: NonNullable<OpenAICompatibleAnchoredSmokeAdapterConfig["promptMode"]>,
): string {
  const common = [
    context.providerPrompt,
    "",
    "Return exactly one exact patch for the explicit target only.",
    `Explicit target: ${context.target.pathLabel}`,
  ];
  if (mode === "context-only") {
    return [
      ...common,
      "Preferred shape: {\"targetFile\":\"...\",\"oldText\":\"...\",\"newText\":\"...\",\"reason\":\"...\",\"verificationHint\":\"...\"}.",
      "If exact replacement text is not available in the prompt, return {\"status\":\"review-only\",\"targetFile\":\"...\",\"reason\":\"...\"}.",
      "Do not invent anchors from files that were not included in the prompt.",
      "Return JSON only.",
    ].join("\n");
  }
  const routeSpecific = requestsLocalCallSite(context)
    ? [
        "The oldText must be this exact bounded block:",
        "export function startApp() {",
        "  return \"started\";",
        "}",
        "",
        "export const bootMessage = startApp();",
        "The newText must be this exact bounded block:",
        "export function runApp() {",
        "  return \"started\";",
        "}",
        "",
        "export const bootMessage = runApp();",
        "Do not split the declaration and call site into multiple targets.",
      ]
    : [
        "The oldText must be the exact function declaration anchor for startApp.",
        "The newText must rename only that declaration to runApp.",
        "Do not include unrelated functions or additional targets.",
      ];
  return [
    ...common,
    ...routeSpecific,
    "Return JSON only.",
  ].join("\n");
}

function requestsLocalCallSite(context: ContextAwareProviderPromptContext): boolean {
  return /local call site|bootMessage/i.test(`${context.userRequest}\n${context.providerPrompt}`);
}

function parseProviderProposal(
  text: string,
  context: ContextAwareProviderPromptContext,
): ProviderEditRawProposal {
  const parsedExact = parseProviderExactPatchOutput({
    text,
    explicitTargetLabels: [context.target.pathLabel],
  });
  if (parsedExact.ok) {
    return parsedExact.rawProposal;
  }
  if (parsedExact.status === "target-mismatch") {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "malformed-response",
      "OpenAI-compatible anchored smoke provider returned a target-mismatched exact patch.",
      { diagnosticEvidence: parsedExact.diagnostics.evidence },
    );
  }

  const jsonText = extractJsonObject(text.trim());
  if (!jsonText) {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "malformed-response",
      "OpenAI-compatible anchored smoke provider returned no JSON object.",
      { diagnosticEvidence: parsedExact.diagnostics.evidence },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "malformed-response",
      "OpenAI-compatible anchored smoke provider returned malformed JSON.",
      { cause: error, diagnosticEvidence: parsedExact.diagnostics.evidence },
    );
  }

  const candidate =
    isRecord(parsed) && isRecord(parsed.proposal) ? parsed.proposal : parsed;
  if (!isRecord(candidate)) {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "malformed-response",
      "OpenAI-compatible anchored smoke provider JSON was not an object.",
    );
  }

  const operationKind = candidate.operationKind;
  if (
    operationKind !== "exact-fenced-replacement" &&
    operationKind !== "generated-replacement" &&
    operationKind !== "broad-refactor" &&
    operationKind !== "fuzzy-replacement"
  ) {
    throw new OpenAICompatibleAnchoredSmokeProviderError(
      "malformed-response",
      "OpenAI-compatible anchored smoke provider JSON omitted operationKind.",
    );
  }

  return {
    operationKind,
    targets: parseTargets(candidate.targets),
    confidence: parseConfidence(candidate.confidence),
    riskSummary: typeof candidate.riskSummary === "string" ? candidate.riskSummary : undefined,
    verificationPlan: parseStringArray(candidate.verificationPlan),
  };
}

function parseTargets(value: unknown): ProviderEditRawProposal["targets"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(isRecord)
    .map((target) => ({
      path: typeof target.path === "string" ? target.path : "",
      summary: typeof target.summary === "string" ? target.summary : undefined,
      oldText: typeof target.oldText === "string" ? target.oldText : undefined,
      newText: typeof target.newText === "string" ? target.newText : undefined,
    }))
    .filter((target) => target.path);
}

function parseConfidence(value: unknown): ProviderEditRawProposal["confidence"] {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function parseStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.filter((entry): entry is string => typeof entry === "string");
  return parsed.length ? parsed : undefined;
}

function extractJsonObject(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  return source.slice(start, end + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNormalizedProviderError(error: unknown): error is NormalizedProviderError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error &&
    "retriable" in error
  );
}
