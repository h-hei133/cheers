import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adaptCommandResultToSidebarEvent } from "../../presentation/sidebar/sidebarCommandEventAdapter.js";
import { runBrowserLocalCommand } from "../commands/browserCommandRuntime.js";
import {
  PUBLIC_WEB_SMOKE_BYTE_BUDGET_ENV,
  PUBLIC_WEB_SMOKE_ENABLE_ENV,
  PUBLIC_WEB_SMOKE_METHOD_ENV,
  PUBLIC_WEB_SMOKE_TIMEOUT_ENV,
  PUBLIC_WEB_SMOKE_URL_ENV,
  parseBrowserPublicReadOnlyWebSmokeConfig,
} from "../../browser/smoke/config.js";
import { renderBrowserPublicReadOnlyWebSmokeReport } from "../../browser/smoke/report.js";
import { runBrowserPublicReadOnlyWebSmoke } from "../../browser/smoke/runner.js";
import { createBrowserPublicReadOnlyWebScenarioFixture } from "./browserPublicReadOnlyWebScenarioFixtures.js";
import { agentCliAssertionFailures } from "../../test-utils/cli/assertions.js";
import { renderAgentCliScenarioReport } from "../../test-utils/cli/report.js";
import { runAgentCliScenario } from "../../test-utils/cli/runner.js";
import type { AgentCliScenario } from "../../test-utils/cli/model.js";

describe("browser public read-only web smoke scenario", () => {
  const cleanupFns: (() => void | Promise<void>)[] = [];
  const tempRoots: string[] = [];

  afterEach(async () => {
    for (const cleanup of cleanupFns.splice(0)) {
      await cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips by default without a network call", async () => {
    const config = parseBrowserPublicReadOnlyWebSmokeConfig({ env: {} });
    const result = await runBrowserPublicReadOnlyWebSmoke({ config });
    const report = renderBrowserPublicReadOnlyWebSmokeReport(result);

    expect(result.status).toBe("skipped");
    expect(result.publicNetworkUsed).toBe(false);
    expect(report).toContain("Smoke enabled: no");
    expect(report).toContain("Status: skipped");
    expect(report).toContain("Public network used: no");
  });

  it("blocks invalid URL, private URL, and unsupported method before network", async () => {
    for (const env of [
      enabledEnv({ [PUBLIC_WEB_SMOKE_URL_ENV]: "not-a-url" }),
      enabledEnv({ [PUBLIC_WEB_SMOKE_URL_ENV]: "https://user:pass@example.test/" }),
      enabledEnv({ [PUBLIC_WEB_SMOKE_URL_ENV]: "http://127.0.0.1:8123/" }),
      enabledEnv({ [PUBLIC_WEB_SMOKE_URL_ENV]: "https://example.test/", [PUBLIC_WEB_SMOKE_METHOD_ENV]: "POST" }),
    ]) {
      const result = await runBrowserPublicReadOnlyWebSmoke({
        config: parseBrowserPublicReadOnlyWebSmokeConfig({ env }),
        httpClient: async () => {
          throw new Error("network should not be called");
        },
      });
      expect(result.status).toBe("blocked");
      expect(result.publicNetworkUsed).toBe(false);
    }
  });

  it("executes injected read-only smoke and renders safe UX summary", async () => {
    const fixture = fixtureFor({ confirmed: true });
    const result = await runBrowserPublicReadOnlyWebSmoke({
      config: parseBrowserPublicReadOnlyWebSmokeConfig({
        env: enabledEnv({
          [PUBLIC_WEB_SMOKE_URL_ENV]: `${fixture.origin}/head`,
          [PUBLIC_WEB_SMOKE_METHOD_ENV]: "HEAD",
        }),
      }),
      httpClient: fixture.httpClient,
    });
    const report = renderBrowserPublicReadOnlyWebSmokeReport(result);

    expect(result.status).toBe("executed");
    expect(result.publicNetworkUsed).toBe(true);
    expect(report).toContain("Public read-only summary");
    expect(report).toContain("Not done: browser launch, JavaScript, auth/cookies, write action, raw content persistence.");
    expect(report).not.toContain("<main>");
    expect(fixture.requests).toEqual([`${fixture.origin}/head`]);
  });

  it("blocks injected redirect escape and reports unavailable client failure safely", async () => {
    const redirect = fixtureFor({
      responses: {
        "/": { statusCode: 302, headers: { "content-type": "text/plain" }, body: "", bodyBytes: 0, redirectLocation: "https://other.test/" },
      },
    });
    const blocked = await runBrowserPublicReadOnlyWebSmoke({
      config: parseBrowserPublicReadOnlyWebSmokeConfig({
        env: enabledEnv({ [PUBLIC_WEB_SMOKE_URL_ENV]: `${redirect.origin}/` }),
      }),
      httpClient: redirect.httpClient,
    });
    expect(blocked.status).toBe("blocked");
    expect(renderBrowserPublicReadOnlyWebSmokeReport(blocked)).toContain("blocked-redirect-escape");

    const unavailable = await runBrowserPublicReadOnlyWebSmoke({
      config: parseBrowserPublicReadOnlyWebSmokeConfig({
        env: enabledEnv({ [PUBLIC_WEB_SMOKE_URL_ENV]: "https://example.test/" }),
      }),
      httpClient: async () => {
        throw new Error("network unavailable");
      },
    });
    const report = renderBrowserPublicReadOnlyWebSmokeReport(unavailable);
    expect(unavailable.status).toBe("unavailable");
    expect(report).toContain("Status: unavailable");
    expect(report).not.toContain("network unavailable");
  });

  it("browser smoke command produces skipped/no-network CLI-shaped output by default", async () => {
    const result = await runBrowserLocalCommand(["smoke"], {
      cwd: process.cwd(),
      browserPublicReadOnlyWebSmokeConfig: parseBrowserPublicReadOnlyWebSmokeConfig({ env: {} }),
    });
    const sidebar = adaptCommandResultToSidebarEvent({
      command: "/browser",
      args: ["smoke"],
      result,
    });

    expect(result.output).toContain("Public read-only web smoke");
    expect(result.output).toContain("Status: skipped");
    expect(result.output).toContain("Public network used: no");
    expect(sidebar.title).toBe("Browser smoke");
    expect(sidebar.summary).toContain("Status: skipped");
  });

  it("real CLI smoke disabled scenario reports skipped without public network", async () => {
    const projectPath = tempRoot("cheers-route121-project-");
    const homeDir = tempRoot("cheers-route121-home-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 121 fixture\n", "utf8");
    const scenario: AgentCliScenario = {
      id: "route121-cli-public-smoke-disabled",
      name: "route121 CLI public smoke disabled",
      metadata: { route: "121", capability: ["browser", "public-readonly", "smoke", "real-cli"] },
      steps: [
        {
          id: "smoke",
          kind: "cli-command",
          prompt: "/browser smoke",
          assertions: [
            { id: "smoke-surface", kind: "stdout-contains", text: "Public read-only web smoke" },
            { id: "skipped", kind: "stdout-contains", text: "Status: skipped" },
            { id: "public-no", kind: "stdout-contains", text: "Public network used: no" },
            { id: "browser-no", kind: "stdout-contains", text: "Browser launched: no" },
            { id: "js-no", kind: "stdout-contains", text: "JavaScript executed: no" },
            { id: "safe-output", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };
    const result = await runAgentCliScenario({ scenario, projectPath, homeDir });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("publicSmoke=skipped/enabled=no/publicNetwork=no");
  });

  const realSmokeEnabled = process.env[PUBLIC_WEB_SMOKE_ENABLE_ENV] === "1" &&
    !!process.env[PUBLIC_WEB_SMOKE_URL_ENV];
  (realSmokeEnabled ? it : it.skip)("optional real public smoke is env-gated", async () => {
    const result = await runBrowserPublicReadOnlyWebSmoke({
      config: parseBrowserPublicReadOnlyWebSmokeConfig({ env: process.env }),
    });
    expect(["executed", "blocked", "unavailable"]).toContain(result.status);
    expect(renderBrowserPublicReadOnlyWebSmokeReport(result)).not.toContain("set-cookie");
  });

  function fixtureFor(input: Parameters<typeof createBrowserPublicReadOnlyWebScenarioFixture>[0] = {}) {
    const fixture = createBrowserPublicReadOnlyWebScenarioFixture(input);
    cleanupFns.push(fixture.cleanup);
    return fixture;
  }

  function enabledEnv(extra: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    return {
      [PUBLIC_WEB_SMOKE_ENABLE_ENV]: "1",
      [PUBLIC_WEB_SMOKE_TIMEOUT_ENV]: "1500",
      [PUBLIC_WEB_SMOKE_BYTE_BUDGET_ENV]: "4096",
      ...extra,
    };
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }
});
