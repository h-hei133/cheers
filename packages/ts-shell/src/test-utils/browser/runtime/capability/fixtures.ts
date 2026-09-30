import { createBrowserActionContract } from "../../../../browser/actionContract.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../../../../browser/executionContract.js";
import {
  createBrowserRuntimeManifest,
  validateBrowserRuntimeManifest,
  type BrowserRuntimeManifest,
  type BrowserRuntimeManifestLoadResult,
} from "../../../../browser/runtime/core/manifest.js";
import {
  SimulatedBrowserRuntimeExecutor,
  type BrowserRuntimePageState,
} from "../../../../browser/runtime/core/executor.js";

export interface BrowserRuntimeMvpScenarioFixture {
  readonly manifest: BrowserRuntimeManifest;
  readonly manifestLoad: BrowserRuntimeManifestLoadResult;
  readonly executor: SimulatedBrowserRuntimeExecutor;
  readonly page: BrowserRuntimePageState;
  readonly unsafePage: BrowserRuntimePageState;
}

export function createBrowserRuntimeMvpScenarioFixture(): BrowserRuntimeMvpScenarioFixture {
  const page: BrowserRuntimePageState = {
    pageId: "route123-main",
    url: "controlled-runtime://route123",
    title: "Route 123 Fixture",
    renderedText: "JS rendered dashboard ready",
    html: [
      "<main>",
      "<h1>Route 123 Fixture</h1>",
      "<p>JS rendered dashboard ready</p>",
      "<button id=\"save\">Save draft</button>",
      "<input aria-label=\"Safe note\" name=\"note\" type=\"text\" value=\"raw-user-value\" />",
      "<input aria-label=\"Password\" type=\"password\" />",
      "<input aria-label=\"Credit card\" name=\"card\" />",
      "<a href=\"/details\">Details</a>",
      "<script>window.secret='sk-testSECRET123456'</script>",
      "<p>api_key=sk-testSECRET123456 hidden reasoning</p>",
      "</main>",
    ].join(""),
    accessibilityNodes: [
      { role: "main", name: "Route 123 Fixture" },
      { role: "heading", name: "Route 123 Fixture" },
      { role: "button", name: "Save draft", selector: "#save" },
      { role: "textbox", name: "Safe note", selector: "input[name=note]" },
      { role: "textbox", name: "Password", selector: "input[type=password]" },
      { role: "textbox", name: "Credit card", selector: "input[name=card]" },
      { role: "link", name: "Details", selector: "a[href='/details']" },
    ],
  };
  const unsafePage: BrowserRuntimePageState = {
    pageId: "route123-unsafe",
    url: "controlled-runtime://unsafe-form",
    title: "Unsafe Form",
    renderedText: "Payment form",
    html: [
      "<main>",
      "<h1>Unsafe Form</h1>",
      "<input aria-label=\"Password\" type=\"password\" />",
      "<input aria-label=\"Credit card\" name=\"card\" />",
      "</main>",
    ].join(""),
    accessibilityNodes: [
      { role: "textbox", name: "Password", selector: "input[type=password]" },
      { role: "textbox", name: "Credit card", selector: "input[name=card]" },
    ],
  };
  const manifest = createBrowserRuntimeManifest({
    manifestId: "browser-runtime:route123-fixture",
    allowedOrigins: [page.url, unsafePage.url],
  });
  return {
    manifest,
    manifestLoad: validateBrowserRuntimeManifest(manifest),
    executor: new SimulatedBrowserRuntimeExecutor([page, unsafePage]),
    page,
    unsafePage,
  };
}

export function browserRuntimeRequest(
  actionKind: "navigate" | "observe" | "extract" | "click" | "type",
  target: string,
  text?: string,
): BrowserExecutionRequest {
  return createBrowserExecutionRequest({
    requestId: `browser-runtime-route123:${actionKind}:${target}`,
    mode: "test-local",
    source: "scenario-harness",
    action: createBrowserActionContract({
      actionKind,
      target,
      url: actionKind === "navigate" ? target : undefined,
      extractionGoal: actionKind === "extract" ? target : undefined,
      text,
      userIntentSummary: `${actionKind} ${target}`,
      requiresNetwork: false,
      requiresAuth: false,
    }),
    approval: actionKind === "observe" || actionKind === "extract" ? "read-only" : "none",
  });
}

export function publicBrowserRuntimeManifestLoad(): BrowserRuntimeManifestLoadResult {
  return validateBrowserRuntimeManifest(createBrowserRuntimeManifest({
    manifestId: "browser-runtime:public-blocked",
    allowedOrigins: ["https://example.com"],
  }));
}
