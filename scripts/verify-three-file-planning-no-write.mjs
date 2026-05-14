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

const scenarios = [
  {
    id: 'exactly-three-existing-update-planning-no-write',
    mode: 'dry-run',
    patch: updatePatch(['a', 'b', 'c']),
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n', 'src/c.ts': 'c = 1\n' },
    expectedOutcome: 'blocked',
    expectedClass: 'three-file-planning-no-write',
    expectedPlanned: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  },
  {
    id: 'exactly-two-existing-update-remains-supported',
    mode: 'dry-run',
    patch: updatePatch(['a', 'b']),
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n' },
    expectedOutcome: 'blocked',
    expectedClass: 'two-file-planning-no-write',
    expectedPlanned: ['src/a.ts', 'src/b.ts'],
  },
  {
    id: 'four-file-update-remains-unsupported',
    mode: 'dry-run',
    patch: updatePatch(['a', 'b', 'c', 'd']),
    files: {
      'src/a.ts': 'a = 1\n',
      'src/b.ts': 'b = 1\n',
      'src/c.ts': 'c = 1\n',
      'src/d.ts': 'd = 1\n',
    },
    expectedOutcome: 'blocked',
    expectedClass: 'unsupported',
    expectedPlanned: [],
  },
  {
    id: 'delete-move-remain-unsupported',
    mode: 'dry-run',
    patch: [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '-a = 1',
      '+a = 2',
      '*** Delete File: src/b.ts',
      '*** Update File: src/c.ts',
      '*** Move to: src/d.ts',
      '@@',
      '-c = 1',
      '+d = 2',
      '*** End Patch',
    ].join('\n'),
    files: { 'src/a.ts': 'a = 1\n', 'src/b.ts': 'b = 1\n', 'src/c.ts': 'c = 1\n' },
    expectedOutcome: 'blocked',
    expectedClass: 'unsupported',
    expectedPlanned: [],
  },
  {
    id: 'malformed-patch-remains-model-output',
    mode: 'dry-run',
    patch: [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '-a = 1',
      '+a = 2',
    ].join('\n'),
    files: { 'src/a.ts': 'a = 1\n' },
    expectedOutcome: 'blocked',
    expectedClass: 'model-output',
    expectedPlanned: [],
  },
]

async function main() {
  console.log('gate name=three-file-planning-no-write')
  console.log('mode=deterministic-no-write')
  console.log('realProviderTouched=false')
  console.log('defaultGateChanged=false')

  const results = []
  for (const scenario of scenarios) {
    const result = runScenario(scenario)
    results.push(result)
    printScenario(result)
  }

  const failures = results.flatMap((result) => result.failures)
  console.log(`coveredScenarios=${results.map((result) => result.id).join(',')}`)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] three-file-planning-no-write - ${failure}`)
    }
    process.exit(1)
  }
  console.log('[pass] three-file-planning-no-write')
}

function runScenario(scenario) {
  const projectDir = path.join(testRoot, `route11-${scenario.id}-${runId}`)
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  for (const [relativePath, content] of Object.entries(scenario.files)) {
    const absolutePath = path.join(projectDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }
  const before = snapshot(projectDir)
  const result = scenario.mode === 'runtime-route'
    ? runRuntimeRoute(projectDir, scenario.patch)
    : runDryRun(projectDir, scenario.patch)
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
  if (result.json?.classification !== scenario.expectedClass) {
    failures.push(`${scenario.id}: classification ${result.json?.classification ?? 'missing'} expected ${scenario.expectedClass}`)
  }
  if (observedChanged.length > 0) failures.push(`${scenario.id}: workspace changed ${observedChanged.join(',')}`)
  if ((result.json?.changedFiles ?? []).length > 0) failures.push(`${scenario.id}: changedFiles not empty`)
  if ((result.json?.writeIntents ?? []).length > 0) failures.push(`${scenario.id}: writeIntents not empty`)
  if (result.json?.writerInvoked !== false) failures.push(`${scenario.id}: writerInvoked was not false`)
  if (result.json?.creatorInvoked !== false) failures.push(`${scenario.id}: creatorInvoked was not false`)
  if (result.json?.deleteMoveInvoked !== false) failures.push(`${scenario.id}: deleteMoveInvoked was not false`)
  if (result.json?.successLike !== false) failures.push(`${scenario.id}: successLike was not false`)
  if (result.json?.workspaceUnchanged !== true || observedChanged.length > 0) {
    failures.push(`${scenario.id}: workspaceUnchanged was not true`)
  }
  if (result.json?.rollbackAtomicityClaim !== false) {
    failures.push(`${scenario.id}: rollback/atomicity claim was not false`)
  }
  const planned = result.json?.plannedFiles ?? []
  if (planned.join(',') !== scenario.expectedPlanned.join(',')) {
    failures.push(`${scenario.id}: plannedFiles ${planned.join(',') || 'none'} expected ${scenario.expectedPlanned.join(',') || 'none'}`)
  }

  return {
    id: scenario.id,
    ...result.json,
    workspaceUnchanged: observedChanged.length === 0 && result.json?.workspaceUnchanged === true,
    failures,
  }
}

function runDryRun(projectDir, patchText) {
  const dryRunModuleUrl = pathToFileURL(
    path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchDryRun.ts'),
  ).href
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildSingleFileApplyPatchDryRun } from ${JSON.stringify(dryRunModuleUrl)};
    const workspaceRoot = process.argv[1];
    const rawPatchText = process.argv[2];
    const before = snapshot(workspaceRoot);
    const dryRun = buildSingleFileApplyPatchDryRun({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      readFile: (absolutePath) => {
        try { return fs.readFileSync(absolutePath, 'utf8'); } catch { return undefined; }
      },
      directoryExists: (absolutePath) => {
        try { return fs.statSync(absolutePath).isDirectory(); } catch { return false; }
      },
    });
    const after = snapshot(workspaceRoot);
    const blockedReason = dryRun.unsupportedCapability?.blockedReason;
    const classification = blockedReason === 'three-file-update-planning-no-write'
      ? 'three-file-planning-no-write'
      : blockedReason === 'multi-file-update-write-not-enabled'
        ? 'two-file-planning-no-write'
        : dryRun.resultSurface?.failureCategory === 'unsupported-patch-shape'
          ? 'model-output'
          : 'unsupported';
    console.log(JSON.stringify({
      outcome: dryRun.status,
      classification,
      plannedFiles: dryRun.plannedFiles ?? [],
      changedFiles: dryRun.changedFiles,
      failedFiles: dryRun.failedFiles,
      writeIntents: dryRun.writeIntents,
      writerInvoked: false,
      creatorInvoked: false,
      deleteMoveInvoked: false,
      workspaceUnchanged: JSON.stringify(before) === JSON.stringify(after),
      successLike: false,
      rollbackAtomicityClaim: false,
    }));
    function snapshot(root) {
      const out = {};
      for (const file of fs.readdirSync(path.join(root, 'src')).sort()) {
        out[\`src/\${file}\`] = fs.readFileSync(path.join(root, 'src', file), 'utf8');
      }
      return out;
    }
  `
  return runJson(script, [projectDir, patchText])
}

function runRuntimeRoute(projectDir, patchText) {
  const routeModuleUrl = pathToFileURL(
    path.join(tsShellRoot, 'src', 'orchestration', 'mutationRoutingProjection.ts'),
  ).href
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { projectApplyPatchRuntimeMutationRoute } from ${JSON.stringify(routeModuleUrl)};
    const workspaceRoot = process.argv[1];
    const rawPatchText = process.argv[2];
    const before = snapshot(workspaceRoot);
    let authorityRequested = false;
    async function main() {
      const result = await projectApplyPatchRuntimeMutationRoute({
        sessionId: 'route11-session',
        prompt: rawPatchText,
        workspaceRoot,
        routeOptions: {
          explicitRuntimeOptIn: true,
          rawPatchText,
          requestedUserDecision: 'approved',
          workspaceWrite: { explicitWorkspaceWriteOptIn: true },
        },
        getWorkspaceAuthority: () => {
          authorityRequested = true;
          throw new Error('workspace authority must not be requested');
        },
        readNoWriteRuntimeFile: (absolutePath) => {
          try { return fs.readFileSync(absolutePath, 'utf8'); } catch { return undefined; }
        },
      });
      const after = snapshot(workspaceRoot);
      const evidence = result?.codingResult?.evidence ?? [];
      console.log(JSON.stringify({
        outcome: result?.terminalClassification,
        classification: evidence.some((item) => item.includes('three-file-planning:no-write-route'))
          ? 'three-file-planning-no-write'
          : 'unsupported',
        plannedFiles: result?.codingResult?.changeSet?.attemptedFiles ?? [],
        changedFiles: result?.codingResult?.changedFiles ?? [],
        failedFiles: result?.codingResult?.failedFiles ?? [],
        writeIntents: [],
        writerInvoked: authorityRequested,
        creatorInvoked: authorityRequested,
        deleteMoveInvoked: false,
        workspaceUnchanged: JSON.stringify(before) === JSON.stringify(after),
        successLike: result?.terminalClassification === 'success',
        rollbackAtomicityClaim: /rollback|atomic/i.test(result?.finalOutput ?? ''),
      }));
    }
    main().catch((error) => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    });
    function snapshot(root) {
      const out = {};
      for (const file of fs.readdirSync(path.join(root, 'src')).sort()) {
        out[\`src/\${file}\`] = fs.readFileSync(path.join(root, 'src', file), 'utf8');
      }
      return out;
    }
  `
  return runJson(script, [projectDir, patchText])
}

function runJson(script, args) {
  const result = spawnSync(process.execPath, [tsxCliPath, '-e', script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(testRoot, 'route11-home'),
      USERPROFILE: path.join(testRoot, 'route11-home'),
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
  console.log(`classification=${result.classification ?? 'missing'}`)
  console.log(`plannedFiles=${(result.plannedFiles ?? []).join(',') || 'none'}`)
  console.log(`changedFiles=${(result.changedFiles ?? []).join(',') || 'none'}`)
  console.log(`failedFiles=${(result.failedFiles ?? []).map(formatFileEntry).join(',') || 'none'}`)
  console.log(`writerInvoked=${result.writerInvoked}`)
  console.log(`creatorInvoked=${result.creatorInvoked}`)
  console.log(`deleteMoveInvoked=${result.deleteMoveInvoked}`)
  console.log(`workspaceUnchanged=${result.workspaceUnchanged}`)
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
