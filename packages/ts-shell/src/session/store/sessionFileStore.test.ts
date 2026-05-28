import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readJsonFileWithRetry,
  withFileLock,
  writeJsonFileAtomic,
} from "./sessionFileStore.js";

describe("sessionFileStore", () => {
  it("atomically writes and reads durable JSON payloads", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-file-store-"));
    try {
      const filePath = path.join(root, "state.json");
      writeJsonFileAtomic(filePath, { status: "active", projectRoot: "/repo" });

      expect(
        readJsonFileWithRetry(filePath, {
          required: true,
          parseErrorDetail: "read failed",
        }),
      ).toEqual({ status: "active", projectRoot: "/repo" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("cleans up state locks after guarded writes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-lock-store-"));
    try {
      const lockPath = path.join(root, "state.lock");
      const result = withFileLock(lockPath, () => "locked");

      expect(result).toBe("locked");
      expect(fs.existsSync(lockPath)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
