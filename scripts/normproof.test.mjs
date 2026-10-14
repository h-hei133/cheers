import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = path.join(root, '.tmp');
fs.mkdirSync(temporaryRoot, { recursive: true });
const fixture = fs.mkdtempSync(path.join(temporaryRoot, 'normproof-test-'));
after(() => fs.rmSync(fixture, { recursive: true, force: true }));
execFileSync('tar', ['-xzf', path.join(root, '.normproof/normproof-0.1.0.tgz'), '-C', fixture]);
const bundle = path.join(fixture, 'package');
const graph = await import(pathToFileURL(path.join(bundle, 'dist/adapters/sidecar-file/module-graph.js')).href);
const { evaluateObligationExpression } = await import(pathToFileURL(path.join(bundle, 'dist/engine/proof/expression/evaluate.js')).href);
const metadata = JSON.parse(fs.readFileSync(path.join(root, '.normproof/bundle.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');

function wideGraph(count = 4096) {
  return new Map(Array.from({ length: count }, (_, index) => [`packages/m${index}.ts`,
    [1, 2, 3, 4].map(offset => `import './m${(index + offset) % count}.js';`).join('\n')]));
}

test('the installed archive and adapted entries match the reproducible artifact', () => {
  assert.equal(hash(fs.readFileSync(path.join(root, '.normproof/normproof-0.1.0.tgz'))), metadata.archiveSha256);
  assert.equal(hash(fs.readFileSync(path.join(root, metadata.patch))), metadata.patchSha256);
  for (const [file, digest] of Object.entries(metadata.members)) assert.equal(hash(fs.readFileSync(path.join(fixture, file))), digest.after);
  for (const file of metadata.vendor.files) assert.equal(hash(fs.readFileSync(path.join(fixture, file.target))), file.sha256);
});

test('a graph above the old capacity reaches the real evaluator and late missing imports remain visible', async () => {
  const sources = wideGraph(2600);
  sources.set('packages/zz.ts', "import './missing.js';");
  const collected = graph.buildModuleGraph(sources);
  assert.ok(Array.isArray(collected.edges), 'the complete graph must reach the evaluator');
  assert.equal(collected.edges.length, 10400);
  assert.deepEqual(collected.unresolved, [{ from: 'packages/zz.ts', specifier: './missing.js' }]);
  const listing = graph.formatModuleGraph(collected.edges, collected.unresolved);
  const pointer = { id: 'graph', path: 'packages/**/*.ts*', present: true, byteSize: Buffer.byteLength(listing), contentLoaded: false };
  const result = await evaluateObligationExpression({ kind: 'none', evidenceId: 'graph', matches: 'unresolved: */**' },
    { inputs: { evidences: { graph: pointer } }, reader: async () => ({ content: listing }) });
  assert.equal(result.satisfied, false);
  assert.match(result.reason, /missing\.js/);
  assert.doesNotMatch(result.reason, /member ceiling/);
  const clean = listing.split('\n').filter(line => !line.startsWith('unresolved: ')).join('\n');
  const accepted = await evaluateObligationExpression({ kind: 'none', evidenceId: 'graph', matches: 'unresolved: */**' },
    { inputs: { evidences: { graph: pointer } }, reader: async () => ({ content: clean }) });
  assert.equal(accepted.satisfied, true);
});

test('the declared capacity is accepted exactly and one additional edge fails without a partial graph', () => {
  const sources = wideGraph();
  const exact = graph.buildModuleGraph(sources);
  assert.equal(exact.edges.length, 16384);
  sources.set('packages/m0.ts', sources.get('packages/m0.ts') + "\nimport './m5.js';");
  const overflow = graph.buildModuleGraph(sources);
  assert.match(overflow.failure, /16384 edge ceiling/);
  assert.equal(overflow.edges, undefined);
});

test('wide imports, literal dynamic imports and TSX paths cannot disappear or resolve to a different explicit file', () => {
  const source = `import { ${Array.from({ length: 100 }, (_, index) => `name${index}`).join(', ')} } from './view.js';\n`
    + "export { value } from './folder';\nconst lazy = import('./lazy.js');\n"
    + "// import './comment.js'\nconst text = \"import './string.js'\";\n";
  const sources = new Map([['packages/entry.ts', source], ['packages/view.tsx', ''],
    ['packages/folder/index.tsx', ''], ['packages/lazy.ts', '']]);
  const result = graph.buildModuleGraph(sources);
  assert.equal(result.edges.length, 3);
  assert.deepEqual(result.unresolved, []);
  sources.set('packages/entry.ts', "import './view.ts'; import './folder.js';");
  assert.deepEqual(graph.buildModuleGraph(sources).unresolved, [
    { from: 'packages/entry.ts', specifier: './folder.js' }, { from: 'packages/entry.ts', specifier: './view.ts' },
  ]);
});

test('the complete repository declaration graph matches TypeScript and remains acyclic', async () => {
  const sources = new Map();
  // Use declared source paths so concurrent runtime fixtures cannot enter this comparison.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'packages'], { cwd: root }).toString().split('\0');
  for (const file of files) if (/\.tsx?$/.test(file) && fs.existsSync(path.join(root, file))) sources.set(file, fs.readFileSync(path.join(root, file), 'utf8'));
  assert.ok(sources.size > 2000, 'the complete source tree must be collected');
  for (const [file, source] of sources) {
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const expected = new Set();
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) expected.add(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) expected.add(node.argument.literal.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) expected.add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(syntax);
    assert.deepEqual(new Set(graph.declaredSpecifiers(source, file)), expected, file);
  }
  const collected = graph.buildModuleGraph(sources);
  assert.ok(collected.edges.length > 8192);
  assert.deepEqual(collected.unresolved, []);
  const listing = graph.formatModuleGraph(collected.edges, collected.unresolved);
  const pointer = { id: 'graph', path: 'packages/**/*.ts*', present: true, byteSize: Buffer.byteLength(listing), contentLoaded: false };
  const result = await evaluateObligationExpression({ kind: 'acyclic', evidenceId: 'graph' },
    { inputs: { evidences: { graph: pointer } }, reader: async () => ({ content: listing }) });
  assert.equal(result.satisfied, true, result.reason);
});

test('the unchanged blocking obligation rejects a native CLI workspace with a missing TSX import', () => {
  const workspace = path.join(fixture, 'workspace');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'packages/view.tsx'), "import './missing.js';\n");
  for (const file of ['judge-input.json', 'evidence-manifest.json', 'norm-packs/software-structure-v0/profile.json']) {
    fs.copyFileSync(path.join(root, '.normproof', file), path.join(workspace, '.normproof', file));
  }
  const run = spawnSync(process.execPath, [path.join(bundle, 'dist/adapters/cli/normproof.js'), 'judge'],
    { cwd: workspace, encoding: 'utf8', env: { ...process.env, CHEERS_REAL_HOME: '' } });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  const ledger = JSON.parse(fs.readFileSync(path.join(workspace, '.normproof/out/ledger.json'), 'utf8'));
  assert.match(JSON.stringify(ledger), /packages\/view\.tsx/);
  assert.match(JSON.stringify(ledger), /missing\.js/);
  assert.match(JSON.stringify(ledger), /source_graph_has_no_unresolved_specifiers/);
});

test('ASI declarations cannot hide a missing side-effect import from the native blocking obligation', () => {
  const workspace = path.join(fixture, 'asi');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  const source = `export const padding = "${'x'.repeat(600)}"\nimport './missing.js'\nimport { value } from './ok.js'\n`;
  assert.equal(ts.createSourceFile('entry.ts', source, ts.ScriptTarget.Latest).parseDiagnostics.length, 0);
  fs.writeFileSync(path.join(workspace, 'packages/entry.ts'), source);
  fs.writeFileSync(path.join(workspace, 'packages/ok.ts'), 'export const value = 1');
  for (const file of ['judge-input.json', 'evidence-manifest.json', 'norm-packs/software-structure-v0/profile.json']) {
    fs.copyFileSync(path.join(root, '.normproof', file), path.join(workspace, '.normproof', file));
  }
  const run = spawnSync(process.execPath, [path.join(bundle, 'dist/adapters/cli/normproof.js'), 'judge'],
    { cwd: workspace, encoding: 'utf8', env: { ...process.env, CHEERS_REAL_HOME: '' } });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  const ledger = JSON.parse(fs.readFileSync(path.join(workspace, '.normproof/out/ledger.json'), 'utf8'));
  const obligation = ledger.obligations.find(entry => entry.id === 'source_graph_has_no_unresolved_specifiers');
  assert.equal(obligation.status, 'failed');
  assert.match(JSON.stringify(obligation), /missing\.js/);
});

test('a native self import remains a cycle under the unchanged advisory obligation', () => {
  const source = "import './entry.js';\nexport function value() { return 1; }\n";
  const collected = graph.buildModuleGraph(new Map([['packages/entry.ts', source]]));
  assert.deepEqual(collected.edges, [{ from: 'packages/entry.ts', to: 'packages/entry.ts' }]);
  assert.deepEqual(collected.unresolved, []);
  const workspace = path.join(fixture, 'self');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'packages/entry.ts'), source);
  for (const file of ['judge-input.json', 'evidence-manifest.json', 'norm-packs/software-structure-v0/profile.json']) {
    fs.copyFileSync(path.join(root, '.normproof', file), path.join(workspace, '.normproof', file));
  }
  const run = spawnSync(process.execPath, [path.join(bundle, 'dist/adapters/cli/normproof.js'), 'judge'],
    { cwd: workspace, encoding: 'utf8', env: { ...process.env, CHEERS_REAL_HOME: '' } });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const verdict = JSON.parse(fs.readFileSync(path.join(workspace, '.normproof/out/verdict.json'), 'utf8'));
  assert.equal(verdict.status, 'partial');
  const ledger = JSON.parse(fs.readFileSync(path.join(workspace, '.normproof/out/ledger.json'), 'utf8'));
  assert.equal(ledger.obligations.find(entry => entry.id === 'source_graph_is_acyclic').status, 'failed');
  assert.equal(ledger.obligations.find(entry => entry.id === 'source_graph_has_no_unresolved_specifiers').status, 'satisfied');
});

test('literal syntax and file grammar retain targets, while parse errors discard the entire collection', () => {
  const source = 'const cast = <number>1;\n'
    + 'const lazy = import(`./lazy.js`); const text = `result ${import("./nested.js")}`;\n'
    + 'type T = import("./types.js").T; import legacy = require("./legacy.js");\n'
    + String.raw`const expression = /import\(".\/phantom.js"\)/; const other = obj.import("./method.js");` + '\n'
    + 'import "./esc\\u0061ped.js";\n';
  const sourcePaths = ['entry.ts', 'lazy.ts', 'nested.ts', 'types.ts', 'legacy.ts', 'escaped.ts'];
  const sources = new Map(sourcePaths.map(file => ['packages/' + file, file === 'entry.ts' ? source : '']));
  assert.equal(graph.buildModuleGraph(sources).edges.length, 5);
  assert.deepEqual(graph.buildModuleGraph(sources).unresolved, []);
  sources.set('packages/view.tsx', 'import "./lazy.js"; export const view = <div />;');
  assert.equal(graph.buildModuleGraph(sources).edges.length, 6);
  sources.set('packages/broken.ts', 'import { broken from "./missing.js";');
  const result = graph.buildModuleGraph(sources);
  assert.match(result.failure, /broken\.ts.*collection is incomplete/);
  assert.equal(result.edges, undefined);
});

test('bounded large ASI export input cannot cause quadratic clause scanning', () => {
  const script = `import { declaredSpecifiers } from ${JSON.stringify(pathToFileURL(path.join(bundle, 'dist/adapters/sidecar-file/module-graph.js')).href)};
    const source = Array.from({length: 32000}, (_, i) => 'export const v' + i + ' = 0').join(String.fromCharCode(10)) + String.fromCharCode(10) + 'import "./missing.js"';
    const result = declaredSpecifiers(source);
    if (JSON.stringify(result) !== '["./missing.js"]') process.exit(2);`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(run.error, undefined, 'the bounded source must finish within five seconds');
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
