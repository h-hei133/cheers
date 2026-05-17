import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./browserCommandContract.js";
import { runBrowserCommandAsync } from "./browserCommandRunner.js";
import { FakeBrowserExecutor } from "./browserExecutor.js";
import { buildBrowserExecutionEvidencePolicy } from "./browserExecutionEvidencePolicy.js";
import { decideBrowserExecutionConfirmation } from "./browserExecutionConfirmation.js";
import {
  createBrowserNetworkAllowlist,
  decideBrowserNetworkAllowlist,
  normalizeBrowserAllowedOrigin,
} from "./browserNetworkAllowlist.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";
import { runBrowserRuntimePreflight } from "./browserRuntimePreflight.js";
import {
  createBrowserSandboxAuthority,
  decideBrowserSandboxAuthority,
} from "./browserSandboxAuthority.js";

describe("browser runtime preflight", () => {
  it("blocks real execution when sandbox authority is disabled", () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const policy = decideBrowserExecutionPolicy({
      request: { ...request, mode: "fake-test" },
      executorAvailable: true,
    });
    const preflight = runBrowserRuntimePreflight({
      request: { ...request, mode: "fake-test" },
      policy,
      executorKind: "fake-test",
    });

    expect(decideBrowserSandboxAuthority({ request }).status).toBe("blocked");
    expect(preflight.preflightStatus).toBe("blocked");
    expect(preflight.blockers).toContain("Browser sandbox authority is not enabled for execution.");
    expect(preflight.evidence).toContain("browser-runtime-preflight:no-browser-launch");
    expect(preflight.evidence).toContain("browser-runtime-preflight:no-network-call");
  });

  it("enforces default-deny network allowlist and passes explicit https origins", () => {
    const request = parseBrowserCommandArgs(["execute", "navigate", "https://example.com/path"]).contract!.execution!;
    const defaultDecision = decideBrowserNetworkAllowlist({ request });
    const allowlist = createBrowserNetworkAllowlist({
      allowedOrigins: [{ origin: "https://example.com", mode: "fake-test" }],
    });
    const allowedDecision = decideBrowserNetworkAllowlist({ request, allowlist });

    expect(defaultDecision.status).toBe("blocked-no-allowlist");
    expect(allowedDecision.status).toBe("allowed");
    expect(normalizeBrowserAllowedOrigin("https://example.com/anything")).toBe("https://example.com");
  });

  it("blocks unsupported schemes, credential URLs, localhost, and private network targets", () => {
    for (const [url, status] of [
      ["file:///tmp/page.html", "blocked-scheme"],
      ["data:text/html,hello", "blocked-scheme"],
      ["javascript:alert(1)", "blocked-scheme"],
      ["about:blank", "blocked-scheme"],
      ["chrome://version", "blocked-scheme"],
      ["https://user:pass@example.com", "blocked-credential-url"],
      ["https://localhost:3000", "blocked-private-network"],
      ["https://127.0.0.1", "blocked-private-network"],
      ["https://10.0.0.2", "blocked-private-network"],
      ["https://192.168.1.2", "blocked-private-network"],
    ] as const) {
      const request = parseBrowserCommandArgs(["execute", "navigate", url]).contract!.execution!;
      expect(decideBrowserNetworkAllowlist({ request }).status).toBe(status);
    }
  });

  it("represents confirmation requirements without prompt UI", () => {
    const navigate = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]).contract!.execution!;
    const click = parseBrowserCommandArgs(["execute", "click", "Submit"]).contract!.execution!;
    const observe = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const auth = parseBrowserCommandArgs(["execute", "auth", "login"]).contract!.execution!;

    expect(decideBrowserExecutionConfirmation({ request: navigate }).status).toBe("required");
    expect(decideBrowserExecutionConfirmation({ request: click }).kind).toBe("state-changing");
    expect(decideBrowserExecutionConfirmation({ request: observe }).status).toBe("not-required");
    expect(decideBrowserExecutionConfirmation({ request: auth }).status).toBe("denied");
  });

  it("prevents executor calls when allowlist or confirmation preflight is blocked", async () => {
    const request = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]).contract!.execution!;
    const result = await runBrowserCommandAsync({
      contract: { mode: "execute", action: request.action, execution: request },
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
    });

    expect(result.output).toContain("- Outcome: blocked");
    expect(result.output).toContain("- Preflight status: blocked");
    expect(result.output).toContain("- Network allowlist: blocked-no-allowlist");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).not.toContain("timestamp=");
  });

  it("blocks fake executor when authority is not fake-test", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const result = await runBrowserCommandAsync({
      contract: { mode: "execute", action: request.action, execution: request },
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "explicit-local" }),
    });

    expect(result.output).toContain("- Outcome: blocked");
    expect(result.output).toContain("Fake/test executor requires fake-test sandbox authority.");
    expect(result.output).toContain("- Executed: no");
  });

  it("allows fake-test executor only with fake authority, allowlisted target, and confirmation", async () => {
    const request = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]).contract!.execution!;
    const result = await runBrowserCommandAsync({
      contract: { mode: "execute", action: request.action, execution: request },
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      browserNetworkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://example.com", mode: "fake-test" }],
      }),
      browserExecutionConfirmations: [{ kind: "network", status: "confirmed", requestId: request.requestId }],
      now: () => "2026-05-17T02:00:00.000Z",
    });

    expect(result.output).toContain("- Outcome: executed");
    expect(result.output).toContain("- Preflight status: warning");
    expect(result.output).toContain("- Sandbox authority: fake-test");
    expect(result.output).toContain("- Network allowlist: allowed");
    expect(result.output).toContain("- Confirmation status: confirmed");
    expect(result.output).toContain("timestamp=2026-05-17T02:00:00.000Z");
  });

  it("keeps read-only observe/extract preflight available with fake authority", () => {
    for (const args of [
      ["execute", "observe"],
      ["execute", "extract", "headline"],
    ]) {
      const request = parseBrowserCommandArgs(args).contract!.execution!;
      const policy = decideBrowserExecutionPolicy({
        request: { ...request, mode: "fake-test" },
        executorAvailable: true,
      });
      const preflight = runBrowserRuntimePreflight({
        request: { ...request, mode: "fake-test" },
        policy,
        executorKind: "fake-test",
        authority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      });

      expect(preflight.networkDecision.status).toBe("allowed");
      expect(preflight.confirmationDecision.status).toBe("not-required");
      expect(["pass", "warning"]).toContain(preflight.preflightStatus);
    }
  });

  it("marks fake evidence and keeps raw browser content disallowed", () => {
    const request = { ...parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!, mode: "fake-test" as const };
    const policy = buildBrowserExecutionEvidencePolicy({ request });

    expect(policy.fakeEvidence).toBe(true);
    expect(policy.rawContentAllowed).toBe(false);
    expect(policy.screenshotAllowed).toBe(false);
    expect(policy.ocrAllowed).toBe(false);
    expect(policy.requiredEvidence).toContain("accessibility snapshot summary reference");
  });
});
