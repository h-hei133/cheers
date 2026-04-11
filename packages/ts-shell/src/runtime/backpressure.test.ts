import { describe, expect, it } from 'vitest'
import { createBackpressureController } from './backpressure.js'

describe('backpressure controller', () => {
  it('rejects work above the configured limit', async () => {
    const controller = createBackpressureController(1)

    let release!: () => void
    const first = controller.run(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )

    await expect(controller.run(async () => 'second')).rejects.toThrow('Backpressure limit reached')

    release()
    await first
  })

  it('releases capacity after work finishes', async () => {
    const controller = createBackpressureController(1)
    await controller.run(async () => 'ok')
    await expect(controller.run(async () => 'next')).resolves.toBe('next')
    expect(controller.snapshot()).toEqual({ active: 0, limit: 1 })
  })
})
