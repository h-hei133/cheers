#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runContractGateCli } from './support/contract.mjs'
export { verifyContractReport } from './support/contract.mjs'

export const contractSuites = [
  'src/result/terminal/truth.test.ts',
  'src/turn/session.test.ts',
  'src/core/shell/sessionRuntime.test.ts',
  'src/core/shell/providerReadiness.test.ts',
  'src/cli/interactive/turnSink.test.ts',
  'src/cli/print/result.test.ts',
]

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runContractGateCli('result-contract', contractSuites)
}
