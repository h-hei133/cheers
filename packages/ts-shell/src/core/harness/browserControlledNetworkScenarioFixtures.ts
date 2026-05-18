import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_CONTROLLED_NETWORK_RUNNER_MANIFEST_ENV,
  createBrowserControlledNetworkRunnerManifest,
  serializeBrowserControlledNetworkRunnerManifest,
  type BrowserControlledNetworkRunnerManifest,
} from "../context/browserControlledNetworkRunnerManifest.js";
import {
  createBrowserControlledNetworkServer,
  type BrowserControlledNetworkServer,
} from "./browserControlledNetworkServer.js";

export interface BrowserControlledNetworkScenarioFixture {
  readonly root: string;
  readonly server: BrowserControlledNetworkServer;
  readonly manifestPath: string;
  readonly manifest: BrowserControlledNetworkRunnerManifest;
  readonly env: Readonly<Record<string, string>>;
  cleanup(): Promise<void>;
}

export async function createBrowserControlledNetworkScenarioFixture(input: {
  readonly prefix?: string;
  readonly timeoutMs?: number;
  readonly unsafeManifest?: unknown;
} = {}): Promise<BrowserControlledNetworkScenarioFixture> {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), input.prefix ?? "private-agents-browser-controlled-network-"),
  );
  const server = await createBrowserControlledNetworkServer();
  const manifest = createBrowserControlledNetworkRunnerManifest({
    source: "cli-harness",
    allowedLoopbackOrigin: server.origin,
    runId: server.runId,
    timeoutMs: input.timeoutMs,
  });
  const manifestPath = path.join(root, "browser-controlled-network-runner-manifest.json");
  fs.writeFileSync(
    manifestPath,
    input.unsafeManifest
      ? `${JSON.stringify(input.unsafeManifest, null, 2)}\n`
      : serializeBrowserControlledNetworkRunnerManifest(manifest),
    "utf8",
  );
  return {
    root,
    server,
    manifestPath,
    manifest,
    env: {
      [BROWSER_CLI_CONTROLLED_NETWORK_RUNNER_MANIFEST_ENV]: manifestPath,
    },
    cleanup: async () => {
      await server.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
