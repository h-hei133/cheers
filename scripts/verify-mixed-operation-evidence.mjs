#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT || path.join(os.tmpdir(), 'private-agents-test')
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

console.log('gate name=mixed-operation-evidence')
console.log('mode=deterministic-non-default')
console.log('realProviderTouched=false')
console.log('realProviderExecution=false')
console.log('defaultGateChanged=false')
console.log('rollbackAtomicityClaim=false')

const scenarios = [
  {
    id: 'update-create-success',
    files: { 'src/a.ts': 'a = 1\n' },
    patchText: updateCreatePatch(),
    expectedOutcome: 'success',
    expectedChangedFiles: ['src/a.ts', 'src/new.ts'],
    expectedSupportStatus: 'supported-write',
    expectedFailureClass: 'none',
    expectedWriterInvoked: true,
    expectedCreatorInvoked: true,
    expectedDeleteMoveInvoked: false,
    expectedPostWriteVerification: 'passed',
    expectedOperationKinds: ['update', 'create'],
  },
  {
    id: 'update-move-success',
    files: { 'src/a.ts': 'a = 1\n', 'src/from.ts': 'from\n' },
    patchText: updateMovePatch(),
    expectedOutcome: 'success',
    expectedChangedFiles: ['src/a.ts', 'src/to.ts'],
    expectedSupportStatus: 'supported-write',
    expectedFailureClass: 'none',
    expectedWriterInvoked: true,
    expectedCreatorInvoked: false,
    expectedDeleteMoveInvoked: true,
    expectedPostWriteVerification: 'passed',
    expectedOperationKinds: ['update', 'move'],
  },
  {
    id: 'update-delete-success',
    files: { 'src/a.ts': 'a = 1\n', 'src/remove.ts': 'remove\n' },
    patchText: updateDeletePatch(),
    expectedOutcome: 'success',
    expectedChangedFiles: ['src/a.ts', 'src/remove.ts'],
    expectedSupportStatus: 'supported-write',
    expectedFailureClass: 'none',
    expectedWriterInvoked: true,
    expectedCreatorInvoked: false,
    expectedDeleteMoveInvoked: true,
    expectedPostWriteVerification: 'passed',
    expectedOperationKinds: ['update', 'delete'],
  },
  {
    id: 'three-mixed-remains-no-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/remove.ts': 'remove\n' },
    patchText: threeMixedPatch(),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedSupportStatus: 'unsupported-no-write',
    expectedFailureClass: 'mixed-operations',
    expectedWriterInvoked: false,
    expectedCreatorInvoked: false,
    expectedDeleteMoveInvoked: false,
    expectedPostWriteVerification: 'not-run',
    expectedOperationKinds: ['update', 'create', 'delete'],
  },
  {
    id: 'broad-apply-patch-remains-no-write',
    files: { 'src/a.ts': 'a = 1\n' },
    patchText: broadPatch(),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedSupportStatus: 'unsupported-no-write',
    expectedFailureClass: 'broad-apply-patch',
    expectedWriterInvoked: false,
    expectedCreatorInvoked: false,
    expectedDeleteMoveInvoked: false,
    expectedPostWriteVerification: 'not-run',
    expectedOperationKinds: ['broad'],
  },
  {
    id: 'outside-create-remains-no-write',
    files: { 'src/a.ts': 'a = 1\n' },
    patchText: outsideCreatePatch(),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedSupportStatus: 'unsupported-no-write',
    expectedFailureClass: 'workspace-boundary',
    expectedWriterInvoked: false,
    expectedCreatorInvoked: false,
    expectedDeleteMoveInvoked: false,
    expectedPostWriteVerification: 'not-run',
    expectedOperationKinds: ['update', 'create'],
  },
  {
    id: 'duplicate-conflict-remains-no-write',
    files: { 'src/a.ts': 'a = 1\n' },
    patchText: duplicateConflictPatch(),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedSupportStatus: 'unsupported-no-write',
    expectedFailureClass: 'duplicate-target',
    expectedWriterInvoked: false,
    expectedCreatorInvoked: false,
    expectedDeleteMoveInvoked: false,
    expectedPostWriteVerification: 'not-run',
    expectedOperationKinds: ['update', 'delete'],
  },
]

const results = scenarios.map(runScenario)
for (const result of results) {
  printScenario(result)
}

const failures = results.flatMap((result) => result.failures)
console.log(`coveredScenarios=${results.map((result) => result.id).join(',')}`)
console.log('noThreePlusMixedWrites=true')
console.log('noBroadApplyPatchWrites=true')
console.log('noRollbackAtomicityClaim=true')
if (failures.length > 0) {
  for (const failure of failures) {
    console.log(`[fail] mixed-operation-evidence - ${failure}`)
  }
  process.exit(1)
}

console.log('[pass] mixed-operation-evidence')

function runScenario(scenario) {
  const projectDir = path.join(testRoot, `route48-${scenario.id}-${runId}`)
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  for (const [relativePath, content] of Object.entries(scenario.files)) {
    const absolutePath = path.join(projectDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }

  const result = runRuntimeRoute(projectDir, scenario.patchText)
  fs.rmSync(projectDir, { recursive: true, force: true })

  const failures = []
  if (result.code !== 0) {
    failures.push(`${scenario.id}: child process exited ${result.code}: ${summarizeOutput(result.output)}`)
  }
  if (result.json?.outcome !== scenario.expectedOutcome) {
    failures.push(`${scenario.id}: outcome ${result.json?.outcome ?? 'missing'} expected ${scenario.expectedOutcome}`)
  }
  if ((result.json?.changedFiles ?? []).join(',') !== scenario.expectedChangedFiles.join(',')) {
    failures.push(`${scenario.id}: changedFiles ${(result.json?.changedFiles ?? []).join(',') || 'none'} expected ${scenario.expectedChangedFiles.join(',') || 'none'}`)
  }
  if (result.json?.supportStatus !== scenario.expectedSupportStatus) {
    failures.push(`${scenario.id}: supportStatus ${result.json?.supportStatus ?? 'missing'} expected ${scenario.expectedSupportStatus}`)
  }
  if (result.json?.failureClass !== scenario.expectedFailureClass) {
    failures.push(`${scenario.id}: failureClass ${result.json?.failureClass ?? 'missing'} expected ${scenario.expectedFailureClass}`)
  }
  if (result.json?.writerInvoked !== scenario.expectedWriterInvoked) {
    failures.push(`${scenario.id}: writerInvoked ${result.json?.writerInvoked} expected ${scenario.expectedWriterInvoked}`)
  }
  if (result.json?.creatorInvoked !== scenario.expectedCreatorInvoked) {
    failures.push(`${scenario.id}: creatorInvoked ${result.json?.creatorInvoked} expected ${scenario.expectedCreatorInvoked}`)
  }
  if (result.json?.deleteMoveInvoked !== scenario.expectedDeleteMoveInvoked) {
    failures.push(`${scenario.id}: deleteMoveInvoked ${result.json?.deleteMoveInvoked} expected ${scenario.expectedDeleteMoveInvoked}`)
  }
  if (result.json?.postWriteVerification !== scenario.expectedPostWriteVerification) {
    failures.push(`${scenario.id}: postWriteVerification ${result.json?.postWriteVerification ?? 'missing'} expected ${scenario.expectedPostWriteVerification}`)
  }
  if ((result.json?.operationKinds ?? []).join(',') !== scenario.expectedOperationKinds.join(',')) {
    failures.push(`${scenario.id}: operationKinds ${(result.json?.operationKinds ?? []).join(',') || 'none'} expected ${scenario.expectedOperationKinds.join(',')}`)
  }
  if ((result.json?.writeCalls ?? 0) > 0 !== scenario.expectedWriterInvoked) {
    failures.push(`${scenario.id}: writeCalls ${(result.json?.writeCalls ?? 0)} did not match writer expectation`)
  }
  if (result.json?.rollbackAtomicityClaim !== false) {
    failures.push(`${scenario.id}: rollback/atomicity success claim was not false`)
  }

  return {
    id: scenario.id,
    ...result.json,
    failures,
  }
}

function runRuntimeRoute(projectDir, patchText) {
  const routeModuleUrl = pathToFileURL(
    path.join(tsShellRoot, 'src', 'orchestration', 'mutationRoutingProjection.ts'),
  ).href
  const authorityModuleUrl = pathToFileURL(
    path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'workspaceAuthority.ts'),
  ).href
  const script = `
    import fs from 'node:fs';
    import { projectApplyPatchRuntimeMutationRoute } from ${JSON.stringify(routeModuleUrl)};
    import { createWorkspaceWriteAuthority } from ${JSON.stringify(authorityModuleUrl)};
    const workspaceRoot = process.argv[1];
    const rawPatchText = process.argv[2];
    let writeCalls = 0;
    async function main() {
      const baseAuthority = createWorkspaceWriteAuthority(workspaceRoot);
      const authority = {
        ...baseAuthority,
        writeFile: async (targetPath, content) => {
          writeCalls += 1;
          await baseAuthority.writeFile(targetPath, content);
        },
        createFileExclusive: async (targetPath, content) => {
          writeCalls += 1;
          await baseAuthority.createFileExclusive(targetPath, content);
        },
        moveFileExclusive: async (sourcePath, targetPath) => {
          writeCalls += 1;
          await baseAuthority.moveFileExclusive(sourcePath, targetPath);
        },
        deleteFile: async (targetPath) => {
          writeCalls += 1;
          await baseAuthority.deleteFile(targetPath);
        },
      };
      const result = await projectApplyPatchRuntimeMutationRoute({
        sessionId: 'route48-session',
        prompt: rawPatchText,
        workspaceRoot,
        routeOptions: {
          explicitRuntimeOptIn: true,
          rawPatchText,
          requestedUserDecision: 'approved',
          workspaceWrite: { explicitWorkspaceWriteOptIn: true },
        },
        getWorkspaceAuthority: () => authority,
        readNoWriteRuntimeFile: (absolutePath) => {
          try { return fs.readFileSync(absolutePath, 'utf8'); } catch { return undefined; }
        },
      });
      const perFilePatchPlan = result?.codingResult?.perFilePatchPlan;
      console.log(JSON.stringify({
        outcome: result?.terminalClassification,
        finalOutput: result?.finalOutput ?? '',
        changedFiles: result?.codingResult?.changedFiles ?? [],
        supportStatus: perFilePatchPlan?.supportStatus,
        failureClass: perFilePatchPlan?.failureClass,
        writerInvoked: perFilePatchPlan?.writerInvoked,
        creatorInvoked: perFilePatchPlan?.creatorInvoked,
        deleteMoveInvoked: perFilePatchPlan?.deleteMoveInvoked,
        postWriteVerification: perFilePatchPlan?.postWriteVerification,
        operationKinds: perFilePatchPlan?.operations?.map((operation) => operation.operationKind) ?? [],
        writeCalls,
        rollbackAtomicityClaim: /rollback succeeded|atomic rollback|atomicity guaranteed/i.test(result?.finalOutput ?? ''),
      }));
    }
    main().catch((error) => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    });
  `
  return runJson(script, [projectDir, patchText])
}

function runJson(script, args) {
  const result = spawnSync(process.execPath, [tsxCliPath, '-e', script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(testRoot, 'route48-home'),
      USERPROFILE: path.join(testRoot, 'route48-home'),
      PRIVATE_AGENTS_REAL_HOME: '',
    },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const jsonLine = output
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith('{'))
  let json
  try {
    json = jsonLine ? JSON.parse(jsonLine) : undefined
  } catch {
    json = undefined
  }
  return { code: result.status ?? 1, output, json }
}

function printScenario(result) {
  console.log(`[scenario] ${result.id} outcome=${result.outcome} changedFiles=${(result.changedFiles ?? []).join(',') || 'none'} supportStatus=${result.supportStatus} failureClass=${result.failureClass} writerInvoked=${result.writerInvoked} creatorInvoked=${result.creatorInvoked} deleteMoveInvoked=${result.deleteMoveInvoked} postWriteVerification=${result.postWriteVerification}`)
}

function summarizeOutput(output) {
  return output.split(/\r?\n/).filter(Boolean).slice(-6).join(' | ')
}

function updateCreatePatch() {
  return [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@',
    '-a = 1',
    '+a = 2',
    '*** Add File: src/new.ts',
    '+created',
    '*** End Patch',
  ].join('\n')
}

function updateMovePatch() {
  return [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@',
    '-a = 1',
    '+a = 2',
    '*** Update File: src/from.ts',
    '*** Move to: src/to.ts',
    '@@',
    ' from',
    '*** End Patch',
  ].join('\n')
}

function updateDeletePatch() {
  return [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@',
    '-a = 1',
    '+a = 2',
    '*** Delete File: src/remove.ts',
    '*** End Patch',
  ].join('\n')
}

function threeMixedPatch() {
  return [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@',
    '-a = 1',
    '+a = 2',
    '*** Add File: src/new.ts',
    '+created',
    '*** Delete File: src/remove.ts',
    '*** End Patch',
  ].join('\n')
}

function broadPatch() {
  return [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1 +1 @@',
    '-a = 1',
    '+a = 2',
  ].join('\n')
}

function outsideCreatePatch() {
  return [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@',
    '-a = 1',
    '+a = 2',
    '*** Add File: ../outside.ts',
    '+outside',
    '*** End Patch',
  ].join('\n')
}

function duplicateConflictPatch() {
  return [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@',
    '-a = 1',
    '+a = 2',
    '*** Delete File: src/a.ts',
    '*** End Patch',
  ].join('\n')
}
