import type { DeepResearchReport, VotedClaim } from "./types.js";

/**
 * Research Report Generator
 * Assembles a comprehensive, structured Markdown technical research report with full source citations.
 */
export class ResearchReportGenerator {
  public static generate(data: {
    topic: string;
    verifiedClaims: readonly VotedClaim[];
    unverifiedClaims: readonly VotedClaim[];
    sources: readonly string[];
    totalQueriesRun: number;
  }): DeepResearchReport {
    const {
      topic,
      verifiedClaims,
      unverifiedClaims,
      sources,
      totalQueriesRun,
    } = data;

    const lines: string[] = [
      `# Deep Technical Research Report: ${topic}`,
      "",
      `*Generated on ${new Date().toISOString()} via Deep Research Engine | ${totalQueriesRun} queries executed | ${sources.length} sources analyzed*`,
      "",
      "## 1. Executive Summary",
      `This report synthesizes findings from a multi-agent tree search on **"${topic}"**. Cross-source consistency voting was conducted across ${sources.length} independent technical documents, APIs, and release notes to filter out unverified claims and eliminate single-source hallucinations.`,
      "",
      "## 2. Key Findings (Cross-Verified Consensus)",
      "",
    ];

    if (verifiedClaims.length === 0) {
      lines.push("No cross-source consensus claims reached the multi-source verification threshold.");
    } else {
      verifiedClaims.forEach((claim, idx) => {
        lines.push(`### 2.${idx + 1}. ${claim.statement}`);
        lines.push(
          `- Carried by ${claim.sources.length} independent ${claim.sources.length === 1 ? "source" : "sources"}, in ${claim.voteCount} ${claim.voteCount === 1 ? "statement" : "statements"}`,
        );
        lines.push(`- **Citations**: ${claim.sources.map((s) => `\`${s}\``).join(", ")}`);
        lines.push("");
      });
    }

    if (unverifiedClaims.length > 0) {
      lines.push("## 3. Supplementary Observations (Single-Source / Needs Verification)");
      lines.push("");
      unverifiedClaims.slice(0, 5).forEach((claim, idx) => {
        lines.push(`- **Observation ${idx + 1}**: ${claim.statement} *(Source: \`${claim.sources[0]}\`)*`);
      });
      lines.push("");
    }

    lines.push("## 4. References & Sources");
    lines.push("");
    sources.forEach((url, idx) => {
      lines.push(`- [${idx + 1}] ${url}`);
    });
    lines.push("");

    const reportMarkdown = lines.join("\n");

    return {
      topic,
      executiveSummary: `Synthesized analysis on ${topic} across ${sources.length} sources.`,
      verifiedClaims,
      unverifiedClaims,
      sources,
      totalQueriesRun,
      reportMarkdown,
      generatedAt: Date.now(),
    };
  }
}
