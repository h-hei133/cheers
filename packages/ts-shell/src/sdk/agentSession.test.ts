import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import { createAgentSession, DefaultResourceLoader, getRuntimeConfig, type ExtensionAPI, type ExtensionModelUpdate, type ExtensionThinkingUpdate, type QueryEvent } from "../index.js";
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../session/model/state.js';
import { sessionMcpDefinitions } from '../core/catalog/mcp.js';
import { renderCustomMessage } from '../core/catalog/renderers.js';

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
  it('publishes session registrations through the public resource loader and withdraws them on disposal', async () => {
    const { work } = makeEnv();
    const resourceLoader = new DefaultResourceLoader({ cwd: work, noContextFiles: true, extensionFactories: [api => {
      api.registerProvider('example-relay', {
        runtime: 'openai', baseUrl: 'http://127.0.0.1:9080/v1', models: [{ id: 'custom-model', contextWindow: 2048 }],
      });
      api.registerMcpServer('example-mcp', { url: 'http://127.0.0.1:9080/mcp', enabled: false });
      api.registerMessageRenderer('example-note', message => `Note: ${message.content}`);
    }] });
    await resourceLoader.reload();
    const { session } = await createAgentSession({ cwd: work, resourceLoader });
    const definitions = sessionMcpDefinitions(() => session.sessionId);
    const message = { role: 'custom', customType: 'example-note', content: 'original', display: true } as const;
    try {
      expect(session.getModelCatalog().physical.find(provider => provider.id === 'example-relay')).toMatchObject({
        runtime: 'openai', models: [{ id: 'custom-model', contextWindow: 2048 }],
      });
      expect(definitions.read(work)['example-mcp']).toMatchObject({ enabled: false, transport: 'http', extensionOwner: expect.any(String) });
      expect(renderCustomMessage(work, session.sessionId, message)).toBe('Note: original');
    } finally { await session.dispose(); }
    expect(definitions.read(work)).toEqual({});
    expect(renderCustomMessage(work, session.sessionId, message)).toBeUndefined();
  });

  it('changes the logical model through an idle extension callback without acquiring provider authority', async () => {
    const { work } = makeEnv();
    const route = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
    let apiRef: ExtensionAPI | undefined;
    let receipt: ExtensionModelUpdate | undefined;
    const resourceLoader = new DefaultResourceLoader({ cwd: work, noContextFiles: true, extensionFactories: [api => {
      apiRef = api;
      api.registerVirtualModel({ provider: 'adaptive', id: 'first', name: 'First', route });
      api.registerVirtualModel({ provider: 'adaptive', id: 'second', name: 'Second', route });
      api.on('session_start', async () => { receipt = await api.setModel('adaptive/second'); });
    }] });
    await resourceLoader.reload();
    const { session } = await createAgentSession({ cwd: work, resourceLoader, provider: 'google', model: 'adaptive/first' });
    try {
      expect(receipt).toEqual({ status: 'applied', model: 'adaptive/second' });
      expect(readSessionModel(session.sessionId)).toMatchObject({ provider: 'google', virtualModel: { provider: 'adaptive', model: 'second' } });
      expect(route).not.toHaveBeenCalled();
      await expect(apiRef!.setModel('adaptive/first')).rejects.toThrow('callback');
    } finally { await session.dispose(); }
    await expect(apiRef!.setModel('adaptive/first')).rejects.toThrow(/retired/);
  });

  it('narrows the ordinary request tool pool and releases the selection on reload', async () => {
    const { work } = makeEnv();
    let current!: ExtensionAPI;
    let original!: ExtensionAPI;
    const resourceLoader = new DefaultResourceLoader({ cwd: work, noContextFiles: true, extensionFactories: [api => {
      current = api;
      if (original) return;
      original = api;
      api.on('session_start', async () => {
        const selection = ['read', 'write'];
        await api.setActiveTools(selection);
        selection[0] = 'grep';
      });
      api.registerCommand({ name: 'update-tools', kind: 'local', summary: 'Update tools', group: 'session', execute: async () => {
        await api.setActiveTools([]);
        return { kind: 'local', output: 'changed' };
      } });
    }] });
    await resourceLoader.reload();
    const { session, extensionsResult } = await createAgentSession({ cwd: work, resourceLoader,
      tools: ['read', 'grep'], runtimeConfigOverrides: { toolDiscovery: 'full' } });
    try {
      expect(await current.getActiveTools()).toEqual(['read']);
      const command = extensionsResult.extensions[0]!.extension.commands[0]!;
      await session.sessionRuntime.commands.run(async () => {
        await expect(command.execute([], { cwd: work, sessionId: session.sessionId })).rejects.toThrow('Finish the current session operation');
      });
      await session.prompt('first request');
      await session.waitForIdle();
      const selected = session.runtimeContext.promptIdentity?.schemaDigest;
      expect(selected).toMatch(/^[a-f\d]{64}$/);
      const result = await session.reload();
      expect(result, 'reason' in result ? result.reason : undefined).toMatchObject({ status: 'reloaded' });
      await expect(original.setActiveTools([])).rejects.toThrow(/retired/);
      expect(await current.getActiveTools()).toEqual(expect.arrayContaining(['read', 'grep']));
      await session.prompt('second request');
      expect(session.runtimeContext.promptIdentity?.schemaDigest).toMatch(/^[a-f\d]{64}$/);
      expect(session.runtimeContext.promptIdentity?.schemaDigest).not.toBe(selected);
    } finally { await session.dispose(); }
  });

  it('saves virtual effort from an admitted SDK callback and refuses busy or retired invocations', async () => {
    const { work } = makeEnv();
    const route = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
    const updates: ExtensionThinkingUpdate[] = [];
    let captured: ExtensionAPI | undefined;
    let unsupported: unknown;
    const resourceLoader = new DefaultResourceLoader({ cwd: work, noContextFiles: true, extensionFactories: [api => {
      captured = api;
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Adaptive', thinkingLevels: ['high'], route });
      api.on('session_start', async () => {
        updates.push(await api.setThinkingLevel('high'));
        try { await api.setThinkingLevel('max'); } catch (error) { unsupported = error; }
        updates.push(await api.setThinkingLevel(null));
      });
      api.registerCommand({ name: 'update-effort', kind: 'local', summary: 'Update effort', group: 'session', execute: async () => {
        await api.setThinkingLevel('high');
        return { kind: 'local', output: 'changed' };
      } });
    }] });
    await resourceLoader.reload();
    const { session, extensionsResult } = await createAgentSession({ cwd: work, resourceLoader, provider: 'google', model: 'adaptive/auto' });
    try {
      expect(updates).toEqual([{ status: 'applied', level: 'high' }, { status: 'applied', level: null }]);
      expect(unsupported).toMatchObject({ message: expect.stringContaining('does not support the selected reasoning effort') });
      const persisted = readSessionModel(session.sessionId);
      expect(persisted).toEqual({ provider: 'google', connectionScope: 'provider', virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: null } });
      expect(route).not.toHaveBeenCalled();
      await expect(captured!.setThinkingLevel('high')).rejects.toThrow('outside an extension callback');
      const command = extensionsResult.extensions[0]!.extension.commands[0]!;
      await session.sessionRuntime.commands.run(async () => {
        await expect(command.execute([], { cwd: work, sessionId: session.sessionId })).rejects.toThrow('Finish the current session operation');
      });
      expect(readSessionModel(session.sessionId)).toEqual(persisted);
    } finally { await session.dispose(); }
    await expect(captured!.setThinkingLevel('high')).rejects.toThrow(/retired/);
  });

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
