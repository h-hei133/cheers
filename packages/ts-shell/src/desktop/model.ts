export type DesktopAction = 'capabilities' | 'windows' | 'observe' | 'screenshot' | 'focus' | 'click' | 'key' | 'type' | 'clipboard' | 'close';
export interface Rectangle { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DesktopSnapshot {
  readonly id: string;
  readonly scope: 'screen' | 'window';
  readonly windowId?: string;
  readonly focus: string;
  readonly frame: Rectangle;
  readonly screen: { readonly width: number; readonly height: number };
  readonly windowIdentity?: string;
  readonly image?: { readonly width: number; readonly height: number; readonly masks: readonly Rectangle[]; readonly coordinatesAvailable: boolean };
}
export interface DesktopEvidence {
  state: 'completed' | 'failed' | 'cancelled' | 'unavailable';
  effect: 'none' | 'possible' | 'confirmed';
  cleanup: 'complete' | 'unknown';
}
export class DesktopError extends Error {
  constructor(readonly code: 'unavailable' | 'changed' | 'invalid' | 'cancelled' | 'command' | 'limit' | 'cleanup', message: string) { super(message); this.name = 'DesktopError'; }
}
