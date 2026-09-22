import { describe, it, expect } from "vitest";
import { ClaimVoter } from "./claimVoter.js";
import { ResearchReportGenerator } from "./reportGenerator.js";
import { DeepResearcher } from "./deepResearcher.js";
import { runDeepResearchCommand } from "../commands/deepResearchCommandRuntime.js";
import { routeSlashCommand } from "../commands/slashRouter.js";
import type { AtomicLearning } from "./types.js";

describe("Deep Research Engine & Command Test Suite", () => {
  describe("ClaimVoter (Cross-Source Consensus)", () => {
    it("classifies claims supported by 2+ independent sources as verified", () => {
      const learnings: AtomicLearning[] = [
        {
          id: "l1",
          statement: "Node.js v22 introduces WebSocket client globally",
          sourceUrl: "https://nodejs.org/v22",
        },
        {
          id: "l2",
          statement: "Node.js 22 now includes global WebSocket client enabled by default",
          sourceUrl: "https://developer.mozilla.org/nodejs22",
        },
        {
          id: "l3",
          statement: "Some unverified isolated single-source claim",
          sourceUrl: "https://random-blog.com/post",
        },
      ];

      const { verified, unverified } = ClaimVoter.vote(learnings);

      expect(verified.length).toBe(1);
      expect(verified[0].consensusStatus).toBe("verified");
      expect(verified[0].sources.length).toBe(2);
      // A count of sources is what is known. The percentage that used to be here
      // was `0.5 + sources * 0.25`, so two agreeing pages read as 100% confidence.
      expect(verified[0].voteCount).toBeGreaterThanOrEqual(2);

      expect(unverified.length).toBe(1);
      expect(unverified[0].consensusStatus).toBe("unverified");
    });
  });

  describe("ResearchReportGenerator", () => {
    it("renders a structured markdown report with citations and executive summary", () => {
      const report = ResearchReportGenerator.generate({
        topic: "Node.js v22 Features",
        verifiedClaims: [
          {
            statement: "WebSocket client is globally enabled",
            voteCount: 2,
            sources: ["https://nodejs.org", "https://mdn.org"],
            consensusStatus: "verified",
          },
        ],
        unverifiedClaims: [],
        sources: ["https://nodejs.org", "https://mdn.org"],
        totalQueriesRun: 3,
      });

      expect(report.reportMarkdown).toContain("# Deep Technical Research Report: Node.js v22 Features");
      expect(report.reportMarkdown).toContain("1. Executive Summary");
      expect(report.reportMarkdown).toContain("2. Key Findings (Cross-Verified Consensus)");
      expect(report.reportMarkdown).toContain("Carried by 2 independent sources, in 2 statements");
      expect(report.reportMarkdown).toContain("## 4. References & Sources");
      expect(report.reportMarkdown).toContain("- [1] https://nodejs.org");
    });
  });

  describe("DeepResearcher", () => {
    it("runs recursive tree search and tracks progress state", async () => {
      const progressSnapshots: number[] = [];

      const report = await DeepResearcher.research({
        topic: "Rust WASI WebAssembly Threads 2026",
        breadth: 2,
        depth: 1,
        maxConcurrency: 2,
        onProgress: (progress) => {
          progressSnapshots.push(progress.totalQueries);
        },
      });

      expect(report.topic).toBe("Rust WASI WebAssembly Threads 2026");
      expect(report.totalQueriesRun).toBeGreaterThan(0);
      expect(progressSnapshots.length).toBeGreaterThan(0);
    });
  });

  describe("/deep-research Slash Command & Router", () => {
    it("renders usage help when invoked without arguments", async () => {
      const res = await runDeepResearchCommand([], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("# Deep Technical Research (/deep-research)");
      expect(res.output).toContain("Usage:");
    });

    it("executes deep research and routes via slashRouter", async () => {
      const routed = await routeSlashCommand("/deep-research SQLite FTS5 Indexing", {
        cwd: process.cwd(),
      });

      expect(routed?.kind).toBe("local");
      if (routed?.kind === "local") {
        expect(routed.output).toContain("Deep Technical Research Report");
      }
    });
  });
});
