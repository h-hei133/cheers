import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import { createAgentSession, DefaultResourceLoader, getRuntimeConfig, type ExtensionAPI, type QueryEvent } from "../index.js";
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../session/model/state.js';

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

describe("DefaultResourceLoader", () => {
  it("awaits file factories and reports rejected initialization without partial extensions", async () => {
    const { work } = makeEnv();
    const ready = path.join(work, "ready.ts");
    const rejected = path.join(work, "rejected.ts");
    fs.writeFileSync(ready, `export default async api => {
      await Promise.resolve();
      api.registerTool({ name: 'file_ready', description: 'Ready', argsSchema: { type: 'object' }, execute: async () => ({ success: true, output: 'ready' }) });
    };`);
    fs.writeFileSync(rejected, `export default async api => {
      api.registerFlag({ name: 'partial' });
      await Promise.resolve();
      throw new Error('initialization failed');
    };`);
    const loader = new DefaultResourceLoader({ cwd: work, additionalExtensionPaths: [ready, rejected] });
    await loader.reload();
    expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(tool => tool.name)).toEqual(["file_ready"]);
    expect(loader.getExtensions().errors).toEqual([{ path: rejected, error: "initialization failed" }]);
  });
  it("redacts VM error data and never invokes thrown message getters", async () => {
    const { work } = makeEnv();
    const secret = path.join(work, "secret.ts");
    const getter = path.join(work, "getter.ts");
    fs.writeFileSync(secret, `export default async () => { throw new Error('token=private-value initialization failed'); };`);
    fs.writeFileSync(getter, `export default async () => { throw { get message() { while (true) {} } }; };`);
    const loader = new DefaultResourceLoader({ cwd: work, additionalExtensionPaths: [secret, getter] });
    await loader.reload();
    const errors = loader.getExtensions().errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]!.error).not.toContain("private-value");
    expect(errors[1]!.error).toBe("Extension initialization failed.");
  });
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

describe("createAgentSession & AgentSession", () => {
  it('selects a staged virtual startup option without inventing a physical model or replacing provider authority', async () => {
    const { work } = makeEnv();
    const route = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
    const resourceLoader = new DefaultResourceLoader({ cwd: work, noContextFiles: true, extensionFactories: [api => {
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Adaptive', route });
    }] });
    await resourceLoader.reload();
    const { session } = await createAgentSession({ cwd: work, resourceLoader, provider: 'google', model: 'adaptive/auto' });
    try {
      expect(readSessionModel(session.sessionId)).toEqual(expect.objectContaining({ provider: 'google', connectionScope: 'provider',
        virtualModel: { provider: 'adaptive', model: 'auto' } }));
      expect(readSessionModel(session.sessionId)?.model).toBeUndefined();
      expect(session.runtimeContext.resolveConfigTarget!(session.runtimeContext.runtimeConfig, session.sessionId).provider).toBe('google');
      expect(session.runtimeContext.runtimeConfig.provider).not.toBe('adaptive');
      expect(route).not.toHaveBeenCalled();
    } finally { await session.dispose(); }
  });
  it('edits only virtual effort when SDK resumes a saved logical model with a thinking option', async () => {
    const { work } = makeEnv();
    const resourceLoader = new DefaultResourceLoader({ cwd: work, noContextFiles: true, extensionFactories: [api => {
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Adaptive', thinkingLevels: ['high', 'max'],
        route: () => ({ provider: 'openai', modelId: 'physical' }) });
    }] });
    await resourceLoader.reload();
    const first = await createAgentSession({ cwd: work, resourceLoader, model: 'adaptive/auto' });
    const sessionId = first.session.sessionId;
    const selected = { ...readSessionModel(sessionId)!, thinkingEffort: 'low' as const,
      virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'high' as const } };
    writeSessionModel(sessionId, selected, readSessionModelEdit(sessionId));
    await first.session.dispose();
    await resourceLoader.reload();
    const second = await createAgentSession({ cwd: work, resourceLoader, sessionId, thinkingLevel: 'max' });
    try {
      expect(readSessionModel(sessionId)).toEqual({ ...selected, virtualModel: { ...selected.virtualModel, thinkingEffort: 'max' } });
      expect(second.session.runtimeContext.resolveConfigTarget!(second.session.runtimeContext.runtimeConfig, sessionId).thinkingEffort).toBe('low');
    } finally { await second.session.dispose(); }
  });
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
