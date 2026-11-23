import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { modelCatalog } from "./models.js";
import { workflowCatalog } from "./workflows.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { projectTrust } from "../../../core/security/projectTrust.js";
import { getRuntimeConfig, type ProviderConnectionConfig, type RuntimeConfig } from "../../../config/runtimeConfig.js";
import { mergeProviders, type CatalogProvider } from "../../../core/models/catalog.js";

let root: string;
const endpoint = (name: string) => `https://${name}.invalid/v1`;

beforeEach(() => {
  const temporary = path.join(os.tmpdir(), "cheers-test");
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, "model-workflow-"));
  vi.stubEnv("HOME", root);
  vi.stubEnv("USERPROFILE", root);
  vi.stubEnv("CHEERS_TEST_ROOT", root);
  fs.mkdirSync(path.join(root, ".cheers"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function request(text: string) {
  return catalogRequest({ text, cursor: text.length, revision: 1 });
}

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    ...getRuntimeConfig(root),
    provider: "openai",
    activeProviderConnectionId: undefined,
    providerConnections: [],
    providerCredentials: {},
    ...overrides,
  };
}

function connection(id: string, baseUrl: string): ProviderConnectionConfig {
  return {
    id,
    provider: "openai-compatible",
    authType: "api-key",
    apiKey: `synthetic-${id}`,
    baseUrl,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

it.each([
  ["/model ", "model"],
  ["/model openai/", "model"],
  ["/model SET openai/", "model"],
  ["/model --global openai/", "model"],
  ["/model list open", "provider"],
  ["/model ls --refresh open", "provider"],
  ["/workflow run ", "workflow"],
  ["/workflow start f", "workflow"],
])("resolves %s", (text, kind) => {
  expect(request(text)?.kind).toBe(kind);
});

it.each([
  "/model status ",
  "/model help ",
  "/model config ",
  "/model refresh ",
  "/model use first extra",
  "/model use --bad ",
  "/workflow list ",
  "/workflow status ",
  "/workflow run first extra",
])("ignores %s", text => {
  expect(request(text)).toBeUndefined();
});

it("reads overlays without creating or refreshing files and retains fixed actions", () => {
  const file = path.join(root, ".cheers", "models.json");
  fs.writeFileSync(file, JSON.stringify({ providers: { openai: { models: [{ id: "fixture-model", contextWindow: 1000 }] } } }));
  const bytes = fs.readFileSync(file);
  const mtime = fs.statSync(file).mtimeMs;
  const runtime = config();

  expect(modelCatalog("model", undefined, [], { config: runtime, env: {} }).map(item => item.value))
    .toContain("openai/fixture-model");
  const providers = modelCatalog("provider", undefined, [], { config: runtime, env: {} });
  expect(providers.map(item => item.value)).toContain("openai");
  expect(providers.every(item => !item.value.includes("/"))).toBe(true);
  expect(catalogSuggestions(request("/model ")!, []).map(item => item.value)).toContain("status");
  expect(fs.readFileSync(file)).toEqual(bytes);
  expect(fs.statSync(file).mtimeMs).toBe(mtime);
  expect(fs.existsSync(path.join(root, ".cheers", "models-cache.json"))).toBe(false);
});

it("omits a large unconfigured catalogue and includes ready and explicitly configured targets", () => {
  const unconfigured: CatalogProvider = {
    id: "openai", label: "OpenAI", runtime: "openai", auth: "api-key",
    models: Array.from({ length: 9197 }, (_, index) => ({ id: `unconfigured-${index}` })),
  };
  const ready: CatalogProvider = {
    id: "openai", label: "OpenAI", runtime: "openai", auth: "api-key", models: [{ id: "ready-model" }],
  };
  const configured = mergeProviders([], [{
    id: "my-provider", label: "My provider", runtime: "openai-compatible", auth: "api-key",
    baseUrl: endpoint("custom"), models: [{ id: "configured-model" }],
  }], { origin: 'user' })[0]!;
  const emptyConfig = config();
  const readyConfig = config({ providerCredentials: { openai: { apiKey: "synthetic-openai" } } });

  expect(modelCatalog("model", [unconfigured], [], { config: emptyConfig, env: {} })).toEqual([]);
  expect(modelCatalog("model", [ready], [], { config: readyConfig, env: {} }).map(item => item.value))
    .toEqual(["openai/ready-model"]);
  expect(modelCatalog("model", [configured], [], { config: emptyConfig, env: {} }).map(item => item.value))
    .toEqual(["my-provider/configured-model"]);
  expect(modelCatalog("provider", [ready, configured], [], { config: readyConfig, env: {} }).map(item => item.value))
    .toEqual(["openai", "my-provider"]);
});

it("keeps endpoint aliases scoped to connections with the matching address", () => {
  const catalog: CatalogProvider[] = [
    {
      id: "relay-a", label: "Relay A", runtime: "openai-compatible", auth: "api-key",
      baseUrl: endpoint("relay-a"), models: [{ id: "shared-model" }],
    },
    {
      id: "relay-b", label: "Relay B", runtime: "openai-compatible", auth: "api-key",
      baseUrl: endpoint("relay-b"), models: [{ id: "shared-model" }],
    },
  ];
  const runtime = config({
    provider: "openai-compatible",
    activeProviderConnectionId: "relay-a",
    providerConnections: [connection("relay-a", endpoint("relay-a"))],
  });

  expect(modelCatalog("model", catalog, [], { config: runtime, env: {} }).map(item => item.value))
    .toEqual(["relay-a/shared-model"]);
  expect(modelCatalog("provider", catalog, [], { config: runtime, env: {} }).map(item => item.value))
    .toEqual(["relay-a"]);
});

it("preserves virtual model suggestions without requiring physical credentials", () => {
  const virtual = [{ provider: "adaptive", id: "automatic", name: "Automatic" }];
  const models = modelCatalog("model", [], virtual, { config: config(), env: {} });
  const providers = modelCatalog("provider", [], virtual, { config: config(), env: {} });

  expect(models.map(item => item.value)).toEqual(["adaptive/automatic"]);
  expect(providers.map(item => item.value)).toEqual(["adaptive"]);
});

it("offers only parseable acyclic workflow filenames without running steps", () => {
  const dir = path.join(root, ".agents", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "fixture-name.json");
  fs.writeFileSync(file, JSON.stringify({ name: "Display title", steps: [{ id: "one", run: "must-never-run" }] }));
  fs.writeFileSync(path.join(dir, "broken.json"), "{bad");
  fs.writeFileSync(path.join(dir, "cycle.json"), JSON.stringify({ steps: [{ id: "one", run: "unused", needs: ["one"] }] }));
  fs.writeFileSync(path.join(dir, "invalid name.json"), JSON.stringify({ steps: [{ id: "one", run: "must-never-run" }] }));
  const trust = vi.spyOn(projectTrust, "isProjectUntrusted").mockReturnValue(false);
  const bytes = fs.readFileSync(file);
  const mtime = fs.statSync(file).mtimeMs;

  expect(workflowCatalog(root)).toEqual([{ value: "fixture-name", label: "Display title", detail: "1 steps" }]);
  expect(catalogSuggestions(request("/workflow run Display")!, workflowCatalog(root))[0]?.edit?.text).toBe("fixture-name ");
  expect(fs.readFileSync(file)).toEqual(bytes);
  expect(fs.statSync(file).mtimeMs).toBe(mtime);
  expect(fs.readdirSync(dir).sort()).toEqual(["broken.json", "cycle.json", "fixture-name.json", "invalid name.json"]);
  trust.mockReturnValue(true);
  expect(() => workflowCatalog(root)).toThrow("unavailable");
});
