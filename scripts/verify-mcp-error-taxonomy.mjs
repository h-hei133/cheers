#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runContractGateCli } from './support/contract.mjs'

export const contractSuites = [
  'src/core/mcp/errorTaxonomy.test.ts',
  'src/core/mcp/lifecycle.test.ts',
  'src/core/tools/mcpForwarding.test.ts',
  'src/core/mcp/transportHonesty.test.ts',
]
export const requiredAssertions = [
  {
    file: contractSuites[0],
    title: 'canonicalizes protocol diagnostics before redaction and safe report projection',
    count: 2,
  },
  { file: contractSuites[1], title: 'does not report connected for a process that never completes initialize' },
  { file: contractSuites[1], title: 'withdraws unavailable catalogs and refuses old registry calls before dispatch' },
  { file: contractSuites[1], title: 'refuses unknown tools before dispatch with an explicit unavailable classification' },
  { file: contractSuites[1], title: 'preserves tool errors and structured results, and marks unsupported content explicitly' },
  { file: contractSuites[2], title: 'carries a server-side error as a failure, not as a canned success' },
  { file: contractSuites[2], title: "answers a transport failure with the gateway's own next step" },
  { file: contractSuites[3], title: 'classifies the refusal as a configuration problem' },
]

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('surface=local-protocol-and-error-projection cli-entry-proof=not-covered real-provider=not-used')
  void runContractGateCli('mcp-error-taxonomy', contractSuites, requiredAssertions)
}
