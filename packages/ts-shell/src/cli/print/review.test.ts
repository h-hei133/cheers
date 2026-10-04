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

it("hands /review to one model turn and prints the model answer", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-review-"));
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
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Synthetic model review completed." }, finish_reason: "stop" }] }));
    });
  });
  try {
    await fs.mkdir(path.join(home, ".cheers"), { recursive: true });
    await fs.mkdir(workspace);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture address");
    await fs.writeFile(path.join(home, ".cheers", "config.json"), JSON.stringify({ provider: "openai", enableMcpTools: false,
      providerCredentials: { openai: { apiKey: "synthetic-only", model: "fixture", baseUrl: `http://127.0.0.1:${address.port}/v1` } } }));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "SystemRoot", "WINDIR", "LANG"]) env[key] = process.env[key];
    Object.assign(env, { HOME: home, USERPROFILE: home, TMPDIR: root, CHEERS_TEST_ROOT: root, CHEERS_PROVIDER_MODE: "real", NO_COLOR: "1" });
    await run("git", ["init", "-q", workspace], { env });
    const command = () => {
      const child = run(process.execPath, [path.join(repo, "dist/cli.js"), "--project", workspace, "--no-skills", "--print", "/review data loss"],
        { cwd: workspace, env, timeout: 20000, maxBuffer: 1024 * 1024 });
      child.child.stdin?.end();
      return child;
    };
    expect((await command()).stdout).toContain("Working tree clean");
    expect(requests).toHaveLength(0);
    const file = path.join(workspace, "new.txt");
    await fs.writeFile(file, "unique staged review evidence\n");
    await run("git", ["add", "new.txt"], { cwd: workspace, env });
    const before = (await run("git", ["status", "--short"], { cwd: workspace, env })).stdout;
    const { stdout, stderr } = await command();
    expect(stdout, stdout + stderr).toContain("Synthetic model review completed.");
    expect(stdout).not.toContain("Reviewer Checklist & Recommendations");
    expect(requests).toHaveLength(1);
    const messages = JSON.parse(requests[0]).messages;
    expect(JSON.stringify(messages)).toContain("+unique staged review evidence");
    expect(JSON.stringify(messages)).toContain("User focus: data loss");
    expect((await run("git", ["status", "--short"], { cwd: workspace, env })).stdout).toBe(before);
    expect(await fs.readFile(file, "utf8")).toBe("unique staged review evidence\n");
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  }
}, 45000);
