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

console.log('gate name=single-file-delete-evidence')
console.log('mode=deterministic-non-default')
console.log('realProviderTouched=false')
console.log('realProviderExecution=false')
console.log('defaultGateChanged=false')
console.log('rollbackAtomicityClaim=false')

const scenarios = [
  {
    id: 'guarded-single-file-delete-success',
    files: { 'src/delete-me.ts': 'delete me\n' },
    patchText: deletePatch('src/delete-me.ts'),
    expectedOutcome: 'success',
    expectedChangedFiles: ['src/delete-me.ts'],
    expectedFailedFiles: [],
    expectedWriteIntentFiles: ['src/delete-me.ts'],
    expectedWriterInvoked: true,
    expectedDeleteMoveInvoked: true,
    expectedDeleteFileCalls: 1,
    expectedPostWriteVerification: 'passed',
    expectedSupportStatus: 'supported-write',
    expectedFailureClass: 'none',
    expectedSuccessLike: true,
    expectedTargetExists: false,
  },
  {
    id: 'missing-target-remains-no-write',
    files: {},
    patchText: deletePatch('src/missing.ts'),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedFailedFiles: ['(apply_patch)'],
    expectedWriteIntentFiles: [],
    expectedWriterInvoked: false,
    expectedDeleteMoveInvoked: false,
    expectedDeleteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSupportStatus: 'unsupported-no-write',
    expectedFailureClass: 'missing-target',
    expectedSuccessLike: false,
    expectedTargetExists: false,
  },
]

const results = scenarios.map(runScenario)
for (const result of results) {
  printScenario(result)
}

const failures = results.flatMap((result) => result.failures)
console.log(`coveredScenarios=${results.map((result) => result.id).join(',')}`)
console.log('noRollbackAtomicityClaim=true')
if (failures.length > 0) {
  for (const failure of failures) {
    console.log(`[fail] single-file-delete-evidence - ${failure}`)
  }
  process.exit(1)
}

console.log('[pass] single-file-delete-evidence')

function runScenario(scenario) {
  const projectDir = path.join(testRoot, `route45-${scenario.id}-${runId}`)
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  for (const [relativePath, content] of Object.entries(scenario.files)) {
    const absolutePath = path.join(projectDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }

  const result = runRuntimeRoute(projectDir, scenario.patchText)
  const targetName = scenario.id.includes('missing') ? 'missing.ts' : 'delete-me.ts'
  const targetPath = path.join(projectDir, 'src', targetName)
  const targetExists = fs.existsSync(targetPath)
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
  if ((result.json?.failedFiles ?? []).join(',') !== scenario.expectedFailedFiles.join(',')) {
    failures.push(`${scenario.id}: failedFiles ${(result.json?.failedFiles ?? []).join(',') || 'none'} expected ${scenario.expectedFailedFiles.join(',') || 'none'}`)
  }
  if ((result.json?.writeIntentFiles ?? []).join(',') !== scenario.expectedWriteIntentFiles.join(',')) {
    failures.push(`${scenario.id}: writeIntentFiles ${(result.json?.writeIntentFiles ?? []).join(',') || 'none'} expected ${scenario.expectedWriteIntentFiles.join(',') || 'none'}`)
  }
  if (result.json?.writerInvoked !== scenario.expectedWriterInvoked) {
    failures.push(`${scenario.id}: writerInvoked ${result.json?.writerInvoked} expected ${scenario.expectedWriterInvoked}`)
  }
  if (result.json?.creatorInvoked !== false) failures.push(`${scenario.id}: creatorInvoked was not false`)
  if (result.json?.deleteMoveInvoked !== scenario.expectedDeleteMoveInvoked) {
    failures.push(`${scenario.id}: deleteMoveInvoked ${result.json?.deleteMoveInvoked} expected ${scenario.expectedDeleteMoveInvoked}`)
  }
  if (result.json?.deleteFileCalls !== scenario.expectedDeleteFileCalls) {
    failures.push(`${scenario.id}: deleteFileCalls ${result.json?.deleteFileCalls ?? 'missing'} expected ${scenario.expectedDeleteFileCalls}`)
  }
  if (result.json?.postWriteVerification !== scenario.expectedPostWriteVerification) {
    failures.push(`${scenario.id}: postWriteVerification ${result.json?.postWriteVerification ?? 'missing'} expected ${scenario.expectedPostWriteVerification}`)
  }
  if (result.json?.supportStatus !== scenario.expectedSupportStatus) {
    failures.push(`${scenario.id}: supportStatus ${result.json?.supportStatus ?? 'missing'} expected ${scenario.expectedSupportStatus}`)
  }
  if (result.json?.failureClass !== scenario.expectedFailureClass) {
    failures.push(`${scenario.id}: failureClass ${result.json?.failureClass ?? 'missing'} expected ${scenario.expectedFailureClass}`)
  }
  if (result.json?.successLike !== scenario.expectedSuccessLike) {
    failures.push(`${scenario.id}: successLike ${result.json?.successLike} expected ${scenario.expectedSuccessLike}`)
  }
  if ((result.json?.operationKinds ?? []).join(',') !== 'delete') {
    failures.push(`${scenario.id}: operationKinds ${(result.json?.operationKinds ?? []).join(',') || 'none'} expected delete`)
  }
  if (targetExists !== scenario.expectedTargetExists) {
    failures.push(`${scenario.id}: targetExists ${targetExists} expected ${scenario.expectedTargetExists}`)
  }
  if (result.json?.rollbackAtomicityClaim !== false) {
    failures.push(`${scenario.id}: rollback/atomicity success claim was not false`)
  }

  return {
    id: scenario.id,
    ...result.json,
    targetExists,
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
    let deleteFileCalls = 0;
    async function main() {
      const baseAuthority = createWorkspaceWriteAuthority(workspaceRoot);
      const authority = {
        ...baseAuthority,
        deleteFile: async (targetPath) => {
          deleteFileCalls += 1;
          await baseAuthority.deleteFile(targetPath);
        },
      };
      const result = await projectApplyPatchRuntimeMutationRoute({
        sessionId: 'route45-session',
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
      const failedFiles = result?.codingResult?.failedFiles ?? [];
      console.log(JSON.stringify({
        outcome: result?.terminalClassification,
        finalOutput: result?.finalOutput ?? '',
        changedFiles: result?.codingResult?.changedFiles ?? [],
        failedFiles: failedFiles.map((file) => file?.path ?? String(file)),
        writeIntentFiles: perFilePatchPlan?.writeIntentFiles ?? [],
        writerInvoked: perFilePatchPlan?.writerInvoked,
        creatorInvoked: perFilePatchPlan?.creatorInvoked,
        deleteMoveInvoked: perFilePatchPlan?.deleteMoveInvoked,
        postWriteVerification: perFilePatchPlan?.postWriteVerification,
        supportStatus: perFilePatchPlan?.supportStatus,
        failureClass: perFilePatchPlan?.failureClass,
        successLike: perFilePatchPlan?.successLike,
        operationKinds: perFilePatchPlan?.operations?.map((operation) => operation.operationKind) ?? [],
        deleteFileCalls,
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
      HOME: path.join(testRoot, 'route45-home'),
      USERPROFILE: path.join(testRoot, 'route45-home'),
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
    maxBuffer: 1024 * 1024 * 10,
  })
  try {
    return {
      code: result.status ?? 1,
      json: JSON.parse(result.stdout.trim()),
      output: `${result.stdout}\n${result.stderr}`,
    }
  } catch {
    return {
      code: result.status ?? 1,
      json: undefined,
      output: `${result.stdout}\n${result.stderr}`,
    }
  }
}

function deletePatch(targetPath) {
  return [
    '*** Begin Patch',
    `*** Delete File: ${targetPath}`,
    '*** End Patch',
  ].join('\n')
}

function printScenario(result) {
  console.log(`scenario=${result.id}`)
  console.log(`outcome=${result.outcome ?? 'missing'}`)
  console.log(`changedFiles=${(result.changedFiles ?? []).join(',') || 'none'}`)
  console.log(`failedFiles=${(result.failedFiles ?? []).join(',') || 'none'}`)
  console.log(`writeIntentFiles=${(result.writeIntentFiles ?? []).join(',') || 'none'}`)
  console.log(`writerInvoked=${result.writerInvoked}`)
  console.log(`creatorInvoked=${result.creatorInvoked}`)
  console.log(`deleteMoveInvoked=${result.deleteMoveInvoked}`)
  console.log(`deleteFileCalls=${result.deleteFileCalls}`)
  console.log(`postWriteVerification=${result.postWriteVerification}`)
  console.log(`supportStatus=${result.supportStatus}`)
  console.log(`failureClass=${result.failureClass}`)
  console.log(`successLike=${result.successLike}`)
  console.log(`operationKinds=${(result.operationKinds ?? []).join(',') || 'none'}`)
  console.log(`targetExists=${result.targetExists}`)
  console.log(`rollbackAtomicityClaim=${result.rollbackAtomicityClaim}`)
}

function summarizeOutput(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join(' | ')
}
