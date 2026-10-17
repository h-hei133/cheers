import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceDigest } from "./start-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "packages/ts-shell/dist");
const pkg = JSON.parse(await readFile(path.join(root, "packages/ts-shell/package.json"), "utf8"));
const { digest } = sourceDigest(root);
const buildId = createHash("sha256").update(`${pkg.version}\0${digest}\0${process.versions.node}`).digest("hex");
const manifest = {
  schemaVersion: 1,
  name: pkg.name,
  version: pkg.version,
  builtAt: new Date().toISOString(),
  node: process.versions.node,
  sourceDigest: digest,
  buildId,
  entry: ["entrypoints/cli.js"],
};
await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote build manifest ${buildId.slice(0, 12)} for ${pkg.name}@${pkg.version}`);
