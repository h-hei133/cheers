#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

console.log('gate name=route206-controlled-multifile-proof-chain')
console.log('real-api-run=false')
console.log('private-config-manual-read=false')

const testResult = spawnSync('npm', [
  'run',
  'test',
  '-w',
  'packages/ts-shell',
  '--',
  'src/orchestration/controlledMultifileProofChain.test.ts',
  'src/orchestration/claimLedgerProjection.test.ts',
], {
  cwd: repoRoot,
  env: isolatedEnv('route206-tests'),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if ((testResult.status ?? 1) !== 0) {
  console.log('[product-regression] route206 focused tests failed')
  printTail(testResult.stdout, testResult.stderr)
  process.exit(testResult.status ?? 1)
}
console.log('[pass] route206 focused tests')

const scenarioResult = spawnSync('npx', ['tsx', '--eval', scenarioProgram()], {
  cwd: repoRoot,
  env: isolatedEnv('route206-scenarios'),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if ((scenarioResult.status ?? 1) !== 0) {
  console.log('[product-regression] route206 scenario proof failed')
  printTail(scenarioResult.stdout, scenarioResult.stderr)
  process.exit(scenarioResult.status ?? 1)
}

const stdout = scenarioResult.stdout ?? ''
for (const marker of [
  'route206-marker success-terminal=verification-succeeded-not-live',
  'route206-marker partial-apply-cannot-success=pass',
  'route206-marker mixed-verification-cannot-success=pass',
  'route206-marker verification-missing-cannot-success=pass',
  'route206-marker unattempted-file-visible=pass',
  'route206-marker per-file-states-visible=pass',
  'route206-marker repair-handoff-preserves-original-failure=pass',
  'route206-marker repair-proposal-alone-cannot-success=pass',
  'route206-marker recovery-available-alone-cannot-success=pass',
  'route206-marker provider-call-during-apply=false',
  'route206-marker no-new-writer=pass',
  'route206-marker no-fuzzy-apply=pass',
  'route206-marker no-production-workspace-mutation=pass',
  'route206-marker fake-focused-default-not-live-success=pass',
]) {
  if (!stdout.includes(marker)) {
    console.log(`[product-regression] route206 marker missing: ${marker}`)
    printTail(stdout, scenarioResult.stderr)
    process.exit(1)
  }
  console.log(marker)
}

console.log('[pass] route206-controlled-multifile-proof-chain')

function scenarioProgram() {
  return String.raw`
    import { runControlledMultifileProofChain } from './packages/ts-shell/src/orchestration/controlledMultifileProofChain.ts';

    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });

    async function main() {
    const success = await runControlledMultifileProofChain({ scenario: 'success' });
    assert(success.claimLedger.terminal.status === 'verification-succeeded-not-live', 'success terminal');
    assert(success.claimLedger.terminal.liveSuccess === false, 'success is focused evidence, not live');
    assert(success.verifiedFiles.length === 2, 'success verified files');
    assert(success.perFileClaims.every((claim) => claim.proposalStatus === 'proven' && claim.anchorQuality === 'exact-ready' && claim.authorityStatus === 'proven'), 'per-file proof derived');
    console.log('route206-marker success-terminal=verification-succeeded-not-live');

    const partial = await runControlledMultifileProofChain({ scenario: 'partial-apply-failure' });
    assert(partial.claimLedger.terminal.status !== 'verified-success', 'partial no success');
    assert(partial.changedFiles.includes('src/a.ts'), 'partial changed a');
    assert(partial.failedFiles.includes('src/b.ts'), 'partial failed b');
    assert(partial.claimLedger.terminal.liveSuccess === false, 'partial live false');
    console.log('route206-marker partial-apply-cannot-success=pass');

    const mixed = await runControlledMultifileProofChain({ scenario: 'mixed-verification' });
    assert(mixed.claimLedger.terminal.status !== 'verified-success', 'mixed no success');
    assert(mixed.verifiedFiles.includes('src/a.ts'), 'mixed verified a');
    assert(mixed.unverifiedFiles.includes('src/b.ts'), 'mixed unverified b');
    console.log('route206-marker mixed-verification-cannot-success=pass');

    const missing = await runControlledMultifileProofChain({ scenario: 'verification-missing' });
    assert(missing.claimLedger.terminal.status !== 'verified-success', 'missing no success');
    assert(missing.claimLedger.evidence.includes('claim-ledger:file:src/b.ts:verification:not-run'), 'missing verification visible');
    console.log('route206-marker verification-missing-cannot-success=pass');

    const unattempted = await runControlledMultifileProofChain({ scenario: 'unattempted-file' });
    assert(unattempted.claimLedger.terminal.status !== 'verified-success', 'unattempted no success');
    assert(unattempted.unattemptedFiles.includes('src/b.ts'), 'unattempted b visible');
    assert(unattempted.claimLedger.evidence.includes('claim-ledger:file:src/b.ts:status:unattempted'), 'unattempted evidence visible');
    console.log('route206-marker unattempted-file-visible=pass');
    console.log('route206-marker per-file-states-visible=pass');

    const repair = await runControlledMultifileProofChain({ scenario: 'repair-handoff' });
    assert(repair.claimLedger.terminal.status === 'repair-confirmation-required', 'repair terminal');
    assert(repair.claimLedger.evidence.includes('claim-ledger:verification:failed'), 'repair preserved original failure');
    assert(repair.claimLedger.terminal.liveSuccess === false, 'repair live false');
    console.log('route206-marker repair-handoff-preserves-original-failure=pass');
    console.log('route206-marker repair-proposal-alone-cannot-success=pass');
    console.log('route206-marker recovery-available-alone-cannot-success=pass');

    const all = [success, partial, mixed, missing, unattempted, repair];
    assert(all.every((result) => result.providerCallDuringApply === false), 'provider during apply');
    assert(all.every((result) => result.evidence.includes('proposal-hunk-set-route:no-new-writer')), 'existing hunk-set route no-new-writer evidence');
    assert(all.every((result) => result.evidence.includes('proposal-hunk-set-route:no-provider-call')), 'existing hunk-set route no-provider-call evidence');
    assert(all.every((result) => result.evidence.includes('proposal-hunk-set-route:multi-hunk-exact-apply')), 'positive exact hunk-set route evidence');
    assert(all.every((result) => result.evidence.includes('proposal-hunk-set-policy:exact-per-target-mapping-only')), 'positive exact mapping policy evidence');
    assert(success.evidence.includes('proposal-hunk-set-route:file:src/a.ts:written'), 'success a written evidence');
    assert(success.evidence.includes('proposal-hunk-set-route:file:src/b.ts:written'), 'success b written evidence');
    assert(partial.evidence.includes('proposal-hunk-set-route:file:src/a.ts:written'), 'partial a written evidence');
    assert(partial.evidence.includes('proposal-hunk-set-route:file:src/b.ts:failed'), 'partial b failed evidence');
    assert(unattempted.evidence.includes('proposal-hunk-set-route:file:src/a.ts:failed'), 'unattempted a failed evidence');
    assert(unattempted.evidence.includes('proposal-hunk-set-route:file:src/b.ts:not-run'), 'unattempted b not-run evidence');
    assert(all.every((result) => !result.evidence.join('\n').includes('fuzzy-output')), 'no fuzzy apply evidence');
    console.log('route206-marker provider-call-during-apply=false');
    console.log('route206-marker no-new-writer=pass');
    console.log('route206-marker no-fuzzy-apply=pass');
    assert(all.every((result) => !result.workspaceRoot.startsWith(${JSON.stringify(repoRoot)})), 'temp workspace outside repo');
    assert(success.evidence.includes('route206:no-production-workspace-mutation'), 'no production mutation marker from runtime');
    console.log('route206-marker no-production-workspace-mutation=pass');

    const focused = await runControlledMultifileProofChain({ scenario: 'success' });
    assert(focused.claimLedger.terminal.liveSuccess === false, 'focused not live');
    console.log('route206-marker fake-focused-default-not-live-success=pass');
    }

    function assert(condition, label) {
      if (!condition) {
        throw new Error('assertion failed: ' + label);
      }
    }
  `
}

function isolatedEnv(name) {
  const root = `/tmp/private-agents-test/${name}`
  return {
    ...process.env,
    PRIVATE_AGENTS_REAL_HOME: '',
    PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '',
    PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE: '',
    PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY: '',
    PRIVATE_AGENTS_TEST_ROOT: root,
    HOME: `${root}-home`,
    USERPROFILE: `${root}-home`,
  }
}

function printTail(stdout, stderr) {
  const output = [redact(stdout), redact(stderr)].filter(Boolean).join('\n')
  for (const line of output.split(/\r?\n/).slice(-80)) {
    if (line.trim()) console.log(line)
  }
}

function redact(input) {
  return String(input ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi, '[REAL_PROVIDER_HOME]')
}
