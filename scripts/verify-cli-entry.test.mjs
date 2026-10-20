import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertJsonToolResult } from './verify-cli-entry.mjs'

function event(eventType, order, facts, toolCallId) {
  return {
    schemaVersion: 'run-event-stream.v1',
    eventType,
    order,
    facts,
    ...(toolCallId ? { toolCallId } : {}),
    truthfulness: {
      observationOnly: true,
      terminalSuccessClaim: false,
    },
  }
}

function result(events) {
  const stdout = events.map(value => JSON.stringify(value)).join('\n')
  return { code: 0, timedOut: false, stdout, stderr: '', output: stdout }
}

function validEvents() {
  return [
    event('approval.resolved', 8, { toolName: 'apply_patch', taskId: 'call-1', outcome: 'approved' }, 'call-1'),
    event('tool.result', 10, {
      toolName: 'apply_patch',
      taskId: 'call-1',
      success: true,
      output: 'committed',
      metadata: { files: [{ compensation: 'none' }] },
    }, 'call-1'),
    event('query.completed', 11, { result: { status: 'completed' } }),
  ]
}

test('accepts a correlated successful approval and tool result', () => {
  assert.equal(assertJsonToolResult(
    'test-valid',
    result(validEvents()),
    [],
    'apply_patch',
    ['committed'],
    1,
    true,
  ), true)
})

test('rejects a tool result that reports failure', () => {
  const events = validEvents()
  events[1].facts.success = false
  assert.equal(assertJsonToolResult(
    'test-failed',
    result(events),
    [],
    'apply_patch',
    ['committed'],
    1,
    true,
  ), false)
})

test('rejects approval ordering after the tool result', () => {
  const events = validEvents()
  events[0].order = 12
  assert.equal(assertJsonToolResult(
    'test-order',
    result(events),
    [],
    'apply_patch',
    ['committed'],
    1,
    true,
  ), false)
})

test('rejects approval and result call-id mismatch', () => {
  const events = validEvents()
  events[0].toolCallId = 'call-other'
  assert.equal(assertJsonToolResult(
    'test-correlation',
    result(events),
    [],
    'apply_patch',
    ['committed'],
    1,
    true,
  ), false)
})
