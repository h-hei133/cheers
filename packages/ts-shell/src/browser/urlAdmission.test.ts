import { describe, expect, it } from "vitest";
import { admitBrowserRedirect, admitBrowserUrl, admitPageRequest } from "./urlAdmission.js";
import { readBrowserOriginPolicy } from "./originPolicy.js";

const open = { allowedOrigins: [], allowPrivateNetwork: false };

describe("browser URL admission", () => {
  it("allows a public page", () => {
    const admission = admitBrowserUrl("https://example.com/docs", open);
    expect(admission.allowed).toBe(true);
    expect(admission.hostname).toBe("example.com");
  });

  it("allows loopback, which is what the tool is for", () => {
    for (const url of ["http://localhost:3000/", "http://127.0.0.1:8080/app", "http://[::1]:3000/"]) {
      expect(admitBrowserUrl(url, open).allowed, url).toBe(true);
    }
  });

  it("refuses a metadata address and says which rule it was", () => {
    const admission = admitBrowserUrl("http://169.254.169.254/latest/meta-data/", open);
    expect(admission.allowed).toBe(false);
    expect(admission.refusal?.code).toBe("blocked-host");
    expect(admission.refusal?.reason).toContain("link-local");
  });

  it("refuses a private address unless the policy allows the class", () => {
    expect(admitBrowserUrl("http://10.0.0.5/", open).allowed).toBe(false);
    expect(admitBrowserUrl("http://192.168.1.10/", open).allowed).toBe(false);
    expect(admitBrowserUrl("http://100.64.0.1/", open).allowed).toBe(false);

    const widened = admitBrowserUrl("http://10.0.0.5/", { allowedOrigins: [], allowPrivateNetwork: true });
    expect(widened.allowed).toBe(true);
  });

  it("keeps metadata refused even when the private class is allowed", () => {
    // The two are separate on purpose: reaching a LAN host is a reason someone
    // has; reaching the instance metadata endpoint is not.
    const widened = { allowedOrigins: [], allowPrivateNetwork: true };
    expect(admitBrowserUrl("http://169.254.169.254/", widened).allowed).toBe(false);
    expect(admitBrowserUrl("http://[fd00:ec2::254]/", widened).allowed).toBe(false);
  });

  it("refuses a scheme that is not http or https", () => {
    for (const url of ["file:///etc/passwd", "data:text/html,<h1>x</h1>", "ftp://host/x"]) {
      const admission = admitBrowserUrl(url, open);
      expect(admission.allowed, url).toBe(false);
      expect(admission.refusal?.code, url).toBe("unsupported-scheme");
    }
  });

  it("refuses a URL that carries credentials", () => {
    const admission = admitBrowserUrl("https://user:secret@example.com/", open);
    expect(admission.allowed).toBe(false);
    expect(admission.refusal?.code).toBe("credential-url");
  });

  it("reports an unparseable URL rather than guessing", () => {
    const admission = admitBrowserUrl("not a url", open);
    expect(admission.allowed).toBe(false);
    expect(admission.refusal?.code).toBe("invalid-url");
  });

  it("narrows to the configured origins when an allowlist is present", () => {
    const policy = { allowedOrigins: ["https://allowed.example"], allowPrivateNetwork: false };
    expect(admitBrowserUrl("https://allowed.example/x", policy).allowed).toBe(true);

    const refused = admitBrowserUrl("https://other.example/x", policy);
    expect(refused.allowed).toBe(false);
    expect(refused.refusal?.code).toBe("not-allowlisted");
  });

  it("treats a default port as part of the same origin", () => {
    const policy = { allowedOrigins: ["https://allowed.example"], allowPrivateNetwork: false };
    expect(admitBrowserUrl("https://allowed.example:443/x", policy).allowed).toBe(true);
  });

  it("re-judges a redirect that leaves the origin", () => {
    const policy = { allowedOrigins: ["http://127.0.0.1:3000"], allowPrivateNetwork: false };
    const escaped = admitBrowserRedirect(
      "http://127.0.0.1:3000/login",
      "http://127.0.0.1:9999/elsewhere",
      policy,
    );

    expect(escaped.allowed).toBe(false);
    expect(escaped.refusal?.code).toBe("not-allowlisted");
    // The message has to name the redirect, or a reader sees only the final
    // address refused and cannot tell why it was ever requested.
    expect(escaped.refusal?.reason).toContain("redirected to");
  });

  it("does not re-decide a redirect that stays on the same origin", () => {
    const policy = { allowedOrigins: ["http://127.0.0.1:3000"], allowPrivateNetwork: false };
    const same = admitBrowserRedirect("http://127.0.0.1:3000/a", "http://127.0.0.1:3000/b", policy);

    expect(same.allowed).toBe(true);
  });

  it("refuses a redirect onto a metadata address", () => {
    const escaped = admitBrowserRedirect(
      "https://example.com/",
      "http://169.254.169.254/latest/meta-data/",
      open,
    );

    expect(escaped.allowed).toBe(false);
    expect(escaped.refusal?.code).toBe("blocked-host");
  });
});

describe("browser origin policy", () => {
  it("is closed by default", () => {
    const policy = readBrowserOriginPolicy({});
    expect(policy.allowedOrigins).toEqual([]);
    expect(policy.allowPrivateNetwork).toBe(false);
  });

  it("reads origins from the environment, dropping entries that do not parse", () => {
    const policy = readBrowserOriginPolicy({
      CHEERS_BROWSER_ALLOWED_ORIGINS: "https://a.example, nonsense, https://b.example/",
    });

    expect(policy.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
  });

  it("enables the private class only for the exact opt-in value", () => {
    expect(readBrowserOriginPolicy({ CHEERS_BROWSER_ALLOW_PRIVATE_NETWORK: "1" }).allowPrivateNetwork).toBe(true);
    expect(readBrowserOriginPolicy({ CHEERS_BROWSER_ALLOW_PRIVATE_NETWORK: "true" }).allowPrivateNetwork).toBe(false);
    expect(readBrowserOriginPolicy({ CHEERS_BROWSER_ALLOW_PRIVATE_NETWORK: "0" }).allowPrivateNetwork).toBe(false);
  });
});

describe("a request the page made for itself", () => {
  it("refuses the hosts that answer with credentials", () => {
    // A document has no legitimate reason to ask for the metadata service, and
    // this is the request that no caller named: `open` decided the address, and
    // a script inside the page decides every request after it.
    expect(admitPageRequest("http://169.254.169.254/latest/meta-data/", open).allowed).toBe(false);
    expect(admitPageRequest("http://metadata.google.internal/computeMetadata/v1/", open).allowed).toBe(false);
    expect(admitPageRequest("http://10.0.0.5/admin", open).allowed).toBe(false);
  });

  it("allows the page's own furniture, which is not a navigation", () => {
    // Stylesheets, images, fonts, data URLs and a websocket to the server the
    // page came from are what a working page is made of. Refusing them would
    // break the local development server the tool exists to reach.
    expect(admitPageRequest("https://example.com/app.css", open).allowed).toBe(true);
    expect(admitPageRequest("http://localhost:3000/hmr", open).allowed).toBe(true);
    expect(admitPageRequest("data:image/png;base64,iVBOR", open).allowed).toBe(true);
    expect(admitPageRequest("blob:http://localhost:3000/abc", open).allowed).toBe(true);
  });

  it("is not narrowed by the allowlist, which is about what the caller names", () => {
    // A caller that allowlisted one origin still gets that page's stylesheet
    // and fonts from wherever they are served.
    const narrowed = { allowedOrigins: ["example.com"], allowPrivateNetwork: false };
    expect(admitPageRequest("https://cdn.example.net/font.woff2", narrowed).allowed).toBe(true);
  });

  it("follows the private-network setting the open decision used", () => {
    const permissive = { allowedOrigins: [], allowPrivateNetwork: true };
    expect(admitPageRequest("http://10.0.0.5/admin", permissive).allowed).toBe(true);
    // Metadata is not private-network, so the setting never reaches it.
    expect(admitPageRequest("http://169.254.169.254/", permissive).allowed).toBe(false);
  });
});
