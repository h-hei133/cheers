import { describe, expect, it, vi } from "vitest";
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileLock, withFileLocks } from "./fileLock.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "file-lock-"));
}

/**
 * A gate the test opens when the code inside it should be allowed to finish.
 *
 * Ordering is decided by the test rather than by a sleep, so the sequencing being
 * asserted is the sequencing that happened. A delay would instead guess at how
 * long the work takes and flake when the machine is busy.
 */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** Lets every already-scheduled continuation run, without advancing real time. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("serializing mutations of one file", () => {
  it('queues a completed nested lock behind a different chain when reacquired', async () => {
    const dir = tempDir();
    const outer = join(dir, 'outer.txt');
    const nested = join(dir, 'nested.txt');
    writeFileSync(outer, 'outer');
    writeFileSync(nested, 'nested');
    const beginOther = gate();
    const otherEntered = gate();
    const releaseOther = gate();
    const other = (async () => {
      await beginOther.wait;
      await withFileLock(nested, async () => { otherEntered.open(); await releaseOther.wait; });
    })();
    await withFileLock(outer, async () => {
      await withFileLock(nested, async () => undefined);
      beginOther.open();
      await otherEntered.wait;
      let entered = false;
      const lookup = gate();
      const realpath = fsPromises.realpath;
      const spy = vi.spyOn(fsPromises, 'realpath').mockImplementation(async (...args) => {
        const resolved = await realpath(...args);
        lookup.open();
        return resolved;
      });
      syncBuiltinESMExports();
      const again = withFileLock(nested, async () => { entered = true; });
      try {
        await lookup.wait;
        await settle();
        expect(entered).toBe(false);
      } finally {
        releaseOther.open();
        await again;
        spy.mockRestore();
        syncBuiltinESMExports();
      }
    });
    await other;
  });

  it('acquires opposite batch target orders without deadlock', async () => {
    const dir = tempDir();
    const first = join(dir, 'a.txt');
    const second = join(dir, 'b.txt');
    const order: number[] = [];
    await Promise.all([
      withFileLocks([first, second], async () => { order.push(1); await settle(); order.push(2); }),
      withFileLocks([second, first], async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
  it("does not let two mutations of the same file overlap", async () => {
    const file = join(tempDir(), "a.txt");
    const order: string[] = [];
    const first = gate();
    const entered = gate();

    const one = withFileLock(file, async () => {
      order.push("first:in");
      entered.open();
      await first.wait;
      order.push("first:out");
    });
    await entered.wait;

    let secondStarted = false;
    const two = withFileLock(file, async () => {
      secondStarted = true;
      order.push("second:in");
    });
    await settle();

    // The first still holds the file, so the second has not begun.
    expect(secondStarted).toBe(false);
    expect(order).toEqual(["first:in"]);

    first.open();
    await Promise.all([one, two]);
    expect(order).toEqual(["first:in", "first:out", "second:in"]);
  });

  it("lets mutations of different files run at the same time", async () => {
    const dir = tempDir();
    const order: string[] = [];
    const first = gate();
    const entered = gate();

    const a = withFileLock(join(dir, "a.txt"), async () => {
      order.push("a:in");
      entered.open();
      await first.wait;
      order.push("a:out");
    });
    await entered.wait;

    // A different file must not queue behind the one being held.
    await withFileLock(join(dir, "b.txt"), async () => {
      order.push("b:in");
    });

    expect(order).toEqual(["a:in", "b:in"]);
    first.open();
    await a;
  });

  it("treats two paths to one file as one lock", async () => {
    const dir = tempDir();
    const real = join(dir, "real.txt");
    writeFileSync(real, "x", "utf8");
    const link = join(dir, "link.txt");
    symlinkSync(real, link);

    const order: string[] = [];
    const first = gate();
    const entered = gate();

    const one = withFileLock(real, async () => {
      order.push("real:in");
      entered.open();
      await first.wait;
      order.push("real:out");
    });
    await entered.wait;

    // The link is the stronger check of the two: it must not merely start late, it
    // must not be able to *finish* while the target is held. An earlier version of
    // this test only watched for the start, which a call still registering itself
    // also satisfies — so it passed against a lock that did not cover links at all.
    let throughLinkFinished = false;
    const two = withFileLock(link, async () => {
      throughLinkFinished = true;
      order.push("link:in");
    });
    for (let spins = 0; spins < 50; spins += 1) {
      await settle();
    }
    expect(throughLinkFinished).toBe(false);

    first.open();
    await Promise.all([one, two]);
    expect(order).toEqual(["real:in", "real:out", "link:in"]);
  });

  it("releases the file when the mutation throws", async () => {
    const file = join(tempDir(), "a.txt");
    await expect(
      withFileLock(file, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A lock left behind by a failure would deadlock every later write.
    await expect(withFileLock(file, async () => "ran")).resolves.toBe("ran");
  });

  it("lets a mutation take the same file's lock again", async () => {
    const file = join(tempDir(), "a.txt");
    // The tool layer holds the lock across its read and write, and the write then
    // reaches the generic write path, which locks the same file. Waiting there
    // would deadlock: the outer call cannot finish until the inner one returns.
    await expect(
      withFileLock(file, () => withFileLock(file, async () => "inner")),
    ).resolves.toBe("inner");
  });

  it("does not let a second caller in while a chain holds the file", async () => {
    const file = join(tempDir(), "a.txt");
    const order: string[] = [];
    const outer = gate();
    const outerIn = gate();

    const one = withFileLock(file, async () => {
      order.push("outer:in");
      outerIn.open();
      await outer.wait;
      // Re-entrant for this chain, but another chain must still wait for it.
      await withFileLock(file, async () => {
        order.push("nested:in");
      });
      order.push("outer:out");
    });
    await outerIn.wait;

    let otherStarted = false;
    const two = withFileLock(file, async () => {
      otherStarted = true;
      order.push("other:in");
    });
    await settle();
    expect(otherStarted).toBe(false);

    outer.open();
    await Promise.all([one, two]);
    expect(order).toEqual(["outer:in", "nested:in", "outer:out", "other:in"]);
  });
});
