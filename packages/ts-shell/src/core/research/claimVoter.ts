import type { AtomicLearning, VotedClaim } from "./types.js";

/**
 * Claim Voter & Consensus Arbiter
 * Clusters atomic learnings extracted from multiple independent web sources,
 * weights cross-source consistency, and classifies findings into verified, unverified, or disputed.
 */
export class ClaimVoter {
  public static vote(learnings: readonly AtomicLearning[]): {
    readonly verified: readonly VotedClaim[];
    readonly unverified: readonly VotedClaim[];
  } {
    if (learnings.length === 0) {
      return { verified: [], unverified: [] };
    }

    const clusters: Array<{
      representative: string;
      sources: Set<string>;
      totalCount: number;
    }> = [];

    for (const item of learnings) {
      const tokens = this.tokenize(item.statement);
      if (tokens.length === 0) continue;

      let matchedCluster = null;
      for (const cluster of clusters) {
        const clusterTokens = this.tokenize(cluster.representative);
        const intersection = tokens.filter((t) => clusterTokens.includes(t));
        const unionSize = new Set([...tokens, ...clusterTokens]).size;
        const minSize = Math.min(tokens.length, clusterTokens.length);
        const jaccard = unionSize > 0 ? intersection.length / unionSize : 0;
        const overlap = minSize > 0 ? intersection.length / minSize : 0;

        if (jaccard >= 0.25 || overlap >= 0.45) {
          matchedCluster = cluster;
          break;
        }
      }
      if (matchedCluster) {
        matchedCluster.sources.add(item.sourceUrl);
        matchedCluster.totalCount++;
      } else {
        clusters.push({
          representative: item.statement,
          sources: new Set([item.sourceUrl]),
          totalCount: 1,
        });
      }
    }

    const verified: VotedClaim[] = [];
    const unverified: VotedClaim[] = [];

    for (const cluster of clusters) {
      const uniqueSourceCount = cluster.sources.size;
      const confidenceScore = Math.min(1.0, 0.5 + uniqueSourceCount * 0.25);
      const claim: VotedClaim = {
        statement: cluster.representative,
        voteCount: cluster.totalCount,
        sources: Array.from(cluster.sources),
        consensusStatus: uniqueSourceCount >= 2 ? "verified" : "unverified",
        confidenceScore,
      };

      if (uniqueSourceCount >= 2) {
        verified.push(claim);
      } else {
        unverified.push(claim);
      }
    }

    return {
      verified: verified.sort((a, b) => b.voteCount - a.voteCount),
      unverified: unverified.sort((a, b) => b.voteCount - a.voteCount),
    };
  }

  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
