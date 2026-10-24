import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBrowserRuntimeProcessAdapter } from "./core/processAdapter.js";
import { runBrowserExternalRunnerProcess } from "./external/runner.js";
import { createBrowserExternalRunnerRequest } from "./external/protocol.js";
import { runBrowserSkillExecutionProcess } from "../skill/execution/executor.js";
import { createBrowserSkillRunnerBinding } from "../skill/runner/binding.js";
import { createBrowserSkillRunnerMetadata } from "../skill/runner/metadata.js";
import { createBrowserRuntimeAdapterFixture } from "../../test-utils/browser/runtime/adapter/fixtures.js";
import { createBrowserExternalRunnerScenarioFixture } from "../../test-utils/browser/execution/external/fixtures.js";
import { browserRuntimeRequest } from "../../test-utils/browser/runtime/capability/fixtures.js";
import { parseBrowserCommandArgs } from "../commandContract.js";

describe("browser process owners use native lifetime", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

  function fixture(owner: string) {
    if (owner === "runtime") {
      const fixture = createBrowserRuntimeAdapterFixture(); cleanups.push(fixture.cleanup);
      if (fixture.externalManifest.status !== "valid") throw new Error("invalid runtime fixture");
      const manifest = fixture.externalManifest.manifest;
      return { ...fixture, run: (signal: AbortSignal) => runBrowserRuntimeProcessAdapter({ signal, manifest,
        request: browserRuntimeRequest("observe", fixture.origin) }) };
    }
    const fixture = createBrowserExternalRunnerScenarioFixture(); cleanups.push(fixture.cleanup);
    const request = parseBrowserCommandArgs(["execute", "observe", "local-fixture://route103-demo"]).contract!.execution!;
    const runnerRequest = createBrowserExternalRunnerRequest({ request, mode: "test-local", fixtureId: fixture.manifest.fixture.id,
      safeUrl: fixture.manifest.fixture.url, outputBudgetBytes: 4096, sandboxDecision: "local-fixture:allowed",
      allowlistDecision: "network:none", confirmationDecision: "sandbox:confirmed" });
    const metadata = createBrowserSkillRunnerMetadata({ runnerId: "skill:cancel", skillId: "skill:cancel", actions: ["observe"] });
    const binding = createBrowserSkillRunnerBinding({ metadata, runnerCommand: fixture.manifest.runnerCommand, timeoutMs: 1500 });
    return { ...fixture, run: (signal: AbortSignal) => owner === "external"
      ? runBrowserExternalRunnerProcess({ signal, manifest: fixture.manifest, request: runnerRequest })
      : runBrowserSkillExecutionProcess({ signal, binding, request: {} }) };
  }

  it.each(["runtime", "external", "skill"])("%s pre-cancel starts no process", async owner => {
    const local = fixture(owner);
    const marker = path.join(local.root, "started");
    fs.writeFileSync(local.runnerPath, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`);
    const controller = new AbortController(); controller.abort();
    const result = await local.run(controller.signal);
    expect(result).toMatchObject({ status: "cancelled", started: false, cleanupStatus: "not-started" });
    expect(fs.existsSync(marker)).toBe(false);
  });

  it.each(["runtime", "external", "skill"])("%s waits for native tree cancellation", async owner => {
    const local = fixture(owner);
    const marker = path.join(local.root, "ready");
    // An ordinary descendant remains in the native owner's process group.
    fs.writeFileSync(local.runnerPath, `
      import { spawn } from 'node:child_process';
      import fs from 'node:fs';
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      fs.writeFileSync(${JSON.stringify(marker + '.pending')}, JSON.stringify([process.pid, child.pid]));
      fs.renameSync(${JSON.stringify(marker + '.pending')}, ${JSON.stringify(marker)});
      setInterval(() => {}, 1000);
    `.replaceAll("import { spawn } from 'node:child_process';", owner === "runtime" ? "import { spawn } from 'node:child_process';" : "const { spawn } = require('node:child_process');")
      .replaceAll("import fs from 'node:fs';", owner === "runtime" ? "import fs from 'node:fs';" : "const fs = require('node:fs');"));
    const controller = new AbortController();
    const pending = local.run(controller.signal);
    try {
      await until(() => fs.existsSync(marker));
      controller.abort();
      const result = await pending;
      expect(result).toMatchObject({ status: "cancelled", started: true, cleanupStatus: "closed" });
      const pids: number[] = JSON.parse(fs.readFileSync(marker, "utf8"));
      for (const pid of pids) expect(running(pid)).toBe(false);
    } finally { controller.abort(); await pending; }
  });
});

async function until(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 1200;
  while (!check()) {
    if (performance.now() > deadline) throw new Error("runner did not reach its startup barrier");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] !== "Z";
    }
    return true;
  } catch { return false; }
}
