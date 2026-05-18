import http from "node:http";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserControlledNetworkRunnerManifest } from "./browserControlledNetworkRunnerManifest.js";
import type { BrowserControlledNetworkPolicyDecision } from "./browserControlledNetworkPolicy.js";
import { browserControlledNetworkTargetUrl } from "./browserControlledNetworkOrigin.js";

export type BrowserControlledNetworkRequestStatus =
  | "executed"
  | "blocked"
  | "timeout"
  | "redirect-blocked"
  | "unsafe-output"
  | "request-failed";

export interface BrowserControlledNetworkExecutorResult {
  readonly status: BrowserControlledNetworkRequestStatus;
  readonly executed: boolean;
  readonly publicNetwork: false;
  readonly browserLaunched: false;
  readonly statusCode?: number;
  readonly safeTitle?: string;
  readonly safeSummary?: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly errorSummary?: string;
  readonly evidence: readonly string[];
}

export async function runBrowserControlledNetworkExecutor(input: {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserControlledNetworkPolicyDecision;
  readonly manifest: BrowserControlledNetworkRunnerManifest;
  readonly httpGet?: (url: URL, timeoutMs: number, outputBudgetBytes: number) => Promise<ControlledHttpResponse>;
}): Promise<BrowserControlledNetworkExecutorResult> {
  if (!input.policy.allowed) {
    return result("blocked", {
      executed: false,
      errorSummary: input.policy.reason,
      evidence: input.policy.evidence,
    });
  }
  const url = browserControlledNetworkTargetUrl({
    rawTarget: input.request.action.url ?? input.request.action.target ?? input.request.action.extractionGoal,
    controlledOrigin: input.manifest.allowedLoopbackOrigin,
  });
  if (!url) {
    return result("blocked", {
      executed: false,
      errorSummary: "Controlled-network target is outside the harness origin.",
      evidence: ["browser-controlled-network-executor:target-outside-origin"],
    });
  }
  try {
    const response = await (input.httpGet ?? controlledHttpGet)(
      url,
      input.manifest.timeoutMs,
      input.manifest.outputBudgetBytes,
    );
    if (response.redirectLocation) {
      const redirect = new URL(response.redirectLocation, url);
      if (redirect.origin !== input.manifest.allowedLoopbackOrigin) {
        return result("redirect-blocked", {
          executed: false,
          statusCode: response.statusCode,
          errorSummary: "Redirect target left the controlled loopback origin.",
          redactions: response.redactions,
          warnings: ["redirect-blocked"],
          evidence: response.evidence,
        });
      }
    }
    if (response.truncated || hasForbiddenContent(response.body)) {
      return result("unsafe-output", {
        executed: false,
        statusCode: response.statusCode,
        errorSummary: "Controlled-network response was unsafe or over budget.",
        redactions: [...response.redactions, "unsafe-output"],
        warnings: ["unsafe-output"],
        evidence: response.evidence,
      });
    }
    return result("executed", {
      executed: true,
      statusCode: response.statusCode,
      safeTitle: extractTitle(response.body),
      safeSummary: summarizeBody(input.request.actionKind, response.body, response.statusCode),
      redactions: response.redactions,
      evidence: response.evidence,
    });
  } catch (error) {
    const code = error instanceof Error && error.message === "controlled-network-timeout"
      ? "timeout"
      : "request-failed";
    return result(code, {
      executed: false,
      errorSummary: code === "timeout" ? "Controlled-network request timed out." : "Controlled-network request failed.",
      warnings: [code],
      evidence: ["browser-controlled-network-executor:request-error"],
    });
  }
}

export interface ControlledHttpResponse {
  readonly statusCode: number;
  readonly body: string;
  readonly redirectLocation?: string;
  readonly truncated: boolean;
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

function controlledHttpGet(
  url: URL,
  timeoutMs: number,
  outputBudgetBytes: number,
): Promise<ControlledHttpResponse> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {
      timeout: timeoutMs,
      headers: { "user-agent": "private-agents-controlled-network-harness" },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= outputBudgetBytes) {
          chunks.push(chunk);
        } else {
          truncated = true;
        }
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: sanitizeBrowserText(Buffer.concat(chunks).toString("utf8"), outputBudgetBytes),
          redirectLocation: response.headers.location,
          truncated,
          redactions: [],
          evidence: [
            "browser-controlled-network-executor:http-request",
            `browser-controlled-network-executor:status:${response.statusCode ?? 0}`,
            "browser-controlled-network-executor:loopback-only",
            "browser-controlled-network-executor:no-public-internet",
            "browser-controlled-network-executor:no-browser-launch",
          ],
        });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("controlled-network-timeout"));
    });
    request.on("error", reject);
  });
}

function result(
  status: BrowserControlledNetworkRequestStatus,
  input: Partial<BrowserControlledNetworkExecutorResult>,
): BrowserControlledNetworkExecutorResult {
  return {
    status,
    executed: input.executed ?? false,
    publicNetwork: false,
    browserLaunched: false,
    statusCode: input.statusCode,
    safeTitle: input.safeTitle,
    safeSummary: input.safeSummary,
    redactions: unique(input.redactions ?? []),
    warnings: unique(input.warnings ?? []),
    errorSummary: input.errorSummary,
    evidence: [
      ...(input.evidence ?? []),
      `browser-controlled-network-executor:${status}`,
      "browser-controlled-network-executor:public-network-no",
      "browser-controlled-network-executor:browser-launched-no",
    ],
  };
}

function extractTitle(body: string): string | undefined {
  const match = body.match(/<title>([^<]+)<\/title>/i);
  return match ? sanitizeBrowserText(match[1] ?? "", 120) : undefined;
}

function summarizeBody(actionKind: BrowserExecutionRequest["actionKind"], body: string, statusCode: number): string {
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitizeBrowserText(`${actionKind} status=${statusCode}; ${text || "empty controlled response"}`, 240);
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|token|secret|password|hidden reasoning|<script|data:image|ocr payload)/i.test(value);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
