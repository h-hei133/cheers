import { describe, expect, it } from 'vitest'
import { ShellStateMachine } from './stateMachine.js'

describe('shell state machine (W5)', () => {
  it('moves through idle -> running -> idle', () => {
    const machine = new ShellStateMachine()
    expect(machine.getState()).toBe('idle')
    machine.startRun()
    expect(machine.getState()).toBe('running')
    machine.completeRun()
    expect(machine.getState()).toBe('idle')
  })

  it('tracks interrupted, error, and terminated states explicitly', () => {
    const machine = new ShellStateMachine()
    machine.startRun()
    machine.interruptRun()
    expect(machine.getState()).toBe('interrupted')
    machine.failRun()
    expect(machine.getState()).toBe('error')
    machine.terminate()
    expect(machine.getState()).toBe('terminated')
  })
})
