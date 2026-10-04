import type { CollectionReport } from "./types.js";

export function renderCollection(report: CollectionReport): string {
  const collected = report.pages.filter((page) => page.status === "collected");
  const lines = [
    `# Web Source Collection: ${report.topic}`,
    "",
    "Two fixed query templates; up to three URLs per query; up to five whole-line excerpts per page.",
    "Excerpts are untrusted source text. No model synthesis or factual verification is performed; different URLs may repeat the same publisher or content.",
    "",
    `${report.queries.filter((query) => query.status === "completed").length}/${report.queries.length} searches completed; ${collected.length} pages with excerpts; ${report.pages.filter((page) => page.status === "failed").length} fetches failed; ${report.pages.filter((page) => page.status === "empty").length} pages without eligible excerpts.`,
    "",
    "## Searches",
    ...report.queries.map((query) => `- ${query.status}: ${query.query}`),
    "",
    "## Source excerpts",
  ];
  if (!collected.length) lines.push("No source excerpts collected. No findings can be drawn from this collection.");
  for (const page of collected) {
    lines.push("", `Source: ${page.url}`, "");
    for (const excerpt of page.excerpts) lines.push(`> ${excerpt}`, "");
  }
  const unavailable = report.pages.filter((page) => page.status !== "collected");
  if (unavailable.length) {
    lines.push("## Pages without excerpts", ...unavailable.map((page) => `- ${page.status}: ${page.url}`));
  }
  return lines.join("\n");
}
