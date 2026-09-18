import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserAccessibilityNodeInput } from "../../accessibilitySnapshot.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
import { normalizeOriginLike, type BrowserRuntimeManifest } from "./manifest.js";

export interface BrowserRuntimePageState {
  readonly pageId: string;
  readonly url: string;
  readonly title: string;
  readonly html: string;
  readonly renderedText: string;
  readonly accessibilityNodes: readonly BrowserAccessibilityNodeInput[];
}

export interface BrowserRuntimeExecutorResult {
  readonly status: "observed" | "acted" | "blocked" | "failed";
  readonly runtimeMode: BrowserRuntimeManifest["runtimeMode"];
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly url: string;
  readonly title: string;
  readonly html: string;
  readonly renderedText: string;
  readonly accessibilityNodes: readonly BrowserAccessibilityNodeInput[];
  readonly actionApplied: boolean;
  readonly browserLaunched: boolean;
  readonly publicAutomation: boolean;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
  readonly rawContent: "internal-only";
}

export interface BrowserRuntimeExecutor {
  readonly kind: BrowserRuntimeManifest["runtimeMode"];
  execute(input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserRuntimeManifest;
  }): Promise<BrowserRuntimeExecutorResult> | BrowserRuntimeExecutorResult;
}

export class SimulatedBrowserRuntimeExecutor implements BrowserRuntimeExecutor {
  readonly kind = "simulated-browser-runtime" as const;
  private readonly pages: Map<string, BrowserRuntimePageState>;

  constructor(pages: readonly BrowserRuntimePageState[]) {
    this.pages = new Map(pages.map((page) => [normalizeOriginLike(page.url), page]));
  }

  execute(input: {
    readonly request: BrowserExecutionRequest;
    readonly manifest: BrowserRuntimeManifest;
  }): BrowserRuntimeExecutorResult {
    const targetUrl = input.request.action.url ?? input.request.action.target ?? input.manifest.allowedOrigins[0] ?? "controlled-runtime://missing";
    const page = this.pages.get(normalizeOriginLike(targetUrl)) ?? this.pages.values().next().value;
    if (!page) {
      return runtimeResult({
        status: "blocked",
        request: input.request,
        manifest: input.manifest,
        page: emptyPage(targetUrl),
        actionApplied: false,
        warnings: ["browser-runtime-executor:missing-fixture-page"],
      });
    }
    if (input.request.actionKind === "click") {
      return runtimeResult({
        status: "acted",
        request: input.request,
        manifest: input.manifest,
        page: applyClick(page, input.request.action.target),
        actionApplied: true,
        warnings: ["browser-runtime-executor:simulated-click"],
      });
    }
    if (input.request.actionKind === "type") {
      return runtimeResult({
        status: "acted",
        request: input.request,
        manifest: input.manifest,
        page: applyType(page, input.request.action.target),
        actionApplied: true,
        warnings: ["browser-runtime-executor:simulated-type"],
      });
    }
    return runtimeResult({
      status: "observed",
      request: input.request,
      manifest: input.manifest,
      page,
      actionApplied: false,
      warnings: input.request.actionKind === "observe" || input.request.actionKind === "extract"
        ? ["browser-runtime-executor:js-rendered-fixture-evidence"]
        : ["browser-runtime-executor:simulated-navigation"],
    });
  }
}

function applyClick(page: BrowserRuntimePageState, target: string | undefined): BrowserRuntimePageState {
  const label = sanitizeBrowserText(target ?? "target", 80);
  return {
    ...page,
    renderedText: `${page.renderedText} Clicked ${label}.`,
    html: `${page.html}<p data-state="clicked">Clicked ${label}</p>`,
    accessibilityNodes: [
      ...page.accessibilityNodes,
      { role: "status", name: `Clicked ${label}` },
    ],
  };
}

function applyType(page: BrowserRuntimePageState, target: string | undefined): BrowserRuntimePageState {
  const label = sanitizeBrowserText(target ?? "field", 80);
  return {
    ...page,
    renderedText: `${page.renderedText} Updated ${label}.`,
    html: `${page.html}<p data-state="typed">Updated ${label}</p>`,
    accessibilityNodes: [
      ...page.accessibilityNodes,
      { role: "status", name: `Updated ${label}` },
    ],
  };
}

function runtimeResult(input: {
  readonly status: BrowserRuntimeExecutorResult["status"];
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly page: BrowserRuntimePageState;
  readonly actionApplied: boolean;
  readonly warnings: readonly string[];
}): BrowserRuntimeExecutorResult {
  return {
    status: input.status,
    runtimeMode: input.manifest.runtimeMode,
    actionKind: input.request.actionKind,
    url: input.page.url,
    title: input.page.title,
    html: input.page.html,
    renderedText: input.page.renderedText,
    accessibilityNodes: input.page.accessibilityNodes,
    actionApplied: input.actionApplied,
    browserLaunched: false,
    publicAutomation: false,
    warnings: input.warnings,
    redactions: [],
    evidence: [
      `browser-runtime-executor:${input.status}`,
      `browser-runtime-executor:action:${input.request.actionKind}`,
      "browser-runtime-executor:controlled-fixture",
      "browser-runtime-executor:no-provider-or-model-call",
      "browser-runtime-executor:no-raw-content-output",
    ],
    rawContent: "internal-only",
  };
}

function emptyPage(url: string): BrowserRuntimePageState {
  return {
    pageId: "missing",
    url,
    title: "missing fixture",
    html: "",
    renderedText: "",
    accessibilityNodes: [],
  };
}
