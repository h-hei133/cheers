import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "../../cli/assertions.js";
import { renderAgentCliScenarioReport } from "../../cli/report.js";
import { runAgentCliScenario } from "../../cli/runner.js";
import type { AgentCliScenario } from "../../cli/model.js";
import { BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV } from "../../../browser/cliExecutorInjection.js";
import {
  createBrowserExternalRunnerManifest,
  serializeBrowserExternalRunnerManifest,
} from "../../../browser/runtime/external/manifest.js";
import { createBrowserSkillRunnerMetadata } from "../../../browser/skill/runner/metadata.js";

describe("browser skill runner CLI scenario examples", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports no skill metadata as future skill required", async () => {
    const env = writeManifestEnv(createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
    }));
    const result = await runAgentCliScenario({
      scenario: scenario("route105-no-skill-metadata", [
        {
          id: "status",
          kind: "cli-command",
          prompt: "/browser status",
          env,
          assertions: [
            { id: "future", kind: "stdout-contains", text: "future-skill-required" },
            { id: "metadata", kind: "stdout-contains", text: "Skill-managed browser runner" },
            { id: "executed", kind: "stdout-contains", text: "Execution: not enabled" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route105-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("loads valid metadata while keeping execution disabled", async () => {
    const env = validMetadataEnv();
    const result = await runAgentCliScenario({
      scenario: scenario("route105-valid-skill-metadata", [
        {
          id: "status",
          kind: "cli-command",
          prompt: "/browser status",
          env,
          assertions: [
            { id: "metadata", kind: "stdout-contains", text: "Metadata status: available-metadata-only" },
            { id: "readiness", kind: "stdout-contains", text: "Skill metadata status: future-execution-required" },
            { id: "no-exec", kind: "stdout-contains", text: "Execution: not enabled" },
          ],
        },
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route105-demo",
          env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "replay", kind: "stdout-contains", text: "Replay readiness: replay-needs-skill-runner" },
            { id: "next", kind: "stdout-contains", text: "Route 106 skill runner execution bridge" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route105-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("skill=available-metadata-only");
  }, 20000);

  it("blocks unsafe skill capabilities without raw manifest leaks", async () => {
    const env = writeManifestEnv(createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: createBrowserSkillRunnerMetadata({
        actions: ["observe", "auth", "arbitrary-js"],
      }),
    }));
    const result = await runAgentCliScenario({
      scenario: scenario("route105-unsafe-skill-metadata", [
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route105-demo",
          env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "invalid", kind: "stdout-contains", text: "Manifest status: invalid" },
            { id: "executed-no", kind: "executed-no" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route105-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  function validMetadataEnv(): Record<string, string> {
    return writeManifestEnv(createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: createBrowserSkillRunnerMetadata({
        runnerId: "skill:browser-runner",
        skillId: "skill:browser-runner",
        skillName: "Browser runner skill",
        actions: ["observe", "extract", "navigate-local"],
      }),
    }));
  }

  function writeManifestEnv(manifest: ReturnType<typeof createBrowserExternalRunnerManifest>): Record<string, string> {
    const root = tempRoot("cheers-route105-manifest-");
    const manifestPath = path.join(root, "browser-skill-runner.json");
    fs.writeFileSync(manifestPath, serializeBrowserExternalRunnerManifest(manifest), "utf8");
    return { [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: manifestPath };
  }

  function scenario(id: string, steps: AgentCliScenario["steps"]): AgentCliScenario {
    return {
      id,
      name: id,
      metadata: { route: "105", capability: ["browser", "skill-runner", "metadata"] },
      steps,
      expectedOutcome: { status: "passed" },
    };
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("cheers-route105-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 105 fixture\n", "utf8");
    return projectPath;
  }
});
