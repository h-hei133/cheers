import { DAGResolver as Resolver } from './graph.js';
import { ParallelDispatcher as Dispatcher } from './dispatch.js';

const workflow = { DAGResolver: Resolver, ParallelDispatcher: Dispatcher } satisfies typeof import('../api.d.ts');
export const { DAGResolver, ParallelDispatcher } = workflow;
