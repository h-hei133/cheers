import readline from "node:readline";
import fs from "node:fs";

const flags = new Set(process.argv.slice(2));
const logIndex = process.argv.indexOf("--log");
const logPath = logIndex < 0 ? undefined : process.argv[logIndex + 1];
const record = (event, extra = {}) => {
  if (logPath) fs.appendFileSync(logPath, JSON.stringify({ event, pid: process.pid, cwd: process.cwd(), ...extra }) + "\n");
};
record("start");
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
      capabilities: flags.has("--no-tools") ? {} : { tools: {} },
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
  if (request.method === "tools/list") {
    if (flags.has("--hang-list")) return;
    if (flags.has("--invalid-tools-list")) return send(request.id, { tools: "not-an-array" });
    if (flags.has("--invalid-json")) {
      process.stdout.write("{not-json\n");
      process.exit(1);
    }
    const second = Boolean(request.params?.cursor);
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
      }],
      ...((flags.has("--paginate") && !second) || flags.has("--repeat-cursor") ? { nextCursor: "next" } : {}),
    });
    return;
  }
  if (request.method === "tools/call") {
    const message = request.params.arguments?.message ?? "missing";
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
