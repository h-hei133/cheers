import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

it("prints source excerpts through the built CLI with synthetic web responses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-research-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const preload = path.join(root, "web.cjs");
  const log = path.join(root, "requests.jsonl");
  try {
    await fs.mkdir(home);
    await fs.mkdir(workspace);
    await fs.writeFile(preload, `
      const fs = require("node:fs");
      const { Readable } = require("node:stream");
      const { EventEmitter } = require("node:events");
      // The production web transport owns native sockets now. Keep this CLI
      // fixture synthetic at that boundary; never fall through to public DNS.
      require("node:dns/promises").lookup = async () => [{ address: "93.184.216.34", family: 4 }];
      const response = (url) => {
        fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(String(url)) + "\\n");
        if (String(url) === "https://html.duckduckgo.com/html/") return [200,
          '<div class="result"><a class="result__a" href="https://docs.example/ok">Doc</a></div>' +
          '<div class="result"><a class="result__a" href="https://docs.example/failed">Failure</a></div>'
        ];
        if (String(url) === "https://docs.example/ok") return [200,
          "Synthetic documentation preserves explicit permission boundaries."
        ];
        if (String(url) === "https://docs.example/failed") return [503, "SECRET_RESPONSE"];
        throw new Error("Unexpected network request");
      };
      const request = (url, _options, callback) => {
        const outgoing = new EventEmitter();
        outgoing.end = () => {
          queueMicrotask(() => {
            try {
              const [status, body] = response(url);
              const incoming = Readable.from([Buffer.from(body)]);
              incoming.statusCode = status;
              incoming.rawHeaders = ["content-type", "text/html"];
              incoming.headers = { "content-type": "text/html" };
              callback(incoming);
            } catch (error) { outgoing.emit("error", error); }
          });
        };
        return outgoing;
      };
      require("node:http").request = request;
      require("node:https").request = request;
      globalThis.fetch = async () => { throw new Error("Unexpected fetch transport"); };
      require("node:module").syncBuiltinESMExports();
    `);
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "SystemRoot", "WINDIR", "LANG"]) env[key] = process.env[key];
    Object.assign(env, { HOME: home, USERPROFILE: home, TMPDIR: root, CHEERS_TEST_ROOT: root, NO_COLOR: "1" });
    await run("git", ["init", "-q", workspace], { env });
    for (const name of ["web-research", "deep-research"]) {
      const child = run(process.execPath, ["--require", preload, path.join(repo, "dist/cli.js"),
        "--project", workspace, "--offline", "--print", `/${name} runtime permissions`],
        { cwd: workspace, env, timeout: 20000, maxBuffer: 1024 * 1024 });
      child.child.stdin?.end();
      const { stdout, stderr } = await child;
      expect(stdout, stdout + stderr).toContain("# Web Source Collection: runtime permissions");
      expect(stdout, stdout + stderr).toContain("Synthetic documentation preserves explicit permission boundaries.");
      expect(stdout).toContain("1 pages with excerpts; 1 fetches failed");
      expect(stdout).not.toMatch(/SECRET_RESPONSE|cross-verified|multi-agent tree search/i);
    }
    const requests = (await fs.readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(requests).toHaveLength(8);
    expect(requests.filter(url => url === "https://docs.example/ok")).toHaveLength(2);
    expect(requests.filter(url => url === "https://html.duckduckgo.com/html/")).toHaveLength(4);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 45000);
