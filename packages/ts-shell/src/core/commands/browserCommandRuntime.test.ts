import { describe, expect, it } from "vitest";
import { runBrowserLocalCommand } from "./browserCommandRuntime.js";
import { createSidebarLiveEventStore } from "../context/sidebarLiveEventStore.js";
import { FakeBrowserExecutor } from "../context/browserExecutor.js";
import { createBrowserSandboxAuthority } from "../context/browserSandboxAuthority.js";
import { BrowserExternalRunnerExecutor } from "../context/browserExternalRunnerExecutor.js";
import { validateBrowserExternalRunnerManifest } from "../context/browserExternalRunnerManifest.js";
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

    expect(result.output).toContain("- Policy decision: blocked-no-executor");
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
});
