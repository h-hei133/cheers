import type {
  DeepResearchOptions,
  DeepResearchReport,
  AtomicLearning,
  SerpQuery,
  ResearchProgressState,
} from "./types.js";
import { ClaimVoter } from "./claimVoter.js";
import { ResearchReportGenerator } from "./reportGenerator.js";
import { createWebSearchToolDefinition } from "../tools/webSearch.js";
import { createWebFetchToolDefinition } from "../tools/webFetch.js";
import { ParallelDispatcher } from "../workflow/parallelDispatcher.js";
import type { ToolExecutionContext } from "../../tools/types.js";

/**
 * Deep Researcher Core Engine
 * Coordinates recursive breadth x depth tree search, web searching, content extraction,
 * claim voting, and report generation.
 */
export class DeepResearcher {
  public static async research(options: DeepResearchOptions): Promise<DeepResearchReport> {
    const {
      topic,
      breadth = 3,
      depth = 2,
      maxConcurrency = 3,
      onProgress,
    } = options;

    const allLearnings: AtomicLearning[] = [];
    const allSources = new Set<string>();
    let totalQueriesExecuted = 0;

    const progress: ResearchProgressState = {
      currentDepth: depth,
      totalDepth: depth,
      currentBreadth: breadth,
      totalBreadth: breadth,
      totalQueries: 0,
      completedQueries: 0,
    };

    const updateProgress = (partial: Partial<ResearchProgressState>): void => {
      Object.assign(progress, partial);
      onProgress?.(progress);
    };

    // Recursive search tree function
    const exploreBranch = async (
      currentTopic: string,
      currentDepth: number,
      currentBreadth: number,
    ): Promise<void> => {
      if (currentDepth <= 0) return;

      // 1. Generate orthogonal SERP queries
      const serpQueries = this.generateSerpQueries(currentTopic, currentBreadth);
      totalQueriesExecuted += serpQueries.length;
      updateProgress({
        totalQueries: totalQueriesExecuted,
        currentDepth,
        currentBreadth,
      });
      // 2. Execute searches concurrently in bounded pool
      const searchTool = createWebSearchToolDefinition();
      const fetchTool = createWebFetchToolDefinition();
      const mockContext: ToolExecutionContext = {
        taskId: "deep-research-task",
        workspaceRoot: process.cwd(),
      };
      const searchThunks = serpQueries.map((sq) => async (): Promise<void> => {
        updateProgress({ currentQuery: sq.query });

        try {
          const searchResult = await searchTool.execute({ query: sq.query, numResults: 3 }, mockContext);
          const searchRaw = searchResult.output || "";
          const urls = this.extractUrlsFromSearch(searchRaw);

          // 3. Fetch top result pages and extract learnings
          for (const url of urls) {
            allSources.add(url);
            try {
              const fetchResult = await fetchTool.execute({ url }, mockContext);
              const fetchRaw = fetchResult.output || "";
              const learnings = this.extractLearningsFromContent(fetchRaw, url);
              allLearnings.push(...learnings);
            } catch {
              // Graceful degradation on fetch errors
            }
          }
        } catch {
          // Graceful degradation on search errors
        }

        updateProgress({
          completedQueries: progress.completedQueries + 1,
        });
      });

      await ParallelDispatcher.run(searchThunks, { maxConcurrency });

      // 4. If depth remains, spawn next depth level
      if (currentDepth - 1 > 0 && allLearnings.length > 0) {
        const nextBreadth = Math.max(1, Math.ceil(currentBreadth / 2));
        const subTopics = allLearnings.slice(-nextBreadth).map((l) => l.statement);
        for (const sub of subTopics) {
          await exploreBranch(sub, currentDepth - 1, nextBreadth);
        }
      }
    };

    // Begin root exploration
    await exploreBranch(topic, depth, breadth);

    // 5. Consensus voting on collected claims
    const { verified, unverified } = ClaimVoter.vote(allLearnings);

    // 6. Generate structured cited report
    return ResearchReportGenerator.generate({
      topic,
      verifiedClaims: verified,
      unverifiedClaims: unverified,
      sources: Array.from(allSources),
      totalQueriesRun: totalQueriesExecuted,
    });
  }

  private static generateSerpQueries(topic: string, count: number): SerpQuery[] {
    const queries: SerpQuery[] = [
      {
        query: `${topic} official documentation architecture best practices`,
        researchGoal: "Discover official specifications and core architecture",
      },
    ];

    if (count > 1) {
      queries.push({
        query: `${topic} implementation comparison tradeoffs benchmark`,
        researchGoal: "Evaluate trade-offs and performance considerations",
      });
    }

    if (count > 2) {
      queries.push({
        query: `${topic} common pitfalls issues breaking changes`,
        researchGoal: "Identify real-world issues, breaking changes, and bugs",
      });
    }

    return queries.slice(0, count);
  }

  private static extractUrlsFromSearch(searchOutput: string): string[] {
    const urls: string[] = [];
    const matches = searchOutput.match(/https?:\/\/[^\s)"]+/g) || [];
    for (const raw of matches) {
      const clean = raw.replace(/[.,;:)\]>]+$/, "");
      if (!urls.includes(clean) && clean.startsWith("http")) {
        urls.push(clean);
      }
    }
    return urls.slice(0, 3);
  }

  private static extractLearningsFromContent(content: string, url: string): AtomicLearning[] {
    if (!content || !content.trim()) return [];

    // Split by punctuation sentences and clean markdown noise
    const sentences = content
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Clean markdown links
      .replace(/[`*_~#]/g, "") // Clean markdown formatting
      .split(/(?<=[.!?。！？\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => {
        // Must be a substantive informational sentence
        if (s.length < 25 || s.length > 250) return false;
        if (/^(cookie|subscribe|login|sign in|privacy|terms|copyright|all rights reserved)/i.test(s)) return false;
        return true;
      });

    return sentences.slice(0, 5).map((statement, idx) => ({
      id: `learning_${Math.random().toString(36).slice(2, 8)}_${idx}`,
      statement,
      sourceUrl: url,
      confidence: 0.85,
    }));
  }
}
