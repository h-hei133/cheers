import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialsError, resolveCredentials } from "./credentials.js";

/**
 * Finding the credential, in the order the tooling established.
 *
 * Every case here supplies its own environment and its own home directory, so
 * nothing reads the machine the tests run on: a developer with a real profile
 * would otherwise see different results from CI.
 */

/** A home directory with the given files, and an environment pointing at it. */
async function home(files: Record<string, string>): Promise<Record<string, string>> {
  const directory = await mkdtemp(join(tmpdir(), "aws-creds-"));
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents);
  }
  return { HOME: directory, AWS_SHARED_CREDENTIALS_FILE: join(directory, "credentials"), AWS_CONFIG_FILE: join(directory, "config") };
}

/** A fetch that answers with a fixed body, recording what it was asked for. */
function answering(body: unknown, status = 200) {
  const seen: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    seen.push(String(url));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe("credentials in the environment", () => {
  it("are used when both halves are there", async () => {
    const credentials = await resolveCredentials({
      env: { AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "SECRET", HOME: "/nonexistent" },
    });

    expect(credentials.accessKeyId).toBe("AKIA");
    expect(credentials.secretAccessKey).toBe("SECRET");
    expect(credentials.sessionToken).toBeUndefined();
  });

  it("carry the session token when one is there", async () => {
    const credentials = await resolveCredentials({
      env: { AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "S", AWS_SESSION_TOKEN: "T", HOME: "/nonexistent" },
    });

    expect(credentials.sessionToken).toBe("T");
  });

  it("are not used when only half is there", async () => {
    // Half a pair signs nothing, so the chain continues rather than returning
    // something that would fail at the service.
    await expect(
      resolveCredentials({ env: { AWS_ACCESS_KEY_ID: "AKIA", HOME: "/nonexistent", AWS_EC2_METADATA_DISABLED: "true" } }),
    ).rejects.toThrow(CredentialsError);
  });
});

describe("credentials in a profile file", () => {
  it("are read from the default profile", async () => {
    const env = await home({ credentials: "[default]\naws_access_key_id = AKIA\naws_secret_access_key = SECRET\n" });

    const credentials = await resolveCredentials({ env });
    expect(credentials.accessKeyId).toBe("AKIA");
  });

  it("are read from the profile the environment names", async () => {
    const env = await home({ credentials: "[work]\naws_access_key_id = W\naws_secret_access_key = S\n" });

    expect((await resolveCredentials({ env: { ...env, AWS_PROFILE: "work" } })).accessKeyId).toBe("W");
  });

  it("are read from the profile the caller names, over the environment's", async () => {
    const env = await home({
      credentials: "[a]\naws_access_key_id = A\naws_secret_access_key = S\n[b]\naws_access_key_id = B\naws_secret_access_key = S\n",
    });

    expect((await resolveCredentials({ env: { ...env, AWS_PROFILE: "a" }, profile: "b" })).accessKeyId).toBe("B");
  });

  it("bound the lifetime of a key that has no stated expiry", async () => {
    // A key from a role is short-lived even without an expiry field, and the
    // tools that write these rotate them. Trusting one forever serves a key
    // that was replaced hours ago, and the symptom is an authentication failure.
    const env = await home({
      credentials: "[default]\naws_access_key_id = AKIA\naws_secret_access_key = S\naws_session_token = T\n",
    });

    const credentials = await resolveCredentials({ env });
    expect(credentials.expiresAt).toBeDefined();
    expect(credentials.expiresAt! - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });

  it("leave a long-lived key with no expiry at all", async () => {
    const env = await home({ credentials: "[default]\naws_access_key_id = AKIA\naws_secret_access_key = S\n" });

    expect((await resolveCredentials({ env })).expiresAt).toBeUndefined();
  });
});

describe("credentials from a role", () => {
  it("are assumed with the keys their source profile holds", async () => {
    // The base credential comes from another profile, which is how a role is
    // normally assumed: one set of long-lived keys, many roles.
    const env = await home({
      credentials: "[base]\naws_access_key_id = BASE\naws_secret_access_key = S\n",
      config: "[profile work]\nrole_arn = arn:aws:iam::1:role/r\nsource_profile = base\n",
    });
    const { fetchImpl, seen } = answering(
      `<AssumeRoleResponse><Credentials><AccessKeyId>AK2</AccessKeyId><SecretAccessKey>S2</SecretAccessKey>` +
        `<SessionToken>T2</SessionToken><Expiration>2099-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleResponse>`,
    );

    const credentials = await resolveCredentials({
      env: { ...env, AWS_PROFILE: "work", AWS_SDK_LOAD_CONFIG: "true" },
      fetchImpl,
    });

    expect(credentials.accessKeyId).toBe("AK2");
    expect(credentials.sessionToken).toBe("T2");
    // The exchange is signed with the base credential, which is what makes it
    // more than a form post.
    expect(seen[0]).toContain("sts.");
  });

  it("let a key in the environment win over a role, which is the documented order", async () => {
    // Not an accident of this implementation: a key placed in the environment
    // was placed deliberately for this process, so it outranks a file.
    const env = await home({
      credentials: "[base]\naws_access_key_id = BASE\naws_secret_access_key = S\n",
      config: "[profile work]\nrole_arn = arn:x\nsource_profile = base\n",
    });

    const credentials = await resolveCredentials({
      env: { ...env, AWS_ACCESS_KEY_ID: "FROM-ENV", AWS_SECRET_ACCESS_KEY: "S", AWS_PROFILE: "work", AWS_SDK_LOAD_CONFIG: "true" },
    });

    expect(credentials.accessKeyId).toBe("FROM-ENV");
  });

  it("refuse a credential source this build does not know", async () => {
    const env = await home({
      config: "[profile work]\nrole_arn = arn:x\ncredential_source = SomethingElse\n",
    });

    await expect(
      resolveCredentials({ env: { ...env, AWS_PROFILE: "work", AWS_SDK_LOAD_CONFIG: "true" } }),
    ).rejects.toThrow(/not a credential source/);
  });

  it("refuse a role with no way to assume it", async () => {
    const env = await home({ config: "[profile work]\nrole_arn = arn:x\n" });

    await expect(
      resolveCredentials({ env: { ...env, AWS_PROFILE: "work", AWS_SDK_LOAD_CONFIG: "true" } }),
    ).rejects.toThrow(/no way to assume it/);
  });

  it("refuse a profile that refers back to itself", async () => {
    const env = await home({
      credentials: "[a]\naws_access_key_id = K\naws_secret_access_key = S\n",
      config: "[profile loop]\nrole_arn = arn:x\nsource_profile = loop\n",
    });

    await expect(
      resolveCredentials({ env: { ...env, AWS_PROFILE: "loop", AWS_SDK_LOAD_CONFIG: "true" } }),
    ).rejects.toThrow(/refers back to itself/);
  });
});

describe("credentials from a process", () => {
  it("are read from what the command prints", async () => {
    const env = await home({
      credentials: `[default]\ncredential_process = printf '{"Version":1,"AccessKeyId":"P","SecretAccessKey":"S"}' 2>/dev/null || echo '{"Version":1,"AccessKeyId":"P","SecretAccessKey":"S"}'\n`,
    });

    const credentials = await resolveCredentials({ env });
    expect(credentials.accessKeyId).toBe("P");
  });

  it("refuse a command that printed something else", async () => {
    const env = await home({ credentials: "[default]\ncredential_process = echo not-json\n" });

    await expect(resolveCredentials({ env })).rejects.toThrow(/did not print JSON/);
  });

  it("refuse a command that failed", async () => {
    const env = await home({ credentials: "[default]\ncredential_process = exit 3\n" });

    await expect(resolveCredentials({ env })).rejects.toThrow(/credential process failed/);
  });
});

describe("credentials from a container endpoint", () => {
  it("are read from the relative path the runtime states", async () => {
    const { fetchImpl, seen } = answering({
      AccessKeyId: "C",
      SecretAccessKey: "S",
      Token: "T",
      Expiration: "2099-01-01T00:00:00Z",
    });

    const credentials = await resolveCredentials({
      env: {
        HOME: "/nonexistent",
        AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/creds",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      fetchImpl,
    });

    expect(credentials.accessKeyId).toBe("C");
    expect(seen[0]).toBe("http://169.254.170.2/creds");
  });

  it("refuse a full URL that is neither encrypted nor local", async () => {
    // The endpoint hands out credentials. Plain HTTP is allowed only to a local
    // address, so that a misconfiguration cannot put them on the wire.
    await expect(
      resolveCredentials({
        env: { HOME: "/nonexistent", AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://elsewhere.test/creds" },
      }),
    ).rejects.toThrow(/not a local address/);
  });

  it("accept an encrypted full URL to any host", async () => {
    const { fetchImpl } = answering({ AccessKeyId: "C", SecretAccessKey: "S", Token: "T" });

    const credentials = await resolveCredentials({
      env: {
        HOME: "/nonexistent",
        AWS_CONTAINER_CREDENTIALS_FULL_URI: "https://container.internal/creds",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      fetchImpl,
    });

    expect(credentials.accessKeyId).toBe("C");
  });

  it("send the authorization token when one is configured", async () => {
    let sent: Record<string, string> = {};
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      sent = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ AccessKeyId: "C", SecretAccessKey: "S", Token: "T" }));
    }) as unknown as typeof fetch;

    await resolveCredentials({
      env: {
        HOME: "/nonexistent",
        AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/creds",
        AWS_CONTAINER_AUTHORIZATION_TOKEN: "BEARER",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      fetchImpl,
    });

    expect(sent.authorization).toBe("BEARER");
  });
});

describe("credentials from instance metadata", () => {
  it("are fetched with the token the first request returned", async () => {
    // Two steps, and the second is refused without the first: knowing the
    // address is not enough to read the instance's credentials.
    const requests: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers: (init?.headers as Record<string, string>) ?? {},
      });
      if (String(url).endsWith("/latest/api/token")) return new Response("TOKEN-1");
      if (String(url).endsWith("/security-credentials/")) return new Response("my-role");
      return new Response(JSON.stringify({ AccessKeyId: "I", SecretAccessKey: "S", Token: "T" }));
    }) as unknown as typeof fetch;

    const credentials = await resolveCredentials({ env: { HOME: "/nonexistent" }, fetchImpl });

    expect(credentials.accessKeyId).toBe("I");
    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.headers["x-aws-ec2-metadata-token-ttl-seconds"]).toBeDefined();
    expect(requests[1]!.headers["x-aws-ec2-metadata-token"]).toBe("TOKEN-1");
    expect(requests[2]!.headers["x-aws-ec2-metadata-token"]).toBe("TOKEN-1");
    expect(requests[2]!.url).toContain("/my-role");
  });

  it("are not tried when the environment disables them", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;

    await expect(
      resolveCredentials({ env: { HOME: "/nonexistent", AWS_EC2_METADATA_DISABLED: "true" }, fetchImpl }),
    ).rejects.toThrow(CredentialsError);
    expect(called).toBe(false);
  });

  it("give up quietly when the endpoint does not answer", async () => {
    // This is the normal case on a machine that is not in the cloud, so it must
    // be a miss rather than an error — otherwise every run would report one.
    const fetchImpl = (async () => {
      throw new Error("unreachable");
    }) as unknown as typeof fetch;

    await expect(
      resolveCredentials({ env: { HOME: "/nonexistent" }, fetchImpl }),
    ).rejects.toThrow(/No credentials found/);
  });
});

describe("when nothing answers", () => {
  it("names every source that was tried", async () => {
    // The failure a user can act on is "there is nothing here"; the one they
    // cannot is "something was missing" with no indication of what.
    await expect(
      resolveCredentials({ env: { HOME: "/nonexistent", AWS_EC2_METADATA_DISABLED: "true" } }),
    ).rejects.toThrow(/environment.*web identity.*profile.*container.*metadata/s);
  });
});

describe("a credential source that never answers", () => {
  /**
   * It is given up on rather than waited on.
   *
   * A `credential_process` is an arbitrary program. One that hangs would hold the
   * request open with nothing to show for it, and the failure a user sees would
   * be a request that never starts rather than one that names the source.
   */
  it("bounds a credential process that does not finish", async () => {
    // No caller signal is passed: the deadline has to come from this layer, or a
    // wedged helper holds the request open with nothing to wait for.
    const env = await home({ credentials: "[default]\ncredential_process = sleep 600\n" });

    const started = Date.now();
    await expect(resolveCredentials({ env })).rejects.toThrow(/credential process failed/);
    expect(Date.now() - started).toBeLessThan(60_000);
  }, 90_000);
});
