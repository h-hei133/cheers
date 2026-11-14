import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import { createAgentSession, DefaultResourceLoader, getRuntimeConfig, type ExtensionAPI, type QueryEvent } from "../index.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalProviderMode = process.env.CHEERS_PROVIDER_MODE;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalProviderMode === undefined) delete process.env.CHEERS_PROVIDER_MODE;
  else process.env.CHEERS_PROVIDER_MODE = originalProviderMode;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeEnv(): { home: string; work: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-sdk-home-"));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-sdk-work-"));
  tempDirs.push(home, work);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CHEERS_PROVIDER_MODE = "synthetic";
  return { home, work };
}

describe("Track 3 DefaultResourceLoader", () => {
  it("loads inline extensionFactories, skills, themes, and systemPrompt/appendSystemPrompt", async () => {
    const { work } = makeEnv();
    const promptFile = path.join(work, "SYSTEM.md");
    fs.writeFileSync(promptFile, "System from file", "utf8");

    const loader = new DefaultResourceLoader({
      cwd: work,
      noThemes: false,
      systemPrompt: promptFile,
      appendSystemPrompt: ["Extra rule 1"],
      systemPromptOverride: (base) => `${base} + override`,
      extensionFactories: [
        (api) => {
          api.registerTool({
            name: "sdk_echo",
            description: "Echo input",
            argsSchema: { type: "object", properties: { value: { type: "string" } } },
            execute: async (args) => ({ success: true, output: String(args.value ?? "") }),
          });
          api.on("before_agent_start", async (payload) => payload);
        },
      ],
    });

    await loader.reload();
    const ext = loader.getExtensions();
    expect(ext.errors).toEqual([]);
    expect(ext.extensions).toHaveLength(1);
    expect(ext.extensions[0]!.extension.tools.map((t) => t.name)).toEqual(["sdk_echo"]);
    expect(loader.getSystemPrompt()).toBe("System from file + override");
    expect(loader.getAppendSystemPrompt()).toEqual(["Extra rule 1"]);
    expect(loader.getThemes().themes.length).toBeGreaterThan(0);

    // Rejects escaping extension paths when no custom assertSourceAccess is provided
    const outsideLoader = new DefaultResourceLoader({
      cwd: work,
      additionalExtensionPaths: ["../outside-ext.ts"],
    });
    await outsideLoader.reload();
    expect(outsideLoader.getExtensions().errors[0]?.error).toContain("outside workspace");
  });
});

describe("Track 3 createAgentSession & AgentSession", () => {
  it("binds hostBridge even for pre-reloaded DefaultResourceLoader and disposes cleanly", async () => {
    const { work } = makeEnv();
    let capturedApi: ExtensionAPI | undefined;
    const resourceLoader = new DefaultResourceLoader({
      cwd: work,
      noContextFiles: true,
      systemPrompt: "Embedded SDK prompt",
      skillsOverride: () => ({
        skills: [{ name: "sdk_skill", description: "SDK skill", body: "Follow SDK rule", filePath: path.join(work, "SKILL.md"), source: "cli", disableModelInvocation: false, unhonouredFields: [] }],
        diagnostics: [],
      }),
      extensionFactories: [
        (api) => {
          capturedApi = api;
          api.registerTool({
            name: "ext_ping",
            description: "Ping",
            argsSchema: { type: "object", properties: {} },
            execute: async () => ({ success: true, output: "pong" }),
          });
        },
      ],
    });
    await resourceLoader.reload();

    const { session, extensionsResult } = await createAgentSession({
      cwd: work,
      resourceLoader,
      noTools: "builtin",
      customTools: [
        {
          name: "custom_probe",
          description: "Custom probe",
          argsSchema: { type: "object", properties: {} },
          execute: async () => ({ success: true, output: "ok" }),
        },
      ],
    });

    try {
      expect(extensionsResult.errors).toEqual([]);
      expect(session.runtimeContext.runtimeConfig.allowedTools).toEqual(["custom_probe", "ext_ping"]);
      expect(session.runtimeContext.systemPrompt).toBe("Embedded SDK prompt");
      expect(session.runtimeContext.sdkSkills?.has("sdk_skill")).toBe(true);
      expect(await capturedApi!.getActiveTools()).toEqual(["custom_probe", "ext_ping"]);
      expect((await capturedApi!.getCommands()).length).toBeGreaterThan(0);

      const observed: QueryEvent[] = [];
      const unsubscribe = session.subscribe((event) => observed.push(event));
      const answer = await session.prompt("hello embedded sdk");
      unsubscribe();

      expect(answer).toContain("hello embedded sdk");
      expect(observed.some((e) => e.type === "query.completed")).toBe(true);
      expect(session.getState().turns.length).toBeGreaterThanOrEqual(2);
    } finally {
      await session.dispose();
    }
  });

  it("supports noTools: 'all', excludeTools via disabledTools, explicit runtimeConfig overrides, and caller-owned mcpGateway", async () => {
    const { work } = makeEnv();
    const s1 = await createAgentSession({ cwd: work, runtimeConfig: getRuntimeConfig(work), noTools: "all" });
    try {
      expect(s1.session.runtimeContext.runtimeConfig.allowedTools).toEqual([]);
    } finally {
      await s1.session.dispose();
    }

    const gateway = new CoreMcpGateway(() => work);
    const closeSpy = vi.spyOn(gateway, "close");
    const s2 = await createAgentSession({ cwd: work, excludeTools: ["bash", "write"], mcpGateway: gateway });
    try {
      expect(s2.session.runtimeContext.runtimeConfig.allowedTools).toBeUndefined();
      expect(s2.session.runtimeContext.runtimeConfig.disabledTools).toEqual(expect.arrayContaining(["bash", "write"]));
    } finally {
      await s2.session.dispose();
    }
    expect(closeSpy).not.toHaveBeenCalled();
    await gateway.close();
  });
});
