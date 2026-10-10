import { TaskRegistry } from './registry.js';
import type { BackgroundRunner } from './model.js';

/** Unbound SDK compatibility. CLI tool calls supply their session owner explicitly. */
export const backgroundTasks: BackgroundRunner = {
  start: input => TaskRegistry.getShared().start(input),
  list: () => TaskRegistry.getShared().list(),
  get: id => TaskRegistry.getShared().get(id),
  stop: id => TaskRegistry.getShared().stop(id),
  onEnded: listener => TaskRegistry.getShared().onEnded(listener),
};
