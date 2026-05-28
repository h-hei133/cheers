import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const childProcessOwners = new Set([
  'packages/ts-shell/src/daemon/client.ts',
  'packages/ts-shell/src/workflow/gitContext.ts',
  'packages/ts-shell/src/core/mcp/client.ts',
  'packages/ts-shell/src/core/commands/openaiAccountAuth.ts',
  'packages/ts-shell/src/core/commands/browserAuthOnboarding.ts',
  'packages/ts-shell/src/core/context/browserSkillExecutionExecutor.ts',
  'packages/ts-shell/src/core/context/browserExternalRunnerProcess.ts',
  'packages/ts-shell/src/core/context/browserRuntimeProcessAdapter.ts',
])

const fsMutationOwners = new Set([
  'packages/ts-shell/src/runtime/execution/executionService.ts',
  'packages/ts-shell/src/sandbox/auditTrail.ts',
  'packages/ts-shell/src/config/runtimeConfig.ts',
  'packages/ts-shell/src/edit/discoveryEditRuntimeStage.ts',
  'packages/ts-shell/src/edit/fencedEditRuntimeStage.ts',
  'packages/ts-shell/src/edit/multifile/mixedFileOperationWriter.ts',
  'packages/ts-shell/src/orchestration/fencedEditRoute.ts',
  'packages/ts-shell/src/orchestration/proposalHunkSetRoute.ts',
  'packages/ts-shell/src/orchestration/controlledMultifileProofChain.ts',
  'packages/ts-shell/src/orchestration/verificationRepairFlow.ts',
  'packages/ts-shell/src/orchestration/verificationRepairIterationFlow.ts',
  'packages/ts-shell/src/orchestration/realTaskLoopRuntime.ts',
  'packages/ts-shell/src/orchestration/realTaskLoopFixture.ts',
  'packages/ts-shell/src/orchestration/realTaskLoopRepairChain.ts',
  'packages/ts-shell/src/orchestration/mutationRoutingProjection.ts',
  'packages/ts-shell/src/orchestration/planningRuntimeProductExecution.ts',
  'packages/ts-shell/src/orchestration/targetSetEditRoute.ts',
  'packages/ts-shell/src/orchestration/exactHunkApply.ts',
  'packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts',
  'packages/ts-shell/src/orchestration/patchApplication/multiFileUpdateApply.ts',
  'packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts',
  'packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts',
  'packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts',
  'packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts',
  'packages/ts-shell/src/orchestration/patchResult/workspaceCreateRoute.ts',
  'packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts',
  'packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts',
  'packages/ts-shell/src/orchestration/patchResult/isolatedWriteLane.ts',
  'packages/ts-shell/src/orchestration/patchResult/productionWriteLane.ts',
  'packages/ts-shell/src/orchestration/patchResult/productionRoute.ts',
  'packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts',
  'packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts',
  'packages/ts-shell/src/core/shell/approvalTrustPolicy.ts',
  'packages/ts-shell/src/core/context/projectMemoryLocalStore.ts',
  'packages/ts-shell/src/core/context/startupWarmContextHealth.ts',
  'packages/ts-shell/src/core/context/browserSelfHealingManifestPatchWriter.ts',
  'packages/ts-shell/src/core/context/browserReceiptCacheRecovery.ts',
  'packages/ts-shell/src/core/context/browserReceiptCacheLock.ts',
  'packages/ts-shell/src/core/context/browserReceiptCacheStore.ts',
  'packages/ts-shell/src/session/transcript/sessionTranscript.ts',
  'packages/ts-shell/src/session/store/sessionStore.ts',
  'packages/ts-shell/src/session/store/sessionFileStore.ts',
  'packages/ts-shell/src/session/store/sessionFileLayout.ts',
  'packages/ts-shell/src/session/store/currentSessionRegistry.ts',
])

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.rs', '.py'])
const failures = []

const productionTsFiles = await listFiles(path.join(root, 'packages/ts-shell/src'), file => {
  const relative = toRelative(file)
  return (
    (relative.endsWith('.ts') || relative.endsWith('.tsx')) &&
    !relative.endsWith('.test.ts') &&
    !relative.endsWith('.test.tsx') &&
    !relative.includes('/__tests__/') &&
    !relative.includes('/test-utils/') &&
    !relative.includes('/core/harness/') &&
    !relative.includes('/fixtures/')
  )
})

for (const file of productionTsFiles) {
  const relative = toRelative(file)
  const content = await fs.readFile(file, 'utf8')

  if (importsChildProcess(content) && !childProcessOwners.has(relative)) {
    failures.push(`${relative}: direct child_process import is outside sanctioned execution owners`)
  }

  if (usesFsMutation(content) && !fsMutationOwners.has(relative)) {
    failures.push(`${relative}: direct fs mutation is outside sanctioned file/workspace owners`)
  }

  if (/packages\/python-eval|@private-agents\/python-eval|\.\.\/.*python-eval/.test(content)) {
    failures.push(`${relative}: production runtime must not import python-eval`)
  }

  if (importsForbiddenProjectSurface(content)) {
    failures.push(`${relative}: production runtime must not import docs/scripts/dev-history/route reports`)
  }
}

const contractFiles = await listFiles(path.join(root, 'contracts'), file => {
  const ext = path.extname(file)
  return sourceExtensions.has(ext)
})

for (const file of contractFiles) {
  const relative = toRelative(file)
  const content = await fs.readFile(file, 'utf8')
  if (/packages\/ts-shell|packages\/rust-core|packages\/python-eval|@private-agents\/ts-shell|@private-agents\/rust-core|@private-agents\/python-eval/.test(content)) {
    failures.push(`${relative}: contracts must not depend on runtime package modules`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`Execution boundary check failed:\n${failures.map(item => `- ${item}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write([
    'Execution boundary check passed.',
    `production files scanned: ${productionTsFiles.length}`,
    `contracts files scanned: ${contractFiles.length}`,
    `child_process owners: ${childProcessOwners.size}`,
    `fs mutation owners: ${fsMutationOwners.size}`,
  ].join('\n') + '\n')
}

async function listFiles(start, include) {
  const result = []
  await walk(start)
  return result

  async function walk(current) {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return
      }
      throw error
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') {
          continue
        }
        await walk(full)
        continue
      }
      if (entry.isFile() && include(full)) {
        result.push(full)
      }
    }
  }
}

function toRelative(file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function importsChildProcess(content) {
  return /from\s+['"]node:child_process['"]|from\s+['"]child_process['"]|require\(['"]node:child_process['"]\)|require\(['"]child_process['"]\)/.test(content)
}

function usesFsMutation(content) {
  return /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync|mkdir|mkdirSync|rename|renameSync|copyFile|copyFileSync|createWriteStream)\s*\(/.test(content)
}

function importsForbiddenProjectSurface(content) {
  const importLines = content
    .split(/\r?\n/)
    .filter(line => /\bimport\b|\brequire\(/.test(line))
    .join('\n')
  return /(?:^|['"/])(?:docs|scripts|dev-history|route-reports)(?:['"/])/.test(importLines)
}
