import { withConfiguration } from "../../../test-utils/configuration.js";
import fs from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

it("observes config changes and gateway state while completion never requests discovery", async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-mcp-completion-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  const context = withConfiguration({ cwd: root, projectRoot: root, session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext);
  const snapshot = vi.fn(); const unsubscribe = vi.fn(); const subscribe = vi.fn(() => unsubscribe);
  const load = createCatalogLoader(() => context, { snapshot, subscribe } as unknown as CliMcpGateway, []);
  const changed = vi.fn(); const closeTools = load.observe("tools", undefined, changed)!;
  const closeMcp = load.observe("mcp", undefined, changed)!;
  try {
    expect(await load("mcp", new AbortController().signal)).toEqual([]);
    const file = path.join(root, ".cheers", "mcp.json"); fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { fixture: { enabled: false, transport: "stdio", command: "must-never-run" } } }));
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect((await load("mcp", new AbortController().signal)).map(item => item.value)).toEqual(["fixture"]);
    expect(subscribe).toHaveBeenCalledOnce(); expect(snapshot).not.toHaveBeenCalled();
  } finally {
    closeTools(); closeMcp(); expect(unsubscribe).toHaveBeenCalledOnce();
    vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
  }
});
