import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertNoSymlinkPath, safeRelativePath, snapshotFile } from "../build-identity.mjs";

export const PUBLIC_RECORD = "public.json";
export const PUBLIC_ENTRY = "public.js";
export const GENERATION_POINTER = "current.js";

/** Names stay stable when other entries or bindings are added in a later build. */
export function bindingName(specifier, name) {
  return `e_${Buffer.from(specifier).toString("hex")}_${Buffer.from(name).toString("hex")}`;
}

export function managedPublicPath(value) {
  return value === ".npmignore" || (safeRelativePath(value) && !value.startsWith("builds/")
    && !value.split("/").some(part => part.startsWith("."))
    && (value.endsWith(".js") || (value.startsWith("types/") && value.endsWith(".d.ts"))));
}

/** Only concrete, package-local ESM entrypoints are admitted to publication. */
export function packageEntries(root) {
  const file = path.join(root, "packages/ts-shell/package.json");
  assertNoSymlinkPath(root, file);
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (!pkg.exports || typeof pkg.exports !== "object" || Array.isArray(pkg.exports)) {
    throw new Error("The package must declare its public entrypoints.");
  }
  const targets = new Set();
  const entries = Object.entries(pkg.exports).sort(([left], [right]) => left.localeCompare(right)).map(([specifier, value]) => {
    if (specifier !== "." && (!specifier.startsWith("./") || !safeRelativePath(specifier.slice(2)) || specifier.includes("*"))) {
      throw new Error("Package exports must use concrete local subpaths.");
    }
    const target = typeof value === "string" ? value : value?.import ?? value?.default;
    if (typeof target !== "string" || !target.startsWith("./dist/")) {
      throw new Error(`Package export ${specifier} has no local ESM target.`);
    }
    const entry = target.slice("./dist/".length);
    if (!managedPublicPath(entry) || !entry.endsWith(".js") || entry.startsWith("types/")
      || [GENERATION_POINTER, PUBLIC_ENTRY].includes(entry) || targets.has(entry)) {
      throw new Error(`Package export ${specifier} has an unsafe or duplicate target.`);
    }
    const types = `types/${entry.slice(0, -3)}.d.ts`;
    if (value?.types !== `./dist/${types}` || (value.default !== undefined && value.default !== target)) {
      throw new Error(`Package export ${specifier} must declare matching ESM and declaration targets.`);
    }
    targets.add(entry);
    return { specifier, path: entry, types };
  });
  if (entries.find(entry => entry.specifier === ".")?.path !== "index.js"
    || pkg.main !== "./dist/index.js" || pkg.types !== "./dist/types/index.d.ts") {
    throw new Error("The package root must expose matching index and declaration entrypoints.");
  }
  return entries;
}

export function readPublicRecord(root, directory) {
  const file = path.join(directory, PUBLIC_RECORD);
  assertNoSymlinkPath(root, file);
  const record = JSON.parse(readFileSync(file, "utf8"));
  const expected = packageEntries(root);
  if (record.schemaVersion !== 1 || !Array.isArray(record.entries) || record.entries.length !== expected.length) {
    throw new Error("The build public-entry record is incomplete.");
  }
  for (let index = 0; index < expected.length; index += 1) {
    const entry = record.entries[index];
    const target = expected[index];
    if (!entry || entry.specifier !== target.specifier || entry.path !== target.path || entry.types !== target.types
      || !Array.isArray(entry.names) || entry.names.some(name => typeof name !== "string")
      || new Set(entry.names).size !== entry.names.length
      || JSON.stringify(entry.names) !== JSON.stringify([...entry.names].sort())) {
      throw new Error("The build public-entry record does not match package exports.");
    }
    for (const relative of [entry.path, entry.types]) {
      const artifact = path.join(directory, relative);
      assertNoSymlinkPath(root, artifact);
      snapshotFile(artifact, relative);
    }
  }
  return record;
}

function relativeImport(from, to) {
  const relative = path.posix.relative(path.posix.dirname(from), to);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export function publicFiles(buildId, entries) {
  const files = [{ path: GENERATION_POINTER, content: `export * from "./builds/${buildId}/${PUBLIC_ENTRY}";\n` }];
  for (const entry of entries) {
    const bindings = entry.names.map(name => `${bindingName(entry.specifier, name)} as ${JSON.stringify(name)}`).join(", ");
    files.push({ path: entry.path,
      content: `export { ${bindings} } from ${JSON.stringify(relativeImport(entry.path, GENERATION_POINTER))};\n` });
    const typesTarget = JSON.stringify(relativeImport(entry.types, `builds/${buildId}/${entry.types.replace(/\.d\.ts$/, ".js")}`));
    files.push({ path: entry.types, content: `export * from ${typesTarget};\n`
      + (entry.names.includes("default") ? `export { default } from ${typesTarget};\n` : "") });
  }
  const published = new Set(["!build-manifest.json"]);
  for (const file of files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index += 1) published.add(`!${parts.slice(0, index).join("/")}/`);
    published.add(`!${file.path}`);
  }
  files.push({ path: ".npmignore", content: ["*", ...published, "!builds/", `!builds/${buildId}/`, `!builds/${buildId}/**`, ""].join("\n") });
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function publicManifest(distRelative, buildId, entries) {
  return {
    schemaVersion: 1,
    entries,
    files: publicFiles(buildId, entries).map(file => ({
      path: `${distRelative}/${file.path}`,
      size: Buffer.byteLength(file.content),
      sha256: createHash("sha256").update(file.content).digest("hex"),
    })),
  };
}

export function verifyPublicFiles(root, dist, manifest) {
  const record = readPublicRecord(root, path.join(dist, "builds", manifest.buildId));
  const distRelative = path.relative(root, dist).split(path.sep).join("/");
  const expected = publicManifest(distRelative, manifest.buildId, record.entries);
  if (JSON.stringify(manifest.publicApi) !== JSON.stringify(expected)) {
    throw new Error("The manifest does not bind the current package-export mapping.");
  }
  for (const file of expected.files) {
    const full = path.join(root, file.path);
    assertNoSymlinkPath(root, full);
    const actual = snapshotFile(full, file.path);
    if (actual.size !== file.size || actual.sha256 !== file.sha256) {
      throw new Error(`The public entrypoint ${file.path} does not match the verified build.`);
    }
  }
  return expected;
}
