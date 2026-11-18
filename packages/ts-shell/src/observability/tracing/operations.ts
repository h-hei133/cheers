import type { TelemetrySpan } from './types.js';

export const RESPONSE_ACCEPTED = 'response.accepted';

type Outcome = 'settled' | 'aborted' | 'error';

interface Operations {
  'session.run': {
    start: { sessionId: string; workspaceRoot: string };
    end: { outcome: Outcome; steps: number };
    events: Record<never, never>;
  };
  'provider.request': {
    start: { requestId: string; purpose: string; usage: 'unknown' };
    end: { usage: 'reported' | 'partial'; endpoint: string; prepared: boolean;
      inputCount: number; outputCount: number; outcome: Outcome; stopReason: string };
    events: { [RESPONSE_ACCEPTED]: { endpoint: string } };
  };
  'tool.execute': {
    start: { tool: string; toolCallId: string; requestId?: string };
    end: { outcome: Outcome };
    events: Record<never, never>;
  };
}

export type OperationName = keyof Operations;

export interface OperationOptions<Name extends OperationName> {
  readonly name: Name;
  readonly attributes?: Operations[Name]['start'];
}

export type OperationSpan<Name extends OperationName> = Omit<TelemetrySpan, 'addEvent' | 'setAttributes'> & {
  setAttributes(attributes: Partial<Operations[Name]['end']>): void;
  addEvent<Event extends keyof Operations[Name]['events']>(name: Event, attributes: Operations[Name]['events'][Event]): void;
};
