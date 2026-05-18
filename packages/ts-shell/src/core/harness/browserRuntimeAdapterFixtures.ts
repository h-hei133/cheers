import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBrowserExternalRuntimeManifest, validateBrowserExternalRuntimeManifest } from "../context/browserExternalRuntimeManifest.js";
import type { BrowserRuntimeProtocolResponse } from "../context/browserRuntimeProtocol.js";
import type { BrowserSkillRuntimeBinding } from "../context/browserSkillRuntimeBinding.js";

export interface BrowserRuntimeAdapterFixture {
  readonly root: string;
  readonly runnerPath: string;
  readonly origin: string;
  readonly externalManifest: ReturnType<typeof validateBrowserExternalRuntimeManifest>;
  readonly invalidManifest: ReturnType<typeof validateBrowserExternalRuntimeManifest>;
  readonly timeoutManifest: ReturnType<typeof validateBrowserExternalRuntimeManifest>;
  readonly skillManifest: ReturnType<typeof validateBrowserExternalRuntimeManifest>;
  readonly skillBinding: BrowserSkillRuntimeBinding;
  readonly cleanup: () => void;
}

export function createBrowserRuntimeAdapterFixture(): BrowserRuntimeAdapterFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-browser-runtime-adapter-"));
  const runnerPath = path.join(root, "runner.mjs");
  fs.writeFileSync(runnerPath, runnerSource(), "utf8");
  const origin = "controlled-runtime://route124";
  const externalManifest = validateBrowserExternalRuntimeManifest(createBrowserExternalRuntimeManifest({
    manifestId: "browser-external-runtime:route124",
    runtimeMode: "external-process",
    runnerCommand: process.execPath,
    runnerArgs: [runnerPath, "ok"],
    allowedOrigins: [origin],
  }));
  const invalidManifest = validateBrowserExternalRuntimeManifest(createBrowserExternalRuntimeManifest({
    manifestId: "browser-external-runtime:route124-invalid",
    runtimeMode: "external-process",
    runnerCommand: process.execPath,
    runnerArgs: [runnerPath, "invalid"],
    allowedOrigins: [origin],
  }));
  const timeoutManifest = validateBrowserExternalRuntimeManifest(createBrowserExternalRuntimeManifest({
    manifestId: "browser-external-runtime:route124-timeout",
    runtimeMode: "external-process",
    runnerCommand: process.execPath,
    runnerArgs: [runnerPath, "timeout"],
    allowedOrigins: [origin],
    timeoutMs: 100,
  }));
  const skillManifestValue = createBrowserExternalRuntimeManifest({
    manifestId: "browser-external-runtime:route124-skill",
    runtimeMode: "skill-managed",
    skillBindingId: "skill-binding:route124",
    allowedOrigins: [origin],
  });
  const skillManifest = validateBrowserExternalRuntimeManifest(skillManifestValue);
  const skillBinding: BrowserSkillRuntimeBinding = {
    bindingId: "skill-binding:route124",
    skillId: "browser-runtime-skill",
    mode: "test-only",
    allowedActions: ["navigate", "observe", "extract", "click", "type"],
    snapshotCapabilities: ["dom", "accessibility", "text", "links"],
    run: async ({ request }) => protocolResponse(request.actionKind, origin),
  };
  return {
    root,
    runnerPath,
    origin,
    externalManifest,
    invalidManifest,
    timeoutManifest,
    skillManifest,
    skillBinding,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function protocolResponse(action: string, origin: string): BrowserRuntimeProtocolResponse {
  const postAction = action === "click"
    ? "Clicked Save draft"
    : action === "type"
      ? "Updated Safe note"
      : "JS rendered adapter dashboard ready";
  return {
    version: "browser-runtime-protocol/v1",
    status: "ok",
    runtimeId: "runtime-route124",
    sessionId: "session-route124",
    currentUrlSummary: origin,
    title: "Route 124 Adapter",
    domSnapshotPayload: {
      title: "Route 124 Adapter",
      textSummary: "JS rendered adapter dashboard ready",
      html: [
        "<main>",
        "<h1>Route 124 Adapter</h1>",
        "<p>JS rendered adapter dashboard ready</p>",
        "<button id=\"save\">Save draft</button>",
        "<input aria-label=\"Safe note\" name=\"note\" type=\"text\" />",
        "<input aria-label=\"Password\" type=\"password\" />",
        "<p>api_key=sk-route124SECRET hidden reasoning</p>",
        "</main>",
      ].join(""),
    },
    accessibilitySnapshotPayload: {
      nodes: [
        { role: "main", name: "Route 124 Adapter" },
        { role: "heading", name: "Route 124 Adapter" },
        { role: "button", name: "Save draft", selector: "#save" },
        { role: "textbox", name: "Safe note", selector: "input[name=note]" },
        { role: "textbox", name: "Password", selector: "input[type=password]" },
      ],
    },
    actionTargetResult: {
      targetId: "target:save",
      selectorSummary: "#save",
      accessibleName: "Save draft",
      confidence: 0.96,
    },
    postActionObservation: postAction,
    warnings: ["browser-runtime-adapter-fixture"],
    redactions: [],
    rawContent: "internal-only",
  };
}

function runnerSource(): string {
  return `
const mode = process.argv[2] || "ok";
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  if (mode === "timeout") {
    setTimeout(() => {}, 10_000);
    return;
  }
  if (mode === "invalid") {
    process.stdout.write("{not-json");
    return;
  }
  const request = JSON.parse(input);
  const action = request.action;
  const postAction = action === "click" ? "Clicked Save draft" : action === "type" ? "Updated Safe note" : "JS rendered adapter dashboard ready";
  process.stdout.write(JSON.stringify({
    version: "browser-runtime-protocol/v1",
    status: "ok",
    runtimeId: "runtime-route124",
    sessionId: "session-route124",
    currentUrlSummary: "controlled-runtime://route124",
    title: "Route 124 Adapter",
    domSnapshotPayload: {
      title: "Route 124 Adapter",
      textSummary: "JS rendered adapter dashboard ready",
      html: "<main><h1>Route 124 Adapter</h1><p>JS rendered adapter dashboard ready</p><button id='save'>Save draft</button><input aria-label='Safe note' name='note' type='text' /><input aria-label='Password' type='password' /><p>api_key=sk-route124SECRET hidden reasoning</p></main>"
    },
    accessibilitySnapshotPayload: {
      nodes: [
        { role: "main", name: "Route 124 Adapter" },
        { role: "heading", name: "Route 124 Adapter" },
        { role: "button", name: "Save draft", selector: "#save" },
        { role: "textbox", name: "Safe note", selector: "input[name=note]" },
        { role: "textbox", name: "Password", selector: "input[type=password]" }
      ]
    },
    actionTargetResult: { targetId: "target:save", selectorSummary: "#save", accessibleName: "Save draft", confidence: 0.96 },
    postActionObservation: postAction,
    warnings: ["browser-runtime-adapter-fixture"],
    redactions: [],
    rawContent: "internal-only"
  }));
});
`;
}
