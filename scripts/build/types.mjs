import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function moduleSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isExternalModuleReference(node)) return node.expression;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return node.argument.literal;
}

function linkDeclaration(file, targets) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("@cheers/")) return;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const replacements = [];
  function visit(node) {
    const specifier = moduleSpecifier(node);
    const target = specifier && ts.isStringLiteral(specifier) && targets.get(specifier.text);
    if (target) {
      const relative = path.relative(path.dirname(file), target).split(path.sep).join("/");
      replacements.push({ start: specifier.getStart(source), end: specifier.end,
        text: JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (replacements.length === 0) return;
  let linked = text;
  for (const replacement of replacements.reverse()) {
    linked = linked.slice(0, replacement.start) + replacement.text + linked.slice(replacement.end);
  }
  writeFileSync(file, linked);
}

function linkDirectory(directory, targets) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) linkDirectory(file, targets);
    else if (entry.isFile() && /\.d\.[cm]?ts$/.test(entry.name)) linkDeclaration(file, targets);
  }
}

/** Publish private workspace types with the independently installed host package. */
export function bundleDomainTypes(root, staging, domains) {
  if (domains.length === 0) return;
  const types = path.join(staging, "types");
  const directory = path.join(types, ".domains");
  const targets = new Map();
  mkdirSync(directory);
  for (const domain of domains) {
    const name = domain.pkg.name.slice("@cheers/".length);
    copyFileSync(path.join(root, domain.types), path.join(directory, `${name}.d.ts`));
    targets.set(domain.pkg.name, path.join(directory, `${name}.js`));
  }
  linkDirectory(types, targets);
}
