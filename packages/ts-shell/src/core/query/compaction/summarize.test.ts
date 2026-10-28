import { describe, expect, it, vi } from "vitest";
import { prepareCompactionMessages, requestCompactionSummary } from "./summarize.js";
import { parseFileFootprintXml } from "./fileFootprint.js";
import { DEFAULT_REQUEST_SHAPE } from '../../models/requestShape.js';
import { ModelAdmissionError } from '../../agent/request/model.js';
import { SummaryAdmissionError } from '../../../session/compaction/contract.js';
import { promptTokensFor } from '../../../context/request/budget.js';

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

  it("writes tool activity as prose for a model that takes no tool messages", async () => {
    // A catalogue model with `tool_call: false` cannot parse `tool_calls` or a
    // `tool` role at all. The checkpoint still has to record what ran, so the
    // same conversation travels as text rather than as a shape the endpoint
    // rejects. Capable models keep the structural form.
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return { ok: true, json: async () => ({ choices: [{ message: { content: "a summary" } }] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const conversation = [
      { role: "user" as const, content: "read the file" },
      { role: "assistant" as const, content: "", tool_calls: [{ id: "call-src-a", type: "function" as const,
        function: { name: "read", arguments: JSON.stringify({ path: "src/a.ts" }) } }] },
      { role: "tool" as const, tool_call_id: "call-src-a", content: "file contents" },
    ];

    await requestCompactionSummary({ provider: { baseUrl: "https://provider.test/v1", headers: {}, model: "m" },
      fetchImpl, messages: conversation });
    await requestCompactionSummary({ provider: { baseUrl: "https://provider.test/v1", headers: {}, model: "m",
      shape: { ...DEFAULT_REQUEST_SHAPE, toolCalling: false } }, fetchImpl, messages: conversation });

    const [capable, noTools] = bodies.map(body => JSON.parse(body) as { messages: Array<Record<string, unknown>> });
    expect(capable!.messages.some(message => message.tool_calls !== undefined)).toBe(true);
    expect(capable!.messages.some(message => message.role === "tool")).toBe(true);
    expect(noTools!.messages.some(message => message.tool_calls !== undefined || message.role === "tool")).toBe(false);
    const prose = JSON.stringify(noTools!.messages);
    expect(prose).toContain("[tool call call-src-a] read");
    expect(prose).toContain("[tool result call-src-a]");
    expect(prose).toContain("file contents");
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

  it("admits an exact summary budget and refuses one token over before fetch", async () => {
    const messages = [{ role: "user" as const, content: "condense this history" }];
    const maxOutputTokens = 10;
    const prepared = prepareCompactionMessages({
      messages,
      maxOutputTokens,
      provider: {},
    });
    const promptTokens = promptTokensFor({
      messages: prepared.map(message => ({ ...message, content: message.content ?? "" })),
    }).tokens;
    const exact = {
      provider: {
        headers: {},
        baseUrl: "https://provider.test/v1",
        model: "m",
        contextWindow: promptTokens + maxOutputTokens,
        maxOutputTokens,
        reserveTokens: 0,
      },
      messages,
      fetchImpl: vi.fn(),
    };

    expect(() => prepareCompactionMessages(exact)).not.toThrow();
    expect(() => prepareCompactionMessages({
      ...exact,
      provider: { ...exact.provider, contextWindow: exact.provider.contextWindow - 1 },
    })).toThrow(SummaryAdmissionError);
    const fetchImpl = vi.fn();
    await expect(requestCompactionSummary({
      ...exact,
      provider: { ...exact.provider, contextWindow: exact.provider.contextWindow - 1 },
      fetchImpl,
    })).rejects.toBeInstanceOf(SummaryAdmissionError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an input-only summary that exceeds the provider prompt ceiling', () => {
    expect(() => prepareCompactionMessages({
      messages: [{ role: "user", content: "x".repeat(10_000) }],
      maxOutputTokens: 10,
      provider: { inputLimit: 1, reserveTokens: 0 },
    })).toThrow(SummaryAdmissionError);
  });
});
