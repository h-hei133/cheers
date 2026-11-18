import { describe, expect, it, vi } from "vitest";
import { prepareCompactionMessages, prepareCompactionRequest, requestCompactionSummary, type CompactionRequest } from "./summarize.js";
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

it('sends captured summary cache controls and session affinity through the actual endpoint body', async () => {
  const provider = { headers: {}, baseUrl: 'https://summary-relay.invalid/v1', model: 'summary',
    endpoint: 'openai-compatible', sessionId: 'summary-session', cacheRetention: 'long' as 'short' | 'long' | 'none',
    supportsPromptCacheKey: true, supportsLongCacheRetention: true, supportsExplicitPromptCacheMode: false };
  const bodies: Record<string, unknown>[] = [];
  const request = { provider, messages: [{ role: 'user' as const, content: 'Source work' }],
    fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ choices: [{ message: { content: 'Summary' } }] });
    }) as typeof fetch };
  const prepared = prepareCompactionRequest(request);
  const short = prepareCompactionRequest({ ...request, provider: { ...provider, cacheRetention: 'short' } });
  expect(short.identity).not.toBe(prepared.identity);
  provider.cacheRetention = 'none'; provider.sessionId = 'successor-session'; provider.supportsLongCacheRetention = false;
  await prepared.send();
  expect(bodies[0]).toMatchObject({ prompt_cache_key: expect.any(String), prompt_cache_retention: '24h' });
  await prepareCompactionRequest(request).send();
  expect(bodies[1]).not.toHaveProperty('prompt_cache_key');
  expect(bodies[1]).not.toHaveProperty('prompt_cache_retention');
});

it('binds a prepared summary to requested cache retention and session even when the endpoint emits no controls', () => {
  const request = { provider: { headers: {}, baseUrl: 'https://unsupported-summary.invalid', model: 'summary',
    sessionId: 'first-session', cacheRetention: 'short' as const, supportsPromptCacheKey: false, supportsLongCacheRetention: false },
    messages: [{ role: 'user' as const, content: 'Captured work' }], fetchImpl: vi.fn() };
  const short = prepareCompactionRequest(request);
  expect(prepareCompactionRequest({ ...request, provider: { ...request.provider, cacheRetention: 'none' } }).identity).not.toBe(short.identity);
  expect(prepareCompactionRequest({ ...request, provider: { ...request.provider, sessionId: 'second-session' } }).identity).not.toBe(short.identity);
});

it.each(['mistral-chat-completions', 'openai-account-responses'])('sends endpoint-owned %s summary affinity headers and suppresses them when disabled', async endpoint => {
  const observed: Headers[] = [];
  const provider = { headers: {}, baseUrl: 'https://summary-affinity.invalid/v1', model: 'summary',
    endpoint, sessionId: 'summary-affinity', cacheRetention: 'long' as 'long' | 'none' };
  const request = { provider, messages: [{ role: 'user' as const, content: 'Source work' }],
    fetchImpl: async (_url: RequestInfo | URL, init?: RequestInit) => {
      observed.push(new Headers(init?.headers));
      return endpoint === 'openai-account-responses' ? new Response('data: ' + JSON.stringify({ type: 'response.completed', response: {
        id: 'summary-response', status: 'completed', output: [{ id: 'summary-message', type: 'message', role: 'assistant',
          content: [{ type: 'output_text', text: 'Summary' }] }] } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })
        : Response.json({ choices: [{ message: { content: 'Summary' } }] });
    } };
  const prepared = prepareCompactionRequest(request);
  provider.sessionId = 'successor-affinity';
  await prepared.send();
  expect(observed[0]!.get(endpoint === 'openai-account-responses' ? 'session-id' : 'x-affinity')).toBe('summary-affinity');
  provider.cacheRetention = 'none'; await prepareCompactionRequest(request).send();
  expect(observed[1]!.has(endpoint === 'openai-account-responses' ? 'session-id' : 'x-affinity')).toBe(false);
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

  it('sends the captured body, target, headers and file footprint after caller mutation', async () => {
    const sent: Array<{ url: string; body: string; authorization: string | null }> = [];
    const shape = { ...DEFAULT_REQUEST_SHAPE, toolCalling: true };
    const provider = { headers: { authorization: 'fixture-before' }, baseUrl: 'https://provider.test/v1', model: 'before', shape };
    const messages = [{ role: 'assistant' as const, content: '', tool_calls: [{ id: 'read', type: 'function' as const,
      function: { name: 'read', arguments: '{"path":"src/before.ts"}' } }] }];
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      sent.push({ url: String(url), body: String(init?.body), authorization: new Headers(init?.headers).get('authorization') });
      return Response.json({ choices: [{ message: { content: 'summary' } }] });
    });
    const prepared = prepareCompactionRequest({ provider, messages, fetchImpl: fetchImpl as typeof fetch, prompt: 'captured instruction' });
    expect(fetchImpl).not.toHaveBeenCalled();
    provider.model = 'after'; provider.baseUrl = 'https://replacement.test'; provider.headers.authorization = 'fixture-after';
    shape.toolCalling = false;
    messages[0]!.tool_calls[0]!.function.arguments = '{"path":"src/after.ts"}';
    const dispatch = vi.fn();
    const summary = await prepared.send({ dispatch });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: 'https://provider.test/v1/chat/completions', authorization: 'fixture-before' });
    const body = JSON.parse(sent[0]!.body);
    expect(body.model).toBe('before');
    expect(body.messages.at(-1).content).toBe('captured instruction');
    expect(body.messages[0].tool_calls[0].function.arguments).toBe('{"path":"src/before.ts"}');
    expect(parseFileFootprintXml(summary).readFiles).toEqual(['src/before.ts']);
    await expect(prepared.send()).rejects.toThrow('already been consumed');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('checks complete serialized input bytes before admitting a summary handle', () => {
    const reserve = vi.fn();
    const fetchImpl = vi.fn();
    expect(() => prepareCompactionRequest({
      provider: { headers: {}, baseUrl: 'https://fixture.test', model: 'summary',
        shape: { ...DEFAULT_REQUEST_SHAPE, inputLimits: { maxRequestBytes: 32 } } },
      messages: [{ role: 'user', content: 'small' }], prompt: 'small instruction',
      fetchImpl: fetchImpl as typeof fetch, requestPolicy: { reserve } as never,
    })).toThrow(SummaryAdmissionError);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('merges converted system text into every auxiliary protocol system field', async () => {
    for (const endpoint of ['openai-compatible', 'anthropic-messages', 'google-generative-ai']) {
      const bodies: Array<Record<string, any>> = [];
      const prepared = prepareCompactionRequest({
        provider: { headers: {}, baseUrl: 'https://fixture.test', model: 'summary', endpoint }, prompt: 'summarize once',
        messages: [{ role: 'system', content: 'first instruction' }, { role: 'user', content: 'history' },
          { role: 'system', content: 'second instruction' }],
        fetchImpl: (async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Response.json({ choices: [{ message: { content: 'summary' } }] });
        }) as typeof fetch,
      });
      await prepared.send();
      expect(bodies).toHaveLength(1);
      const body = bodies[0]!;
      if (endpoint === 'openai-compatible') expect(body.messages[0]).toEqual({ role: 'system', content: 'first instruction\n\nsecond instruction' });
      if (endpoint === 'anthropic-messages') {
        expect(body.system[0].text).toBe('first instruction\n\nsecond instruction');
        expect(body.messages.every((message: any) => message.role !== 'system')).toBe(true);
      }
      if (endpoint === 'google-generative-ai') expect(body.systemInstruction.parts[0].text).toBe('first instruction\n\nsecond instruction');
    }
  });

  it('refuses non-text system content before preparing a body or dispatching', () => {
    const fetchImpl = vi.fn();
    const messages = [{ role: 'system', content: [{ type: 'image', data: 'fixture', mimeType: 'image/png' }] }];
    expect(() => prepareCompactionRequest({ provider: { headers: {}, baseUrl: 'https://fixture.test', model: 'summary' },
      messages: messages as unknown as CompactionRequest['messages'], fetchImpl })).toThrow(SummaryAdmissionError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('binds identity to captured request bytes and target without authentication headers', () => {
    const request: CompactionRequest = { provider: { headers: { authorization: 'fixture-one' }, baseUrl: 'https://fixture.test', model: 'summary' },
      messages: [{ role: 'user', content: 'history' }], fetchImpl: vi.fn(), prompt: 'summarize' };
    const first = prepareCompactionRequest(request);
    const same = prepareCompactionRequest({ ...request, provider: { ...request.provider, headers: { authorization: 'fixture-two' } } });
    expect(first.identity).toMatch(/^[a-f0-9]{64}$/);
    expect(same.identity).toBe(first.identity);
    expect(prepareCompactionRequest({ ...request, messages: [{ role: 'user', content: 'changed' }] }).identity).not.toBe(first.identity);
    expect(prepareCompactionRequest({ ...request, provider: { ...request.provider, model: 'different' } }).identity).not.toBe(first.identity);
    expect(prepareCompactionRequest({ ...request, purpose: 'branch-summary' }).identity).not.toBe(first.identity);
    expect(prepareCompactionRequest({ ...request, previousSummary: 'previous' }).identity).not.toBe(first.identity);
    expect(prepareCompactionRequest({ ...request, provider: { ...request.provider,
      credentialId: 'account', credentialGeneration: 'next' } }).identity).not.toBe(first.identity);
  });

  it('estimates converted history separately while preflight still covers the complete request', () => {
    const messages = [{ role: 'user' as const, content: 'history' }];
    const request: CompactionRequest = { provider: { headers: {}, baseUrl: 'https://fixture.test', model: 'summary' }, messages, fetchImpl: vi.fn() };
    const first = prepareCompactionRequest({ ...request, prompt: 'short' });
    const longer = prepareCompactionRequest({ ...request, prompt: 'long instruction '.repeat(100), previousSummary: 'old work '.repeat(100) });
    expect(first.tokens).toBe(promptTokensFor({ messages }).tokens);
    expect(longer.tokens).toBe(first.tokens);
    expect(() => prepareCompactionRequest({ ...request, provider: { ...request.provider, inputLimit: first.tokens + 1, reserveTokens: 0 },
      prompt: 'long instruction '.repeat(100) })).toThrow(SummaryAdmissionError);
  });

  it('rejects a cancelled prepared request before transport admission and dispatch', async () => {
    const controller = new AbortController();
    const reserve = vi.fn();
    const fetchImpl = vi.fn();
    const dispatch = vi.fn();
    const prepared = prepareCompactionRequest({ provider: { headers: {}, baseUrl: 'https://fixture.test', model: 'summary' },
      messages: [{ role: 'user', content: 'history' }], signal: controller.signal, fetchImpl, requestPolicy: { reserve } });
    controller.abort();
    await expect(prepared.send({ dispatch })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reserve).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
  });
});
