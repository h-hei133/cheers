import { describe, expect, it, vi } from "vitest";
import { fanOutProposals, type ProposalRequest } from "./fanOut.js";

/**
 * Independent proposals, run together.
 *
 * Two things matter: every proposer is asked the same question and nothing
 * else, and a failure is reported per proposer rather than dissolving the
 * batch or entering convergence as an empty claim.
 */

const requests: readonly ProposalRequest[] = [
  { id: "a", prompt: "Why is the build slow?", perspective: "profile first" },
  { id: "b", prompt: "Why is the build slow?", perspective: "read the config first" },
];

describe("fanning out proposals", () => {
  it("gives every proposer the same prompt and only its own perspective", async () => {
    const seen: ProposalRequest[] = [];
    await fanOutProposals(requests, async request => {
      seen.push(request);
      return `claim from ${request.id}`;
    });

    expect(seen.map(request => request.prompt)).toEqual(["Why is the build slow?", "Why is the build slow?"]);
    expect(seen.map(request => request.perspective)).toEqual(["profile first", "read the config first"]);
    expect(seen.map(request => request.id)).toEqual(["a", "b"]);
  });

  it("runs the proposers concurrently rather than one after another", async () => {
    // Sequential execution would let the second proposer start only after the
    // first finished, which is the one thing independence does not require and
    // latency does.
    let running = 0;
    let peak = 0;
    await fanOutProposals(requests, async request => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
      return request.id;
    });

    expect(peak).toBe(2);
  });

  it("keeps the proposals that answered when one fails", async () => {
    const outcome = await fanOutProposals(requests, async request => {
      if (request.id === "b") throw new Error("provider refused");
      return "the build is slow because of the linker";
    });

    expect(outcome.proposals.find(entry => entry.id === "a")?.claim).toBe("the build is slow because of the linker");
    expect(outcome.proposals.find(entry => entry.id === "b")?.status).toBe("failed");
    expect(outcome.proposals.find(entry => entry.id === "b")?.failure).toContain("provider refused");
    expect(outcome.proposed).toBe(1);
    expect(outcome.complete).toBe(false);
  });

  it("does not let an empty answer count as a proposal", async () => {
    // An empty claim that later "survives" is worse than an honest gap.
    const outcome = await fanOutProposals(requests, async () => "   ");

    expect(outcome.proposals.every(entry => entry.status === "failed")).toBe(true);
    expect(outcome.proposed).toBe(0);
    expect(outcome.proposals[0]?.failure).toContain("returned nothing");
  });

  it("reports cancellation as cancellation, not failure", async () => {
    const controller = new AbortController();
    const outcome = await fanOutProposals(requests, async (_request, signal) => {
      controller.abort();
      signal?.throwIfAborted();
      return "unreachable";
    }, controller.signal);

    expect(outcome.proposals.every(entry => entry.status === "cancelled")).toBe(true);
    expect(outcome.complete).toBe(false);
  });

  it("does not start a proposer after the run was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(async () => "claim");

    const outcome = await fanOutProposals(requests, run, controller.signal);

    expect(run).not.toHaveBeenCalled();
    expect(outcome.proposals.every(entry => entry.status === "cancelled")).toBe(true);
  });

  it("does not hang when a proposer never settles", async () => {
    // A run that never resolves would hold the pass open forever: the signal
    // can stop the next proposer starting and mark one that throws, but it
    // cannot interrupt a promise nobody rejects.
    const controller = new AbortController();
    const pending = fanOutProposals(requests, async request => {
      if (request.id === "a") return await new Promise<string>(() => {});   // never settles
      return "answered";
    }, controller.signal);

    controller.abort();
    const outcome = await pending;

    expect(outcome.proposals.find(entry => entry.id === "a")?.status).toBe("cancelled");
    expect(outcome.complete).toBe(false);
  });

  it("is complete only when every proposer answered", async () => {
    const all = await fanOutProposals(requests, async request => request.id);
    expect(all.complete).toBe(true);
    expect(all.proposed).toBe(2);

    const one = await fanOutProposals(requests, async request => {
      if (request.id === "a") throw new Error("no");
      return "yes";
    });
    expect(one.complete).toBe(false);
  });
});
