import type { ProjectMemoryStore, ProjectMemoryStoreHealth } from "../projectMemoryStoreContract.js";

export async function readProjectMemoryHealth(
  store: ProjectMemoryStore | undefined,
  evidenceSource = "project-memory-store",
): Promise<ProjectMemoryStoreHealth> {
  return store ? store.health() : {
    mode: "disabled",
    ok: true,
    readable: false,
    writable: false,
    detail: "No explicit local memory store configured.",
    evidence: [`${evidenceSource}:store-disabled`, `${evidenceSource}:no-default-path`],
  };
}

/** Store capability is independent of whether the current command wrote anything. */
export function renderProjectMemoryHealth(health?: ProjectMemoryStoreHealth): readonly string[] {
  const readable = health && (health.readable ?? health.writable);
  const access = !health ? "not checked" : readable ? "available on explicit request" : "unavailable (store not readable)";
  return [
    `- Store mode: ${health?.mode ?? "not checked"}`,
    `- Store readable: ${!health ? "not checked" : readable ? "yes" : "no"}`,
    `- Store writable: ${!health ? "not checked" : health.writable ? "yes" : "no"}`,
    `- Store health: ${!health ? "not checked" : health.ok ? "ok" : "degraded"}`,
    ...(health ? [`- Store detail: ${health.detail}`] : []),
    ...(health?.diagnostics ?? []).map((diagnostic) => `- Warning: ${diagnostic}`),
    `- Retrieval / wake-up / recall: ${access}`,
    `- Future-turn injection: ${readable ? "explicit staged use only (/memory use)" : access}`,
  ];
}
