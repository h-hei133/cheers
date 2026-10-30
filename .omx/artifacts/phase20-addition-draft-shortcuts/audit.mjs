import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { checkBuild } from '../../../scripts/start-lib.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-draft-shortcuts');
const files = ['cli/interactive/inputPreferences.ts', 'cli/interactive/interactiveMode.ts'];
function namedCallables(text) {
  const source = ts.createSourceFile('owner.ts', text, ts.ScriptTarget.Latest, true), names = [];
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) && node.name) names.push(node.name.getText(source));
    if (ts.isConstructorDeclaration(node)) names.push('constructor');
    if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) names.push(node.name.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source); return names;
}
const owners = files.map(file => {
  const relative = 'packages/ts-shell/src/' + file, current = namedCallables(fs.readFileSync(relative, 'utf8'));
  const before = namedCallables(execFileSync('rtk', ['proxy', 'git', 'show', 'ff084423:' + relative], { encoding: 'utf8' }));
  return { file, baseline: before.length, count: current.length, names: current };
});
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'), version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
if (!build.ok) throw Error('build freshness failed');
const receipt = { owners, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, freshness: true };
fs.writeFileSync(path.join(archive, 'audit.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ owners: owners.map(({ names, ...owner }) => owner), buildId: receipt.buildId, inputsDigest: receipt.inputsDigest, freshness: true }));
