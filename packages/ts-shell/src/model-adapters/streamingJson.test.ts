import { describe, expect, it } from "vitest";
import { readCompletionStream } from "../turn/completion.js";
import { StreamingJsonParser } from "./streamingJson.js";
import { parseStreamingJson, ToolCallArgumentsStream } from "./toolCallArgsStream.js";

describe("StreamingJsonParser", () => {
  it("incrementally parses nested objects, arrays, strings, escapes, and numbers", () => {
    const parser = new StreamingJsonParser();
    const chunks = ['{"path":', '"src/a\\', 'n.ts","lines":[1,', '2,true,null],"meta":{"k":"v"}}'];
    let last = parser.snapshot();
    for (const chunk of chunks) {
      parser.append(chunk);
      last = parser.snapshot();
    }
    expect(last).toEqual({
      path: "src/a\n.ts",
      lines: [1, 2, true, null],
      meta: { k: "v" },
    });
  });

  it("exposes partial values mid-stream without mutating previous snapshots", () => {
    const parser = new StreamingJsonParser();
    parser.append('{"content":"hel');
    const first = parser.snapshot() as Record<string, unknown>;
    expect(first).toEqual({ content: "hel" });

    parser.append('lo","done":true}');
    const second = parser.snapshot() as Record<string, unknown>;
    expect(first).toEqual({ content: "hel" });
    expect(second).toEqual({ content: "hello", done: true });
    expect(parser.snapshot()).toBe(second);
  });

  it("blocks __proto__, constructor, and prototype pollution and emits no changes for them", () => {
    const parser = new StreamingJsonParser();
    const changes = parser.append('{"__proto__":{"polluted":true},"constructor":{"x":1},"safe":1}');
    const result = parser.snapshot() as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.safe).toBe(1);
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
    expect(Object.hasOwn(result, "constructor")).toBe(false);
    expect(changes.some((c) => c.path.includes("__proto__") || c.path.includes("constructor"))).toBe(false);
  });
});

describe("ToolCallArgumentsStream and parseStreamingJson", () => {
  it("streams incremental tool arguments and repairs unclosed final JSON", () => {
    const stream = new ToolCallArgumentsStream();
    expect(stream.append('{"cmd":"echo')).toEqual({ cmd: "echo" });
    expect(stream.append(' hi"')).toEqual({ cmd: "echo hi" });
    expect(stream.finish()).toEqual({ arguments: { cmd: "echo hi" } });
  });

  it("reports malformed non-object or unrepairable tool arguments on finish without throwing", () => {
    const arr = new ToolCallArgumentsStream();
    arr.append("[1,2,3]");
    expect(arr.finish()).toEqual({
      arguments: {},
      argumentsError: "Malformed tool call JSON arguments.",
    });

    const broken = new ToolCallArgumentsStream();
    broken.append('{"a":');
    expect(broken.finish()).toEqual({
      arguments: {},
      argumentsError: "Malformed tool call JSON arguments.",
    });
  });

  it("falls back to StreamingJsonParser on unrepairable partial JSON and ignores non-objects", () => {
    expect(parseStreamingJson(undefined)).toEqual({});
    expect(parseStreamingJson("[1,2]")).toEqual({});
    expect(parseStreamingJson('{"a": 1, "b": "par')).toEqual({ a: 1, b: "par" });
    expect(parseStreamingJson('{"a":')).toEqual({});
  });

  it("assembles tool call arguments through readCompletionStream", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{\\"path\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"README.md\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    const gen = readCompletionStream(stream);
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    expect(step.value.message.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "read", arguments: '{"path":"README.md"}' },
      },
    ]);
  });
});
