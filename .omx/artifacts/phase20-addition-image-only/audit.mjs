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
const baselineCommit = execFileSync('rtk', ['proxy', 'git', 'rev-parse', '89843761'], { encoding: 'utf8' }).trim();
const files = ['model-adapters/multimodal.ts', 'session/recovery/scope.ts', 'session/recovery/sessionResumeEligibility.ts',
  'session/presentation/sessionReentrySurface.ts', 'core/shell/recovery.ts'];
const owners = files.map(file => {
  const relative = 'packages/ts-shell/src/' + file;
  const current = names(fs.readFileSync(relative, 'utf8'));
  const baseline = names(execFileSync('rtk', ['proxy', 'git', 'show', baselineCommit + ':' + relative], { encoding: 'utf8' }));
  assert(current.length <= 20, 'responsibility ceiling: ' + file);
  assert.equal(current.length - baseline.length, file === 'model-adapters/multimodal.ts' ? 1 : 0);
  return { file, baseline: baseline.length, count: current.length, names: current };
});
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'current build freshness');
const receipt = { baselineCommit, owners, buildId: build.manifest.buildId,
  inputsDigest: build.manifest.inputsDigest, freshness: true };
fs.writeFileSync('.omx/artifacts/phase20-addition-image-only/audit.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
