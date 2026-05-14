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
console.log('defaultGateChanged=false')

const scenario = runScenario()
printScenario(scenario)

if (scenario.failures.length > 0) {
  for (const failure of scenario.failures) {
    console.log(`[fail] three-file-guarded-write - ${failure}`)
  }
  process.exit(1)
}

console.log('[pass] three-file-guarded-write')

function runScenario() {
  const projectDir = path.join(testRoot, `route40-three-file-guarded-write-${runId}`)
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  for (const name of ['a', 'b', 'c']) {
    fs.writeFileSync(path.join(projectDir, 'src', `${name}.ts`), `${name} = 1\n`, 'utf8')
  }

  const before = snapshot(projectDir)
  const result = runRuntimeRoute(projectDir, updatePatch(['a', 'b', 'c']))
  const after = snapshot(projectDir)
  const observedChanged = changedFiles(before, after)
  fs.rmSync(projectDir, { recursive: true, force: true })

  const expectedFiles = ['src/a.ts', 'src/b.ts', 'src/c.ts']
  const failures = []
  if (result.code !== 0) {
    failures.push(`child process exited ${result.code}: ${summarizeOutput(result.output)}`)
  }
  if (result.json?.outcome !== 'success') failures.push(`outcome ${result.json?.outcome ?? 'missing'} expected success`)
  if ((result.json?.changedFiles ?? []).join(',') !== expectedFiles.join(',')) {
    failures.push(`changedFiles ${(result.json?.changedFiles ?? []).join(',') || 'none'} expected ${expectedFiles.join(',')}`)
  }
  if (observedChanged.join(',') !== expectedFiles.join(',')) {
    failures.push(`workspace changed ${observedChanged.join(',') || 'none'} expected ${expectedFiles.join(',')}`)
  }
  if ((result.json?.plannedFiles ?? []).length > 0) failures.push(`plannedFiles not empty: ${result.json.plannedFiles.join(',')}`)
  if ((result.json?.failedFiles ?? []).length > 0) failures.push(`failedFiles not empty`)
  if ((result.json?.writeIntentFiles ?? []).join(',') !== expectedFiles.join(',')) {
    failures.push(`writeIntentFiles ${(result.json?.writeIntentFiles ?? []).join(',') || 'none'} expected ${expectedFiles.join(',')}`)
  }
  if (result.json?.writerInvoked !== true) failures.push('writerInvoked was not true')
  if (result.json?.creatorInvoked !== false) failures.push('creatorInvoked was not false')
  if (result.json?.deleteMoveInvoked !== false) failures.push('deleteMoveInvoked was not false')
  if (result.json?.postWriteVerification !== 'passed') failures.push(`postWriteVerification ${result.json?.postWriteVerification ?? 'missing'} expected passed`)
  if (result.json?.successLike !== true) failures.push('successLike was not true')
  if (result.json?.rollbackAtomicityClaim !== false) failures.push('rollback/atomicity success claim was not false')

  return {
    id: 'exactly-three-existing-update-guarded-write',
    ...result.json,
    observedChanged,
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
    import path from 'node:path';
    import { projectApplyPatchRuntimeMutationRoute } from ${JSON.stringify(routeModuleUrl)};
    import { createWorkspaceWriteAuthority } from ${JSON.stringify(authorityModuleUrl)};
    const workspaceRoot = process.argv[1];
    const rawPatchText = process.argv[2];
    async function main() {
      const authority = createWorkspaceWriteAuthority(workspaceRoot);
      const result = await projectApplyPatchRuntimeMutationRoute({
        sessionId: 'route40-session',
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
        changedFiles: result?.codingResult?.changedFiles ?? [],
        plannedFiles: result?.codingResult?.changeSet?.unchangedAttemptedFiles ?? [],
        failedFiles: result?.codingResult?.failedFiles ?? [],
        writeIntentFiles: perFilePatchPlan?.writeIntentFiles ?? [],
        writerInvoked: perFilePatchPlan?.writerInvoked,
        creatorInvoked: perFilePatchPlan?.creatorInvoked,
        deleteMoveInvoked: perFilePatchPlan?.deleteMoveInvoked,
        postWriteVerification: perFilePatchPlan?.postWriteVerification,
        successLike: perFilePatchPlan?.successLike,
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
      HOME: path.join(testRoot, 'route40-home'),
      USERPROFILE: path.join(testRoot, 'route40-home'),
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
  console.log(`writeIntentFiles=${(result.writeIntentFiles ?? []).join(',') || 'none'}`)
  console.log(`writerInvoked=${result.writerInvoked}`)
  console.log(`creatorInvoked=${result.creatorInvoked}`)
  console.log(`deleteMoveInvoked=${result.deleteMoveInvoked}`)
  console.log(`postWriteVerification=${result.postWriteVerification}`)
  console.log(`successLike=${result.successLike}`)
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
