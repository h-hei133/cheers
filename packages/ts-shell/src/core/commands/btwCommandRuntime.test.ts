import { afterEach, expect, it, vi } from "vitest";
import { runBtwCommand } from "./btwCommandRuntime.js";
import { loadCatalog } from "../models/catalogStore.js";
import { providerFetchFor } from "../../provider/request/fetch.js";

vi.mock("../../config/runtimeConfig.js", () => ({ getRuntimeConfig: () => ({}) }));
vi.mock("../shell/providerCredentials.js", () => ({ resolveProviderCredential: () => ({
  provider: "fixture", model: "m", baseUrl: "https://provider.test",
  credential: { apiKey: "synthetic" },
}) }));
vi.mock("../models/catalogStore.js", () => ({ loadCatalog: vi.fn() }));
vi.mock("../../provider/request/fetch.js", () => ({ providerFetchFor: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it.each([true, false, undefined])("uses catalog temperature capability %s for side questions", async (supportsTemperature) => {
  vi.mocked(loadCatalog).mockReturnValue([{ id: "fixture", name: "Fixture", endpoint: "google-generative-ai", models: [
    { id: "m", name: "Model", compat: { supportsTemperature } },
  ] }] as never);
  const bodies: Record<string, unknown>[] = [];
  vi.mocked(providerFetchFor).mockReturnValue((async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "answer" }] } }] }), { status: 200 });
  }) as typeof fetch);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain("answer");
  expect(bodies).toHaveLength(1);
  if (supportsTemperature === false) expect(bodies[0]?.generationConfig).not.toHaveProperty("temperature");
  else expect(bodies[0]?.generationConfig).toHaveProperty("temperature", 0);
});
