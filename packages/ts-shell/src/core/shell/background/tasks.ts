/** Compatibility imports delegate to the owning local jobs domain. */
export { TaskRegistry } from '../../../workflow/jobs/local/registry.js';
export { backgroundTasks } from '../../../workflow/jobs/local/legacy.js';
export { renderTask, renderTaskNotice } from '../../../workflow/jobs/local/projection.js';
export type { BackgroundTask, BackgroundRunner } from '../../../workflow/jobs/local/model.js';
