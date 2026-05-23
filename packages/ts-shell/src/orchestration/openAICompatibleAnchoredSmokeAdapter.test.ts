import { describe, expect, it } from "vitest";

import {
  classifyOpenAICompatibleAnchoredSmokeError,
  createOpenAICompatibleAnchoredSmokeAdapter,
  OpenAICompatibleAnchoredSmokeProviderError,
} from "./openAICompatibleAnchoredSmokeAdapter.js";
import { buildLiveSmokeFixture } from "./liveProviderSmokeFixture.js";

describe("openAICompatibleAnchoredSmokeAdapter", () => {
  const fixture = buildLiveSmokeFixture({
    fixtureId: "adapter-test",
    requestId: "adapter-test",
  });

  it("calls the existing OpenAI-compatible adapter boundary and parses proposal JSON", async () => {
    const requests: string[] = [];
    const bodies: string[] = [];
    const adapter = createOpenAICompatibleAnchoredSmokeAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1/",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      fetchImpl: async (input, init) => {
        requests.push(String(input));
        bodies.push(String(init?.body ?? ""));
        return new Response(sse(JSON.stringify({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/smoke.ts",
              summary: "rename startApp to runApp",
              oldText: "export function startApp() {",
              newText: "export function runApp() {",
            },
          ],
          confidence: "high",
          riskSummary: "review only",
          verificationPlan: ["npm test -- smoke"],
        })), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    const proposal = await adapter.proposeEdit(fixture.promptContext);

    expect(requests).toEqual(["https://api.siliconflow.cn/v1/chat/completions"]);
    expect(bodies.join("\n")).toContain("Return exactly one target");
    expect(bodies.join("\n")).toContain("Do not include unrelated functions or additional targets");
    expect(proposal.operationKind).toBe("exact-fenced-replacement");
    expect(proposal.targets?.[0]?.path).toBe("src/smoke.ts");
    expect(proposal.targets?.[0]?.oldText).toBe("export function startApp() {");
    expect(proposal.targets?.[0]?.newText).toBe("export function runApp() {");
  });

  it("asks local-call-site task loops for one bounded exact target", async () => {
    const bodies: string[] = [];
    const adapter = createOpenAICompatibleAnchoredSmokeAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.example.test/v1/",
      model: "test-model",
      fetchImpl: async (_input, init) => {
        bodies.push(String(init?.body ?? ""));
        return new Response(sse(JSON.stringify({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/smoke.ts",
              summary: "rename startApp declaration and local call site",
              oldText: [
                "export function startApp() {",
                "  return \"started\";",
                "}",
                "",
                "export const bootMessage = startApp();",
              ].join("\n"),
              newText: [
                "export function runApp() {",
                "  return \"started\";",
                "}",
                "",
                "export const bootMessage = runApp();",
              ].join("\n"),
            },
          ],
          confidence: "high",
          riskSummary: "review only",
          verificationPlan: ["safe readback"],
        })), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    await adapter.proposeEdit({
      ...fixture.promptContext,
      userRequest: "Rename startApp to runApp in src/smoke.ts, including the local call site.",
      providerPrompt: [
        fixture.promptContext.providerPrompt,
        "The request includes the local call site bootMessage.",
      ].join("\n"),
    });

    expect(bodies.join("\n")).toContain("Do not split the declaration and call site into multiple targets");
    expect(bodies.join("\n")).toContain("export const bootMessage = startApp();");
  });

  it("classifies malformed provider output without exposing raw output", async () => {
    const adapter = createOpenAICompatibleAnchoredSmokeAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.example.test/v1",
      model: "test-model",
      fetchImpl: async () =>
        new Response(sse("not json"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });

    await expect(adapter.proposeEdit(fixture.promptContext)).rejects.toMatchObject({
      providerErrorClass: "malformed-response",
    });
  });

  it("classifies auth and network errors into safe provider error classes", () => {
    expect(classifyOpenAICompatibleAnchoredSmokeError({
      provider: "openai-compatible",
      kind: "authentication",
      message: "401",
      retriable: false,
      statusCode: 401,
    })).toBe("auth");
    expect(classifyOpenAICompatibleAnchoredSmokeError({
      provider: "openai-compatible",
      kind: "network",
      message: "fetch failed",
      retriable: true,
    })).toBe("network");
    expect(classifyOpenAICompatibleAnchoredSmokeError(
      new OpenAICompatibleAnchoredSmokeProviderError("timeout", "timeout"),
    )).toBe("timeout");
  });
});

function sse(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`),
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
