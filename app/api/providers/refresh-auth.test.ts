import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/providers/[provider]/refresh/route";

/*
  The refresh endpoint is the only write path into the catalog, so its guard is
  tested directly by invoking the route handler.

  These tests never supply BRIGHT_DATA_API_TOKEN, so no request can reach Bright
  Data even if a guard were to regress.
*/

const ROUTE = "http://localhost/api/providers/openai/refresh";

function ctx(provider: string) {
  return { params: Promise.resolve({ provider }) } as Parameters<typeof POST>[1];
}

function post(headers: Record<string, string> = {}) {
  return new Request(ROUTE, { method: "POST", headers });
}

const SECRET = "correct-horse-battery-staple";

function withSecret<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ADMIN_REFRESH_SECRET;
  if (value === undefined) delete process.env.ADMIN_REFRESH_SECRET;
  else process.env.ADMIN_REFRESH_SECRET = value;

  return run().finally(() => {
    if (previous === undefined) delete process.env.ADMIN_REFRESH_SECRET;
    else process.env.ADMIN_REFRESH_SECRET = previous;
  });
}

describe("refresh endpoint authorisation", () => {
  it("refuses to run at all when no secret is configured", async () => {
    await withSecret(undefined, async () => {
      const response = await POST(post(), ctx("openai"));
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.missingEnvVars).toEqual(["ADMIN_REFRESH_SECRET"]);
      // The variable is named; no value is disclosed.
      expect(JSON.stringify(body)).not.toContain(SECRET);
    });
  });

  it("rejects a request with no secret", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(post(), ctx("openai"));
      expect(response.status).toBe(401);
    });
  });

  it("rejects a wrong secret of the same length", async () => {
    await withSecret(SECRET, async () => {
      const wrong = "x".repeat(SECRET.length);
      const response = await POST(
        post({ "x-admin-refresh-secret": wrong }),
        ctx("openai"),
      );
      expect(response.status).toBe(401);
    });
  });

  it("rejects a wrong secret of a different length", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(
        post({ "x-admin-refresh-secret": "short" }),
        ctx("openai"),
      );
      expect(response.status).toBe(401);
    });
  });

  it("rejects a secret that is only a prefix of the real one", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(
        post({ "x-admin-refresh-secret": SECRET.slice(0, -1) }),
        ctx("openai"),
      );
      expect(response.status).toBe(401);
    });
  });

  it("never echoes the expected secret in an error body", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(post({ "x-admin-refresh-secret": "nope" }), ctx("openai"));
      const text = await response.text();
      expect(text).not.toContain(SECRET);
    });
  });

  it("accepts the secret as a Bearer token", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(
        post({ authorization: `Bearer ${SECRET}` }),
        ctx("openai"),
      );
      // Past the guard: it now fails on missing Bright Data configuration.
      expect(response.status).not.toBe(401);
    });
  });
});

describe("refresh endpoint guards after authorisation", () => {
  it("rejects an unknown provider before touching any credentials", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(
        post({ "x-admin-refresh-secret": SECRET }),
        ctx("google"),
      );
      expect(response.status).toBe(404);
    });
  });

  it("names missing Bright Data variables without revealing values", async () => {
    await withSecret(SECRET, async () => {
      const response = await POST(
        post({ "x-admin-refresh-secret": SECRET }),
        ctx("openai"),
      );
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.missingEnvVars).toContain("BRIGHT_DATA_API_TOKEN");
      expect(JSON.stringify(body)).not.toContain(SECRET);
    });
  });
});
