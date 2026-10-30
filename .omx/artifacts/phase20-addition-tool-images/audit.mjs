import assert from 'node:assert/strict';
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
const baselineCommit = '4fa2cd53';
const files = ['cli/interactive/toolCards.ts', 'cli/interactive/turnSink.ts', 'presentation/tui/transcript/blocks.ts',
  'cli/interactive/history.ts', 'turn/projection.ts', 'session/sessionEventCodec.ts'];
const owners = files.map(file => {
  const relative = 'packages/ts-shell/src/' + file;
  const current = names(fs.readFileSync(relative, 'utf8'));
  const baseline = names(execFileSync('rtk', ['proxy', 'git', 'show', baselineCommit + ':' + relative], { encoding: 'utf8' }));
  return { file, baseline: baseline.length, count: current.length, overCeiling: current.length > 20 };
});
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'current build freshness');
const receipt = { baselineCommit, owners, overCeiling: owners.filter(owner => owner.overCeiling).map(owner => owner.file),
  buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, freshness: true };
fs.writeFileSync('.omx/artifacts/phase20-addition-tool-images/audit.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
