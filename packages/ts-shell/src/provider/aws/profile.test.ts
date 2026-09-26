import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  homeDirectory,
  mergedProfile,
  parseProfileFile,
  profileFilePaths,
  resolveProfileName,
  resolveRegion,
  shouldReadConfig,
} from "./profile.js";

/**
 * The two settings files, and the rules for reading them.
 *
 * The formats look like INI and are not: section headers differ between the two
 * files, comments start two ways, and a value may contain the separator. Each of
 * those is a case below, because getting one wrong silently reads a profile as
 * empty and the failure appears much later as a missing credential.
 */

describe("reading a settings file", () => {
  it("files a bare section under its own name", () => {
    const parsed = parseProfileFile("[default]\naws_access_key_id = AKIA\n");

    expect(parsed.default).toEqual({ aws_access_key_id: "AKIA" });
  });

  it("strips the prefix the config file puts on a section", () => {
    // The credentials file writes `[name]` and the config file writes
    // `[profile name]`, so a lookup by name has to work for both.
    const parsed = parseProfileFile("[profile work]\nregion = eu-west-1\n");

    expect(parsed.work).toEqual({ region: "eu-west-1" });
    expect(parsed["profile work"]).toBeUndefined();
  });

  it("keeps a sign-on session apart from the profiles", () => {
    // These share a file with profiles and would otherwise be read as one.
    const parsed = parseProfileFile("[sso-session corp]\nsso_start_url = https://x\n");

    expect(parsed["sso-session:corp"]).toEqual({ sso_start_url: "https://x" });
  });

  it("skips both comment markers and blank lines", () => {
    const parsed = parseProfileFile("# a comment\n; another\n\n[a]\nk = v\n");

    expect(parsed.a).toEqual({ k: "v" });
  });

  it("splits on the first separator so a value may contain one", () => {
    // A token or a command line can legally contain `=`, and splitting on the
    // last one would truncate the key.
    const parsed = parseProfileFile("[a]\nk = v=w=x\n");

    expect(parsed.a!.k).toBe("v=w=x");
  });

  it("trims surrounding space from keys and values", () => {
    const parsed = parseProfileFile("[a]\n   k   =   v   \n");

    expect(parsed.a!.k).toBe("v");
  });

  it("ignores a key that appears before any section", () => {
    const parsed = parseProfileFile("k = v\n[a]\nj = w\n");

    expect(parsed.a).toEqual({ j: "w" });
  });

  it("reads a file written with carriage returns", () => {
    const parsed = parseProfileFile("[a]\r\nk = v\r\n");

    expect(parsed.a!.k).toBe("v");
  });
});

describe("where the files are", () => {
  it("uses the standard locations", () => {
    const paths = profileFilePaths({ HOME: "/home/someone" });

    expect(paths.credentials).toBe("/home/someone/.aws/credentials");
    expect(paths.config).toBe("/home/someone/.aws/config");
  });

  it("honours a configured location", () => {
    const paths = profileFilePaths({
      HOME: "/home/someone",
      AWS_SHARED_CREDENTIALS_FILE: "/tmp/creds",
      AWS_CONFIG_FILE: "/tmp/conf",
    });

    expect(paths.credentials).toBe("/tmp/creds");
    expect(paths.config).toBe("/tmp/conf");
  });

  it("takes the home directory from either spelling", () => {
    expect(homeDirectory({ HOME: "/h" })).toBe("/h");
    expect(homeDirectory({ USERPROFILE: "C:\\Users\\x" })).toBe("C:\\Users\\x");
  });
});

describe("choosing a profile and a region", () => {
  it("prefers the named profile to the environment", () => {
    expect(resolveProfileName("chosen", { AWS_PROFILE: "env" })).toBe("chosen");
    expect(resolveProfileName(undefined, { AWS_PROFILE: "env" })).toBe("env");
    expect(resolveProfileName(undefined, {})).toBe("default");
  });

  it("takes the region from the most specific place that states one", () => {
    expect(resolveRegion("chosen", { region: "p" }, { AWS_REGION: "env" })).toBe("chosen");
    expect(resolveRegion(undefined, { region: "p" }, { AWS_REGION: "env" })).toBe("env");
    expect(resolveRegion(undefined, { region: "p" }, {})).toBe("p");
    expect(resolveRegion(undefined, undefined, {})).toBe("us-east-1");
  });

  it("reads the config file only when something asked for it", () => {
    // Reading it unconditionally would change what an account resolves to for
    // users who never asked for those settings.
    expect(shouldReadConfig("chosen", {})).toBe(true);
    expect(shouldReadConfig(undefined, { AWS_PROFILE: "p" })).toBe(true);
    expect(shouldReadConfig(undefined, { AWS_SDK_LOAD_CONFIG: "true" })).toBe(true);
    expect(shouldReadConfig(undefined, { AWS_SDK_LOAD_CONFIG: "1" })).toBe(true);
    expect(shouldReadConfig(undefined, {})).toBe(false);
    expect(shouldReadConfig(undefined, { AWS_SDK_LOAD_CONFIG: "0" })).toBe(false);
  });
});

describe("merging one profile from both files", () => {
  it("lets the config file's copy win", () => {
    // The two files hold different keys, and a profile in both is the normal
    // case rather than a conflict.
    const merged = mergedProfile("work", { work: { aws_access_key_id: "AKIA", region: "a" } }, { work: { region: "b" } });

    expect(merged).toEqual({ aws_access_key_id: "AKIA", region: "b" });
  });

  it("answers nothing for a profile in neither file", () => {
    expect(mergedProfile("absent", {}, {})).toBeUndefined();
  });

  it("answers for a profile that is only in the config file", () => {
    expect(mergedProfile("work", {}, { work: { role_arn: "arn:x" } })).toEqual({ role_arn: "arn:x" });
  });
});

describe("a real pair of files", () => {
  it("reads a profile written the way the tooling writes it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "creds-"));
    await writeFile(
      join(directory, "credentials"),
      "# written by a sign-in helper\n[default]\naws_access_key_id = AKIA\naws_secret_access_key = SECRET\n",
    );
    await writeFile(join(directory, "config"), "[profile work]\nregion = eu-west-1\nrole_arn = arn:aws:iam::1:role/r\n");

    const credentials = parseProfileFile(await readFile(join(directory, "credentials"), "utf8"));
    const config = parseProfileFile(await readFile(join(directory, "config"), "utf8"));

    expect(mergedProfile("default", credentials, config)).toEqual({
      aws_access_key_id: "AKIA",
      aws_secret_access_key: "SECRET",
    });
    expect(mergedProfile("work", credentials, config)).toEqual({
      region: "eu-west-1",
      role_arn: "arn:aws:iam::1:role/r",
    });
  });
});
