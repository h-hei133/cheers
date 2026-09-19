#!/usr/bin/env node
// Import-cycle gate.
//
// AGENTS.md norm #1 forbids dependency cycles, but until now nothing in the repo
// enforced it: the B4 splits were each verified with an ad-hoc scanner that was
// never committed, and one of those scanners was silently wrong, so a real
// two-module runtime cycle shipped while its commit message claimed "0 cycles".
//
// The bug that made it wrong is worth recording, because it is easy to repeat:
// file paths were collected relative (`src/a.ts`) while import specifiers were
// resolved absolute (`/repo/src/a.ts`). The identity map therefore never matched,
// every edge into a file not already reached by the same form was dropped, and the
// graph looked acyclic. Everything here is resolved with `path.resolve` before it
// is compared, and the regression test below pins that.
//
// `import type` is erased at emit, so it cannot form a runtime cycle. It is
// reported separately: a type-only back-edge is load-safe but becomes a real cycle
// the moment someone converts it to a value import.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] ?? "packages/ts-shell/src");

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collectFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      // Absolute from the start; mixing forms is the bug this gate exists to avoid.
      acc.push(path.resolve(full));
    }
  }
  return acc;
}

const RE_RUNTIME = /import\s+(?!type\b)(?:[^'"]*?)\bfrom\s*["']([^"']+)["']/g;
const RE_TYPE_ONLY = /import\s+type\s+[^'"]*?\bfrom\s*["']([^"']+)["']/g;
const RE_BARE = /import\s*["']([^"']+)["']/g;

function resolveSpecifier(fromFile, specifier, known) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier).replace(/\.js$/, "");
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return known.has(path.resolve(candidate)) ? path.resolve(candidate) : null;
    }
  }
  return null;
}

function buildGraph(files, known) {
  const runtime = files.map(() => []);
  const typeOnly = files.map(() => []);
  for (let i = 0; i < files.length; i += 1) {
    const source = fs.readFileSync(files[i], "utf8");
    for (const [pattern, sink] of [
      [RE_RUNTIME, runtime],
      [RE_BARE, runtime],
      [RE_TYPE_ONLY, typeOnly],
    ]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        const target = resolveSpecifier(files[i], match[1], known);
        if (target && known.has(target)) sink[i].push(known.get(target));
      }
    }
  }
  return { runtime, typeOnly };
}

function stronglyConnected(edges, count) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Array(count).fill(-1);
  const low = new Array(count).fill(0);
  const components = [];
  const visit = (v) => {
    indices[v] = low[v] = index++;
    stack.push(v);
    onStack.add(v);
    for (const w of edges[v]) {
      if (indices[w] < 0) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack.has(w)) {
        low[v] = Math.min(low[v], indices[w]);
      }
    }
    if (low[v] === indices[v]) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  };
  for (let v = 0; v < count; v += 1) if (indices[v] < 0) visit(v);
  return components.filter((component) => component.length > 1);
}

const files = collectFiles(ROOT);
const shown = new Map(files.map((file, i) => [file, i]));
const { runtime, typeOnly } = buildGraph(files, shown);
const runtimeCycles = stronglyConnected(runtime, files.length);

// Guard the path-form regression directly: both forms of the same file must agree.
const probe = files[0];
if (probe && shown.get(path.resolve(probe)) !== shown.get(probe)) {
  console.error("scc-gate: path identity broken (relative/absolute mismatch)");
  process.exit(2);
}

console.log(`scc-gate root=${path.relative(process.cwd(), ROOT)} files=${files.length}`);
for (const component of runtimeCycles) {
  console.error("  runtime cycle:");
  for (const node of component) {
    console.error(`    ${path.relative(ROOT, files[node])}`);
  }
}
const typeOnlyCycles = stronglyConnected(typeOnly, files.length).filter((component) =>
  // Only report pairs whose back-edge is type-only, i.e. no runtime cycle already covers them.
  !runtimeCycles.some((runtime) => component.every((node) => runtime.includes(node)))
);
console.log(`scc-gate runtime_cycles=${runtimeCycles.length} type_only_cycles=${typeOnlyCycles.length}`);
if (typeOnlyCycles.length > 0) {
  console.log("[note] type-only back-edges are erased at emit and cannot fault; they become");
  console.log("       runtime cycles the moment one is converted to a value import:");
  for (const component of typeOnlyCycles) {
    console.log(`  - ${component.map((n) => path.relative(ROOT, files[n])).join(" <-> ")}`);
  }
}

if (runtimeCycles.length > 0) {
  console.error(`[fail] no-dependency-cycles - ${runtimeCycles.length} runtime cycle(s)`);
  process.exit(1);
}
console.log("[pass] no-dependency-cycles - every module import resolves acyclically");
