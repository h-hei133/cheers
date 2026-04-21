import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");
const cliEntry = path.join(distDir, "cli.js");

const content = `#!/usr/bin/env node
import "../packages/ts-shell/dist/packages/ts-shell/src/entrypoints/cli.js";
`;

await mkdir(distDir, { recursive: true });
await writeFile(cliEntry, content, "utf8");
await chmod(cliEntry, 0o755);

console.log(`Wrote CLI bin entry: ${cliEntry}`);
