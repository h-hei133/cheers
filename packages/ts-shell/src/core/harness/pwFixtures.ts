import type { BrowserAccessibilityNodeInput } from "../context/browserAccessibilitySnapshot.js";
import { createBrowserActionContract } from "../context/browserActionContract.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../context/browserExecutionContract.js";
import type { PwInjectedClient } from "../context/pwAdapter.js";
import type { PwPageEvidence } from "../context/pwEvidence.js";
import {
  createBrowserRuntimeManifest,
  validateBrowserRuntimeManifest,
  type BrowserRuntimeManifestLoadResult,
} from "../context/browserRuntimeManifest.js";

export const PW_STATIC_FIXTURE = "local-fixture://pw/static";
export const PW_JS_FIXTURE = "local-fixture://pw/js";
export const PW_TIMEOUT_FIXTURE = "local-fixture://pw/timeout";
export const PW_UNSAFE_FIXTURE = "local-fixture://pw/unsafe";
export const PW_SECRET_FIXTURE = "local-fixture://pw/redaction";

export const pwFixtures = [
  {
    marker: PW_STATIC_FIXTURE,
    html: [
      "<!doctype html><html><head><title>Route 126 Direct Playwright</title></head><body>",
      "<main>",
      "<h1>Route 126 Direct Playwright</h1>",
      "<p>Static fixture ready</p>",
      "<button id=\"save\" onclick=\"document.querySelector('#status').textContent='Clicked Save draft'\">Save draft</button>",
      "<input id=\"note\" aria-label=\"Safe note\" name=\"note\" type=\"text\" oninput=\"document.querySelector('#status').textContent='Updated Safe note'\" />",
      "<input aria-label=\"Password\" type=\"password\" />",
      "<p id=\"status\" role=\"status\">Waiting</p>",
      "</main>",
      "</body></html>",
    ].join(""),
  },
  {
    marker: PW_JS_FIXTURE,
    waitForReady: true,
    html: [
      "<!doctype html><html><head><title>Route 126 JS Fixture</title></head><body>",
      "<main><h1>Route 126 JS Fixture</h1><p id=\"status\">Booting</p></main>",
      "<script>setTimeout(()=>{document.querySelector('#status').textContent='JS rendered Playwright fixture ready'; window.__pwReady=true;}, 10)</script>",
      "</body></html>",
    ].join(""),
  },
  {
    marker: PW_TIMEOUT_FIXTURE,
    waitForReady: true,
    html: [
      "<!doctype html><html><head><title>Route 126 Timeout Fixture</title></head><body>",
      "<main><h1>Route 126 Timeout Fixture</h1><p>Never ready</p></main>",
      "<script>window.__pwReady=false</script>",
      "</body></html>",
    ].join(""),
  },
  {
    marker: PW_UNSAFE_FIXTURE,
    html: [
      "<!doctype html><html><head><title>Unsafe Form</title></head><body>",
      "<main><h1>Unsafe Form</h1><input aria-label=\"Password\" type=\"password\" /></main>",
      "</body></html>",
    ].join(""),
  },
  {
    marker: PW_SECRET_FIXTURE,
    html: [
      "<!doctype html><html><head><title>Secret Fixture</title></head><body>",
      "<main>",
      "<h1>Secret Fixture</h1>",
      "<input type=\"hidden\" name=\"token\" value=\"sk-route126SECRET\" />",
      "<p>api_key=sk-route126SECRET hidden reasoning cookie=session-cookie localStorage=stored-secret</p>",
      "<button id=\"save\">Save draft</button>",
      "</main>",
      "</body></html>",
    ].join(""),
  },
] as const;

export function createPwManifestLoad(): BrowserRuntimeManifestLoadResult {
  return validateBrowserRuntimeManifest(createBrowserRuntimeManifest({
    manifestId: "browser-runtime:route127-direct-playwright",
    runtimeMode: "direct-playwright-core",
    allowedOrigins: pwFixtures.map((fixture) => fixture.marker),
    warnings: ["route127:direct-playwright-runtime"],
  }));
}

export function pwRequest(
  actionKind: "navigate" | "observe" | "extract" | "click" | "type",
  target: string,
  text?: string,
  url?: string,
): BrowserExecutionRequest {
  return createBrowserExecutionRequest({
    requestId: `browser-runtime-route126:${actionKind}:${target}`,
    mode: "test-local",
    source: "scenario-harness",
    action: createBrowserActionContract({
      actionKind,
      target,
      url: url ?? (actionKind === "navigate" ? target : undefined),
      extractionGoal: actionKind === "extract" ? target : undefined,
      text,
      userIntentSummary: `${actionKind} ${target}`,
      requiresNetwork: false,
      requiresAuth: false,
    }),
    approval: actionKind === "observe" || actionKind === "extract" ? "read-only" : "none",
  });
}

export function createInjectedPwClient(): PwInjectedClient {
  return {
    run: ({ request, fixture }) => {
      if (fixture.marker === PW_TIMEOUT_FIXTURE) {
        return evidence(request, fixture.marker, "timed-out", "Direct Playwright operation timed out.");
      }
      const postAction = request.actionKind === "click"
        ? "Clicked Save draft"
        : request.actionKind === "type"
          ? "Updated Safe note"
          : fixture.marker === PW_JS_FIXTURE
            ? "JS rendered Playwright fixture ready"
            : "Static fixture ready";
      return evidence(request, fixture.marker, "ok", postAction, fixture.html);
    },
  };
}

function evidence(
  request: BrowserExecutionRequest,
  marker: string,
  status: PwPageEvidence["status"],
  visibleText: string,
  rawHtml?: string,
): PwPageEvidence {
  return {
    status,
    operation: request.actionKind,
    fixtureMarker: marker,
    urlSummary: marker,
    title: marker === PW_JS_FIXTURE ? "Route 126 JS Fixture" : "Route 126 Direct Playwright",
    visibleText,
    rawHtml,
    accessibilityNodes: nodes(request),
    actionApplied: status === "ok" && (request.actionKind === "click" || request.actionKind === "type"),
    browserLaunched: false,
    cleanupStatus: "closed",
    targetSummary: request.action.target,
    errorKind: status === "timed-out" ? "timeout" : undefined,
    errorSummary: status === "timed-out" ? visibleText : undefined,
    warnings: ["pw-fixtures:injected-client"],
    evidence: ["pw-fixtures:injected"],
  };
}

function nodes(request: BrowserExecutionRequest): readonly BrowserAccessibilityNodeInput[] {
  const result: Array<BrowserAccessibilityNodeInput | undefined> = [
    { role: "main", name: "Route 126 Direct Playwright" },
    { role: "heading", name: "Route 126 Direct Playwright" },
    { role: "button", name: "Save draft", selector: "#save" },
    { role: "textbox", name: "Safe note", selector: "#note" },
    { role: "textbox", name: "Password", selector: "input[type=password]" },
    request.actionKind === "type" ? { role: "status", name: "Updated Safe note", selector: "#status", value: request.action.text } : undefined,
  ];
  return result.filter((node): node is BrowserAccessibilityNodeInput => !!node);
}
