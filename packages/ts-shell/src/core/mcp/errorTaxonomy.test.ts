import { expect, it } from 'vitest';
import { classifyMcpFailure, classifyUnknownMcpFailure, mcpFailureMetadata } from './errorTaxonomy.js';
import { mcpReport } from '../commands/mcp/report.js';

it.each(['sk-\x1b[31msyntheticSensitiveDiagnostic123456', 'pass\x1b[31mword=synthetic-sensitive-diagnostic'])
('canonicalizes protocol diagnostics before redaction and safe report projection', detail => {
  const failure = classifyMcpFailure({ failureClass: 'protocol', detail });
  const report = mcpReport({ clients: [{ name: 'fixture', type: 'failed', error: failure.safeDetail,
    config: { scope: 'project', transport: 'stdio' } }], tools: [] }, '/mcp-test');
  const result = JSON.stringify({ failure, metadata: mcpFailureMetadata(failure), report,
    unknown: classifyUnknownMcpFailure(new Error(detail)) });
  expect(result).toMatch(/\[(?:secret-)?redacted\]/);
  expect(result).not.toMatch(/synthetic-sensitive|syntheticSensitive|\\x1b|\\u001b/);
  expect(failure.failureClass).toBe('protocol'); expect(failure.failurePlane).toBe('protocol-level');
});
