#!/usr/bin/env node
import { runContractGateCli } from './support/contract.mjs'

// Current owner suites include actual execution, rejection and durable-state assertions.
// Every suite and assertion must execute; an empty or skipped selection cannot pass.
const suites = [
  'src/sandbox/workspace.test.ts',
  'src/sandbox/osSandbox.test.ts',
  'src/turn/workspace.test.ts',
  'src/turn/fileAccess.test.ts',
  'src/turn/tools.test.ts',
  'src/core/tools/readFreshness.test.ts',
  'src/core/tools/editEngine.test.ts',
  'src/core/query/toolPolicy.test.ts',
]
void runContractGateCli('workspace-safety', suites)
