export type ShellState = 'idle' | 'running' | 'interrupted' | 'error' | 'terminated'

export class ShellStateMachine {
  private state: ShellState = 'idle'

  getState(): ShellState {
    return this.state
  }

  startRun(): void {
    this.state = 'running'
  }

  completeRun(): void {
    this.state = 'idle'
  }

  interruptRun(): void {
    this.state = 'interrupted'
  }

  failRun(): void {
    this.state = 'error'
  }

  terminate(): void {
    this.state = 'terminated'
  }
}
