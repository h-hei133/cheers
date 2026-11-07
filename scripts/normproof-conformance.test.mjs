import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';
import { contract, extractPinned, repository, requireDigest, requireRuntime } from '../.normproof/adapter/artifact.mjs';
import { runShadow } from '../.normproof/adapter/shadow.mjs';

fs.mkdirSync(path.join(repository, '.tmp'), { recursive: true });
const scratch = fs.mkdtempSync(path.join(repository, '.tmp/adapter-conformance-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const identity = extractPinned(scratch);
const load = member => import(pathToFileURL(path.join(scratch, 'package/dist', member)).href);
const graph = await load('adapters/sidecar-file/module-graph.js');
const evaluator = await load('engine/proof/expression/evaluate.js');
const collector = await load('adapters/sidecar-file/evidence-collector.js');
const fixture = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/adapter/fixtures/graph.json')));

function workspace(name, source = 'export function value() { return 1; }') {
  const root = path.join(scratch, name);
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages/entry.ts'), source);
  for (const file of ['judge-input.json', 'evidence-manifest.json', 'norm-packs/software-structure-v0/profile.json']) {
    fs.copyFileSync(path.join(repository, '.normproof', file), path.join(root, '.normproof', file));
  }
  return root;
}

function command(args, options = {}) {
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 4194304, ...options });
  assert.equal(run.error, undefined);
  assert.equal(run.signal, null);
  return run;
}

test('artifact: actual archive still carries all six pinned hunks; stale bytes and runtime are refused', () => {
  console.log(JSON.stringify(identity));
  assert.equal(identity.hunks, 6);
  assert.equal(identity.parserVersion, '5.9.3');
  assert.throws(() => requireDigest(Buffer.from('changed'), contract.archiveSha256, 'archive'), /stale_artifact/);
  assert.throws(() => requireRuntime('v20.2.0'), /unsupported_runtime/);
  assert.throws(() => requireRuntime('unknown'), /unsupported_runtime/);
  requireRuntime('v20.3.0');
});

test('paths: explicit .js only TS/TSX; explicit .ts/.tsx only themselves; extensionless and self edges survive', () => {
  for (const item of fixture.paths) {
    const sources = new Map([['packages/entry.ts', `import '${item.specifier}';`], ...item.modules.map(file => ['packages/' + file, ''])]);
    const result = graph.buildModuleGraph(sources);
    assert.deepEqual(result.edges, item.target ? [{ from: 'packages/entry.ts', to: 'packages/' + item.target }] : [], item.name);
    assert.deepEqual(result.unresolved, item.target ? [] : [{ from: 'packages/entry.ts', specifier: item.specifier }], item.name);
  }
});

test('ast/comment: AST declarations, escapes, literal dynamics, TSX and whole-collection syntax refusal', () => {
  assert.deepEqual(graph.declaredSpecifiers(fixture.astSource), fixture.astTargets);
  assert.deepEqual(graph.declaredSpecifiers("import './view.js'; const view = <div/>;", 'view.tsx'), ['./view.js']);
  const result = graph.buildModuleGraph(new Map([['bad.ts', fixture.syntaxFailure], ['ok.ts', "import './ok.js';"]]));
  assert.match(result.failure, /collection is incomplete/);
  assert.equal(result.edges, undefined);
  const member = fs.readFileSync(path.join(scratch, 'package/dist/adapters/sidecar-file/module-graph.js'), 'utf8');
  assert.match(member, /literal dynamic imports are included/);
  assert.doesNotMatch(member, /path aliases, dynamic imports, missing/);
  // Legacy omissions are a documented capability gap, never a claim of runtime dependency coverage.
  assert.deepEqual(graph.declaredSpecifiers(fixture.legacyBlindSpots), []);
});

test('capacity: 16384 edges admitted by collector and evaluator, next edge oversized without partial evidence', async () => {
  const sources = new Map(Array.from({ length: 4096 }, (_, index) => [`packages/m${index}.ts`,
    [1, 2, 3, 4].map(offset => `import './m${(index + offset) % 4096}.js';`).join('\n')]));
  const exact = graph.buildModuleGraph(sources);
  assert.equal(exact.edges.length, contract.limits.graphEdges);
  assert.equal(evaluator.OBLIGATION_EXPRESSION_MAX_GRAPH_EDGES, contract.limits.graphEdges);
  assert.equal(evaluator.OBLIGATION_EXPRESSION_MAX_GRAPH_STEPS, contract.limits.reachabilitySteps);
  const listing = graph.formatModuleGraph(exact.edges, exact.unresolved);
  const context = { inputs: { evidences: { graph: { id: 'graph', present: true, path: 'packages/**', byteSize: Buffer.byteLength(listing), contentLoaded: false } } }, reader: async () => ({ content: listing }) };
  const accepted = await evaluator.evaluateObligationExpression({ kind: 'none', evidenceId: 'graph', matches: 'unresolved: */**' }, context);
  assert.equal(accepted.satisfied, true);
  sources.set('packages/m0.ts', sources.get('packages/m0.ts') + "\nimport './m5.js';");
  const overflow = graph.buildModuleGraph(sources);
  assert.match(overflow.failure, /^oversized:.*16384.*collection is incomplete/);
  assert.equal(overflow.edges, undefined);
  const refused = await evaluator.evaluateObligationExpression({ kind: 'none', evidenceId: 'graph', matches: 'unresolved: */**' },
    { inputs: { evidences: { graph: { ...context.inputs.evidences.graph, error: overflow.failure, present: false } } }, reader: async () => { assert.fail('failed evidence must not be read'); } });
  assert.equal(refused.satisfied, false);
  assert.match(refused.reason, /oversized:/);
  assert.equal(evaluator.evidenceFailureCause({ error: overflow.failure }), 'oversized');
  console.log(JSON.stringify({ ceiling: exact.edges.length, overflow, evaluator: refused }));
});

test('capacity: 4096 paths admitted, 4097 refused; 1 MiB enforced by shadow manifest and native verdict is not_proven', async () => {
  const root = workspace('paths');
  for (let index = 1; index < 4096; index++) fs.writeFileSync(path.join(root, `packages/m${index}.ts`), '');
  const manifest = { version: '0.1.0', workspace: root, maxFileBytes: 1048576, entries: [{ id: 'graph', source: { kind: 'module-graph', pattern: 'packages/**/*.ts*' } }] };
  const exact = await collector.collectEvidence(manifest, root);
  assert.equal(exact.evidences.graph.error, undefined);
  fs.writeFileSync(path.join(root, 'packages/extra.ts'), '');
  const oversized = await collector.collectEvidence(manifest, root);
  assert.match(oversized.evidences.graph.error, /^oversized:/);
  assert.equal(oversized.fileSetListings.graph, undefined);
  const large = workspace('large', ' '.repeat(1048577));
  const extract = path.join(scratch, 'large-extract'); fs.mkdirSync(extract);
  const result = runShadow(large, path.join(scratch, 'large-out'), extract);
  assert.equal(result.underlyingExitCode, 2);
  assert.equal(result.proofVerdict, 'not_proven');
  assert.equal(result.hostExitCode, 0);
  const ledger = JSON.parse(fs.readFileSync(path.join(repository, result.artifacts, 'ledger.json')));
  assert.match(JSON.stringify(ledger), /oversized:/);
  console.log(JSON.stringify({ paths: oversized.evidences.graph, sourceFileBytes: 1048577, shadow: { underlyingExitCode: result.underlyingExitCode, hostExitCode: result.hostExitCode, proofVerdict: result.proofVerdict } }));
});

test('report: native advisory cycle/name ceiling remain visible with partial verdict and exit 0', () => {
  const root = workspace('advisory', "import './entry.js';\n" + Array.from({ length: 21 }, (_, i) => `export function f${i}() { return ${i}; }`).join('\n'));
  const output = path.join(scratch, 'advisory-out');
  const run = command([path.join(scratch, 'package/dist/adapters/cli/normproof.js'), 'judge', path.join(root, '.normproof/judge-input.json'), output,
    '--evidence-manifest', path.join(root, '.normproof/evidence-manifest.json')], { cwd: root });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const verdict = JSON.parse(fs.readFileSync(path.join(output, 'verdict.json')));
  assert.equal(verdict.status, 'partial');
  const report = fs.readFileSync(path.join(output, 'report.md'), 'utf8');
  for (const id of ['source_graph_is_acyclic', 'declared_functions_within_module_ceiling']) {
    assert.equal(verdict.obligations.find(item => item.id === id).blocking, false);
    assert.equal(verdict.obligations.find(item => item.id === id).status, 'failed');
    assert.match(report.split('## Obligations')[1].split('## Evidence')[0], new RegExp(`${id}: failed`));
    assert.doesNotMatch(report.split('## Missing Or Failed Obligations')[1], new RegExp(id));
  }
  console.log(JSON.stringify({ exitCode: run.status, verdict: verdict.status, advisoryVisible: true, failedOnlySectionIncludesAdvisory: false }));
});

test('hooks: pinned write allow/block JSON; legacy Stop silence and block lack R0a envelope', () => {
  const clean = workspace('clean'), bad = workspace('bad', "import './missing.js';");
  fs.writeFileSync(path.join(clean, '.normproof/write-rules.json'), JSON.stringify({ version: '0.1.0', rules: [{ kind: 'pathBoundary', id: 'protected', deny: ['target.ts'], message: 'protected' }] }));
  for (const [file, expected] of [['allowed.ts', 'allow'], ['target.ts', 'block']]) {
    const run = command([path.join(repository, '.normproof/write-gate/cli.mjs'), '--emit-result'], { input: JSON.stringify({ cwd: clean, tool_name: 'Write', tool_input: { file_path: file, content: 'fixture' } }) });
    assert.equal(run.status, 0); assert.equal(JSON.parse(run.stdout).decision, expected);
  }
  const cli = path.join(scratch, 'package/dist/adapters/cli/normproof.js');
  for (const [root, expected] of [[clean, null], [bad, 'block']]) {
    const run = command([cli, 'gate', 'stop', '--emit-result'], { cwd: root, input: JSON.stringify({ cwd: root, hook_event_name: 'Stop', stop_hook_active: false }) });
    assert.equal(run.status, 0);
    if (expected === null) assert.equal(run.stdout, '');
    else { const wire = JSON.parse(run.stdout); assert.equal(wire.decision, expected); assert.equal(wire.contract, undefined); }
    console.log(JSON.stringify({ surface: 'pinned Stop', output: run.stdout.trim() || null, capability: 'unsupported R0a envelope' }));
  }
});

test('hooks: current host consumes captured R0a envelopes; fixture producer is not the pinned release', () => {
  const run = command([path.join(repository, 'node_modules/tsx/dist/cli.mjs'), path.join(repository, 'scripts/normproof/host.test.mts')]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /tests 2/);
  assert.match(run.stdout, /pass 2/);
  console.log(run.stdout);
});

test('MCP initialize: old pinned server returns explicit unsupported for known and unknown versions', () => {
  const server = path.join(scratch, 'package/dist/adapters/protocol/stdio-server.js');
  for (const protocolVersion of ['2025-11-25', '2026-07-28', 'unknown-version']) {
    const frame = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'adapter-conformance', version: '1.0.0' } } };
    const run = command([server], { input: JSON.stringify(frame) + '\n' });
    assert.equal(run.status, 0);
    const output = JSON.parse(run.stdout);
    assert.equal(output.error.code, -32601); assert.match(output.error.message, /initialize/);
    assert.equal(output.result, undefined);
    console.log(JSON.stringify({ protocolVersion, output, capability: 'unsupported' }));
  }
});

test('shadow: a real blocking failure remains failed while observation exits 0; blocking command is unavailable', () => {
  const root = workspace('shadow', "import './missing.js';");
  const run = command([path.join(repository, '.normproof/adapter/cli.mjs'), 'shadow', root, path.join(scratch, 'shadow-output')]);
  assert.equal(run.status, 0);
  const result = JSON.parse(run.stdout);
  assert.equal(result.mode, 'shadow'); assert.equal(result.canBlock, false);
  assert.equal(result.underlyingExitCode, 2); assert.equal(result.proofVerdict, 'failed');
  console.log(JSON.stringify({ mode: result.mode, canBlock: result.canBlock, underlyingExitCode: result.underlyingExitCode, hostExitCode: run.status, proofVerdict: result.proofVerdict }));
  const blocking = command([path.join(repository, '.normproof/adapter/cli.mjs'), 'blocking', root]);
  assert.equal(blocking.status, 1);
  assert.match(blocking.stderr, /blocking is unavailable/);
});
