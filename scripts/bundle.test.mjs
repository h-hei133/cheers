import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { bundleModules } from "./build/bundle.mjs";
import { bindingName } from "./build/exports.mjs";
import { bundleDomainTypes } from "./build/types.mjs";
import { REQUIRED_BUILD_ASSETS, snapshotDirectory } from "./build-identity.mjs";

function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function fixture() {
  const parent = path.join(os.tmpdir(), "cheers-test");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, "bundle-"));
  const source = path.join(root, "packages/ts-shell/src");
  const staging = path.join(root, "packages/ts-shell/dist/staging");
  write(path.join(root, "package.json"), '{"type":"module"}\n');
  write(path.join(source, "index.ts"), 'export const value = 1;\n');
  write(path.join(source, "entrypoints/cli.tsx"), 'export {};\n');
  for (const asset of REQUIRED_BUILD_ASSETS) {
    write(path.join(source, asset), JSON.stringify({ name: path.basename(asset, ".json") }));
  }
  return { root, source, staging, entries: [{ specifier: ".", path: "index.js", types: "types/index.d.ts" }],
    version: "1.2.3", name: "@cheers/fixture" };
}

test("links emitted public types to packaged workspace declarations", () => {
  const input = fixture();
  try {
    const packageTypes = "packages/media/api.d.ts";
    const declaration = path.join(input.staging, "types/runtime/reader.d.ts");
    write(path.join(input.root, packageTypes), "export type Sample = number;\n");
    write(declaration, [
      'export type { Sample } from "@cheers/media";',
      'export type Media = typeof import("@cheers/media");',
      'export type Label = "@cheers/media";',
      'export type { External } from "external";',
    ].join("\n"));
    bundleDomainTypes(input.root, input.staging, [{ pkg: { name: "@cheers/media" }, types: packageTypes }]);
    assert.equal(readFileSync(declaration, "utf8"), [
      'export type { Sample } from "../.domains/media.js";',
      'export type Media = typeof import("../.domains/media.js");',
      'export type Label = "@cheers/media";',
      'export type { External } from "external";',
    ].join("\n"));
    assert.equal(readFileSync(path.join(input.staging, "types/.domains/media.d.ts"), "utf8"), "export type Sample = number;\n");
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("bundled public entries share live bindings and lazy owners in a deployed graph", async () => {
  const input = fixture();
  const ownerKey = `cheers-owner-${path.basename(input.root)}`;
  const lazyKey = `cheers-lazy-${path.basename(input.root)}`;
  const cliKey = `cheers-cli-${path.basename(input.root)}`;
  const buildKey = `cheers-build-${path.basename(input.root)}`;
  try {
    write(path.join(input.source, "state.ts"), `
globalThis[${JSON.stringify(ownerKey)}] = (globalThis[${JSON.stringify(ownerKey)}] ?? 0) + 1;
export const owner = new WeakMap();
export let count = 0;
export function bump() { count += 1; }
`);
    write(path.join(input.source, "presentation/themes/assets.ts"), `
import { createRequire } from 'node:module';
const nativeRequire = createRequire(import.meta.url);
export const dark = typeof require === 'function' ? require('./dark.json') : nativeRequire('./dark.json');
`);
    write(path.join(input.root, "node_modules/fixture-lazy/package.json"), '{"name":"fixture-lazy","main":"index.cjs"}\n');
    write(path.join(input.root, "node_modules/fixture-lazy/index.cjs"), `
globalThis[${JSON.stringify(lazyKey)}] = (globalThis[${JSON.stringify(lazyKey)}] ?? 0) + 1;
module.exports = { loaded: true };
`);
    write(path.join(input.source, "index.ts"), `
import { createRequire } from 'node:module';
globalThis[${JSON.stringify(buildKey)}] = true;
const nativeRequire = createRequire(import.meta.url);
export { owner, count, bump } from './state.js';
export { dark } from './presentation/themes/assets.js';
export type OnlyType = { typeOnly: true };
export default function label() { return __CHEERS_BUILD_NAME__ + '@' + __CHEERS_BUILD_VERSION__; }
export const unusual = 7;
export { unusual as "punctuated-name" };
export function lazy() { return typeof require === 'function' ? require('fixture-lazy') : nativeRequire('fixture-lazy'); }
export function nativeLazy() { return nativeRequire('fixture-lazy'); }
export async function next() { return (await import('./late.js')).owner; }
`);
    write(path.join(input.source, "late.ts"), 'export { owner } from "./state.js";\n');
    write(path.join(input.source, "feature.tsx"), 'export { owner, count, bump } from "./state.js";\n');
    write(path.join(input.source, "entrypoints/cli.tsx"), `globalThis[${JSON.stringify(cliKey)}] = true;\nexport {};\n`);
    input.entries.push({ specifier: "./feature", path: "feature.js", types: "types/feature.d.ts" });
    const record = await bundleModules(input);
    assert.equal(globalThis[buildKey], undefined, "export discovery must not execute the input");
    assert.equal(globalThis[cliKey], undefined, "the CLI must not execute during bundling");
    assert.deepEqual(record.entries[0].names,
      ["bump", "count", "dark", "default", "lazy", "nativeLazy", "next", "owner", "punctuated-name", "unusual"]);
    assert.deepEqual(record.entries[1].names, ["bump", "count", "owner"]);
    assert.ok(readdirSync(path.join(input.staging, "chunks")).some(name => name.endsWith(".js")));
    assert.deepEqual(JSON.parse(readFileSync(path.join(input.staging, "presentation/themes/dark.json"), "utf8")), { name: "dark" });
    const publicApi = await import(pathToFileURL(path.join(input.staging, "public.js")).href);
    const rootApi = await import(pathToFileURL(path.join(input.staging, "index.js")).href);
    const feature = await import(pathToFileURL(path.join(input.staging, "feature.js")).href);
    assert.equal(globalThis[ownerKey], 1);
    assert.equal(globalThis[cliKey], undefined, "public.js must not aggregate the CLI");
    assert.equal(globalThis[lazyKey], undefined, "external require must remain lazy");
    assert.equal(rootApi.owner, feature.owner);
    assert.equal(await rootApi.next(), feature.owner, "dynamic chunks must share the same owner");
    assert.equal(publicApi[bindingName(".", "owner")], feature.owner);
    feature.bump();
    assert.equal(rootApi.count, 1);
    assert.equal(publicApi[bindingName(".", "count")], 1, "aggregation must preserve live bindings");
    assert.equal(publicApi[bindingName("./feature", "count")], 1);
    assert.equal(publicApi[bindingName(".", "punctuated-name")], 7);
    assert.equal(publicApi[bindingName(".", "default")](), "@cheers/fixture@1.2.3");
    assert.deepEqual(rootApi.dark, { name: "dark" });
    assert.deepEqual(rootApi.lazy(), { loaded: true });
    assert.equal(rootApi.nativeLazy(), rootApi.lazy());
    assert.equal(globalThis[lazyKey], 1);
    const deployedJavaScript = readFileSync(path.join(input.staging, "index.js"), "utf8")
      + readdirSync(path.join(input.staging, "chunks")).map(name => readFileSync(path.join(input.staging, "chunks", name), "utf8")).join("\n");
    assert.doesNotMatch(deployedJavaScript, /module\.exports = \{ loaded: true \}/, "external package source must not be bundled");
  } finally {
    for (const key of [ownerKey, lazyKey, cliKey, buildKey]) delete globalThis[key];
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("public aggregation preserves side effects of an entry with no runtime exports", async () => {
  const input = fixture();
  const key = `cheers-empty-${path.basename(input.root)}`;
  try {
    write(path.join(input.source, "empty.ts"), `globalThis[${JSON.stringify(key)}] = true;\nexport type Hidden = string;\n`);
    input.entries.push({ specifier: "./empty", path: "empty.js", types: "types/empty.d.ts" });
    const record = await bundleModules(input);
    assert.deepEqual(record.entries[1].names, []);
    assert.equal(globalThis[key], undefined);
    await import(pathToFileURL(path.join(input.staging, "public.js")).href);
    assert.equal(globalThis[key], true);
  } finally { delete globalThis[key]; rmSync(input.root, { recursive: true, force: true }); }
});

test("bundles the independently compiled media workspace as a lazy feature", async () => {
  const input = fixture();
  const mediaEntry = path.join(input.staging, ".media", "index.js");
  try {
    write(mediaEntry, 'export const value = "media workspace fixture";\n');
    write(path.join(input.source, "index.ts"), `
export const core = 1;
export async function media() {
  try { return (await import('@cheers/media')).value; }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') return 'unavailable'; throw error; }
}
`);
    await bundleModules({ ...input, domainEntries: new Map([['@cheers/media', mediaEntry]]) });
    const mediaChunk = readdirSync(path.join(input.staging, 'chunks')).find(name =>
      readFileSync(path.join(input.staging, 'chunks', name), 'utf8').includes('media workspace fixture'));
    assert.ok(mediaChunk, 'media implementation must be in a shipped chunk');
    const entry = pathToFileURL(path.join(input.staging, 'index.js')).href;
    assert.equal((await import(entry)).core, 1);
    assert.equal(await (await import(entry)).media(), 'media workspace fixture');

    const missing = fixture();
    try {
      write(path.join(missing.source, 'index.ts'), readFileSync(path.join(input.source, 'index.ts')));
      const missingEntry = path.join(missing.staging, '.media', 'index.js');
      write(missingEntry, 'export const value = "media workspace fixture";\n');
      await bundleModules({ ...missing, domainEntries: new Map([['@cheers/media', missingEntry]]) });
      for (const name of readdirSync(path.join(missing.staging, 'chunks'))) {
        if (readFileSync(path.join(missing.staging, 'chunks', name), 'utf8').includes('media workspace fixture')) {
          rmSync(path.join(missing.staging, 'chunks', name));
        }
      }
      const api = await import(pathToFileURL(path.join(missing.staging, 'index.js')).href);
      assert.equal(api.core, 1);
      assert.equal(await api.media(), 'unavailable');
    } finally { rmSync(missing.root, { recursive: true, force: true }); }
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("bundle output is stable across temporary domain directories", async () => {
  const input = fixture();
  const secondStaging = path.join(input.root, "packages/ts-shell/dist/staging-second");
  const domainSource = "export const value = 'stable domain output';\n";
  const writeDomainEntry = (staging) => {
    const entry = path.join(staging, ".domains/media/index.js");
    write(entry, domainSource);
    return entry;
  };

  try {
    write(path.join(input.source, "index.ts"), [
      'export async function media() {',
      '  return (await import("@cheers/media")).value;',
      '}',
    ].join("\n"));

    await bundleModules({ ...input, domainEntries: new Map([
      ["@cheers/media", writeDomainEntry(input.staging)],
    ]) });
    rmSync(path.join(input.staging, ".domains"), { recursive: true, force: true });
    const first = snapshotDirectory(input.staging);

    await bundleModules({ ...input, staging: secondStaging, domainEntries: new Map([
      ["@cheers/media", writeDomainEntry(secondStaging)],
    ]) });
    rmSync(path.join(secondStaging, ".domains"), { recursive: true, force: true });
    const second = snapshotDirectory(secondStaging);

    assert.equal(second.digest, first.digest);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("domain modules cannot reach another package through relative imports", async () => {
  const input = fixture();
  try {
    write(path.join(input.source, "index.ts"), 'export async function media() { return import("@cheers/media"); }\n');
    const mediaEntry = path.join(input.staging, ".domains/media/index.js");
    const browserEntry = path.join(input.staging, ".domains/browser/index.js");
    write(mediaEntry, 'export { value } from "../browser/index.js";\n');
    write(browserEntry, 'export const value = "browser";\n');

    await assert.rejects(bundleModules({ ...input, domainEntries: new Map([
      ["@cheers/media", mediaEntry],
      ["@cheers/browser", browserEntry],
    ]) }), /escapes its package output/);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("missing, ambiguous and unsafe public sources refuse bundling before staging changes", async () => {
  const input = fixture();
  try {
    write(path.join(input.staging, "kept.txt"), "unchanged\n");
    await assert.rejects(bundleModules({ ...input, entries: [{ specifier: ".", path: "missing.js", types: "types/missing.d.ts" }] }),
      /exactly one \.ts or \.tsx/);
    write(path.join(input.source, "index.tsx"), 'export const second = true;\n');
    await assert.rejects(bundleModules(input), /exactly one \.ts or \.tsx/);
    await assert.rejects(bundleModules({ ...input, entries: [{ specifier: ".", path: "../escape.js", types: "types/../escape.d.ts" }] }),
      /unsafe or duplicate/);
    assert.deepEqual(readdirSync(input.staging), ["kept.txt"]);
    assert.equal(readFileSync(path.join(input.staging, "kept.txt"), "utf8"), "unchanged\n");
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});
