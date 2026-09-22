import { describe, expect, it } from "vitest";
import { parseBrowserPreviewActionArgs } from "../../actionContract.js";
import { createBrowserExecutionRequest } from "../../executionContract.js";
import { createBrowserLocalFixture } from "../../localFixture.js";
import { createBrowserSkillRunnerMetadata } from "../runner/metadata.js";
import { createBrowserSkillRunnerBinding } from "../runner/binding.js";
import { prepareBrowserSkillExecutionBridge } from "./bridge.js";

describe("browser skill execution bridge", () => {
  it("blocks missing binding and allows explicit test-local binding", () => {
    const metadata = createBrowserSkillRunnerMetadata();
    const request = browserRequest(["observe", "local-fixture://route106-demo"]);
    const fixture = createBrowserLocalFixture({
      fixtureId: "fixture:route106-demo",
      url: "local-fixture://route106-demo",
      text: "Safe Route 106 fixture.",
    });
    const missing = prepareBrowserSkillExecutionBridge({
      request,
      metadata,
      fixture,
    });
    const ready = prepareBrowserSkillExecutionBridge({
      request,
      metadata,
      binding: createBrowserSkillRunnerBinding({
        metadata,
        runnerCommand: {
          command: process.execPath,
          args: ["/tmp/route106-skill-runner.cjs"],
        },
      }),
      fixture,
    });

    expect(missing.status).toBe("future-execution-required");
    expect(ready.status).toBe("ready");
    expect(ready.request?.mode).toBe("skill-managed-test-local");
  });

  it("blocks unsupported actions", () => {
    const metadata = createBrowserSkillRunnerMetadata({ actions: ["observe"] });
    const request = browserRequest(["extract", "route106 summary"]);
    const fixture = createBrowserLocalFixture({
      fixtureId: "fixture:route106-demo",
      url: "local-fixture://route106-demo",
      text: "Safe Route 106 fixture.",
    });
    const ready = prepareBrowserSkillExecutionBridge({
      request,
      metadata,
      binding: createBrowserSkillRunnerBinding({
        metadata,
        allowedActions: ["observe"],
        runnerCommand: {
          command: process.execPath,
          args: ["/tmp/route106-skill-runner.cjs"],
        },
      }),
      fixture,
    });

    expect(ready.status).toBe("blocked-unsupported-action");
  });

  function browserRequest(args: readonly string[]) {
    const parsed = parseBrowserPreviewActionArgs(args);
    expect(parsed.ok).toBe(true);
    return createBrowserExecutionRequest({ action: parsed.contract! });
  }
});
