import readline from "node:readline";
import fs from "node:fs";

const flags = new Set(process.argv.slice(2));
const logIndex = process.argv.indexOf("--log");
const logPath = logIndex < 0 ? undefined : process.argv[logIndex + 1];
const record = (event, extra = {}) => {
  if (logPath) fs.appendFileSync(logPath, JSON.stringify({ event, pid: process.pid, cwd: process.cwd(), ...extra }) + "\n");
};
record("start");
const controlIndex = process.argv.indexOf("--control");
if (controlIndex >= 0) fs.watchFile(process.argv[controlIndex + 1], { interval: 30, persistent: false }, () => {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" }) + "\n");
});
let initialized = false;
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, message) => process.stdout.write(JSON.stringify({
  jsonrpc: "2.0", id, error: { code: -32603, message },
}) + "\n");
if (flags.has("--hang-close")) {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
}
const input = readline.createInterface({ input: process.stdin });
input.on("line", line => {
  const request = JSON.parse(line);
  record(request.method, { params: request.params });
  if (request.method === "initialize") {
    if (flags.has("--initialize-fail")) return fail(request.id, "Handshake rejected");
    if (flags.has("--initialize-hang")) return;
    send(request.id, {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        ...(flags.has("--no-tools") ? {} : { tools: {} }),
        ...(flags.has("--content") ? { resources: { subscribe: true, listChanged: true }, prompts: { listChanged: true }, logging: {} } : {}),
      },
      serverInfo: { name: "fixture", version: "1.0.0" },
    });
    return;
  }
  if (request.method === "notifications/initialized") {
    initialized = true;
    return;
  }
  if (request.id === undefined) return;
  if (!initialized) return fail(request.id, "Client did not send initialized");
  if (["resources/list", "resources/templates/list", "prompts/list"].includes(request.method)) {
    if (flags.has("--hang-content")) return;
    const second = Boolean(request.params?.cursor);
    if (flags.has("--notify-during-content")) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/resources/list_changed" }) + "\n");
    if (flags.has("--notify-resource-during-content")) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: "fixture://file/one" } }) + "\n");
    if (flags.has("--malformed-content")) return send(request.id, { resources: 7, resourceTemplates: 7, prompts: 7 });
    const result = request.method === "resources/list" ? { resources: [{ uri: `fixture://file/${second ? "two" : "one"}`, name: second ? "second resource" : "first resource" }] }
      : request.method === "resources/templates/list" ? { resourceTemplates: [{ uriTemplate: `fixture://template/${second ? "two" : "one"}/{id}`, name: "file template" }] }
      : { prompts: [{ name: second ? "second_prompt" : "summarize", description: "A remote prompt", arguments: [{ name: "topic", required: true }] }] };
    send(request.id, { ...result, ...((flags.has("--paginate") && !second) || flags.has("--repeat-cursor") ? { nextCursor: "next" } : {}) });
    return;
  }
  if (request.method === "resources/read") {
    if (flags.has("--hang-content")) return;
    if (flags.has("--notify-resource-during-content")) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: request.params.uri } }) + "\n");
    if (flags.has("--content-error")) return fail(request.id, 'Remote error \u001b]52;c;unsafe\u0007 password: synthetic-password {"token":"synthetic-token"} sk-syntheticReview12345');
    const response = () => send(request.id, { contents: [{ uri: request.params.uri, mimeType: "text/plain",
      text: flags.has("--large-content") ? "x".repeat(1024 * 1024 + 1) : "resource body\nBearer fixture-secret\n\u001b]52;c;unsafe\u0007" },
      { uri: request.params.uri + "/binary", mimeType: "image/png", blob: "AA==" }] });
    if (flags.has("--delay-content")) setTimeout(response, 200);
    else response();
    return;
  }
  if (request.method === "prompts/get") {
    send(request.id, { description: "Remote template", messages: [{ role: "user", content: { type: "text", text: "Discuss " + request.params.arguments.topic } }] });
    return;
  }
  if (request.method === "resources/subscribe" || request.method === "resources/unsubscribe") {
    send(request.id, {});
    if (request.method === "resources/subscribe") setTimeout(() => {
      for (let i = 0; i < 205; i++) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "Bearer fixture-secret " + i } }) + "\n");
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: request.params.uri } }) + "\n");
    }, 30);
    return;
  }
  if (request.method === "tools/list") {
    if (flags.has("--notify-during-list")) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" }) + "\n");
    if (flags.has("--hang-list")) return;
    if (flags.has("--invalid-tools-list")) return send(request.id, { tools: "not-an-array" });
    if (flags.has("--invalid-json")) {
      process.stdout.write("{not-json\n");
      process.exit(1);
    }
    const second = Boolean(request.params?.cursor);
    const definitionIndex = process.argv.indexOf('--tool-definition');
    const definition = definitionIndex >= 0 ? JSON.parse(fs.readFileSync(process.argv[definitionIndex + 1], 'utf8')) : {};
    send(request.id, {
      tools: [{
        name: second ? "second_tool" : "echo_message",
        description: "Echo a message from stdio MCP",
        inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
        annotations: { readOnlyHint: true },
        ...(!second && flags.has("--output-schema") ? {
          outputSchema: { type: "object", properties: { answer: { type: "integer" } }, required: ["answer"] },
        } : {}),
        ...(!second && flags.has("--required-task") ? { execution: { taskSupport: "required" } } : {}),
        ...definition,
      }],
      ...((flags.has("--paginate") && !second) || flags.has("--repeat-cursor") ? { nextCursor: "next" } : {}),
    });
    return;
  }
  if (request.method === "tools/call") {
    const message = request.params.arguments?.message ?? "missing";
    if (message === 'mcp-hold') return;
    if (message === "mcp-notify") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" }) + "\n");
    if (message === "mcp-invalid-args") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id,
        error: { code: -32602, message: "Arguments rejected" } }) + "\n");
      return;
    }
    if (message === "mcp-invalid-output") return send(request.id, { content: [], structuredContent: { answer: "wrong" } });
    if (message === "mcp-throw") {
      process.stderr.write("MCP stdio execution failed");
      process.exit(1);
    }
    if (message === "mcp-malformed") return send(request.id, { content: 7 });
    if (message === "mcp-image") return send(request.id, {
      content: [{ type: "text", text: "operation returned image" }, { type: "image", data: "AA==", mimeType: "image/png" }],
    });
    if (message === "mcp-structured") return send(request.id, { content: [], structuredContent: { answer: 42 } });
    send(request.id, {
      content: [{ type: "text", text: message === "mcp-error"
        ? "MCP tool rejected request: invalid message" : "echo:" + message }],
      ...(message === "mcp-error" ? { isError: true } : {}),
    });
    return;
  }
  fail(request.id, "Unknown method");
});
input.on("close", () => record("eof"));
