import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createQaPtyEnvironment } from "./qa-pty-env.mjs";

test("isolates the packaged PTY probe from real homes, credentials and Git config", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pty-env-"));
  try {
    const home = path.join(root, "home");
    const project = path.join(root, "project");
    fs.mkdirSync(home);
    fs.mkdirSync(project);
    const env = createQaPtyEnvironment(home, project, {
      PATH: "/safe/bin",
      HOME: "/real/home",
      USERPROFILE: "/real/home",
      CHEERS_HOME_OVERRIDE: "/real/cheers",
      CHEERS_REAL_HOME: "/private/agents",
      CHEERS_REAL_API_KEY: "real-secret",
      OPENAI_API_KEY: "provider-secret",
      GITHUB_TOKEN: "github-secret",
      AWS_ACCESS_KEY_ID: "aws-access",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      GOOGLE_APPLICATION_CREDENTIALS: "/real/google.json",
      AZURE_CLIENT_SECRET: "azure-secret",
      NODE_OPTIONS: "--inspect",
      XDG_CONFIG_HOME: "/real/config",
      GIT_CONFIG_GLOBAL: "/real/gitconfig",
    });

    assert.equal(env.PATH, "/safe/bin");
    assert.equal(env.HOME, home);
    assert.equal(env.USERPROFILE, home);
    assert.equal(env.CHEERS_HOME_OVERRIDE, home);
    assert.equal(env.CHEERS_PROVIDER_MODE, "synthetic");
    assert.equal(env.GIT_CONFIG_GLOBAL, path.join(home, ".gitconfig"));
    assert.equal(env.GIT_CEILING_DIRECTORIES, project);
    assert.equal(env.XDG_CONFIG_HOME, path.join(home, ".config"));
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.CHEERS_REAL_HOME, undefined);
    assert.equal(env.CHEERS_REAL_API_KEY, undefined);
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(env.AWS_ACCESS_KEY_ID, undefined);
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
    assert.equal(env.AZURE_CLIENT_SECRET, undefined);
    assert.ok(fs.statSync(env.TMPDIR).isDirectory());
    assert.ok(fs.statSync(env.CHEERS_TEST_ROOT).isDirectory());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
