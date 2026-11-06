import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pinnedIdentity, fileHash, treeIdentity, boundStatus, sha256 } from './identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.resolve(root, process.argv[2] ?? 'docs/architecture/hooks/evidence/capabilities');
if (!output.startsWith(root + path.sep)) throw new Error('Evidence output must remain in Cheers.');
fs.mkdirSync(path.join(root, '.tmp/capabilities'), { recursive: true });
const scratch = fs.mkdtempSync(path.join(root, '.tmp/capabilities/run-'));
fs.mkdirSync(output, { recursive: true });
const identity = pinnedIdentity(root);
const sourceMembers = identity.sourceSnapshot.members;
delete identity.sourceSnapshot.members;
const rows = [];
const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: path.join(scratch, 'home'), USERPROFILE: path.join(scratch, 'home'),
  TMPDIR: path.join(scratch, 'temp'), CHEERS_TEST_ROOT: path.join(scratch, 'data'), GIT_CEILING_DIRECTORIES: scratch, CAPABILITY_SCRATCH: scratch };
for (const dir of ['home', 'temp', 'data']) fs.mkdirSync(path.join(scratch, dir));
const normalize = value => value.replaceAll(scratch, '<scratch>').replaceAll(root, '<cheers>');

function command(id, executable, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024, ...options });
  const record = { command: [executable, ...args], cwd: options.cwd ?? root, stdin: options.input ?? null, exitCode: result.status,
    signal: result.signal, elapsedMs: Date.now() - started, error: result.error?.code ?? null, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  fs.writeFileSync(path.join(output, `${id}.json`), normalize(JSON.stringify(record, null, 2)) + '\n');
  return record;
}

function add(id, details, binding = identity) {
  const row = { id, identity: binding, ...details };
  row.status = boundStatus(row, binding);
  rows.push(row);
}

function fixture(name, broken) {
  const workspace = path.join(scratch, name);
  const files = {
    '.normproof/judge-input.json': fs.readFileSync(path.join(root, '.normproof/judge-input.json'), 'utf8'),
    '.normproof/norm-packs/software-structure-v0/profile.json': fs.readFileSync(path.join(root, '.normproof/norm-packs/software-structure-v0/profile.json'), 'utf8'),
    '.normproof/evidence-manifest.json': JSON.stringify({ version: '0.1.0', workspace: '..', entries: [
      { id: 'source_module_graph', source: { kind: 'module-graph', pattern: 'src/**/*.ts' } },
      { id: 'source_module_functions', source: { kind: 'module-functions', pattern: 'src/**/*.ts' } },
    ] }, null, 2),
    '.normproof/write-rules.json': JSON.stringify({ version: '0.1.0', rules: [{ kind: 'pathBoundary', id: 'protected', deny: ['target.txt'], message: 'Choose an allowed file.' }] }),
    'src/module.ts': broken ? 'import { missing } from "./missing.js";\nexport function run() { return missing; }\n' : 'export function run() { return 1; }\n',
  };
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), contents);
    const saved = path.join(output, 'fixtures', name, file.endsWith('.ts') ? `${file}.txt` : file);
    fs.mkdirSync(path.dirname(saved), { recursive: true }); fs.writeFileSync(saved, contents);
  }
  return { workspace, sha256: treeIdentity(workspace, Object.keys(files)).sha256 };
}

function filesUnder(directory, prefix = '') {
  return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? filesUnder(directory, relative) : [relative];
  });
}

try {
  const archive = path.join(scratch, 'pinned'); fs.mkdirSync(archive);
  const extracted = command('extract-pinned', 'tar', ['-xzf', path.join(root, '.normproof/normproof-0.1.0.tgz'), '-C', archive]);
  if (extracted.exitCode !== 0) throw new Error('Cannot extract the pinned bundle.');
  const pinnedCli = path.join(archive, 'package/dist/adapters/cli/normproof.js');
  const upstreamRoot = '/home/wang/projects/normproof';
  const upstream = path.join(scratch, 'r0a'); fs.mkdirSync(upstream);
  for (const entry of ['dist', 'norm-packs', 'package.json']) fs.cpSync(path.join(upstreamRoot, entry), path.join(upstream, entry), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(upstream, 'node_modules'));
  const upstreamSource = command('upstream-source', 'git', ['-C', upstreamRoot, 'rev-parse', 'HEAD']);
  const upstreamStatus = command('upstream-status', 'git', ['-C', upstreamRoot, 'status', '--porcelain']);
  const upstreamFiles = filesUnder(upstream).filter(file => !file.startsWith('node_modules'));
  const upstreamTree = treeIdentity(upstream, upstreamFiles);
  const upstreamIdentity = { ...identity, producerSnapshot: upstreamSource.stdout.trim(), producerWorktree: upstreamStatus.stdout.trim() || 'clean',
    bundleDigest: upstreamTree.sha256, artifactSha256: fileHash(path.join(upstream, 'dist/adapters/cli/normproof.js')),
    distribution: 'copied read-only current dist; independently hashed, not the Cheers pinned release',
    dependency: { typescript: fileHash(path.join(root, 'node_modules/typescript/lib/typescript.js')) } };
  delete upstreamIdentity.artifactProvenance;
  delete upstreamIdentity.artifactMetadataDigest;
  delete upstreamIdentity.bundleMetadataDigest;
  fs.writeFileSync(path.join(output, 'upstream-members.json'), JSON.stringify(upstreamTree.members, null, 2) + '\n');
  const upstreamCli = path.join(upstream, 'dist/adapters/cli/normproof.js');
  const compliant = fixture('compliant', false), violating = fixture('violating', true);
  const empty = path.join(scratch, 'not-configured'); fs.mkdirSync(empty);
  const runtimes = [path.join(root, '.omx/cache/node-floor/node-v20.3.0-linux-x64/bin/node'), process.execPath];
  const stopCases = [];
  for (const boundary of ['pinned', 'r0a']) for (const [name, state, active] of [['compliant', compliant.workspace, false], ['violating', violating.workspace, false], ['not-configured', empty, false], ['reentry', violating.workspace, true]]) {
    stopCases.push({ id: `${boundary}-${name}`, cli: boundary === 'pinned' ? pinnedCli : upstreamCli, workspace: state, active, boundary });
  }
  fs.writeFileSync(path.join(scratch, 'stop-cases.json'), JSON.stringify(stopCases));
  for (const executable of runtimes) {
    const version = command(`runtime-${path.basename(path.dirname(path.dirname(executable)))}`, executable, ['--version']);
    if (version.exitCode !== 0) { add(`runtime-${executable}`, { status: 'unavailable', reason: version.error, commandEvidence: 'runtime version' }); continue; }
    const node = version.stdout.trim(), tag = node.startsWith('v20.') ? 'node20' : 'node24';
    const runtime = { node, platform: process.platform, arch: process.arch, executableSha256: fileHash(executable) };
    for (const proposed of ['allowed.txt', 'target.txt']) {
      const id = `${tag}-write-${proposed === 'target.txt' ? 'block' : 'allow'}`;
      const record = command(id, executable, [path.join(root, '.normproof/write-gate/cli.mjs'), '--emit-result'], { input: JSON.stringify({ cwd: compliant.workspace, tool_name: 'Write', tool_input: { file_path: proposed, content: 'fixture\n' } }) });
      add(id, { status: record.exitCode === 0 ? 'observed' : 'unsupported', runtime, surface: 'pre-action pinned artifact', event: 'PreToolUse', tool: 'Write', timeoutMs: 180000,
        inputFidelity: 'canonical path + full content', failureDirection: 'wire decision; exit 0 does not mean allow', denyShape: 'explicit write envelope', reentry: false,
        canBlock: 'requires Cheers consumer, observed in host cells', fixtureDigest: compliant.sha256, output: JSON.parse(record.stdout || 'null'), evidence: `${id}.json` });
    }
    for (const [name, item] of [['compliant', compliant], ['violating', violating]]) {
      const id = `${tag}-judge-${name}`, directory = path.join(scratch, id);
      const record = command(id, executable, [pinnedCli, 'judge', path.join(item.workspace, '.normproof/judge-input.json'), directory, '--evidence-manifest', path.join(item.workspace, '.normproof/evidence-manifest.json')], { cwd: item.workspace });
      const verdictFile = path.join(directory, 'verdict.json');
      const verdict = fs.existsSync(verdictFile) ? JSON.parse(fs.readFileSync(verdictFile, 'utf8')) : null;
      if (fs.existsSync(directory)) fs.cpSync(directory, path.join(output, id), { recursive: true });
      add(id, { status: record.error ? 'unsupported' : 'observed', runtime, surface: 'pinned judge bundle', event: 'judge', tool: null, timeoutMs: 180000,
        inputFidelity: 'frozen source graph, profile and manifest', failureDirection: 'nonzero for blocking obligation', denyShape: 'exit code + verdict file', reentry: false, canBlock: record.exitCode !== 0,
        declaredEngine: '>=24', executionClassification: record.error ? 'crash-or-timeout' : 'executed-without-engine-check', exitCode: record.exitCode, verdict, fixtureDigest: item.sha256, evidence: `${id}.json` }, { ...identity, artifactSha256: fileHash(pinnedCli), artifactMember: 'package/dist/adapters/cli/normproof.js' });
    }
    const repoJudgeId = `${tag}-judge-repository`;
    const repoJudgeOutput = path.join(scratch, repoJudgeId);
    const repoJudge = command(repoJudgeId, executable, [pinnedCli, 'judge', path.join(root, '.normproof/judge-input.json'), repoJudgeOutput, '--evidence-manifest', path.join(root, '.normproof/evidence-manifest.json')]);
    const repoVerdict = path.join(repoJudgeOutput, 'verdict.json');
    add(repoJudgeId, { status: repoJudge.error ? 'unsupported' : 'observed', runtime, surface: 'pinned judge / actual Cheers source', event: 'judge', tool: null, timeoutMs: 180000,
      inputFidelity: 'actual source/profile/evidence manifest', failureDirection: 'exit status from actual bundle', denyShape: 'exit + verdict', reentry: false, canBlock: repoJudge.exitCode !== 0,
      exitCode: repoJudge.exitCode, verdict: fs.existsSync(repoVerdict) ? JSON.parse(fs.readFileSync(repoVerdict, 'utf8')) : null, evidence: `${repoJudgeId}.json` }, { ...identity, artifactSha256: fileHash(pinnedCli), artifactMember: 'package/dist/adapters/cli/normproof.js' });
    if (fs.existsSync(repoJudgeOutput)) fs.cpSync(repoJudgeOutput, path.join(output, repoJudgeId), { recursive: true });
    for (const item of stopCases) {
      const id = `${tag}-stop-${item.id}`;
      const record = command(id, executable, [item.cli, 'gate', 'stop', '--emit-result'], { cwd: item.workspace, input: JSON.stringify({ cwd: item.workspace, hook_event_name: 'Stop', stop_hook_active: item.active }) });
      add(id, { status: record.error ? 'unsupported' : 'observed', runtime, surface: `${item.boundary} Stop producer`, event: 'Stop', tool: null, timeoutMs: 180000,
        inputFidelity: 'explicit cwd and boolean stop_hook_active', failureDirection: record.stdout.trim() ? 'wire decision consumed separately' : 'legacy silent result; host unknown', denyShape: item.boundary === 'pinned' ? 'legacy block-only' : 'R0a versioned envelope', reentry: 'host flag only', canBlock: 'host parser cell required',
        output: record.stdout.trim() ? JSON.parse(record.stdout) : null, exitCode: record.exitCode, evidence: `${id}.json` }, item.boundary === 'pinned' ? { ...identity, artifactSha256: fileHash(pinnedCli), artifactMember: 'package/dist/adapters/cli/normproof.js' } : upstreamIdentity);
    }
    for (const [boundary, server] of [['pinned', path.join(archive, 'package/dist/adapters/protocol/stdio-server.js')], ['current', path.join(upstream, 'dist/adapters/protocol/stdio-server.js')]]) {
      for (const requested of ['2025-11-25', '2026-07-28', 'unknown-version']) {
        const id = `${tag}-mcp-${boundary}-${requested}`;
        const request = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: requested, capabilities: {}, clientInfo: { name: 'cheers-capability-probe', version: '1' } } };
        const record = command(id, executable, [server], { input: JSON.stringify(request) + '\n' });
        const result = JSON.parse(record.stdout || 'null');
        add(id, { status: result?.error?.code === -32601 ? 'unsupported' : 'observed', runtime, surface: 'MCP initialize', event: 'initialize', tool: null, timeoutMs: 180000,
          inputFidelity: 'literal JSON-RPC initialize frame', failureDirection: 'protocol error separate from runtime failure', denyShape: 'JSON-RPC error', reentry: false, canBlock: false, requestedVersion: requested, output: result, evidence: `${id}.json` }, boundary === 'pinned' ? { ...identity, artifactSha256: fileHash(server), artifactMember: 'package/dist/adapters/protocol/stdio-server.js' } : { ...upstreamIdentity, artifactSha256: fileHash(server), artifactMember: 'dist/adapters/protocol/stdio-server.js' });
      }
      const id = `${tag}-mcp-${boundary}-direct`;
      const mcpRules = { version: '0.1.0', rules: [{ kind: 'pathBoundary', id: 'protected', deny: ['target.ts'], message: 'Choose an allowed source file.' }] };
      const frames = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'local-script', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        ...['allowed.ts', 'target.ts'].map((target, index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name: 'check_file_write', arguments: { workspaceRoot: compliant.workspace, path: target, content: 'export const fixture = 1;\n', rules: mcpRules } } })),
      ];
      const record = command(id, executable, [server], { input: frames.map(frame => JSON.stringify(frame)).join('\n') + '\n' });
      add(id, { status: 'observed', runtime, surface: 'MCP explicit scripted call', invocation: 'script-forced protocol probe; no product host forcing', event: 'tools/call', tool: 'check_file_write', timeoutMs: 180000,
        inputFidelity: 'full TypeScript proposed content + explicit rules', failureDirection: 'response is advisory until a host consumes it', denyShape: 'MCP text decision allow/deny', reentry: false, canBlock: false, output: record.stdout.trim().split('\n').map(line => JSON.parse(line)), evidence: `${id}.json` }, boundary === 'pinned' ? { ...identity, artifactSha256: fileHash(server), artifactMember: 'package/dist/adapters/protocol/stdio-server.js', writeRulesDigest: sha256(JSON.stringify(mcpRules)) } : { ...upstreamIdentity, artifactSha256: fileHash(server), artifactMember: 'dist/adapters/protocol/stdio-server.js', writeRulesDigest: sha256(JSON.stringify(mcpRules)) });
    }
    const id = `${tag}-host`;
    // Each runtime observes a new workspace/index/profile, never the previous runtime's effects.
    for (const consumer of ['normal', 'prepared', 'security', 'git']) for (const mode of ['block', 'allow']) fs.rmSync(path.join(scratch, `${consumer}-${mode}`), { recursive: true, force: true });
    fs.rmSync(path.join(scratch, 'config'), { recursive: true, force: true });
    for (const scenario of ['proven', 'blocked', 'repair', 'not-configured', 'repeated-block']) fs.rmSync(path.join(scratch, `completion-${scenario}`), { recursive: true, force: true });
    const record = command(id, executable, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'scripts/hooks/capabilities/host.mts')]);
    if (fs.existsSync(path.join(scratch, 'host.json'))) {
      const hostRows = JSON.parse(fs.readFileSync(path.join(scratch, 'host.json'), 'utf8'));
      for (const row of hostRows) {
        const rules = row.rules ?? JSON.parse(fs.readFileSync(path.join(compliant.workspace, '.normproof/write-rules.json'), 'utf8'));
        const binding = { ...(row.boundary === 'r0a' ? upstreamIdentity : row.boundary === 'pinned' ? { ...identity, artifactSha256: fileHash(pinnedCli), artifactMember: 'package/dist/adapters/cli/normproof.js' } : identity),
          ...(row.command && !row.boundary ? { artifactSha256: sha256(row.command), artifactKind: 'inline-shell', artifactText: row.command } : {}), hostProfile: row.profile ?? 'isolated-default',
          ...(row.command ? { commandDigest: sha256(row.command) } : {}),
          writeRulesDigest: sha256(JSON.stringify(rules)), ...(row.declaredConfig ? { configurationDigest: sha256(normalize(JSON.stringify(row.declaredConfig))), configurationEncoding: 'canonical JSON with documented path placeholders' } : {}) };
        add(`${tag}-${row.id}`, { ...row, id: `${tag}-${row.id}`, runtime, hostVersion: '0.1.0', timeoutScope: 'handler budget', evidence: `${id}.json`, evidenceDetail: `${tag}-host-details.json` }, binding);
      }
      for (const event of ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied', 'PreModelSwitch', 'PostModelSwitch', 'PreCompact', 'PostCompact', 'SubagentStart', 'SubagentStop', 'WorktreeCreate', 'WorktreeRemove', 'Stop', 'StopFailure']) {
        const observations = hostRows.flatMap(row => (row.output?.observed ?? []).filter(item => item.payload?.eventName === event));
        add(`${tag}-event-${event}`, { status: observations.length ? 'observed' : 'unavailable', runtime, surface: 'Cheers event inventory', event, tool: null,
          timeoutMs: event === 'Stop' || event === 'SessionEnd' || event === 'StopFailure' ? 3000 : 15000,
          inputFidelity: observations.length ? 'literal payload in host-details' : 'unavailable', failureDirection: 'only observed dispatch result; no untested consumer claim',
          denyShape: 'unavailable for event-specific veto beyond PreToolUse/Stop cells', reentry: event === 'Stop' ? 'C2 at most one; no configured Stop in normal host fixture' : false,
          canBlock: 'see dedicated consumer cells; no promotion from dispatch alone', reason: observations.length ? 'Actual product dispatch, declarations may be absent for this event' : 'No dynamic dispatch for this event in this run; historical source-only row is not platform evidence', observations, evidence: `${tag}-host-details.json` });
      }
      for (const consumer of ['prepared', 'security', 'git']) {
        const operations = hostRows.filter(row => row.id.startsWith(`host-${consumer}-`));
        const stopDispatches = operations.flatMap(row => (row.output?.observed ?? []).filter(item => item.payload?.eventName === 'Stop'));
        add(`${tag}-${consumer}-postaction-stop`, { status: 'unsupported', runtime, surface: `${consumer} direct operation / Stop`, event: 'Stop', tool: consumer === 'git' ? 'bash' : 'write', timeoutMs: null,
          inputFidelity: 'no Stop payload dispatched', failureDirection: 'no standalone post-action Stop enforcement', denyShape: 'unavailable', reentry: false, canBlock: false,
          output: { observedOperations: operations.length, stopDispatches: stopDispatches.length }, evidence: `${tag}-host-details.json` });
      }
      for (const tool of ['edit', 'apply_patch', 'MCP tool via Cheers gate', 'browser', 'desktop', 'unknown tool']) {
        add(`${tag}-tool-${tool}`, { status: 'unavailable', runtime, surface: 'tool family inventory', event: 'PreToolUse', tool, timeoutMs: 15000,
          inputFidelity: 'unavailable; no product call on this surface', failureDirection: 'unavailable', denyShape: 'unavailable', reentry: false, canBlock: 'unavailable',
          reason: 'No actual product tool invocation for this family in this run. Historical source/translation evidence does not prove platform effects.', evidence: `${tag}-host-details.json` });
      }
      fs.writeFileSync(path.join(output, `${tag}-host-details.json`), normalize(JSON.stringify(hostRows, null, 2)) + '\n');
      fs.rmSync(path.join(scratch, 'host.json'));
    }
    if (record.exitCode !== 0) add(`${tag}-host-runner`, { status: 'unavailable', runtime, reason: 'Host runner exited before all cells; inspect actual stderr', evidence: `${id}.json` });
  }
  for (const surface of ['macOS/Node20', 'macOS/Node24', 'Windows/Node20', 'Windows/Node24', 'Claude Code real host', 'Codex real host', 'pi real host', 'native security scanner end-to-end', 'MCP voluntary model invocation', 'MCP Cheers host-forced judgement', 'remote CI nonzero judge propagation / J0 O5']) {
    const binding = surface.includes('MCP') ? { ...upstreamIdentity, artifactSha256: fileHash(path.join(upstream, 'dist/adapters/protocol/stdio-server.js')), artifactMember: 'dist/adapters/protocol/stdio-server.js' }
      : surface.includes('CI') ? { ...identity, artifactSha256: fileHash(pinnedCli), artifactMember: 'package/dist/adapters/cli/normproof.js' } : identity;
    add(`unavailable-${surface}`, { status: 'unavailable', surface, reason: surface.includes('CI') ? 'No observed remote judge-nonzero job; recent failing job stopped in tests. Local nonzero is not CI evidence.' : surface.includes('MCP') ? 'Only explicit protocol calls executed; no live model trajectory or product forced judgement boundary.' : 'No execution on this platform/host in this run.', evidence: 'matrix.json', timeoutMs: null, event: null, tool: null, inputFidelity: 'unavailable', failureDirection: 'unavailable', denyShape: 'unavailable', reentry: 'unavailable', canBlock: 'unavailable' }, binding);
  }
  const after = pinnedIdentity(root);
  delete after.sourceSnapshot.members;
  const sourceChanged = JSON.stringify(after) !== JSON.stringify(identity);
  if (sourceChanged) for (const row of rows) { row.recordedStatus = row.status; row.status = 'stale'; }
  // Compare against the read-only producer again; comparing the private copy alone misses upstream drift.
  const upstreamChanged = upstreamFiles.some(file => fileHash(path.join(upstreamRoot, file)) !== upstreamTree.members[file]);
  if (upstreamChanged) for (const row of rows.filter(row => row.identity.producerSnapshot)) { row.recordedStatus = row.status; row.status = 'stale'; }
  fs.writeFileSync(path.join(output, 'source-members.json'), JSON.stringify(sourceMembers, null, 2) + '\n');
  for (const row of rows) {
    row.hostVersion ??= '0.1.0';
    row.event ??= null;
    row.tool ??= null;
    row.timeoutMs ??= null;
    row.inputFidelity ??= 'see literal input in evidence; no additional fidelity claim';
    row.failureDirection ??= 'unknown; see actual result';
    row.denyShape ??= 'unknown';
    row.reentry ??= 'unknown';
    row.canBlock ??= 'unknown';
    row.timeoutUnit = 'milliseconds';
    row.timeoutScope ??= row.evidenceTier?.includes('command') || row.id.includes('host-') || row.id.includes('event-') || row.id.includes('config-') ? 'handler budget' : 'probe process observation deadline; not a host contract';
  }
  fs.writeFileSync(path.join(output, 'matrix.json'), normalize(JSON.stringify({ version: 1, recordedAt: new Date().toISOString(), host: { version: '0.1.0', platform: process.platform, arch: process.arch }, identity, upstreamIdentity,
    ...(sourceChanged ? { currentSourceStatus: 'source changed during collection; all local cells stale' } : {}),
    identityPolicy: 'Each cell is bound to its own producer bytes. Reuse with any source/profile/bundle/artifact mismatch is stale; absent identity is unknown. An observed result is not pass/proven.', fixtures: { compliant: compliant.sha256, violating: violating.sha256 }, rows }, null, 2)) + '\n');
  console.log(JSON.stringify({ rows: rows.length, statuses: rows.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] ?? 0) + 1 }), {}), evidence: path.relative(root, output) }));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
