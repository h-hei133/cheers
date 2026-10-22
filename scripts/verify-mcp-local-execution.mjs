#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runContractGateCli } from './support/contract.mjs'

export const contractSuites = [
  'src/core/mcp/lifecycle.test.ts',
  'src/core/tools/mcpForwarding.test.ts',
  'src/core/mcp/transportHonesty.test.ts',
]
export const requiredAssertions = [
  { file: contractSuites[0], title: 'handshakes once, paginates, and reuses one process across snapshots and calls' },
  { file: contractSuites[0], title: 'does not replay a call after disconnect and reconnects for a subsequent request' },
  { file: contractSuites[0], title: 'rejects an old registry contract after refresh without calling the replacement tool' },
  { file: contractSuites[0], title: 'withdraws unavailable catalogs and refuses old registry calls before dispatch' },
  { file: contractSuites[0], title: 'refuses unknown tools before dispatch with an explicit unavailable classification' },
  { file: contractSuites[0], title: 'preserves tool errors and structured results, and marks unsupported content explicitly' },
  { file: contractSuites[0], title: 'cancels outstanding discovery and rejects queued writes when shutdown starts' },
  { file: contractSuites[0], title: 'does not retain cancellation callbacks for settled requests' },
  { file: contractSuites[1], title: 'carries a server-side error as a failure, not as a canned success' },
  { file: contractSuites[1], title: "answers a transport failure with the gateway's own next step" },
  { file: contractSuites[2], title: 'fails at connect instead of reporting a connection' },
]

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('surface=local-stdio-and-tool-registry cli-entry-proof=not-covered real-provider=not-used')
  void runContractGateCli('mcp-local-execution', contractSuites, requiredAssertions)
}
