import { listWorkflowNames, readWorkflow } from "../../../core/workflow/definition.js";
import { DAGResolver } from "../../../core/workflow/dagResolver.js";
import { projectTrust } from "../../../core/security/projectTrust.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export function workflowCatalog(root: string): readonly Suggestion[] {
  if (projectTrust.isProjectUntrusted(root)) throw new Error("Workflow catalog unavailable");
  return listWorkflowNames(root).slice(0, 5000).flatMap(name => {
    const result = readWorkflow(root, name);
    if ("error" in result) return [];
    const resolution = DAGResolver.resolve(result.workflow.steps.map(step => ({ id: step.id, name: step.id, dependencies: step.needs, status: "pending" as const })));
    if (!resolution.isValid) return [];
    return [{ value: name, label: result.workflow.name, detail: result.workflow.description ?? `${result.workflow.steps.length} steps` }];
  });
}
