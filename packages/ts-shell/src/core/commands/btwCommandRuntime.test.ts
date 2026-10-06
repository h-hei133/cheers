import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runBtwCommand } from "./btwCommandRuntime.js";
import { loadCatalog } from "../models/catalogStore.js";
import { providerFetchForEndpoint } from "../../provider/request/fetch.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { routeSlashCommand } from "./slashRouter.js";

vi.mock("../../config/runtimeConfig.js", () => ({ getRuntimeConfig: () => ({}) }));
vi.mock("../shell/providerCredentials.js", () => ({ resolveProviderCredential: vi.fn(() => ({
  provider: "fixture", model: "m", baseUrl: "https://provider.test",
  credential: { apiKey: "synthetic" },
})) }));
vi.mock("../models/catalogStore.js", () => ({ loadCatalog: vi.fn() }));
vi.mock("../../provider/request/fetch.js", () => ({ providerFetchForEndpoint: vi.fn() }));
beforeEach(() => {
  vi.mocked(resolveProviderCredential).mockReturnValue({
    provider: "fixture", model: "m", baseUrl: "https://provider.test", credential: { apiKey: "synthetic" },
  } as never);
  vi.mocked(loadCatalog).mockReturnValue([{ id: "fixture", name: "Fixture", endpoint: "openai-compatible", models: [{ id: "m", name: "Model" }] }] as never);
});
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

it.each([true, false, undefined])("uses catalog temperature capability %s for side questions", async (supportsTemperature) => {
  vi.mocked(loadCatalog).mockReturnValue([{ id: "fixture", name: "Fixture", endpoint: "google-generative-ai", models: [
    { id: "m", name: "Model", compat: { supportsTemperature } },
  ] }] as never);
  const bodies: Record<string, unknown>[] = [];
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "answer" }] } }] }), { status: 200 });
  }) as typeof fetch);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain("answer");
  expect(bodies).toHaveLength(1);
  if (supportsTemperature === false) expect(bodies[0]?.generationConfig).not.toHaveProperty("temperature");
  else expect(bodies[0]?.generationConfig).toHaveProperty("temperature", 0);
});

it.each([
  ["network", "provider_network"],
  ["refusal", "provider_safety_block"],
  ["http", "provider_endpoint"],
  ["empty", "provider_output_insufficient"],
  ["malformed", "provider_response_malformed"],
])("reports %s failures without displaying response details", async (scenario, classification) => {
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async () => {
    if (scenario === "network") throw new TypeError("fetch failed: private-provider-detail");
    if (scenario === "http") return new Response("private-provider-detail", { status: 400 });
    if (scenario === "malformed") return new Response("{private-provider-detail", { status: 200 });
    return Response.json({ choices: [{ message: { content: "" }, finish_reason: scenario === "refusal" ? "content_filter" : "stop" }] });
  }) as typeof fetch);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain(`Failure: ${classification}`);
  expect(result.output).not.toContain("private-provider-detail");
  expect(result.output).not.toContain("was answered");
  expect(result.output).not.toContain("No provider credential");
});

it("reports its own deadline as a timeout and releases the timer", async () => {
  vi.useFakeTimers();
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch);
  const pending = runBtwCommand(["question"], { cwd: "/synthetic" });
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await pending).output).toContain("Failure: provider_timeout");
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the missing-credential explanation and sends nothing", async () => {
  vi.mocked(resolveProviderCredential).mockReturnValue({ provider: "fixture" } as never);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain("No provider credential is configured, so nothing was sent.");
  expect(result.output).not.toContain("Failure:");
  expect(providerFetchForEndpoint).not.toHaveBeenCalled();
});

it("sends the literal side question without decoding quotes, whitespace or escapes", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: "answer" }, finish_reason: "stop" }] });
  }) as typeof fetch);
  const question = "  why 'a  b' in C:\\tmp\\file?\n\t--show-literal\\  ";
  await routeSlashCommand("/side " + question, { cwd: "/synthetic", skillOptions: { noSkills: true } });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.messages).toEqual(expect.arrayContaining([{ role: "user", content: question }]));
});

it.each(["", "  \t\n"])("rejects an empty side question before resolving credentials: %j", async (rawCommandArgs) => {
  const result = await runBtwCommand([], { cwd: "/synthetic", rawCommandArgs });
  expect(result.output).toContain("Usage: /btw <question>");
  expect(resolveProviderCredential).not.toHaveBeenCalled();
  expect(providerFetchForEndpoint).not.toHaveBeenCalled();
});
