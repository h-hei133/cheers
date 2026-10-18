import { describe, expect, it, vi } from "vitest";
import { requestCompactionSummary } from "./summarize.js";
import { parseFileFootprintXml } from "./fileFootprint.js";
import { ModelAdmissionError } from '../../agent/request/model.js';

/**
 * What a compaction writes back is what the next one reads. The footprint is
 * the case that matters: it exists so the model does not re-read a file it has
 * already seen, and a list that only describes the newest messages stops doing
 * that after the first compaction.
 */

function providerReturning(summary: string): {
  readonly provider: { baseUrl: string; apiKey: string; model: string };
  readonly fetchImpl: typeof fetch;
  readonly bodies: string[];
} {
  const bodies: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: summary } }] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return {
    provider: { baseUrl: "https://provider.test/v1", apiKey: "k", model: "m" },
    fetchImpl,
    bodies,
  };
}

const readCall = (path: string) => ({
  role: "assistant" as const,
  tool_calls: [{ id: `call-${path}`, function: { name: "read", arguments: JSON.stringify({ path }) } }],
});

describe("requestCompactionSummary", () => {
  it('reports billed usage even when the response has no summary', async () => {
    const onUsage = vi.fn();
    expect(await requestCompactionSummary({ provider: { headers: {}, baseUrl: 'https://provider.invalid', model: 'm' },
      messages: [], fetchImpl: (async () => Response.json({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } })) as typeof fetch,
      onUsage })).toBeUndefined();
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ prompt_tokens: 7, completion_tokens: 2 }));
  });

  it('retains billing evidence when the shared budget rejects the reported usage', async () => {
    const onUsage = vi.fn();
    const settle = vi.fn(() => {
      expect(onUsage).toHaveBeenCalledOnce();
      throw new ModelAdmissionError('breach', 'persisted');
    });
    await expect(requestCompactionSummary({ provider: { headers: {}, baseUrl: 'https://provider.invalid', model: 'm' },
      messages: [], fetchImpl: (async () => Response.json({ choices: [{ message: { content: 'summary' } }], usage: { prompt_tokens: 7, completion_tokens: 2 } })) as typeof fetch,
      onUsage, requestPolicy: { reserve: () => ({ id: 'fixture', dispatch() {}, confirmUnsent() {}, settle }) },
    })).rejects.toMatchObject({ code: 'breach' });
    expect(onUsage).toHaveBeenCalledOnce(); expect(settle).toHaveBeenCalledOnce();
  });
  it("names the files this compaction saw", async () => {
    const { provider, fetchImpl } = providerReturning("a summary");
    const checkpoint = await requestCompactionSummary({
      provider,
      fetchImpl,
      messages: [readCall("src/a.ts")],
    });
    expect(checkpoint).toBeDefined();
    expect(parseFileFootprintXml(checkpoint).readFiles).toEqual(["src/a.ts"]);
  });

  it("still names a file the previous checkpoint recorded", async () => {
    // The regression this guards: the summarizer only ever saw the messages in
    // front of it, so everything read before the last checkpoint vanished from
    // the list and the model re-read it.
    const { provider, fetchImpl } = providerReturning("a summary");
    const previous = [
      "An earlier checkpoint.",
      "<read-files>",
      "- src/early.ts",
      "</read-files>",
    ].join("\n");

    const checkpoint = await requestCompactionSummary({
      provider,
      fetchImpl,
      messages: [readCall("src/late.ts")],
      previousSummary: previous,
    });

    const footprint = parseFileFootprintXml(checkpoint);
    expect(footprint.readFiles).toContain("src/early.ts");
    expect(footprint.readFiles).toContain("src/late.ts");
  });

  it("promotes a file the previous checkpoint had only read", async () => {
    const { provider, fetchImpl } = providerReturning("a summary");
    const previous = ["<read-files>", "- src/a.ts", "</read-files>"].join("\n");
    const editCall = {
      role: "assistant" as const,
      tool_calls: [
        { id: "call-1", function: { name: "edit", arguments: JSON.stringify({ path: "src/a.ts" }) } },
      ],
    };

    const checkpoint = await requestCompactionSummary({
      provider,
      fetchImpl,
      messages: [editCall],
      previousSummary: previous,
    });

    const footprint = parseFileFootprintXml(checkpoint);
    expect(footprint.modifiedFiles).toEqual(["src/a.ts"]);
    expect(footprint.readFiles).toEqual([]);
  });

  it("writes no footprint when nothing named a file", async () => {
    const { provider, fetchImpl } = providerReturning("a summary");
    const checkpoint = await requestCompactionSummary({
      provider,
      fetchImpl,
      messages: [{ role: "user", content: "hello" }],
    });
    expect(checkpoint).not.toContain("<read-files>");
    expect(checkpoint).not.toContain("<modified-files>");
  });

  it("carries the temperature the protocol gates on, when the caller sets one", async () => {
    // The compaction request passes the model's own tolerance through to the
    // protocol, which is the layer that decides whether to write the field. A
    // summarizer that could not say would send a temperature a host refuses.
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "a summary" } }] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    // A temperature the caller set reaches the body when the model accepts one.
    await requestCompactionSummary({
      provider: { baseUrl: "https://provider.test/v1", headers: {}, model: "m", supportsTemperature: true },
      fetchImpl,
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
    });
    // And the same request is built without it when the model rejects one.
    await requestCompactionSummary({
      provider: { baseUrl: "https://provider.test/v1", headers: {}, model: "m", supportsTemperature: false },
      fetchImpl,
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
    });

    const bodiesJson = bodies.map((body) => JSON.parse(body) as Record<string, unknown>);
    expect(bodiesJson[0]).toMatchObject({ temperature: 0.2 });
    expect(bodiesJson[1]).not.toHaveProperty("temperature");
  });

  it("returns nothing when the provider gives no summary", async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    const result = await requestCompactionSummary({
      provider: { baseUrl: "https://provider.test/v1", apiKey: "k", model: "m" },
      fetchImpl,
      messages: [readCall("src/a.ts")],
    });
    expect(result).toBeUndefined();
  });
});
