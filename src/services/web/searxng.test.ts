import { describe, expect, it, vi } from "vitest";

import {
  createSearxngSearchEngine,
  WebSearchError,
} from "#app/services/web/search.ts";

describe("createSearxngSearchEngine", () => {
  it("calls the searxng api and parses results", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input));

      expect(url.origin).toBe("https://search.example.com");
      expect(url.pathname).toBe("/search");
      expect(url.searchParams.get("q")).toBe("typescript");
      expect(url.searchParams.get("format")).toBe("json");
      expect(init?.headers).toEqual({
        Accept: "application/json",
      });

      return new Response(
        JSON.stringify({
          results: [
            {
              title: "TypeScript",
              url: "https://example.com/typescript",
              content: "Typed JavaScript at any scale.",
            },
            {
              title: "Missing URL",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });

    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation,
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual([
      {
        title: "TypeScript",
        url: "https://example.com/typescript",
        description: "Typed JavaScript at any scale.",
      },
    ]);
  });

  it("includes api key when provided", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input));

      expect(url.origin).toBe("https://search.example.com");
      expect(init?.headers).toEqual({
        Accept: "application/json",
        Authorization: "Bearer secret-key",
      });

      return new Response(
        JSON.stringify({
          results: [],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });

    const engine = createSearxngSearchEngine({
      apiKey: "secret-key",
      baseUrl: "https://search.example.com",
      fetchImplementation,
    });

    await engine.search({
      query: "test",
      limit: 5,
      timeoutMs: 1_000,
    });

    expect(fetchImplementation).toHaveBeenCalled();
  });

  it("wraps fetch failures", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrowError("SearXNG search request failed: network down");
  });

  it("wraps timeout failures", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async (_input, init) => {
        init?.signal?.throwIfAborted();

        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });

        init?.signal?.throwIfAborted();

        return new Response("never reached", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1,
      }),
    ).rejects.toThrowError("SearXNG search request timed out after 1ms.");
  });

  it("returns a helpful error for non-ok responses", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        return new Response("rate limited", {
          status: 429,
          statusText: "Too Many Requests",
        });
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrowError(
      "SearXNG search request failed with 429 Too Many Requests: rate limited",
    );
  });

  it("returns a helpful error for 403 json disabled", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        return new Response("JSON format is disabled", {
          status: 403,
          statusText: "Forbidden",
        });
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrowError(
      "SearXNG search request failed with 403 Forbidden: JSON format is disabled",
    );
  });

  it("returns an empty result list for unexpected payloads", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual([]);
  });

  it("returns an empty result list when results field is missing", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            query: "typescript",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual([]);
  });

  it("rejects unexpected content types", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        return new Response("<html></html>", {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        });
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrowError("Unsupported content type: text/html.");
  });

  it("throws WebSearchError instances", async () => {
    const engine = createSearxngSearchEngine({
      apiKey: undefined,
      baseUrl: "https://search.example.com",
      fetchImplementation: vi.fn(async () => {
        return new Response("boom", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }),
    });

    await expect(
      engine.search({
        query: "typescript",
        limit: 5,
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(WebSearchError);
  });
});
