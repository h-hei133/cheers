import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { extractPinned, readBundleMetadata } from '../.normproof/adapter/artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = path.join(root, '.tmp');
fs.mkdirSync(temporaryRoot, { recursive: true });
const fixture = fs.mkdtempSync(path.join(temporaryRoot, 'normproof-test-'));
after(() => fs.rmSync(fixture, { recursive: true, force: true }));
const identity = extractPinned(fixture);
const bundle = path.join(fixture, 'package');
const graph = await import(pathToFileURL(path.join(bundle, 'dist/adapters/sidecar-file/module-graph.js')).href);
const { evaluateObligationExpression } = await import(pathToFileURL(path.join(bundle, 'dist/engine/proof/expression/evaluate.js')).href);
const { collectEvidence } = await import(pathToFileURL(path.join(bundle, 'dist/adapters/sidecar-file/evidence-collector.js')).href);
const { GRAPH_SAFETY } = await import(pathToFileURL(path.join(bundle, 'dist/contracts/sidecar/graph-budget.js')).href);
const metadata = readBundleMetadata();
const nativeRuntime = { skip: Number(process.versions.node.split('.')[0]) < 24 && 'The native package requires Node 24' };

function wideGraph(count = 4096) {
  return new Map(Array.from({ length: count }, (_, index) => [`packages/m${index}.ts`,
    [1, 2, 3, 4].map(offset => `import './m${(index + offset) % count}.js';`).join('\n')]));
}

function writeJudgeConfig(workspace) {
  fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ workspaces: [] }));
  for (const file of ['judge-input.json', 'evidence-manifest.json', 'norm-packs/software-structure-v0/profile.json']) {
    fs.copyFileSync(path.join(root, '.normproof', file), path.join(workspace, '.normproof', file));
  }
  fs.writeFileSync(path.join(workspace, '.normproof/baseline.json'), JSON.stringify({
    version: 2, values: {}, moduleFunctionSeed: 20, moduleFunctionCeilings: {}
  }));
}

test('the installed archive, source commit and required members match the upstream pin', () => {
  assert.equal(metadata.version, 2);
  assert.equal(identity.archiveSha256, metadata.archiveSha256);
  assert.equal(identity.sourceCommit, metadata.baseCommit);
  assert.deepEqual(identity.members, metadata.members);
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

test('the declared capacity is accepted exactly and one additional edge fails without partial evidence', async () => {
  const workspace = path.join(fixture, 'capacity');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  const sources = wideGraph(8);
  for (const [file, source] of sources) fs.writeFileSync(path.join(workspace, file), source);
  const manifest = { version: '0.1.0', workspace, entries: [{ id: 'graph', source: {
    kind: 'module-graph', pattern: 'packages/**/*.ts', resources: {
      version: '1', sourceSnapshot: 'sha256:' + '0'.repeat(64),
      accepted: { ...GRAPH_SAFETY, resolvedEdges: 30 }, growth: { resolvedEdges: 2 }
    }
  } }] };
  const exact = await collectEvidence(manifest, workspace);
  assert.equal(exact.moduleEdges.graph.length, 32);
  fs.appendFileSync(path.join(workspace, 'packages/m0.ts'), "\nimport './m5.js';");
  const overflow = await collectEvidence(manifest, workspace);
  assert.match(overflow.evidences.graph.error, /^oversized:.*resolvedEdges.*32/);
  assert.equal(overflow.fileSetListings.graph, undefined);
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

test('the streaming collector admits the complete repository graph with typed edges', async () => {
  const manifestDir = path.join(root, '.normproof');
  const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, 'evidence-manifest.json'), 'utf8'));
  const entry = manifest.entries.find(item => item.source.kind === 'module-graph');
  assert.ok(entry);
  const collected = await collectEvidence({ ...manifest, entries: [entry] }, manifestDir);
  assert.equal(collected.evidences[entry.id].error, undefined);
  const edges = collected.moduleEdges[entry.id];
  assert.ok(edges.length > 16_384, 'the repository exceeds the previous deployed ceiling');
  assert.ok(edges.some(edge => edge.kind === 'type-only'));
  assert.ok(edges.some(edge => edge.kind === 'value'));
  const listing = collected.fileSetListings[entry.id];
  const result = await evaluateObligationExpression({ kind: 'none', evidenceId: entry.id, matches: 'unresolved: */**' },
    { inputs: { evidences: collected.evidences }, graphBudgets: collected.graphBudgets, reader: async () => ({ content: listing }) });
  assert.equal(result.satisfied, true, result.reason);
});

test('the unchanged blocking obligation rejects a native CLI workspace with a missing TSX import', nativeRuntime, () => {
  const workspace = path.join(fixture, 'workspace');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'packages/view.tsx'), "import './missing.js';\n");
  writeJudgeConfig(workspace);
  const run = spawnSync(process.execPath, [path.join(bundle, 'dist/adapters/cli/normproof.js'), 'judge'],
    { cwd: workspace, encoding: 'utf8', env: { ...process.env, CHEERS_REAL_HOME: '' } });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  const ledger = JSON.parse(fs.readFileSync(path.join(workspace, '.normproof/out/ledger.json'), 'utf8'));
  assert.match(JSON.stringify(ledger), /packages\/view\.tsx/);
  assert.match(JSON.stringify(ledger), /missing\.js/);
  assert.match(JSON.stringify(ledger), /source_graph_has_no_unresolved_specifiers/);
});

test('ASI declarations cannot hide a missing side-effect import from the native blocking obligation', nativeRuntime, () => {
  const workspace = path.join(fixture, 'asi');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  const source = `export const padding = "${'x'.repeat(600)}"\nimport './missing.js'\nimport { value } from './ok.js'\n`;
  assert.equal(ts.createSourceFile('entry.ts', source, ts.ScriptTarget.Latest).parseDiagnostics.length, 0);
  fs.writeFileSync(path.join(workspace, 'packages/entry.ts'), source);
  fs.writeFileSync(path.join(workspace, 'packages/ok.ts'), 'export const value = 1');
  writeJudgeConfig(workspace);
  const run = spawnSync(process.execPath, [path.join(bundle, 'dist/adapters/cli/normproof.js'), 'judge'],
    { cwd: workspace, encoding: 'utf8', env: { ...process.env, CHEERS_REAL_HOME: '' } });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  const ledger = JSON.parse(fs.readFileSync(path.join(workspace, '.normproof/out/ledger.json'), 'utf8'));
  const obligation = ledger.obligations.find(entry => entry.id === 'source_graph_has_no_unresolved_specifiers');
  assert.equal(obligation.status, 'failed');
  assert.match(JSON.stringify(obligation), /missing\.js/);
});

test('a native self import remains a cycle under the unchanged advisory obligation', nativeRuntime, () => {
  const source = "import './entry.js';\nexport function value() { return 1; }\n";
  const collected = graph.buildModuleGraph(new Map([['packages/entry.ts', source]]));
  assert.deepEqual(collected.edges, [{ from: 'packages/entry.ts', to: 'packages/entry.ts', kind: 'value' }]);
  assert.deepEqual(collected.unresolved, []);
  const workspace = path.join(fixture, 'self');
  fs.mkdirSync(path.join(workspace, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'packages/entry.ts'), source);
  writeJudgeConfig(workspace);
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
  assert.match(result.failure, /^invalid:.*parser diagnostics/);
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
