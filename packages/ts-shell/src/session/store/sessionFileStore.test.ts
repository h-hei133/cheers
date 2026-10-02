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
  it.each(["EEXIST", "EPERM", "EBUSY"])("does not repeat an action that fails with %s", (code) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-lock-action-"));
    let calls = 0;
    const failure = Object.assign(new Error("action failed"), { code });
    try {
      expect(() => withFileLock(path.join(root, "state.lock"), () => { calls += 1; throw failure; })).toThrow(failure);
      expect(calls).toBe(1);
      expect(fs.readdirSync(root)).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it.each(["replace-file", "replace-token"])("preserves a successor lock after %s", (replacement) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-lock-owner-"));
    const lockPath = path.join(root, "state.lock");
    const successor = JSON.stringify({ token: "successor", pid: process.pid, hostname: os.hostname() });
    try {
      expect(() => withFileLock(lockPath, () => {
        const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        expect(owner.token).toEqual(expect.any(String));
        if (replacement === "replace-file") fs.renameSync(lockPath, path.join(root, "old.lock"));
        fs.writeFileSync(lockPath, successor);
      })).toThrow("ownership lost");
      expect(fs.readFileSync(lockPath, "utf8")).toBe(successor);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

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
