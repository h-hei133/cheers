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

console.log('gate name=three-file-guarded-write')
console.log('mode=deterministic-non-default')
console.log('realProviderTouched=false')
console.log('realProviderExecution=false')
console.log('defaultGateChanged=false')
console.log('rollbackAtomicityClaim=false')

const scenarios = [
  {
    id: 'exactly-three-existing-update-guarded-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n', 'src/c.ts': 'c = 1\n' },
    patchText: updatePatch(['a', 'b', 'c']),
    expectedOutcome: 'success',
    expectedChangedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    expectedWriteIntentFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    expectedFailedFiles: [],
    expectedPerFileFailedFiles: [],
    expectedPerFileSupportStatus: 'supported-write',
    expectedPerFileFailureClass: 'none',
    expectedOperationKinds: ['update', 'update', 'update'],
    expectedOperationSupportStatuses: ['supported-write', 'supported-write', 'supported-write'],
    expectedWriterInvoked: true,
    expectedWriteFileCalls: 3,
    expectedPostWriteVerification: 'passed',
    expectedSuccessLike: true,
  },
  {
    id: 'exactly-three-stale-read-guard-no-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n', 'src/c.ts': 'c = 1\n' },
    patchText: updatePatch(['a', 'b', 'c']),
    routeOptions: { staleReadTargets: ['src/b.ts'] },
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedWriteIntentFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    expectedFailedFiles: ['src/b.ts'],
    expectedPerFileFailedFiles: ['src/b.ts'],
    expectedPerFileSupportStatus: 'supported-write',
    expectedPerFileFailureClass: 'stale-read',
    expectedOperationKinds: ['update', 'update', 'update'],
    expectedOperationSupportStatuses: ['supported-write', 'supported-write', 'supported-write'],
    expectedWriterInvoked: false,
    expectedWriteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSuccessLike: false,
  },
  {
    id: 'four-file-update-unsupported-no-write',
    files: {
      'src/a.ts': 'a = 1\n',
      'src/b.ts': 'b = 1\n',
      'src/c.ts': 'c = 1\n',
      'src/d.ts': 'd = 1\n',
    },
    patchText: updatePatch(['a', 'b', 'c', 'd']),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedWriteIntentFiles: [],
    expectedFailedFiles: ['(apply_patch)'],
    expectedPerFileFailedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
    expectedPerFileSupportStatus: 'unsupported-no-write',
    expectedPerFileFailureClass: 'too-many-update-files',
    expectedOperationKinds: ['update', 'update', 'update', 'update'],
    expectedOperationSupportStatuses: [
      'unsupported-no-write',
      'unsupported-no-write',
      'unsupported-no-write',
      'unsupported-no-write',
    ],
    expectedWriterInvoked: false,
    expectedWriteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSuccessLike: false,
  },
  {
    id: 'delete-file-unsupported-no-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n' },
    patchText: [
      '*** Begin Patch',
      '*** Delete File: src/a.ts',
      '*** End Patch',
    ].join('\n'),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedWriteIntentFiles: [],
    expectedFailedFiles: ['(apply_patch)'],
    expectedPerFileFailedFiles: ['src/a.ts'],
    expectedPerFileSupportStatus: 'unsupported-no-write',
    expectedPerFileFailureClass: 'unsupported-operation',
    expectedOperationKinds: ['delete'],
    expectedOperationSupportStatuses: ['unsupported-no-write'],
    expectedWriterInvoked: false,
    expectedWriteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSuccessLike: false,
  },
  {
    id: 'move-file-unsupported-no-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n' },
    patchText: [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '*** Move to: src/renamed.ts',
      '@@',
      '-a = 1',
      '+a = 2',
      '*** End Patch',
    ].join('\n'),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedWriteIntentFiles: [],
    expectedFailedFiles: ['(apply_patch)'],
    expectedPerFileFailedFiles: ['src/renamed.ts'],
    expectedPerFileSupportStatus: 'unsupported-no-write',
    expectedPerFileFailureClass: 'unsupported-operation',
    expectedOperationKinds: ['move'],
    expectedOperationSupportStatuses: ['unsupported-no-write'],
    expectedWriterInvoked: false,
    expectedWriteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSuccessLike: false,
  },
  {
    id: 'broad-apply-patch-unsupported-no-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n' },
    patchText: [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-a = 1',
      '+a = 2',
    ].join('\n'),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedWriteIntentFiles: [],
    expectedFailedFiles: ['(apply_patch)'],
    expectedPerFileFailedFiles: ['src/a.ts'],
    expectedPerFileSupportStatus: 'unsupported-no-write',
    expectedPerFileFailureClass: 'broad-apply-patch',
    expectedOperationKinds: ['broad'],
    expectedOperationSupportStatuses: ['unsupported-no-write'],
    expectedWriterInvoked: false,
    expectedWriteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSuccessLike: false,
  },
  {
    id: 'mixed-update-delete-unsupported-no-write',
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n' },
    patchText: [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '-a = 1',
      '+a = 2',
      '*** Delete File: src/b.ts',
      '*** End Patch',
    ].join('\n'),
    expectedOutcome: 'stopped',
    expectedChangedFiles: [],
    expectedWriteIntentFiles: [],
    expectedFailedFiles: ['(apply_patch)'],
    expectedPerFileFailedFiles: ['src/a.ts', 'src/b.ts'],
    expectedPerFileSupportStatus: 'unsupported-no-write',
    expectedPerFileFailureClass: 'mixed-operations',
    expectedOperationKinds: ['update', 'delete'],
    expectedOperationSupportStatuses: ['unsupported-no-write', 'unsupported-no-write'],
    expectedWriterInvoked: false,
    expectedWriteFileCalls: 0,
    expectedPostWriteVerification: 'not-run',
    expectedSuccessLike: false,
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
    console.log(`[fail] three-file-guarded-write - ${failure}`)
  }
  process.exit(1)
}

console.log('[pass] three-file-guarded-write')

function runScenario(scenario) {
  const projectDir = path.join(testRoot, `route41-${scenario.id}-${runId}`)
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  for (const [relativePath, content] of Object.entries(scenario.files)) {
    const absolutePath = path.join(projectDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }

  const before = snapshot(projectDir)
  const result = runRuntimeRoute(projectDir, scenario.patchText, scenario.routeOptions ?? {})
  const after = snapshot(projectDir)
  const observedChanged = changedFiles(before, after)
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
  if (observedChanged.join(',') !== scenario.expectedChangedFiles.join(',')) {
    failures.push(`${scenario.id}: workspace changed ${observedChanged.join(',') || 'none'} expected ${scenario.expectedChangedFiles.join(',') || 'none'}`)
  }
  if ((result.json?.plannedFiles ?? []).length > 0) {
    failures.push(`${scenario.id}: plannedFiles not empty: ${result.json.plannedFiles.join(',')}`)
  }
  if ((result.json?.failedFiles ?? []).join(',') !== scenario.expectedFailedFiles.join(',')) {
    failures.push(`${scenario.id}: failedFiles ${(result.json?.failedFiles ?? []).join(',') || 'none'} expected ${scenario.expectedFailedFiles.join(',') || 'none'}`)
  }
  if ((result.json?.perFileFailedFiles ?? []).join(',') !== scenario.expectedPerFileFailedFiles.join(',')) {
    failures.push(`${scenario.id}: perFileFailedFiles ${(result.json?.perFileFailedFiles ?? []).join(',') || 'none'} expected ${scenario.expectedPerFileFailedFiles.join(',') || 'none'}`)
  }
  if ((result.json?.writeIntentFiles ?? []).join(',') !== scenario.expectedWriteIntentFiles.join(',')) {
    failures.push(`${scenario.id}: writeIntentFiles ${(result.json?.writeIntentFiles ?? []).join(',') || 'none'} expected ${scenario.expectedWriteIntentFiles.join(',') || 'none'}`)
  }
  if (result.json?.writerInvoked !== scenario.expectedWriterInvoked) {
    failures.push(`${scenario.id}: writerInvoked ${result.json?.writerInvoked} expected ${scenario.expectedWriterInvoked}`)
  }
  if (result.json?.creatorInvoked !== false) failures.push(`${scenario.id}: creatorInvoked was not false`)
  if (result.json?.deleteMoveInvoked !== false) failures.push(`${scenario.id}: deleteMoveInvoked was not false`)
  if (result.json?.writeFileCalls !== scenario.expectedWriteFileCalls) {
    failures.push(`${scenario.id}: writeFileCalls ${result.json?.writeFileCalls ?? 'missing'} expected ${scenario.expectedWriteFileCalls}`)
  }
  if (result.json?.postWriteVerification !== scenario.expectedPostWriteVerification) {
    failures.push(`${scenario.id}: postWriteVerification ${result.json?.postWriteVerification ?? 'missing'} expected ${scenario.expectedPostWriteVerification}`)
  }
  if (result.json?.successLike !== scenario.expectedSuccessLike) {
    failures.push(`${scenario.id}: successLike ${result.json?.successLike} expected ${scenario.expectedSuccessLike}`)
  }
  if (result.json?.perFileSupportStatus !== scenario.expectedPerFileSupportStatus) {
    failures.push(`${scenario.id}: perFileSupportStatus ${result.json?.perFileSupportStatus ?? 'missing'} expected ${scenario.expectedPerFileSupportStatus}`)
  }
  if (result.json?.perFileFailureClass !== scenario.expectedPerFileFailureClass) {
    failures.push(`${scenario.id}: perFileFailureClass ${result.json?.perFileFailureClass ?? 'missing'} expected ${scenario.expectedPerFileFailureClass}`)
  }
  if ((result.json?.perFileOperationKinds ?? []).join(',') !== scenario.expectedOperationKinds.join(',')) {
    failures.push(`${scenario.id}: perFileOperationKinds ${(result.json?.perFileOperationKinds ?? []).join(',') || 'none'} expected ${scenario.expectedOperationKinds.join(',')}`)
  }
  if ((result.json?.perFileOperationSupportStatuses ?? []).join(',') !== scenario.expectedOperationSupportStatuses.join(',')) {
    failures.push(`${scenario.id}: perFileOperationSupportStatuses ${(result.json?.perFileOperationSupportStatuses ?? []).join(',') || 'none'} expected ${scenario.expectedOperationSupportStatuses.join(',')}`)
  }
  if (result.json?.rollbackAtomicityClaim !== false) {
    failures.push(`${scenario.id}: rollback/atomicity success claim was not false`)
  }

  return {
    id: scenario.id,
    ...result.json,
    observedChanged,
    failures,
  }
}

function runRuntimeRoute(projectDir, patchText, routeOptions) {
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
    const scenarioOptions = JSON.parse(process.argv[3] || '{}');
    const staleReadTargets = new Set(scenarioOptions.staleReadTargets || []);
    let writeFileCalls = 0;
    async function main() {
      const baseAuthority = createWorkspaceWriteAuthority(workspaceRoot);
      const authority = {
        ...baseAuthority,
        readVerifiedFile: (relativePath) => staleReadTargets.has(relativePath)
          ? '__stale_content_from_route41_guard__\\n'
          : baseAuthority.readVerifiedFile(relativePath),
        writeFile: async (relativePath, content) => {
          writeFileCalls += 1;
          await baseAuthority.writeFile(relativePath, content);
        },
      };
      const result = await projectApplyPatchRuntimeMutationRoute({
        sessionId: 'route41-session',
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
        changedFiles: result?.codingResult?.changedFiles ?? [],
        plannedFiles: perFilePatchPlan?.plannedFiles ?? [],
        failedFiles: failedFiles.map((file) => file?.path ?? String(file)),
        writeIntentFiles: perFilePatchPlan?.writeIntentFiles ?? [],
        writerInvoked: perFilePatchPlan?.writerInvoked,
        creatorInvoked: perFilePatchPlan?.creatorInvoked,
        deleteMoveInvoked: perFilePatchPlan?.deleteMoveInvoked,
        writeFileCalls,
        postWriteVerification: perFilePatchPlan?.postWriteVerification,
        successLike: perFilePatchPlan?.successLike,
        perFileSupportStatus: perFilePatchPlan?.supportStatus,
        perFileFailureClass: perFilePatchPlan?.failureClass,
        perFileOperationKinds: perFilePatchPlan?.operations?.map((operation) => operation.operationKind) ?? [],
        perFileOperationSupportStatuses: perFilePatchPlan?.operations?.map((operation) => operation.supportStatus) ?? [],
        perFileFailedFiles: perFilePatchPlan?.operations
          ?.map((operation) => operation.failedFile?.path)
          .filter(Boolean) ?? [],
        rollbackAtomicityClaim: /rollback succeeded|atomic rollback|atomicity guaranteed/i.test(result?.finalOutput ?? ''),
      }));
    }
    main().catch((error) => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    });
  `
  return runJson(script, [projectDir, patchText, JSON.stringify(routeOptions)])
}

function runJson(script, args) {
  const result = spawnSync(process.execPath, [tsxCliPath, '-e', script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(testRoot, 'route41-home'),
      USERPROFILE: path.join(testRoot, 'route41-home'),
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

function printScenario(result) {
  console.log(`scenario=${result.id}`)
  console.log(`outcome=${result.outcome ?? 'missing'}`)
  console.log(`changedFiles=${(result.changedFiles ?? []).join(',') || 'none'}`)
  console.log(`plannedFiles=${(result.plannedFiles ?? []).join(',') || 'none'}`)
  console.log(`failedFiles=${(result.failedFiles ?? []).map(formatFileEntry).join(',') || 'none'}`)
  console.log(`perFileFailedFiles=${(result.perFileFailedFiles ?? []).join(',') || 'none'}`)
  console.log(`writeIntentFiles=${(result.writeIntentFiles ?? []).join(',') || 'none'}`)
  console.log(`writerInvoked=${result.writerInvoked}`)
  console.log(`creatorInvoked=${result.creatorInvoked}`)
  console.log(`deleteMoveInvoked=${result.deleteMoveInvoked}`)
  console.log(`writeFileCalls=${result.writeFileCalls}`)
  console.log(`postWriteVerification=${result.postWriteVerification}`)
  console.log(`successLike=${result.successLike}`)
  console.log(`perFileSupportStatus=${result.perFileSupportStatus}`)
  console.log(`perFileFailureClass=${result.perFileFailureClass}`)
  console.log(`perFileOperationKinds=${(result.perFileOperationKinds ?? []).join(',') || 'none'}`)
  console.log(`perFileOperationSupportStatuses=${(result.perFileOperationSupportStatuses ?? []).join(',') || 'none'}`)
  console.log(`rollbackAtomicityClaim=${result.rollbackAtomicityClaim}`)
}

function formatFileEntry(file) {
  if (typeof file === 'string') return file
  if (file?.path) return file.path
  if (file?.code) return file.code
  return 'unknown'
}

function summarizeOutput(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join(' | ')
}

function snapshot(root) {
  const src = path.join(root, 'src')
  if (!fs.existsSync(src)) return new Map()
  return new Map(
    fs.readdirSync(src)
      .sort()
      .map((file) => [`src/${file}`, fs.readFileSync(path.join(src, file), 'utf8')]),
  )
}

function changedFiles(before, after) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort()
  return keys.filter((key) => before.get(key) !== after.get(key))
}

function updatePatch(names) {
  return [
    '*** Begin Patch',
    ...names.flatMap((name) => [
      `*** Update File: src/${name}.ts`,
      '@@',
      `-${name} = 1`,
      `+${name} = 2`,
    ]),
    '*** End Patch',
  ].join('\n')
}
