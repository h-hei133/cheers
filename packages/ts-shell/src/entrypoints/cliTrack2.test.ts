import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startupEligible } from "../cli/interactive/startup/eligibility.js";
import { resolveCliCredential } from "../cli/provider/cliProviderRuntimeBridge.js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { bootstrapShellRuntime } from "../core/shell/bootstrap.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import { SessionManager } from "../session/SessionManager.js";
import { writeSessionState } from "../session/store/sessionStateStore.js";
import { writeSessionMetadataRecord } from "../session/store/sessionStore.js";
import { createSessionStoreLayout, projectSessionFileLayout } from "../session/store/sessionFileLayout.js";
import { appendSessionTurn, appendTranscriptEvent } from "../session/transcript/sessionTranscript.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { formatCliModelList } from "./cliListModels.js";
import { runCliExport } from "./cliExportCommand.js";
import { parseCliArgs } from "./cliArgs.js";

const tempRoots: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Track 2 runtime wiring", () => {
  it("lists and fuzzy-filters catalog models for --list-models", () => {
    const table = formatCliModelList("gpt");
    expect(table).toContain("provider");
    expect(table.toLowerCase()).toContain("gpt");
    expect(formatCliModelList("nonexistent-xyz-999")).toContain("No models found");
  });

  it("resolves provider/model:thinking shorthand and --thinking override", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-t2-model-"));
    tempRoots.push(root);
    const config = getRuntimeConfig(root);
    const resolved = resolveCliCredential(
      config,
      { model: "openai/gpt-5.4:high" },
      { OPENAI_API_KEY: "test-key" },
    );
    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("gpt-5.4");
    expect(resolved.thinkingEffort).toBe("high");

    const explicit = resolveCliCredential(
      config,
      { model: "openai/gpt-5.4:high", thinking: "low" },
      { OPENAI_API_KEY: "test-key" },
    );
    expect(explicit.thinkingEffort).toBe("low");
  });

  it("forks an existing session on bootstrap (--fork) and exports HTML (--export)", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-t2-home-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-t2-work-"));
    tempRoots.push(home, root);
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const manager = new SessionManager();
    const source = manager.createNew(root);
    const layout = projectSessionFileLayout({
      sessionsDir: createSessionStoreLayout(home).sessionsDir,
      sessionId: source.id,
    });
    const sessionCopy = { ...source, turns: [...source.turns] };
    appendSessionTurn({
      session: sessionCopy,
      message: { role: "user", content: "hello from source" },
      timestamp: new Date().toISOString(),
      append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
      writeMetadata: (s) => writeSessionMetadataRecord({ session: s, layout }),
      writeState: (s) => writeSessionState({ session: s, layout }),
    });
    appendSessionTurn({
      session: sessionCopy,
      message: { role: "assistant", content: "hi there" },
      timestamp: new Date().toISOString(),
      append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
      writeMetadata: (s) => writeSessionMetadataRecord({ session: s, layout }),
      writeState: (s) => writeSessionState({ session: s, layout }),
    });

    const forked = bootstrapShellRuntime({
      cwd: root,
      runtimeConfig: getRuntimeConfig(root),
      gitContext: getWorkflowGitContext(root),
      sessionManager: manager,
      renderer: new StreamingRenderer(),
      forkSource: source.id,
      emitLifecycleMessages: false,
    });

    expect(forked.context.session.id).not.toBe(source.id);
    expect(forked.context.session.turns.length).toBe(2);

    const outHtml = path.join(root, "out", "exported.html");
    const parsedExport = parseCliArgs(["--export", source.id, "./out/exported.html"], { cwd: root });
    expect(parsedExport.ok).toBe(true);
    if (parsedExport.ok) {
      expect(parsedExport.args.options.projectPath).toBeUndefined();
      expect(parsedExport.args.options.promptArg).toBe("./out/exported.html");
    }

    const msg = await runCliExport(layout.transcriptPath, outHtml, root);
    expect(msg).toContain(outHtml);
    expect(fs.existsSync(outHtml)).toBe(true);
    const html = fs.readFileSync(outHtml, "utf8");
    const match = /id="session-data"[^>]*>([A-Za-z0-9+/=]+)</.exec(html);
    expect(match).not.toBeNull();
    const decoded = Buffer.from(match![1]!, "base64").toString("utf8");
    expect(decoded).toContain("hello from source");

    await expect(runCliExport("..", outHtml, root)).rejects.toThrow("Invalid session id");
    expect(() =>
      bootstrapShellRuntime({
        cwd: root,
        runtimeConfig: getRuntimeConfig(root),
        gitContext: getWorkflowGitContext(root),
        sessionManager: manager,
        renderer: new StreamingRenderer(),
        forkSource: "../other",
        emitLifecycleMessages: false,
      }),
    ).toThrow();
  });
  it("treats interactive Track 2 flags as startup-eligible and excludes --list-models/--export", () => {
    expect(startupEligible(["-c", "--model", "gpt-5.4", "--no-tools"], true)).toBe(true);
    expect(startupEligible(["--list-models"], true)).toBe(false);
    expect(startupEligible(["--export", "s1"], true)).toBe(false);
  });
});
