#!/usr/bin/env node
// Import-cycle gate.
//
// AGENTS.md norm #1 forbids dependency cycles. Everything here is resolved with
// `path.resolve` before identity comparison and parsed with TypeScript's AST so
// `import`, `export ... from`, dynamic `import('...')`, and `import type` are
// classified accurately without comment/string false positives.
//
// `import type` and `export type` are erased at emit, so they cannot form a
// runtime cycle. Type-only back-edges are reported separately as advisory notes.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { packageBoundaryFindings, stronglyConnected } from "./build/imports.mjs";
import { workspacePackages } from "./build/workspaces.mjs";

const root = process.cwd();
const selectedRoot = process.argv[2];
const workspaces = selectedRoot === undefined ? workspacePackages(root) : [];
const sourceRoots = selectedRoot === undefined ? workspaces.map(entry => path.resolve(root, entry.directory, "src"))
  : [path.resolve(root, selectedRoot)];

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

function resolveSpecifier(fromFile, specifier, known) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier).replace(/\.[cm]?js$/, "");
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const resolved = path.resolve(candidate);
      return known.has(resolved) ? resolved : null;
    }
  }
  return null;
}

function isTypeOnlyImportClause(clause) {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    return clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(el => el.isTypeOnly);
  }
  return false;
}

function isTypeOnlyExportClause(clause) {
  if (!clause) return false;
  if (ts.isNamedExports(clause)) {
    return clause.elements.length > 0 && clause.elements.every(el => el.isTypeOnly);
  }
  return false;
}

function extractDependencies(filePath, sourceText) {
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, false, kind);
  const edges = new Map(); // specifier -> 'value' | 'type-only'
  const record = (specifier, edgeKind) => {
    const prev = edges.get(specifier);
    if (prev !== "value") edges.set(specifier, edgeKind);
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, isTypeOnlyImportClause(node.importClause) ? "type-only" : "value");
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = node.isTypeOnly || isTypeOnlyExportClause(node.exportClause);
      record(node.moduleSpecifier.text, typeOnly ? "type-only" : "value");
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && ts.isStringLiteral(node.moduleReference.expression)) {
      record(node.moduleReference.expression.text, node.isTypeOnly ? "type-only" : "value");
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      record(node.arguments[0].text, "value");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edges;
}

function buildGraph(files, known) {
  const runtime = files.map(() => []);
  const typeOnly = files.map(() => []);
  for (let i = 0; i < files.length; i += 1) {
    const source = fs.readFileSync(files[i], "utf8");
    for (const [specifier, edgeKind] of extractDependencies(files[i], source)) {
      const target = resolveSpecifier(files[i], specifier, known);
      if (!target || !known.has(target)) continue;
      const targetIndex = known.get(target);
      if (edgeKind === "type-only") typeOnly[i].push(targetIndex);
      else runtime[i].push(targetIndex);
    }
  }
  return { runtime, typeOnly };
}

const files = sourceRoots.flatMap(directory => collectFiles(directory));
const shown = new Map(files.map((file, i) => [file, i]));
const { runtime, typeOnly } = buildGraph(files, shown);
const runtimeCycles = stronglyConnected(runtime, files.length);
const displayRoot = selectedRoot === undefined ? root : sourceRoots[0];

// Guard the path-form regression directly: both forms of the same file must agree.
const probe = files[0];
if (probe && shown.get(path.resolve(probe)) !== shown.get(probe)) {
  console.error("scc-gate: path identity broken (relative/absolute mismatch)");
  process.exit(2);
}

console.log(`scc-gate roots=${sourceRoots.map(directory => path.relative(root, directory)).join(",")} files=${files.length}`);
for (const component of runtimeCycles) {
  console.error("  runtime cycle:");
  for (const node of component) {
    console.error(`    ${path.relative(displayRoot, files[node])}`);
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
    console.log(`  - ${component.map((n) => path.relative(displayRoot, files[n])).join(" <-> ")}`);
  }
}

if (runtimeCycles.length > 0) {
  console.error(`[fail] no-dependency-cycles - ${runtimeCycles.length} runtime cycle(s)`);
  process.exitCode = 1;
} else console.log("[pass] no-dependency-cycles - no runtime import cycles in the selected source roots");

if (selectedRoot === undefined) {
  const boundary = packageBoundaryFindings(root, workspaces);
  for (const finding of boundary) console.error(`[fail] package-boundary - ${finding}`);
  if (boundary.length > 0) process.exitCode = 1;
  else console.log("[pass] package-boundary - workspace dependencies are acyclic and imports use declared public entries");
}
