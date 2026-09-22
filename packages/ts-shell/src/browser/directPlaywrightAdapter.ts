import type { BrowserExecutionRequest } from "./executionContract.js";
import type {
  BrowserRuntimeExecutor,
  BrowserRuntimeExecutorResult,
} from "./runtime/core/executor.js";
import type { BrowserRuntimeManifest } from "./runtime/core/manifest.js";
import {
  type BrowserPlaywrightPageEvidence,
  mapPlaywrightEvidenceToRuntimeResult,
} from "./playwrightEvidenceMapper.js";
import type { BrowserPlaywrightRuntimeAvailability } from "./playwrightRuntimeAvailability.js";

export interface BrowserDirectPlaywrightClient {
  observe(input: BrowserDirectPlaywrightClientInput): Promise<BrowserPlaywrightPageEvidence> | BrowserPlaywrightPageEvidence;
  click?(input: BrowserDirectPlaywrightClientInput): Promise<BrowserPlaywrightPageEvidence> | BrowserPlaywrightPageEvidence;
  type?(input: BrowserDirectPlaywrightClientInput): Promise<BrowserPlaywrightPageEvidence> | BrowserPlaywrightPageEvidence;
}

export interface BrowserDirectPlaywrightClientInput {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly policy: BrowserDirectPlaywrightAdapterPolicy;
  readonly timeoutMs: number;
  readonly outputBudgetChars: number;
}

export interface BrowserDirectPlaywrightAdapterPolicy {
  readonly launchPolicy: "explicit-injected-client-only" | "future-explicit-launch";
  readonly connectPolicy: "disabled-in-route125" | "future-explicit-connect";
  readonly browserContextPolicy: "ephemeral-no-cookies-no-auth";
  readonly pageLifecyclePolicy: "single-page-per-request";
  readonly timeoutMs: number;
  readonly outputBudgetChars: number;
  readonly cleanupPolicy: "caller-owned-injected-client";
  readonly rawContent: "excluded";
}

export class BrowserDirectPlaywrightAdapter implements BrowserRuntimeExecutor {
  readonly kind = "direct-playwright-core" as const;
  readonly policy: BrowserDirectPlaywrightAdapterPolicy;

  constructor(
    private readonly input: {
      readonly availability: BrowserPlaywrightRuntimeAvailability;
      readonly client?: BrowserDirectPlaywrightClient;
      readonly policy?: Partial<BrowserDirectPlaywrightAdapterPolicy>;
    },
  ) {
    this.policy = {
      launchPolicy: input.policy?.launchPolicy ?? "explicit-injected-client-only",
      connectPolicy: input.policy?.connectPolicy ?? "disabled-in-route125",
      browserContextPolicy: input.policy?.browserContextPolicy ?? "ephemeral-no-cookies-no-auth",
      pageLifecyclePolicy: input.policy?.pageLifecyclePolicy ?? "single-page-per-request",
      timeoutMs: input.policy?.timeoutMs ?? 5_000,
      outputBudgetChars: input.policy?.outputBudgetChars ?? 4_000,
      cleanupPolicy: input.policy?.cleanupPolicy ?? "caller-owned-injected-client",
      rawContent: "excluded",
    };
  }

  async execute(input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserRuntimeManifest;
  }): Promise<BrowserRuntimeExecutorResult> {
    if (!this.input.client || this.input.availability.status !== "available") {
      return this.blocked(input, "Direct Playwright is unavailable or not explicitly injected.");
    }
    try {
      const evidence = await this.invokeClient(input.request, input.manifest);
      if (!isEvidenceLike(evidence)) {
        return this.blocked(input, "Direct Playwright adapter returned invalid evidence.", ["direct-playwright-adapter:invalid-evidence"]);
      }
      return mapPlaywrightEvidenceToRuntimeResult({
        request: input.request,
        manifest: input.manifest,
        evidence,
      });
    } catch (error) {
      return mapPlaywrightEvidenceToRuntimeResult({
        request: input.request,
        manifest: input.manifest,
        evidence: {
          status: "error",
          url: input.request.action.url ?? input.manifest.allowedOrigins[0] ?? "controlled-runtime://playwright-error",
          errorSummary: error instanceof Error ? error.message : String(error),
          warnings: ["direct-playwright-adapter:error"],
        },
      });
    }
  }

  private async invokeClient(
    request: BrowserExecutionRequest,
    manifest: BrowserRuntimeManifest,
  ): Promise<BrowserPlaywrightPageEvidence> {
    const callInput: BrowserDirectPlaywrightClientInput = {
      request,
      manifest,
      policy: this.policy,
      timeoutMs: Math.min(manifest.timeoutMs, this.policy.timeoutMs),
      outputBudgetChars: Math.min(manifest.outputBudgetChars, this.policy.outputBudgetChars),
    };
    if (request.actionKind === "click" && this.input.client?.click) {
      return this.input.client.click(callInput);
    }
    if (request.actionKind === "type" && this.input.client?.type) {
      return this.input.client.type(callInput);
    }
    return this.input.client!.observe(callInput);
  }

  private blocked(
    input: {
      readonly request: BrowserExecutionRequest;
      readonly manifest: BrowserRuntimeManifest;
    },
    reason: string,
    warnings: readonly string[] = [],
  ): BrowserRuntimeExecutorResult {
    return mapPlaywrightEvidenceToRuntimeResult({
      request: input.request,
      manifest: input.manifest,
      evidence: {
        status: "unavailable",
        url: input.request.action.url ?? input.manifest.allowedOrigins[0] ?? "controlled-runtime://playwright-unavailable",
        title: "Direct Playwright unavailable",
        errorSummary: reason,
        warnings: [
          ...warnings,
          "direct-playwright-adapter:unavailable",
          "direct-playwright-adapter:no-browser-launch",
        ],
      },
    });
  }
}

function isEvidenceLike(value: unknown): value is BrowserPlaywrightPageEvidence {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as BrowserPlaywrightPageEvidence).status === "string" &&
    typeof (value as BrowserPlaywrightPageEvidence).url === "string";
}
