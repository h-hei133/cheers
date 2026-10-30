import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { checkBuild } from '../../../scripts/start-lib.mjs';
const root = process.cwd(), file = 'packages/ts-shell/src/presentation/tui/pastes.ts';
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
const current = names(fs.readFileSync(file, 'utf8'));
const baseline = names(execFileSync('rtk', ['proxy', 'git', 'show', '8061bd92:' + file], { encoding: 'utf8' }));
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'), version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
if (!build.ok || current.length > 20) throw Error('freshness or responsibility ceiling failed');
const receipt = { file, baseline: baseline.length, count: current.length, names: current,
  constructorCount: 1, conservativeIncludingConstructor: current.length + 1,
  buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, freshness: true };
fs.writeFileSync('.omx/artifacts/phase20-addition-paste-retention/audit.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
