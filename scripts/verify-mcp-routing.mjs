#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runContractGateCli } from './support/contract.mjs'

export const contractSuites = [
  'src/core/mcp/gateway.test.ts',
  'src/core/mcp/lifecycle.test.ts',
  'src/core/tools/mcpForwarding.test.ts',
  'src/core/tools/prefilter.test.ts',
  'src/core/commands/slashRouter.test.ts',
]
export const requiredAssertions = [
  { file: contractSuites[0], title: 'loads user and project MCP configs into scoped configs' },
  { file: contractSuites[0], title: 'invalidates cached clients when reconnect reveals auth is now required' },
  { file: contractSuites[0], title: 'honors an already-aborted signal before MCP discovery' },
  { file: contractSuites[0], title: 'rejects a queued snapshot promptly without starting discovery after cancellation' },
  { file: contractSuites[1], title: 'rejects an old registry contract after refresh without calling the replacement tool' },
  { file: contractSuites[1], title: 'withdraws unavailable catalogs and refuses old registry calls before dispatch' },
  { file: contractSuites[2], title: 'forwards the call to the gateway and returns its content' },
  { file: contractSuites[3], title: 'still withholds MCP tools when MCP is off, even if named' },
  { file: contractSuites[4], title: 'hides /mcp when MCP command exposure is disabled' },
]

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runContractGateCli('mcp-routing', contractSuites, requiredAssertions)
}
