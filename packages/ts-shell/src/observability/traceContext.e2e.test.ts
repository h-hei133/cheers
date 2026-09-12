import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createComponentLogger } from './structuredLogger.js'
import { safeRemoveDir } from '../test-utils/cleanup.js'
import {
  createTraceContext,
  resetTraceContext,
  setGlobalTraceContext,
} from './traceContext.js'
import { setStructuredLogSink, type StructuredLogEntry } from './structuredLogger.js'

describe('observability integration', () => {
  const workspaceRoot = path.join(os.tmpdir(), 'private-agents-observability')
  let captured: StructuredLogEntry[] = []

  beforeEach(async () => {
    captured = []
    resetTraceContext()
    setGlobalTraceContext(createTraceContext())
    setStructuredLogSink(entry => captured.push(entry))
    await safeRemoveDir(workspaceRoot)
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'package.json'), '{"name":"obs"}', 'utf8')
  })

  afterEach(async () => {
    setStructuredLogSink(null)
    resetTraceContext()
    await safeRemoveDir(workspaceRoot)
  })

  it('redacts secrets from emitted logs', () => {
    const logger = createComponentLogger('provider-client')
    logger.info('using api key sk_12345678901234567890', {
      authorization: 'Bearer abc.def.ghi',
    })

    expect(captured).toHaveLength(1)
    expect(captured[0].message).toContain('[REDACTED]')
    expect(captured[0].fields.authorization).toBe('[REDACTED]')
  })
})
