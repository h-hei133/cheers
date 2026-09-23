import { describe, expect, it, vi } from "vitest";
import { requestCompactionSummary } from "./summarize.js";
import { parseFileFootprintXml } from "./fileFootprint.js";

/**
 * What a compaction writes back is what the next one reads. The footprint is
 * the case that matters: it exists so the model does not re-read a file it has
 * already seen, and a list that only describes the newest messages stops doing
 * that after the first compaction.
 */

function providerReturning(summary: string): {
  readonly provider: { baseUrl: string; apiKey: string; model: string };
  readonly bodies: string[];
} {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: summary } }] }),
    } as unknown as Response;
  });
  return {
    provider: { baseUrl: "https://provider.test/v1", apiKey: "k", model: "m" },
    bodies,
  };
}

const readCall = (path: string) => ({
  role: "assistant" as const,
  tool_calls: [{ id: `call-${path}`, function: { name: "read", arguments: JSON.stringify({ path }) } }],
});

describe("requestCompactionSummary", () => {
  it("names the files this compaction saw", async () => {
    const { provider } = providerReturning("a summary");
    const checkpoint = await requestCompactionSummary({
      provider,
      messages: [readCall("src/a.ts")],
    });
    expect(checkpoint).toBeDefined();
    expect(parseFileFootprintXml(checkpoint).readFiles).toEqual(["src/a.ts"]);
    vi.unstubAllGlobals();
  });

  it("still names a file the previous checkpoint recorded", async () => {
    // The regression this guards: the summarizer only ever saw the messages in
    // front of it, so everything read before the last checkpoint vanished from
    // the list and the model re-read it.
    const { provider } = providerReturning("a summary");
    const previous = [
      "An earlier checkpoint.",
      "<read-files>",
      "- src/early.ts",
      "</read-files>",
    ].join("\n");

    const checkpoint = await requestCompactionSummary({
      provider,
      messages: [readCall("src/late.ts")],
      previousSummary: previous,
    });

    const footprint = parseFileFootprintXml(checkpoint);
    expect(footprint.readFiles).toContain("src/early.ts");
    expect(footprint.readFiles).toContain("src/late.ts");
    vi.unstubAllGlobals();
  });

  it("promotes a file the previous checkpoint had only read", async () => {
    const { provider } = providerReturning("a summary");
    const previous = ["<read-files>", "- src/a.ts", "</read-files>"].join("\n");
    const editCall = {
      role: "assistant" as const,
      tool_calls: [
        { id: "call-1", function: { name: "edit", arguments: JSON.stringify({ path: "src/a.ts" }) } },
      ],
    };

    const checkpoint = await requestCompactionSummary({
      provider,
      messages: [editCall],
      previousSummary: previous,
    });

    const footprint = parseFileFootprintXml(checkpoint);
    expect(footprint.modifiedFiles).toEqual(["src/a.ts"]);
    expect(footprint.readFiles).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("writes no footprint when nothing named a file", async () => {
    const { provider } = providerReturning("a summary");
    const checkpoint = await requestCompactionSummary({
      provider,
      messages: [{ role: "user", content: "hello" }],
    });
    expect(checkpoint).not.toContain("<read-files>");
    expect(checkpoint).not.toContain("<modified-files>");
    vi.unstubAllGlobals();
  });

  it("returns nothing when the provider gives no summary", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
    const result = await requestCompactionSummary({
      provider: { baseUrl: "https://provider.test/v1", apiKey: "k", model: "m" },
      messages: [readCall("src/a.ts")],
    });
    expect(result).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
