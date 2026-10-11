#!/usr/bin/env node
import { runContractGate } from './support/contract.mjs'

// Current owner suites include actual execution, rejection and durable-state assertions.
// Every suite and assertion must execute; an empty or skipped selection cannot pass.
const suites = [
  'src/turn/session.test.ts',
  'src/turn/retry.test.ts',
  'src/turn/tools.test.ts',
  'src/turn/pendingInput.test.ts',
  'src/turn/completion.test.ts',
  'src/core/tools/mcpForwarding.test.ts',
  'src/entrypoints/cliRuntimeInvocation.test.ts',
  'src/cli/runtime/cliRuntimeInvocationBridge.test.ts',
]
runContractGate('query-orchestration', suites).catch(error => {
  console.error(error.message); process.exitCode = 1
})
