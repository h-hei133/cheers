import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from '../../../node_modules/typescript/lib/typescript.js';
import { buildInputDigest, listCompilerFiles } from '../../../scripts/build-identity.mjs';
import { checkBuild } from '../../../scripts/start-lib.mjs';
const root = process.cwd();
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist',
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
if (!build.ok) throw Error(build.reason);
const compiler = listCompilerFiles(root), input = buildInputDigest(root, compiler);
if (JSON.stringify(compiler) !== JSON.stringify(build.manifest.compilerInputs) || input.digest !== build.manifest.inputsDigest)
  throw Error('compiler input mismatch');
const count = text => { let total = 0; const visit = node => {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) total++;
  else if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) total++;
  else if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) total++;
  ts.forEachChild(node, visit);
}; visit(ts.createSourceFile('owner.ts', text, ts.ScriptTarget.Latest, true)); return total; };
const report = { buildId: build.manifest.buildId, inputsDigest: input.digest, compilerInputs: compiler.length,
  files: input.files, compilerMatch: true, digestMatch: true, callables: {} };
for (const file of ['packages/ts-shell/src/edit/recovery/undo/turnRestore.ts', 'packages/ts-shell/src/edit/recovery/undo/report.ts', 'packages/ts-shell/src/edit/recovery/undo/command.ts', 'packages/ts-shell/src/edit/recovery/undo/service.ts', 'packages/ts-shell/src/observability/usageTelemetry.ts']) {
  const source = fs.readFileSync(file, 'utf8'), previous = execFileSync('rtk', ['proxy', 'git', 'show', 'HEAD:' + file], { encoding: 'utf8' });
  report.callables[file] = { count: count(source), previousCount: count(previous), sourceSha256: createHash('sha256').update(source).digest('hex') };
}
fs.writeFileSync('.omx/artifacts/phase20-addition-restore-status/build.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
