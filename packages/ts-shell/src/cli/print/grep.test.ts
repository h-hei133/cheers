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

it("executes bounded native grep through the built CLI model tool loop", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-grep-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += String(chunk); });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.method === "GET") { response.end(JSON.stringify({ data: [{ id: "fixture" }] })); return; }
      requests.push(body);
      if (requests.length === 1) {
        response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: null,
          tool_calls: [{ id: "grep-fixture", type: "function", function: { name: "grep", arguments: JSON.stringify({ pattern: "needle", path: "data.txt", limit: 3 }) } }] }, finish_reason: "tool_calls" }] }));
      } else response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Synthetic grep completed." }, finish_reason: "stop" }] }));
    });
  });
  try {
    await fs.mkdir(path.join(home, ".cheers"), { recursive: true });
    await fs.mkdir(workspace);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture address");
    await fs.writeFile(path.join(home, ".cheers", "config.json"), JSON.stringify({ provider: "openai", enableMcpTools: false, allowedTools: ["grep"],
      providerCredentials: { openai: { apiKey: "synthetic-only", model: "fixture", baseUrl: `http://127.0.0.1:${address.port}/v1` } } }));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "SystemRoot", "WINDIR", "LANG"]) env[key] = process.env[key];
    Object.assign(env, { HOME: home, USERPROFILE: home, TMPDIR: root, CHEERS_TEST_ROOT: root, CHEERS_PROVIDER_MODE: "real", NO_COLOR: "1" });
    await run("rg", ["--version"], { env });
    await run("git", ["init", "-q", workspace], { env });
    const command = () => {
      const child = run(process.execPath, [path.join(repo, "dist/cli.js"), "--project", workspace, "--no-skills", "--print", "Find needle in data.txt"],
        { cwd: workspace, env, timeout: 20000, maxBuffer: 1024 * 1024 });
      child.child.stdin?.end();
      return child;
    };
    const file = path.join(workspace, "data.txt");
    const content = Array.from({ length: 10000 }, (_, i) => `${i} 中文 needle`).join("\n");
    await fs.writeFile(file, content);
    const { stdout, stderr } = await command();
    expect(stdout, stdout + stderr).toContain("Synthetic grep completed.");
    expect(requests).toHaveLength(2);
    const messages = JSON.parse(requests[1]).messages as Array<{ role: string; content: string }>;
    const result = messages.find(message => message.role === "tool");
    expect(result?.content).toContain("data.txt:1: 0 中文 needle");
    expect(result?.content).toContain("data.txt:3: 2 中文 needle");
    expect(result?.content).not.toContain("data.txt:4:");
    expect(await fs.readFile(file, "utf8")).toBe(content);

  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  }
}, 45000);
