import { describe, expect, it } from "vitest";
import { runBrowserLocalCommand } from "./browserCommandRuntime.js";
import { createSidebarLiveEventStore } from "../context/sidebarLiveEventStore.js";
import { FakeBrowserExecutor } from "../context/browserExecutor.js";
import { createBrowserSandboxAuthority } from "../context/browserSandboxAuthority.js";

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
});
