import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-team-adoption');
const files = ['core/tools/teamTool.ts', 'core/subagents/team/adoption.ts', 'turn/tools.ts'];
function names(source) {
  const result = [], tree = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
      || ts.isSetAccessorDeclaration(node)) && node.name) result.push(node.name.getText(tree));
    else if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) result.push(node.name.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree); return result;
}
const counts = files.map(file => {
  const target = 'packages/ts-shell/src/' + file;
  const previous = spawnSync('rtk', ['proxy', 'git', 'show', '19ee578ceda0a7be617d1dc162cd7b7bcf12e8cd:' + target], { encoding: 'utf8' });
  const baseline = previous.status === 0 ? names(previous.stdout).length : 0;
  const found = names(fs.readFileSync(target, 'utf8'));
  assert(found.length <= 20 || found.length <= baseline, 'no increased responsibility violation: ' + file);
  return { file, count: found.length, baseline, names: found };
});
fs.writeFileSync(path.join(archive, 'module-counts.json'), JSON.stringify(counts, null, 2) + '\n');
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'fresh build');
const manifest = { ok: build.ok, entry: build.entry, buildId: build.manifest.buildId,
  inputsDigest: build.manifest.inputsDigest, artifactDigest: build.manifest.artifactDigest, version: build.manifest.version };
fs.writeFileSync(path.join(archive, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ counts: counts.map(({ file, count, baseline }) => ({ file, count, baseline })), build: manifest }) + '\n');
