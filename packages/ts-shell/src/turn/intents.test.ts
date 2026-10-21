import { afterEach, expect, it, vi } from "vitest";
import { syntheticToolIntent } from "./intents.js";
import { createSyntheticStep } from "./synthetic.js";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "true", "0"])("keeps tools opt-in when the gate is %s", gate => {
  vi.stubEnv("CHEERS_SYNTHETIC_TOOLS", gate);
  expect(syntheticToolIntent()).toBeUndefined();
});

it("resolves discovery and delegation phrases after preceding text with mixed case", async () => {
  vi.stubEnv("CHEERS_SYNTHETIC_TOOLS", "1");
  const intents = syntheticToolIntent()!;
  const discovery = intents.find(intent => intent.phrase === "discover and load skill ")!;
  expect(discovery.sequence!("Please DISCOVER AND LOAD SKILL example").at(-1)).toEqual({
    name: "skill", args: { name: "example" },
  });
  const step = createSyntheticStep({ toolIntent: intents });
  const result = await step([{ role: "user", content: "Please DELEGATE TASK inspect fixture" }],
    new AbortController().signal, {});
  expect(result.toolCalls[0]).toMatchObject({ name: "task", args: { prompt: "inspect fixture" } });
});
