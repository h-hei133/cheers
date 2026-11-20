import type { DesktopErrorCode } from '../api.d.ts';

export class DesktopError extends Error {
  constructor(readonly code: DesktopErrorCode, message: string) {
    super(message);
    this.name = 'DesktopError';
  }
}
