import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "../../test-utils/cli/assertions.js";
import { runAgentCliScenario } from "../../test-utils/cli/runner.js";
import { renderAgentCliScenarioReport } from "../../test-utils/cli/report.js";
import {
  renderBrowserSelfHealingApplyCliReport,
  summarizeBrowserSelfHealingApplyCliScenario,
} from "./browserSelfHealingApplyCliReport.js";
import {
  createBrowserSelfHealingApplyCliScenarioFixture,
  writeInvalidBrowserSelfHealingApplyCliManifest,
  type BrowserSelfHealingApplyCliScenarioFixture,
} from "./browserSelfHealingApplyCliScenarioFixtures.js";
import type { AgentCliScenario } from "../../test-utils/cli/model.js";

describe("browser self-healing apply real CLI scenario examples", () => {
  const fixtures: BrowserSelfHealingApplyCliScenarioFixture[] = [];
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("repairs runner binding across CLI child processes", async () => {
    const fixture = track(createBrowserSelfHealingApplyCliScenarioFixture({ manifestKind: "external-runner" }));
    const result = await runRepairScenario("route115-runner-binding", fixture, fixture.proposalIds.runnerBinding, [
      {
        id: "status",
        kind: "cli-command",
        prompt: "/browser status",
        env: fixture.env,
        assertions: [
          { id: "manifest-valid", kind: "stdout-contains", text: "Manifest status: valid" },
          { id: "mode", kind: "stdout-contains", text: "Execution mode: test-local" },
          { id: "auto-replay", kind: "stdout-not-contains", text: "Replay executed: yes" },
        ],
      },
    ]);

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(fixture.inspectManifest()).toMatchObject({
      valid: true,
      runnerBindingPatched: true,
    });
    expect(summarizeBrowserSelfHealingApplyCliScenario(result)).toContain("Replay executed automatically: no");
  }, 20000);

  it("repairs skill metadata across CLI child processes while execution stays explicit", async () => {
    const fixture = track(createBrowserSelfHealingApplyCliScenarioFixture({ manifestKind: "skill-runner" }));
    const result = await runRepairScenario("route115-skill-metadata", fixture, fixture.proposalIds.skillMetadata, [
      {
        id: "status",
        kind: "cli-command",
        prompt: "/browser status",
        env: fixture.env,
        assertions: [
          { id: "metadata", kind: "stdout-contains", text: "Metadata status: available-metadata-only" },
          { id: "readiness", kind: "stdout-contains", text: "Skill metadata status: future-execution-required" },
          { id: "binding", kind: "stdout-contains", text: "Skill binding mode: none" },
          { id: "auto-replay", kind: "stdout-not-contains", text: "Replay executed: yes" },
        ],
      },
    ]);

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(fixture.inspectManifest()).toMatchObject({
      valid: true,
      skillMetadataReady: true,
      skillBindingReady: false,
    });
  }, 20000);

  it("repairs local fixture allowlist across CLI child processes and keeps external URL blocked", async () => {
    const fixture = track(createBrowserSelfHealingApplyCliScenarioFixture({ manifestKind: "local-fixture" }));
    const result = await runRepairScenario("route115-local-allowlist", fixture, fixture.proposalIds.allowlist, [
      {
        id: "observe",
        kind: "cli-command",
        prompt: "/browser execute observe local-fixture://route115-demo",
        env: fixture.env,
        assertions: [
          { id: "executed", kind: "executed-yes" },
          { id: "mode", kind: "stdout-contains", text: "Mode: local-fixture" },
        ],
      },
      {
        id: "external",
        kind: "cli-command",
        prompt: "/browser execute navigate https://example.com",
        env: fixture.env,
        assertions: [
          { id: "blocked", kind: "browser-execution-blocked" },
          { id: "executed-no", kind: "executed-no" },
        ],
      },
    ]);

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(fixture.inspectManifest()).toMatchObject({
      valid: true,
      localFixtureAllowlistPatched: true,
    });
  }, 30000);

  it("repairs fixture summary without exposing raw fixture content", async () => {
    const fixture = track(createBrowserSelfHealingApplyCliScenarioFixture({ manifestKind: "local-fixture" }));
    const result = await runRepairScenario("route115-fixture-refresh", fixture, fixture.proposalIds.fixtureRefresh, [
      {
        id: "status",
        kind: "cli-command",
        prompt: "/browser status",
        env: fixture.env,
        assertions: [
          { id: "manifest-valid", kind: "stdout-contains", text: "Manifest status: valid" },
          { id: "no-raw", kind: "no-raw-content-or-secrets" },
        ],
      },
    ]);

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(fixture.inspectManifest()).toMatchObject({
      valid: true,
      fixtureSummaryRefreshed: true,
    });
    expect(fs.readFileSync(fixture.manifestPath, "utf8")).not.toContain("RAW_");
  }, 20000);

  it("blocks external, unsafe, missing, invalid, global, and unconfirmed repair apply", async () => {
    const fixture = track(createBrowserSelfHealingApplyCliScenarioFixture({ manifestKind: "local-fixture" }));
    const invalidRoot = tempRoot("browser-self-healing-cli-invalid-");
    const invalidManifest = writeInvalidBrowserSelfHealingApplyCliManifest(invalidRoot);
    const result = await runAgentCliScenario({
      scenario: scenario("route115-blocked-repairs", [
        repairStep("external", fixture.proposalIds.externalBlocked, fixture.manifestPath, {
          assertions: [
            { id: "external", kind: "stdout-contains", text: "apply-blocked-external-network" },
            { id: "executed-no", kind: "stdout-contains", text: "Browser executed: no" },
          ],
        }),
        repairStep("unsafe", fixture.proposalIds.unsafeEvidence, fixture.manifestPath, {
          assertions: [{ id: "unsafe", kind: "stdout-contains", text: "apply-blocked-unsafe" }],
        }),
        repairStep("missing-manifest", fixture.proposalIds.runnerBinding, undefined, {
          assertions: [{ id: "missing", kind: "stdout-contains", text: "missing-explicit-manifest-context" }],
        }),
        repairStep("invalid-manifest", fixture.proposalIds.runnerBinding, invalidManifest, {
          assertions: [{ id: "invalid", kind: "stdout-contains", text: "Manifest could not be read or parsed." }],
        }),
        repairStep("global", fixture.proposalIds.runnerBinding, "/etc/cheers-browser.json", {
          assertions: [{ id: "global", kind: "stdout-contains", text: "global-manifest-scope" }],
        }),
        {
          id: "unconfirmed",
          kind: "cli-command",
          prompt: `/browser repair apply ${fixture.proposalIds.runnerBinding} --manifest ${fixture.manifestPath}`,
          assertions: [{ id: "confirm", kind: "stdout-contains", text: "missing-explicit-user-confirmation" }],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route115-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(fixture.inspectManifest().warningMarkers).toEqual([]);
  }, 30000);

  it("keeps replay explicit after repair apply", async () => {
    const fixture = track(createBrowserSelfHealingApplyCliScenarioFixture({ manifestKind: "external-runner" }));
    const result = await runRepairScenario("route115-replay-explicit", fixture, fixture.proposalIds.runnerBinding, [
      {
        id: "replay-status",
        kind: "cli-command",
        prompt: "/browser replay status",
        env: fixture.env,
        assertions: [
          { id: "cache", kind: "stdout-contains", text: "Cache configured: no" },
          { id: "auto", kind: "stdout-not-contains", text: "Replay executed: yes" },
        ],
      },
      {
        id: "replay",
        kind: "cli-command",
        prompt: "/browser replay route115-missing-receipt",
        env: fixture.env,
        assertions: [
          { id: "blocked", kind: "stdout-contains", text: "Outcome: blocked" },
          { id: "revalidates", kind: "stdout-contains", text: "Replay status:" },
        ],
      },
    ]);

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("repairApply=applied/runner-binding/changed=yes/manifestPatch=patch-allowed");
    expect(summarizeBrowserSelfHealingApplyCliScenario(result)).toContain("Browser executed: no");
  }, 30000);

  it("renders compact repair CLI reports without raw manifest content", () => {
    const report = renderBrowserSelfHealingApplyCliReport({
      scenarioId: "route115-report",
      proposalId: "browser-self-healing-proposal:route115:missing-runner-binding",
      patchKind: "add-runner-binding",
      manifestKind: "external-runner",
      applyProcessResult: "passed",
      followUpProcessResult: "passed",
      manifestPatched: true,
      browserExecuted: false,
      replayExecutedAutomatically: false,
      rawManifestExposed: false,
      warningsOrBlockers: [],
      nextAction: "Run /browser replay <receipt-id> explicitly if replay is needed.",
    });

    expect(report).toContain("Manifest patched: yes");
    expect(report).toContain("Replay executed automatically: no");
    expect(report).toContain("Raw manifest exposed: no");
    expect(report).not.toContain("RAW_");
  });

  async function runRepairScenario(
    id: string,
    fixture: BrowserSelfHealingApplyCliScenarioFixture,
    proposalId: string,
    followUpSteps: AgentCliScenario["steps"],
  ) {
    return runAgentCliScenario({
      scenario: scenario(id, [
        repairStep("apply", proposalId, fixture.manifestPath, {
          env: fixture.env,
          assertions: [
            { id: "applied", kind: "stdout-contains", text: "Outcome: applied" },
            { id: "patch", kind: "stdout-contains", text: "Manifest patch: patch-allowed" },
            { id: "browser", kind: "stdout-contains", text: "Browser executed: no" },
            { id: "replay", kind: "stdout-contains", text: "Replay executed: no" },
            { id: "auto", kind: "stdout-contains", text: "Automatic replay: no" },
          ],
        }),
        ...followUpSteps,
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route115-home-"),
    });
  }

  function repairStep(
    id: string,
    proposalId: string,
    manifestPath: string | undefined,
    options: {
      readonly env?: Readonly<Record<string, string>>;
      readonly assertions?: AgentCliScenario["steps"][number]["assertions"];
    },
  ): AgentCliScenario["steps"][number] {
    return {
      id,
      kind: "cli-command",
      prompt: [
        "/browser repair apply",
        proposalId,
        "--confirm",
        manifestPath ? `--manifest ${manifestPath}` : "",
      ].filter(Boolean).join(" "),
      env: options.env,
      assertions: options.assertions,
    };
  }

  function scenario(id: string, steps: AgentCliScenario["steps"]): AgentCliScenario {
    return {
      id,
      name: id,
      metadata: { route: "115", capability: ["browser", "self-healing", "real-cli"] },
      steps,
      expectedOutcome: { status: "passed" },
    };
  }

  function track<T extends BrowserSelfHealingApplyCliScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("cheers-route115-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 115 fixture\n", "utf8");
    return projectPath;
  }
});
