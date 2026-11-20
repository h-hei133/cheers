import { build } from "esbuild";
import { copyFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertNoSymlinkPath, REQUIRED_BUILD_ASSETS, safeRelativePath } from "../build-identity.mjs";
import { bindingName, PUBLIC_ENTRY } from "./exports.mjs";

// External CommonJS dependencies remain lazy in ESM chunks, just as they are in source.
const REQUIRE_BANNER = 'import { createRequire as __cheersCreateRequire } from "node:module";\n'
  + 'const require = __cheersCreateRequire(import.meta.url);';
const CLI_ENTRY = "entrypoints/cli.js";

function sourceEntry(root, entry) {
  const base = path.join(root, "packages/ts-shell/src", entry.slice(0, -3));
  const candidates = [];
  for (const extension of [".ts", ".tsx"]) {
    const file = `${base}${extension}`;
    assertNoSymlinkPath(root, file);
    if (existsSync(file)) {
      if (!lstatSync(file).isFile()) throw new Error(`Bundle source is not a regular file: ${entry}`);
      candidates.push(file);
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`Bundle entry ${entry} must resolve to exactly one .ts or .tsx source.`);
  }
  return candidates[0];
}

function resolveEntries(root, entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("Public bundle entries are required.");
  const specifiers = new Set();
  const targets = new Set([PUBLIC_ENTRY, CLI_ENTRY]);
  const resolved = [];
  for (const entry of entries) {
    if (!entry || typeof entry.specifier !== "string"
      || (entry.specifier !== "." && (!entry.specifier.startsWith("./") || !safeRelativePath(entry.specifier.slice(2))))
      || !safeRelativePath(entry.path) || !entry.path.endsWith(".js")
      || ["chunks", "types"].includes(entry.path.split("/")[0])
      || entry.types !== `types/${entry.path.slice(0, -3)}.d.ts`
      || specifiers.has(entry.specifier) || targets.has(entry.path)) {
      throw new Error("Public bundle entries contain an unsafe or duplicate target.");
    }
    specifiers.add(entry.specifier);
    targets.add(entry.path);
    resolved.push({ specifier: entry.specifier, path: entry.path, types: entry.types,
      source: sourceEntry(root, entry.path) });
  }
  return resolved;
}

function publicEntries(root, staging, resolved, outputs) {
  const entries = [];
  for (const entry of resolved) {
    const expected = path.join(staging, entry.path);
    let output;
    for (const [file, metadata] of Object.entries(outputs)) {
      if (path.resolve(root, file) === expected && metadata.entryPoint
        && path.resolve(root, metadata.entryPoint) === entry.source) {
        output = metadata;
        break;
      }
    }
    if (!output || !Array.isArray(output.exports)) {
      throw new Error(`Bundler did not describe the public entry ${entry.specifier}.`);
    }
    entries.push({ specifier: entry.specifier, path: entry.path, types: entry.types,
      names: [...new Set(output.exports)].sort() });
  }
  return entries;
}

function publicModule(entries) {
  const lines = [];
  for (const entry of entries) {
    const bindings = entry.names.map(name => `${JSON.stringify(name)} as ${bindingName(entry.specifier, name)}`);
    // An empty export still preserves the entry's module side effects.
    lines.push(`export { ${bindings.join(", ")} } from ${JSON.stringify(`./${entry.path}`)};`);
  }
  return `${lines.join("\n")}\n`;
}

/** Build every public entry and the CLI together, so shared owners have one module identity. */
export async function bundleModules({ root, staging, version, name, entries, domainEntries = new Map() }) {
  root = path.resolve(root);
  staging = path.resolve(staging);
  assertNoSymlinkPath(root, staging);
  const linkedDomains = new Map();
  for (const [specifier, entry] of domainEntries) {
    if (!/^@cheers\/[a-z0-9-]+$/.test(specifier)) throw new Error("Invalid domain build specifier.");
    const absolute = path.resolve(root, entry);
    assertNoSymlinkPath(staging, absolute);
    if (!lstatSync(absolute).isFile()) throw new Error(`Build entry for ${specifier} is not a regular file.`);
    linkedDomains.set(specifier, { path: absolute });
  }
  if (typeof version !== "string" || !version.trim() || typeof name !== "string" || !name.trim()) {
    throw new Error("Bundle version and package name must be nonempty strings.");
  }
  const resolved = resolveEntries(root, entries);
  const entryPoints = resolved.map(entry => ({ in: entry.source, out: entry.path.slice(0, -3) }));
  entryPoints.push({ in: sourceEntry(root, CLI_ENTRY), out: CLI_ENTRY.slice(0, -3) });
  const assets = [];
  for (const relative of REQUIRED_BUILD_ASSETS) {
    const source = path.join(root, "packages/ts-shell/src", relative);
    assertNoSymlinkPath(root, source);
    if (!lstatSync(source).isFile()) throw new Error(`Bundle asset is not a regular file: ${relative}`);
    assets.push({ source, target: path.join(staging, relative) });
  }
  const result = await build({
    absWorkingDir: root,
    entryPoints,
    outdir: staging,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "node",
    target: "node20.3",
    keepNames: true,
    packages: "external",
    ...(linkedDomains.size > 0 ? { plugins: [{ name: "domain-workspaces", setup(builder) {
      builder.onResolve({ filter: /^@cheers\// }, ({ path: specifier }) => linkedDomains.get(specifier));
    } }] } : {}),
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "assets/[name]-[hash]",
    banner: { js: REQUIRE_BANNER },
    define: { __CHEERS_BUILD_VERSION__: JSON.stringify(version), __CHEERS_BUILD_NAME__: JSON.stringify(name) },
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const record = { entries: publicEntries(root, staging, resolved, result.metafile.outputs) };
  const artifacts = [...result.outputFiles, { path: path.join(staging, PUBLIC_ENTRY),
    contents: publicModule(record.entries) }];
  // Validate all destinations before making staging changes; the caller owns publication/rollback.
  for (const artifact of [...artifacts, ...assets]) assertNoSymlinkPath(root, artifact.path ?? artifact.target);
  for (const artifact of artifacts) {
    mkdirSync(path.dirname(artifact.path), { recursive: true });
    writeFileSync(artifact.path, artifact.contents);
  }
  // Preserve the existing manifest's resource contract; runtime JSON loads are embedded once
  // through the original theme owner by esbuild's literal-require handling.
  for (const asset of assets) {
    mkdirSync(path.dirname(asset.target), { recursive: true });
    copyFileSync(asset.source, asset.target);
  }
  return record;
}
