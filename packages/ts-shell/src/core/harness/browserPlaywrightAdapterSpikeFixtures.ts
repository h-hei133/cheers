import type { BrowserAccessibilityNodeInput } from "../context/browserAccessibilitySnapshot.js";
import type {
  BrowserDirectPlaywrightClient,
  BrowserDirectPlaywrightClientInput,
} from "../context/browserDirectPlaywrightAdapter.js";
import type { BrowserPlaywrightPageEvidence } from "../context/browserPlaywrightEvidenceMapper.js";
import {
  auditBrowserPlaywrightRuntimeAvailability,
  type BrowserPlaywrightRuntimeAvailability,
} from "../context/browserPlaywrightRuntimeAvailability.js";
import {
  createBrowserRuntimeManifest,
  validateBrowserRuntimeManifest,
  type BrowserRuntimeManifestLoadResult,
} from "../context/browser/runtime/core/manifest.js";

export interface BrowserPlaywrightAdapterSpikeFixture {
  readonly origin: string;
  readonly manifestLoad: BrowserRuntimeManifestLoadResult;
  readonly available: BrowserPlaywrightRuntimeAvailability;
  readonly unavailable: BrowserPlaywrightRuntimeAvailability;
  readonly client: BrowserDirectPlaywrightClient;
  readonly invalidClient: BrowserDirectPlaywrightClient;
  readonly timeoutClient: BrowserDirectPlaywrightClient;
}

export async function createBrowserPlaywrightAdapterSpikeFixture(): Promise<BrowserPlaywrightAdapterSpikeFixture> {
  const origin = "controlled-runtime://route125";
  const manifestLoad = validateBrowserRuntimeManifest(createBrowserRuntimeManifest({
    manifestId: "browser-runtime:route125-direct-playwright",
    runtimeMode: "direct-playwright-core",
    allowedOrigins: [origin],
    warnings: ["route125:direct-playwright-spike"],
  }));
  const available = await auditBrowserPlaywrightRuntimeAvailability({
    rootPackageJson: { dependencies: { playwright: "0.0.0-test" } },
    allowRuntimeImportCheck: true,
    runtimeImport: async () => ({ chromium: {} }),
  });
  const unavailable = await auditBrowserPlaywrightRuntimeAvailability({
    rootPackageJson: { dependencies: {} },
    workspacePackageJson: { dependencies: {} },
    allowRuntimeImportCheck: false,
  });
  return {
    origin,
    manifestLoad,
    available,
    unavailable,
    client: createInjectedPlaywrightLikeClient(origin),
    invalidClient: {
      observe: () => ({ status: "invalid" } as unknown as BrowserPlaywrightPageEvidence),
    },
    timeoutClient: {
      observe: (input) => pageEvidence(input, origin, "timed-out"),
    },
  };
}

export function createInjectedPlaywrightLikeClient(origin: string): BrowserDirectPlaywrightClient {
  return {
    observe: (input) => pageEvidence(input, origin, "ok"),
    click: (input) => pageEvidence(input, origin, "ok", "Clicked Save draft"),
    type: (input) => pageEvidence(input, origin, "ok", "Updated Safe note"),
  };
}

function pageEvidence(
  input: BrowserDirectPlaywrightClientInput,
  origin: string,
  status: BrowserPlaywrightPageEvidence["status"],
  postAction?: string,
): BrowserPlaywrightPageEvidence {
  const text = postAction ?? "JS rendered Playwright fixture ready";
  return {
    status,
    url: origin,
    title: "Route 125 Direct Playwright",
    renderedText: text,
    html: [
      "<main>",
      "<h1>Route 125 Direct Playwright</h1>",
      "<p>JS rendered Playwright fixture ready</p>",
      "<button id=\"save\">Save draft</button>",
      "<input aria-label=\"Safe note\" name=\"note\" type=\"text\" value=\"raw-user-value\" />",
      "<input aria-label=\"Password\" type=\"password\" />",
      "<p>api_key=sk-route125SECRET hidden reasoning</p>",
      "</main>",
    ].join(""),
    accessibilityNodes: nodes(input),
    actionApplied: input.request.actionKind === "click" || input.request.actionKind === "type",
    actionTarget: {
      selectorSummary: "#save",
      accessibleName: input.request.action.target ?? "Save draft",
      confidence: 0.96,
    },
    warnings: ["route125-injected-playwright-like-client"],
  };
}

function nodes(input: BrowserDirectPlaywrightClientInput): readonly BrowserAccessibilityNodeInput[] {
  const result: Array<BrowserAccessibilityNodeInput | undefined> = [
    { role: "main", name: "Route 125 Direct Playwright" },
    { role: "heading", name: "Route 125 Direct Playwright" },
    { role: "button", name: "Save draft", selector: "#save" },
    { role: "textbox", name: "Safe note", selector: "input[name=note]" },
    { role: "textbox", name: "Password", selector: "input[type=password]" },
    input.request.actionKind === "type"
      ? { role: "status", name: "Updated Safe note", selector: "#status", value: input.request.action.text }
      : undefined,
  ];
  return result.filter((node): node is BrowserAccessibilityNodeInput => !!node);
}
