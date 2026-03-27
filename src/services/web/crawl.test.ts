import { describe, expect, it, vi } from "vitest";

import {
  createWebCrawler,
  formatWebCrawlResult,
  runWebCrawlCommand,
  WebCrawlError,
} from "#app/services/web/crawl.ts";

type WebCrawlResult = Awaited<
  ReturnType<ReturnType<typeof createWebCrawler>["crawl"]>
>;

const sampleCrawlResult = {
  concurrency: 2,
  maxDepth: 2,
  maxPages: 10,
  pages: [
    {
      canonicalUrl: "https://example.com/",
      depth: 0,
      error: undefined,
      finalUrl: "https://example.com/",
      outboundLinkCount: 2,
      parentUrl: undefined,
      queuedLinkCount: 2,
      requestedUrl: "https://example.com/",
      status: "ok",
      title: "Home",
    },
  ],
  requestedUrl: "https://example.com/",
  sameOriginOnly: true,
  stats: {
    errors: 0,
    queuedPages: 3,
    skippedDuplicates: 1,
    skippedExternal: 1,
    skippedFragments: 1,
    visitedPages: 1,
  },
} satisfies WebCrawlResult;

const createFetchImplementation = (
  responses: Record<string, Response | (() => Response | Promise<Response>)>,
): typeof fetch => {
  return vi.fn(async (input) => {
    const url = input instanceof URL ? input.toString() : String(input);
    const response = responses[url];

    if (response === undefined) {
      throw new Error(`Unexpected URL: ${url}`);
    }

    if (typeof response === "function") {
      return await response();
    }

    return response;
  });
};

describe("formatWebCrawlResult", () => {
  it("formats text output", () => {
    expect(formatWebCrawlResult(sampleCrawlResult, false)).toContain(
      "1. [ok] https://example.com/",
    );
  });

  it("formats json output", () => {
    expect(JSON.parse(formatWebCrawlResult(sampleCrawlResult, true))).toEqual(
      sampleCrawlResult,
    );
  });
});

describe("runWebCrawlCommand", () => {
  it("maps validated input to the crawler", async () => {
    const requests: Array<{
      concurrency: number;
      maxDepth: number;
      maxPages: number;
      sameOriginOnly: boolean;
      timeoutMs: number;
      url: string;
    }> = [];

    const output = await runWebCrawlCommand(
      {
        options: {
          concurrency: 2,
          json: true,
          "max-depth": 2,
          "max-pages": 10,
          "same-origin": true,
          timeout: 1_000,
        },
        url: "https://example.com",
      },
      {
        webCrawler: {
          crawl: async (request) => {
            requests.push(request);
            return sampleCrawlResult;
          },
        },
      },
    );

    expect(JSON.parse(output)).toMatchObject({
      requestedUrl: "https://example.com/",
      sameOriginOnly: true,
    });
    expect(requests).toEqual([
      {
        concurrency: 2,
        maxDepth: 2,
        maxPages: 10,
        sameOriginOnly: true,
        timeoutMs: 1_000,
        url: "https://example.com",
      },
    ]);
  });
});

describe("createWebCrawler", () => {
  it("crawls pages breadth-first and records errors without failing the whole crawl", async () => {
    const crawler = createWebCrawler({
      fetchImplementation: createFetchImplementation({
        "https://example.com/": new Response(
          "<html><body><main><h1>Home</h1><a href='/docs'>Docs</a><a href='/broken'>Broken</a><a href='https://external.example.com/offsite'>Offsite</a><a href='#intro'>Intro</a></main></body></html>",
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
            status: 200,
          },
        ),
        "https://example.com/broken": new Response("missing", {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
          status: 404,
          statusText: "Not Found",
        }),
        "https://example.com/docs": new Response(
          "<html><body><main><h1>Docs</h1><a href='/guide'>Guide</a><a href='/'>Home</a></main></body></html>",
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
            status: 200,
          },
        ),
        "https://example.com/guide": new Response(
          "<html><body><main><h1>Guide</h1></main></body></html>",
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
            status: 200,
          },
        ),
      }),
    });

    const result = await crawler.crawl({
      concurrency: 2,
      maxDepth: 2,
      maxPages: 10,
      sameOriginOnly: true,
      timeoutMs: 1_000,
      url: "https://example.com",
    });

    expect(result.pages).toMatchObject([
      {
        depth: 0,
        finalUrl: "https://example.com/",
        queuedLinkCount: 2,
        status: "ok",
      },
      {
        depth: 1,
        requestedUrl: "https://example.com/broken",
        status: "error",
      },
      {
        depth: 1,
        finalUrl: "https://example.com/docs",
        status: "ok",
      },
      {
        depth: 2,
        finalUrl: "https://example.com/guide",
        status: "ok",
      },
    ]);
    expect(result.stats).toMatchObject({
      errors: 1,
      skippedDuplicates: 1,
      skippedExternal: 1,
      skippedFragments: 1,
      visitedPages: 4,
    });
  });

  it("wraps timeout failures", async () => {
    const crawler = createWebCrawler({
      fetchImplementation: vi.fn(async (_input, init) => {
        init?.signal?.throwIfAborted();

        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });

        init?.signal?.throwIfAborted();

        return new Response("<html><body>never reached</body></html>", {
          headers: {
            "Content-Type": "text/html",
          },
          status: 200,
        });
      }),
    });

    const result = await crawler.crawl({
      concurrency: 1,
      maxDepth: 0,
      maxPages: 1,
      sameOriginOnly: true,
      timeoutMs: 1,
      url: "https://example.com",
    });

    expect(result.pages[0]).toMatchObject({
      error: "Web request timed out after 1ms.",
      status: "error",
    });
  });

  it("throws WebCrawlError for invalid max pages", async () => {
    await expect(
      runWebCrawlCommand(
        {
          options: {
            concurrency: 1,
            json: false,
            "max-depth": 0,
            "max-pages": 0,
            "same-origin": true,
            timeout: 1_000,
          },
          url: "https://example.com",
        },
        {
          webCrawler: {
            crawl: async () => sampleCrawlResult,
          },
        },
      ),
    ).rejects.toBeInstanceOf(WebCrawlError);
  });
});
