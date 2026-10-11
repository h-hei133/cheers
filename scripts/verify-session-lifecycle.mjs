#!/usr/bin/env node
import { runContractGate } from './support/contract.mjs'

// Current owner suites include actual execution, rejection and durable-state assertions.
// Every suite and assertion must execute; an empty or skipped selection cannot pass.
const suites = [
  'src/session/SessionManager.test.ts',
  'src/session/replay/builder.test.ts',
  'src/session/replay/sessionReplayFacade.test.ts',
  'src/core/shell/bootstrap.test.ts',
  'src/cli/runtime/navigation.test.ts',
  'src/cli/runtime/shutdown.test.ts',
  'src/cli/runtime/inputStream.test.ts',
]
runContractGate('session-lifecycle', suites).catch(error => {
  console.error(error.message); process.exitCode = 1
})
