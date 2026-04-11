export interface BackpressureController {
  run<T>(operation: () => Promise<T>): Promise<T>
  snapshot(): { active: number; limit: number }
}

export function createBackpressureController(limit: number): BackpressureController {
  let active = 0

  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        throw new Error(`Backpressure limit reached (${limit})`)
      }

      active += 1
      try {
        return await operation()
      } finally {
        active -= 1
      }
    },
    snapshot() {
      return { active, limit }
    },
  }
}
