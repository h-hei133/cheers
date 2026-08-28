import type { RuntimeProjectionEvent } from "../../../runtime/events/projection.js";
import type { ProductSurfaceSection } from "./types.js";

export function eventSections(
  events: readonly RuntimeProjectionEvent[] = [],
): readonly ProductSurfaceSection[] {
  if (events.length === 0) {
    return [];
  }

  const toolEvents = events.filter((e) => e.type.startsWith("tool-"));
  if (toolEvents.length === 0) {
    return [];
  }

  return [
    {
      kind: "events",
      title: "Observed Runtime Events",
      severity: "info",
      status: "observed",
      summary: `Observed ${toolEvents.length} runtime event(s).`,
      facts: toolEvents.slice(0, 10).map((e) => ({
        label: e.type,
        value: e.id,
        machineEventCorrelationId: e.id,
      })),
      redaction: "none",
      notProvenClaims: ["events-observed-not-verified"],
      sourceEvidenceIds: toolEvents.map((e) => e.id).filter(Boolean),
      machineEventCorrelationIds: toolEvents.map((e) => e.id).filter(Boolean),
    },
  ];
}
