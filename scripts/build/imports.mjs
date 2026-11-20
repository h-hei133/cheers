import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { workspacePackages } from "./workspaces.mjs";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

export function stronglyConnected(edges, count) {
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
  return components.filter(component => component.length > 1);
}

function contained(root, file) {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function* sourceFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(file)) yield file;
  }
}

function exportsPath(pkg, specifier) {
  const subpath = specifier === pkg.name ? "." : `.${specifier.slice(pkg.name.length)}`;
  return pkg.exports?.[subpath] !== undefined && pkg.exports[subpath] !== null;
}

function packageCycle(component, dependencies) {
  const members = new Set(component);
  const start = Math.min(...component);
  const first = dependencies[start].find(target => target !== start && members.has(target));
  const queue = [first];
  const previous = new Map([[first, undefined]]);
  for (const current of queue) {
    if (current === start) break;
    for (const target of dependencies[current]) {
      if (!members.has(target) || previous.has(target)) continue;
      previous.set(target, current);
      queue.push(target);
    }
  }
  const cycle = [];
  for (let current = start; current !== undefined; current = previous.get(current)) cycle.push(current);
  return [start, ...cycle.reverse()];
}

export function packageBoundaryFindings(root, declared = workspacePackages(root)) {
  const workspaces = declared.map((entry, index) => ({ ...entry, index, path: path.resolve(root, entry.directory) }));
  const byName = new Map(workspaces.map(workspace => [workspace.pkg.name, workspace]));
  const host = workspaces.find(workspace => workspace.directory === "packages/ts-shell");
  const dependencies = workspaces.map(workspace => [...new Set(DEPENDENCY_FIELDS
    .flatMap(field => Object.keys(workspace.pkg[field] ?? {}))
    .filter(name => byName.has(name))
    .sort())]
    .map(name => byName.get(name).index));
  const findings = [];
  for (const workspace of workspaces) {
    const targets = dependencies[workspace.index];
    if (targets.includes(workspace.index)) {
      findings.push(`package dependency cycle: ${workspace.pkg.name} -> ${workspace.pkg.name}`);
    }
    if (host && workspace !== host && targets.includes(host.index)) {
      findings.push(`${workspace.file} -> ${host.pkg.name}: domain packages must not depend on the shell host`);
    }
  }
  for (const component of stronglyConnected(dependencies, workspaces.length)) {
    const cycle = packageCycle(component, dependencies).map(index => workspaces[index].pkg.name);
    findings.push(`package dependency cycle: ${cycle.join(" -> ")}`);
  }
  if (workspaces.length < 2) return findings;
  for (const workspace of workspaces) {
    const dependsOn = new Set(dependencies[workspace.index]);
    const files = [...sourceFiles(path.join(workspace.path, "src"))];
    const declarations = path.join(workspace.path, "api.d.ts");
    if (fs.existsSync(declarations)) files.push(declarations);
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const references = ts.preProcessFile(source, true, true);
      for (const { fileName: specifier } of [...references.importedFiles, ...references.referencedFiles]) {
        const isRelative = specifier.startsWith(".");
        const target = isRelative || path.isAbsolute(specifier)
          ? workspaces.find(other => contained(other.path, path.resolve(path.dirname(file), specifier)))
          : workspaces.find(other => specifier === other.pkg.name || specifier.startsWith(`${other.pkg.name}/`));
        if (!target || target === workspace) continue;
        const reason = isRelative || path.isAbsolute(specifier) ? `use the public entry of ${target.pkg.name}`
          : !dependsOn.has(target.index) ? `declare ${target.pkg.name} as a dependency`
          : !exportsPath(target.pkg, specifier) ? `${specifier} is outside the declared exports` : undefined;
        if (reason) findings.push(`${path.relative(root, file)} -> ${specifier}: ${reason}`);
      }
    }
  }
  return [...new Set(findings)].sort();
}
