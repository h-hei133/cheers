import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { checkBuild } from '../../../scripts/start-lib.mjs';
const root = process.cwd();
function names(text) {
  const source = ts.createSourceFile('owner.ts', text, ts.ScriptTarget.Latest, true), result = [];
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) && node.name) result.push(node.name.getText(source));
    if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) result.push(node.name.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source); return result;
}
const files = ['core/shell/sessionRuntime.ts', 'session/agent/lifecycle.ts', 'session/lifecycle/sessionLifecycleWrites.ts', 'session/lifecycle/sessionPromptBarrier.ts'];
const owners = files.map(file => {
  const relative = 'packages/ts-shell/src/' + file;
  const current = names(fs.readFileSync(relative, 'utf8'));
  const baseline = names(execFileSync('rtk', ['proxy', 'git', 'show', 'bc121e28:' + relative], { encoding: 'utf8' }));
  return { file, baseline: baseline.length, count: current.length, names: current };
});
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'), version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
if (!build.ok || owners.some(owner => owner.count > owner.baseline)) throw Error('freshness or responsibility ceiling failed');
const receipt = { owners, baselineCeilingViolationsRetained: owners.filter(owner => owner.count > 20).map(owner => owner.file),
  buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, freshness: true };
fs.writeFileSync('.omx/artifacts/phase20-addition-image-history/audit.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
