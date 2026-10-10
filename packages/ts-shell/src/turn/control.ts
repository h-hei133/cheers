import type { AgentEventListener } from '../core/agent/events.js';
import type { ThinkingPreference } from '../core/models/effort.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { ToolDefinition } from '../tools/types.js';
import type { StepFunction } from './step.js';

/** A feature can select a step while the ordinary turn retains tools, input and persistence. */
export interface StepControl {
  readonly step: StepFunction;
  readonly observe: AgentEventListener;
}
export type StepControlFactory = (host: {
  readonly step: StepFunction;
  readonly forModel: (model: string, admission?: () => string | undefined, effort?: ThinkingPreference, providerScope?: 'current') => StepFunction;
  readonly tools: ReadonlyMap<string, ToolDefinition>;
  readonly hooks: HookDispatcher;
}) => StepControl;
