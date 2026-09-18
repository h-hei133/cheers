import { describe, expect, it } from "vitest";
import { runBrowserLocalCommand } from "./browserCommandRuntime.js";
import { createSidebarLiveEventStore } from "../../presentation/sidebar/sidebarLiveEventStore.js";
import { FakeBrowserExecutor } from "../context/browserExecutor.js";
import { createBrowserSandboxAuthority } from "../context/browserSandboxAuthority.js";
import { BrowserExternalRunnerExecutor } from "../../browser/runtime/external/executor.js";
import { validateBrowserExternalRunnerManifest } from "../../browser/runtime/external/manifest.js";
import { createBrowserSkillRunnerMetadata } from "../context/browser/skill/runner/metadata.js";
import { classifyBrowserSkillRunnerReadiness } from "../context/browser/skill/runner/readiness.js";
import { createBrowserSkillExecutionScenarioFixture } from "../harness/browserSkillExecutionScenarioFixtures.js";
import { createBrowserCliExecutionBridge } from "../context/browserCliExecutionBridge.js";
import { loadBrowserCliExecutorInjectionFromEnv } from "../context/browserCliExecutorInjection.js";
import { createBrowserExternalRunnerScenarioFixture } from "../harness/browserExternalRunnerScenarioFixtures.js";

describe("browser local command runtime", () => {
  it("emits a sidebar event for blocked browser execution", async () => {
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-17T00:00:00.000Z",
      nextId: () => "sidebar-event:test",
    });
    const result = await runBrowserLocalCommand(["execute", "navigate", "https://example.com"], {
      cwd: "/tmp/browser-command-runtime-test",
      sessionId: "browser-runtime-test",
      sidebarLiveEventStore,
    });

    expect(result.output).toContain("External browser execution");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("- Runner manifest: missing");
    const events = sidebarLiveEventStore.listRecent({
      sessionScopeId: "session:browser-runtime-test",
      includeDeveloperOnly: true,
    }).events;
    expect(events.map((event) => event.title)).toContain("Browser execution");
    expect(events[0]?.severity).toBe("blocked");
  });

  it("emits a sidebar event for fake/test browser execution", async () => {
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-17T00:00:00.000Z",
      nextId: () => "sidebar-event:test",
    });
    const result = await runBrowserLocalCommand(["execute", "observe"], {
      cwd: "/tmp/browser-command-runtime-test",
      sessionId: "browser-runtime-test",
      sidebarLiveEventStore,
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
    });

    expect(result.output).toContain("- Executed: yes");
    const events = sidebarLiveEventStore.listRecent({
      sessionScopeId: "session:browser-runtime-test",
      includeDeveloperOnly: true,
    }).events;
    expect(events.map((event) => event.title)).toContain("Browser execution");
    expect(events[0]?.summary).toContain("Executed: yes");
  });

  it("emits a sanitized sidebar event for external runner execution", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    try {
      const validation = validateBrowserExternalRunnerManifest(fixture.manifest);
      expect(validation.ok).toBe(true);
      const sidebarLiveEventStore = createSidebarLiveEventStore({
        now: () => "2026-05-17T00:00:00.000Z",
        nextId: () => "sidebar-event:test",
      });
      const result = await runBrowserLocalCommand(["execute", "observe", "local-fixture://route103-demo"], {
        cwd: "/tmp/browser-command-runtime-test",
        sessionId: "browser-runtime-test",
        sidebarLiveEventStore,
        browserExecutor: new BrowserExternalRunnerExecutor({
          manifest: validation.ok ? validation.manifest : fixture.manifest,
          fixture: validation.ok ? validation.fixture : undefined!,
        }),
        browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
      });

      expect(result.output).toContain("External browser runner");
      expect(result.output).toContain("- Executed: yes");
      const events = sidebarLiveEventStore.listRecent({
        sessionScopeId: "session:browser-runtime-test",
        includeDeveloperOnly: true,
      }).events;
      expect(events.map((event) => event.title)).toContain("Browser execution");
      expect(JSON.stringify(events)).not.toContain("RAW_");
    } finally {
      fixture.cleanup();
    }
  });

  it("surfaces skill-managed metadata status without executing skills", async () => {
    const metadata = createBrowserSkillRunnerMetadata();
    const readiness = classifyBrowserSkillRunnerReadiness({
      metadata,
      futureExecutionRequired: true,
    });
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-17T00:00:00.000Z",
      nextId: () => "sidebar-event:test",
    });
    const result = await runBrowserLocalCommand(["execute", "observe"], {
      cwd: "/tmp/browser-command-runtime-test",
      sessionId: "browser-runtime-test",
      sidebarLiveEventStore,
      browserCliExecutionBridgeSummary: {
        executorSource: "cli-harness",
        manifestStatus: "valid",
        executionMode: "skill-managed",
        dependencyDecision: "external-runner-only; packageMutation=none; defaultExecution=disabled",
        externalRunnerStatus: "future-execution-required",
        skillRunnerMetadata: metadata,
        skillRunnerReadiness: readiness,
        reason: "Skill-managed runner metadata is valid; execution waits for an explicit future bridge.",
        evidence: readiness.evidence,
        warnings: [],
        redactions: [],
      },
    });

    expect(result.output).toContain("Skill-managed browser runner");
    expect(result.output).toContain("- Execution: not enabled");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("- Replay readiness: replay-needs-skill-runner");
    const events = sidebarLiveEventStore.listRecent({
      sessionScopeId: "session:browser-runtime-test",
      includeDeveloperOnly: true,
    }).events;
    expect(events[0]?.summary).toContain("Metadata status");
  });

  it("emits a sanitized sidebar event for skill-managed runner execution", async () => {
    const fixture = createBrowserSkillExecutionScenarioFixture();
    try {
      const bridge = createBrowserCliExecutionBridge(
        loadBrowserCliExecutorInjectionFromEnv({
          env: fixture.env,
        }),
      );
      const sidebarLiveEventStore = createSidebarLiveEventStore({
        now: () => "2026-05-17T00:00:00.000Z",
        nextId: () => "sidebar-event:test",
      });
      const result = await runBrowserLocalCommand(["execute", "observe", "local-fixture://route106-demo"], {
        cwd: "/tmp/browser-command-runtime-test",
        sessionId: "browser-runtime-test",
        sidebarLiveEventStore,
        browserExecutor: bridge.browserExecutor,
        browserSandboxAuthority: bridge.browserSandboxAuthority,
        browserNetworkAllowlist: bridge.browserNetworkAllowlist,
        browserExecutionConfirmations: bridge.browserExecutionConfirmations,
        browserCliExecutionBridgeSummary: bridge.browserCliExecutionBridgeSummary,
      });

      expect(result.output).toContain("Skill-managed browser execution");
      expect(result.output).toContain("- Executed: yes");
      const events = sidebarLiveEventStore.listRecent({
        sessionScopeId: "session:browser-runtime-test",
        includeDeveloperOnly: true,
      }).events;
      expect(events.map((event) => event.title)).toContain("Browser execution");
      expect(events[0]?.summary).toContain("Binding mode");
      expect(JSON.stringify(events)).not.toContain("RAW_");
    } finally {
      fixture.cleanup();
    }
  });
});
