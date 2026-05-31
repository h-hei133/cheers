import { describe, expect, it } from "vitest";
import {
  buildCurrentJournalDurableAuthority,
  futureJournalDurableAuthorityOptions,
} from "./journalDurableAuthority.js";

describe("journal durable authority descriptor", () => {
  it("describes current durable authority as absent and non-executing", () => {
    expect(buildCurrentJournalDurableAuthority()).toEqual(
      expect.objectContaining({
        authorityKind: "none",
        availability: "absent",
        persistence: "none",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: false,
        canVerifyCurrentContent: false,
      }),
    );
    expect(buildCurrentJournalDurableAuthority().blockers).toEqual(
      expect.arrayContaining([
        "metadata-only-journal",
        "no-durable-snapshot",
        "no-original-content",
        "no-recovery-executor",
        "no-atomicity-authority",
        "no-persistence-authority",
        "no-durable-authority",
        "no-current-content-inspection",
      ]),
    );
    expect(buildCurrentJournalDurableAuthority().evidence).toEqual(
      expect.arrayContaining([
        "journal-durable-authority:no-file-io",
        "journal-durable-authority:no-git",
        "journal-durable-authority:no-snapshot",
      ]),
    );
  });

  it("keeps future options inactive and non-claiming", () => {
    expect(futureJournalDurableAuthorityOptions.map((option) => option.authorityKind)).toEqual([
      "original-content-ledger",
      "hash-only-ledger",
      "snapshot-checkpoint",
      "git-checkpoint",
      "file-history",
    ]);
    for (const option of futureJournalDurableAuthorityOptions) {
      expect(option.availability).toBe("design-only");
      expect(option.canRecover).toBe(false);
      expect(option.canRollback).toBe(false);
      expect(option.canRestoreOriginalContent).toBe(false);
      expect(option.canVerifyCurrentContent).toBe(false);
    }
  });
});
