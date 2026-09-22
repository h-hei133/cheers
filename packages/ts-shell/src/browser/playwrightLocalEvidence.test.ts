import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./commandContract.js";
import { createBrowserLocalFixture } from "./localFixture.js";
import { buildBrowserPlaywrightLocalEvidence } from "./playwrightLocalEvidence.js";

describe("browser Playwright local evidence", () => {
  it("redacts raw HTML, secrets, hidden reasoning, and raw stdio", () => {
    const request = parseBrowserCommandArgs(["execute", "extract", "headline"]).contract!.execution!;
    const evidence = buildBrowserPlaywrightLocalEvidence({
      executionId: "browser-exec:test",
      runtimeKind: "module",
      mode: "local-fixture",
      fixture: createBrowserLocalFixture({
        fixtureId: "fixture:test",
        title: "Safe title",
        url: "local-fixture://test",
        text: "Safe summary",
      }),
      request,
      safeObservationSummary: "<main>sk-testsecret123 hidden reasoning</main>",
      safeExtractionSummary: "headline with github_pat_12345678901234567890",
      actionTrace: ["<body>raw</body>", "chain of thought"],
      stdout: "<html>sk-testsecret123</html>",
      stderr: "ghp_12345678901234567890",
      executed: true,
    });

    const serialized = JSON.stringify(evidence);
    expect(evidence.redactions).toContain("raw-html");
    expect(evidence.redactions).toContain("secret-looking-content");
    expect(evidence.redactions).toContain("hidden-reasoning");
    expect(serialized).not.toContain("<main>");
    expect(serialized).not.toContain("sk-testsecret123");
    expect(serialized).not.toContain("github_pat_12345678901234567890");
    expect(serialized).not.toContain("chain of thought");
  });
});
