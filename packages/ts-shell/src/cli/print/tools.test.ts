import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

it("lists the same filtered MCP and skill tools the compiled CLI sends to the model", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-tools-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const tmp = path.join(root, "tmp");
  const skill = path.join(root, "SKILL.md");
  const requests: string[][] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += String(chunk); });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.method === "GET") {
        response.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
        return;
      }
      const parsed = JSON.parse(body) as { tools: Array<{ function: { name: string } }> };
      requests.push(parsed.tools.map(tool => tool.function.name).sort());
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "finished" }, finish_reason: "stop" }] }));
    });
  });
  try {
    await Promise.all([fs.mkdir(path.join(home, ".cheers"), { recursive: true }), fs.mkdir(workspace), fs.mkdir(tmp)]);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture address");
    const names = ["mcp__fixture__echo_message", "read", "skill"];
    await fs.writeFile(path.join(home, ".cheers", "config.json"), JSON.stringify({ provider: "openai", enableMcpTools: true,
      toolDiscovery: "full", allowedTools: names, providerCredentials: { openai: { apiKey: "test-only-local", model: "fixture-model", baseUrl: `http://127.0.0.1:${address.port}/v1` } } }));
    await fs.writeFile(skill, "---\nname: inspect-fixture\ndescription: Inspect this fixture\n---\nRead the fixture.\n");
    const mcpLog = path.join(root, "mcp.jsonl");
    await fs.writeFile(path.join(workspace, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      fixture: { transport: "stdio", command: process.execPath,
        args: [path.join(repo, "packages/ts-shell/src/core/mcp/fixtures/mockMcpServer.mjs"), "--log", mcpLog] },
    } }));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG"]) env[key] = process.env[key];
    Object.assign(env, { HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
      CHEERS_TEST_ROOT: tmp, CHEERS_REAL_HOME: "", CHEERS_PROVIDER_MODE: "real", NO_COLOR: "1" });
    await run("git", ["init", "-q", workspace], { env });
    const command = (prompt: string) => {
      const child = run(process.execPath, [path.join(repo, "dist/cli.js"), "--project", workspace,
        "--skill", skill, "--no-skills", "--print", prompt], { cwd: workspace, env, timeout: 20000, maxBuffer: 1024 * 1024 });
      child.child.stdin?.end();
      return child;
    };
    const listed = await command("/tools");
    expect(requests).toEqual([]);
    expect(listed.stdout, listed.stdout + listed.stderr).toContain("### Tools (3)");
    const rows = listed.stdout.split("\n").flatMap(line => line.match(/^\| ([^|]+) \| (?:allowed|read-only|blocked) \|/)?.[1] ?? []).sort();
    expect(rows).toEqual(names);
    await command("Reply briefly.");
    expect(requests).toEqual([names]);
    const operations = (await fs.readFile(mcpLog, "utf8")).trim().split("\n").map(line => JSON.parse(line).event);
    expect(operations.filter(event => event === "tools/list")).toHaveLength(2);
    expect(operations).not.toContain("tools/call");
    expect(operations.filter(event => event === "eof")).toHaveLength(2);
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  }
}, 45000);
