import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { pinnedIdentity, boundStatus, fileHash, sha256 } from './identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = path.join(root, 'docs/architecture/hooks/evidence/capabilities');
const matrix = JSON.parse(fs.readFileSync(path.join(directory, 'matrix.json')));
const expected = pinnedIdentity(root); delete expected.sourceSnapshot.members;
for (const field of ['artifactMetadataDigest', 'bundleMetadataDigest', 'artifactProvenance']) {
  assert.deepEqual(matrix.identity[field], expected[field], `Pinned ${field} changed`);
}
const statuses = [];
const ids = new Set();
const upstreamCache = new Map();
const memberCache = new Map();
const records = new Map();
const details = new Map();
const required = ['hostVersion', 'event', 'tool', 'timeoutMs', 'timeoutUnit', 'inputFidelity', 'failureDirection', 'denyShape', 'reentry', 'canBlock'];
for (const row of matrix.rows) {
  assert.ok(!ids.has(row.id), `${row.id}: duplicate cell`); ids.add(row.id);
  for (const field of required) assert.ok(Object.hasOwn(row, field), `${row.id}: missing ${field}`);
  if (row.runtime) assert.ok(row.runtime.node.startsWith(row.id.startsWith('node20-') ? 'v20.' : 'v24.'), `${row.id}: runtime pair mismatch`);
  assert.ok(fs.existsSync(path.join(directory, row.evidence)), `${row.id}: evidence missing`);
  if (row.evidence.endsWith('.json') && row.evidence !== 'matrix.json') {
    if (!records.has(row.evidence)) records.set(row.evidence, JSON.parse(fs.readFileSync(path.join(directory, row.evidence))));
    const command = records.get(row.evidence);
    if (row.exitCode !== undefined) assert.equal(command.exitCode, row.exitCode, `${row.id}: exit evidence differs`);
    if (command.stdout !== undefined && row.output !== undefined && !row.evidenceDetail && row.evidenceTier !== 'remote-GitHub-Actions') {
      const actual = command.stdout.trim() ? command.stdout.trim().split('\n').map(line => JSON.parse(line)) : [null];
      assert.deepEqual(row.output, Array.isArray(row.output) ? actual : actual[0], `${row.id}: stdout evidence differs`);
    }
  }
  if (row.evidenceDetail) {
    if (!details.has(row.evidenceDetail)) details.set(row.evidenceDetail, JSON.parse(fs.readFileSync(path.join(directory, row.evidenceDetail))));
    const detail = details.get(row.evidenceDetail).find(item => row.id.endsWith(item.id));
    assert.ok(detail, `${row.id}: host detail missing`);
    assert.deepEqual(row.output, detail.output, `${row.id}: product output differs`);
    if (row.identity.configurationDigest) assert.equal(row.identity.configurationDigest, sha256(JSON.stringify(detail.declaredConfig)), `${row.id}: configuration digest differs`);
  }
  if (row.evidenceTier === 'remote-GitHub-Actions') {
    const file = JSON.parse(fs.readFileSync(path.join(directory, row.evidence)));
    const job = JSON.parse(file.stdout);
    assert.deepEqual(row.output, job, `${row.id}: remote output differs`);
    assert.equal(job.headSha, row.identity.sourceSnapshot.commit);
    const workflow = row.id === 'ci-watch' ? '.github/workflows/normproof-watch.yml' : '.github/workflows/ci.yml';
    assert.equal(sha256(execFileSync('git', ['show', `${job.headSha}:${workflow}`], { cwd: root })), row.identity.sourceSnapshot.workflowSha256);
    assert.equal(sha256(execFileSync('git', ['show', `${job.headSha}:.normproof/norm-packs/software-structure-v0/profile.json`], { cwd: root })), row.identity.profile.sha256);
    const archive = execFileSync('git', ['show', `${job.headSha}:.normproof/normproof-0.1.0.tgz`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    assert.equal(sha256(archive), row.identity.bundleDigest);
    assert.equal(sha256(execFileSync('tar', ['-xzO', row.identity.artifactMember], { input: archive })), row.identity.artifactSha256);
    statuses.push(row.status); continue;
  }
  const artifact = row.identity.artifactMember;
  const binding = { ...expected };
  if (row.identity.producerSnapshot) {
    assert.equal(row.identity.dependency.typescript, fileHash(path.join(root, 'node_modules/typescript/lib/typescript.js')), `${row.id}: producer dependency changed`);
    if (!upstreamCache.has('digest')) {
      const members = JSON.parse(fs.readFileSync(path.join(directory, 'upstream-members.json')));
      const actual = Object.fromEntries(Object.keys(members).map(file => [file, fileHash(path.join('/home/wang/projects/normproof', file))]));
      upstreamCache.set('digest', sha256(JSON.stringify(actual)));
    }
    binding.bundleDigest = upstreamCache.get('digest');
    binding.artifactSha256 = fileHash(path.join('/home/wang/projects/normproof', artifact ?? 'dist/adapters/cli/normproof.js'));
  } else if (row.identity.artifactKind === 'inline-shell') {
    binding.artifactSha256 = sha256(row.identity.artifactText);
  } else if (artifact) {
    if (!memberCache.has(artifact)) memberCache.set(artifact, sha256(execFileSync('tar', ['-xOzf', path.join(root, '.normproof/normproof-0.1.0.tgz'), artifact])));
    binding.artifactSha256 = memberCache.get(artifact);
  }
  const status = boundStatus(row, binding);
  if (status === 'stale' || status === 'unknown' && row.status !== 'unknown') throw new Error(`${row.id}: ${status} identity`);
  statuses.push(status);
}
for (const tag of ['node20', 'node24']) {
  const find = id => matrix.rows.find(row => row.id === `${tag}-${id}`);
  assert.equal(find('write-allow').output.decision, 'allow');
  assert.equal(find('write-block').output.decision, 'block');
  assert.equal(find('judge-compliant').exitCode, 0);
  assert.equal(find('judge-violating').exitCode, 2);
  assert.equal(find('mcp-current-2025-11-25').output.result.protocolVersion, '2025-11-25');
  assert.equal(find('mcp-current-2026-07-28').output.result.protocolVersion, '2026-07-28');
  assert.equal(find('mcp-current-unknown-version').output.error.code, -32602);
  assert.deepEqual(find('mcp-current-unknown-version').output.error.data.supportedProtocolVersions, ['2026-07-28', '2025-11-25']);
  for (const boundary of ['pinned', 'current']) {
    const replies = find(`mcp-${boundary}-direct`).output.filter(frame => frame.id === 2 || frame.id === 3);
    assert.deepEqual(replies.map(frame => JSON.parse(frame.result.content[0].text).decision), ['allow', 'deny']);
  }
  for (const host of ['normal', 'prepared', 'security', 'git']) assert.equal(find(`host-${host}-block`).canBlock, true);
  for (const host of ['normal', 'prepared', 'security']) {
    assert.equal(find(`host-${host}-block`).output.targetExists, false);
    assert.equal(find(`host-${host}-allow`).output.targetExists, true);
  }
  assert.equal(find('host-git-block').output.index, '');
  assert.equal(find('host-git-allow').output.index, 'git-target.txt\n');
  assert.equal(find('stop-parser-pinned-compliant').output.reasonCode, 'empty_output');
  assert.equal(find('stop-parser-r0a-compliant').output.decision, 'allow');
  assert.equal(find('stop-parser-r0a-compliant').output.proofVerdict, 'proven');
  assert.equal(find('stop-parser-r0a-violating').output.decision, 'block');
  for (const source of ['project', '.cheers', '.cheer', '.private-agents', '.coding-agents', 'named-profile', 'project-only']) {
    const configuration = find(`config-${source}`);
    assert.equal(configuration.loaded.hooks.length, 1, `${tag}: ${source} declaration`);
    assert.equal(configuration.canBlock, true, `${tag}: ${source} actual command veto`);
  }
  const version = find('stop-parser-version-mismatch');
  assert.equal(version.status, version.output.decision === 'allow' ? 'unknown' : 'observed');
  assert.equal(version.output.decision, 'unknown');
  assert.equal(version.output.reasonCode, 'incompatible_contract');
  for (const scenario of ['not-configured', 'reentry']) {
    const result = find(`stop-parser-r0a-${scenario}`).output;
    assert.equal(result.stopDisposition, 'completed_unproven');
    assert.equal(result.proofVerdict, 'not_reported');
  }
  const proven = find('completion-proven').output;
  assert.equal(proven.completed, 1); assert.equal(proven.failed, 0);
  const blocked = find('completion-blocked').output;
  assert.equal(blocked.completed, 0); assert.equal(blocked.completedUnproven, 1); assert.equal(blocked.failed, 0);
  assert.ok(blocked.finalSource.includes('missing.js'), 'R0a re-entry must not be reported as repaired/proven');
  assert.deepEqual(blocked.checks.map(check => check.result.reasonCode), ['actionable_gap', 'already_blocked_once']);
  assert.equal(blocked.checks.length, 2);
  assert.deepEqual(blocked.checks.map(check => [check.reentryCount, check.stop_hook_active]), [[0, false], [1, true]]);
  assert.equal(new Set(blocked.checks.map(check => check.attemptId)).size, 1);
  const repair = find('completion-repair').output;
  assert.equal(repair.completed, 0); assert.equal(repair.completedUnproven, 1); assert.equal(repair.failed, 0);
  assert.ok(!repair.finalSource.includes('missing.js')); assert.equal(repair.checks.length, 2);
  const notConfigured = find('completion-not-configured').output;
  assert.equal(notConfigured.completed, 0); assert.equal(notConfigured.completedUnproven, 1); assert.equal(notConfigured.failed, 0);
  const repeated = find('completion-repeated-block').output;
  assert.equal(repeated.completed, 0); assert.equal(repeated.completedUnproven, 0); assert.equal(repeated.failed, 1);
  assert.equal(repeated.checks.length, 2);
  assert.equal(repeated.states.at(-1).reasonCode, 'repeated_block');
}
console.log(JSON.stringify({ rows: statuses.length, identity: 'matched', requirements: 'runtime, host block, MCP positive/negative, Stop actual parser', unavailable: matrix.rows.filter(row => row.status === 'unavailable').length }));
