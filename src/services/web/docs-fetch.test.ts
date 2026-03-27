import { describe, expect, it, vi } from "vitest";

import {
  createFetchWebDocsReader,
  formatWebDocsContent,
  runWebDocsFetchCommand,
  WebDocsReadError,
} from "#app/services/web/docs-fetch.ts";

type WebDocsContent = Awaited<
  ReturnType<ReturnType<typeof createFetchWebDocsReader>["read"]>
>;

const sampleContent = {
  blocks: [],
  canonicalUrl: "https://example.com/docs/reference",
  codeBlocks: [],
  contentRoot: {
    selector: "main",
    strategy: "main",
  },
  description: "Docs description",
  finalUrl: "https://example.com/docs/reference",
  headings: [],
  language: "en",
  markdown: "# API Reference",
  requestedUrl: "https://example.com/docs/reference",
  sections: [],
  siteName: "Example Docs",
  tables: [],
  text: "API Reference",
  title: "Docs title",
  warnings: [],
} satisfies WebDocsContent;

describe("formatWebDocsContent", () => {
  it("formats markdown output", () => {
    expect(formatWebDocsContent(sampleContent, "markdown")).toBe(
      "# API Reference\n",
    );
  });

  it("formats json output", () => {
    expect(JSON.parse(formatWebDocsContent(sampleContent, "json"))).toEqual(
      sampleContent,
    );
  });
});

describe("runWebDocsFetchCommand", () => {
  it("maps validated input to the docs reader", async () => {
    const requests: Array<{ timeoutMs: number; url: string }> = [];

    const output = await runWebDocsFetchCommand(
      {
        options: {
          format: "json",
          timeout: 1_000,
        },
        url: "https://example.com/docs/reference",
      },
      {
        webDocsReader: {
          read: async (request) => {
            requests.push(request);
            return sampleContent;
          },
        },
      },
    );

    expect(JSON.parse(output)).toMatchObject({
      finalUrl: "https://example.com/docs/reference",
      title: "Docs title",
    });
    expect(requests).toEqual([
      {
        timeoutMs: 1_000,
        url: "https://example.com/docs/reference",
      },
    ]);
  });
});

describe("createFetchWebDocsReader", () => {
  it("extracts sections, code blocks, tables, and markdown from docs pages", async () => {
    const reader = createFetchWebDocsReader({
      fetchImplementation: vi.fn(async () => {
        return new Response(
          `
            <html lang="en">
              <head>
                <title>Fixture Docs Reference</title>
                <meta name="description" content="Fixture docs description" />
                <meta property="og:title" content="Fixture Docs OG Title" />
                <meta property="og:site_name" content="Fixture Docs" />
                <link rel="canonical" href="/docs/reference" />
              </head>
              <body>
                <nav><a href="/">Home</a></nav>
                <main>
                  <article>
                    <h1>API Reference</h1>
                    <p>Use <code>devtools web fetch</code> to read a page.</p>
                    <h2>Installation</h2>
                    <p>Install the CLI before running commands.</p>
                    <pre><code class="language-ts">export const answer = 42;
</code></pre>
                    <h2>Options</h2>
                    <table>
                      <caption>CLI Options</caption>
                      <thead>
                        <tr><th>Name</th><th>Description</th></tr>
                      </thead>
                      <tbody>
                        <tr><td><code>--json</code></td><td>Return JSON output</td></tr>
                      </tbody>
                    </table>
                  </article>
                </main>
              </body>
            </html>
          `,
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
            status: 200,
          },
        );
      }),
      userAgent: "devtools-test",
    });

    const result = await reader.read({
      timeoutMs: 1_000,
      url: "https://example.com/docs/reference",
    });

    expect(result.title).toBe("Fixture Docs OG Title");
    expect(result.description).toBe("Fixture docs description");
    expect(result.siteName).toBe("Fixture Docs");
    expect(result.contentRoot).toEqual({
      selector: "main",
      strategy: "main",
    });
    expect(result.headings).toMatchObject([
      { level: 1, text: "API Reference" },
      { level: 2, text: "Installation" },
      { level: 2, text: "Options" },
    ]);
    expect(result.codeBlocks).toMatchObject([
      {
        code: "export const answer = 42;",
        language: "ts",
      },
    ]);
    expect(result.tables).toMatchObject([
      {
        caption: "CLI Options",
        headers: ["Name", "Description"],
        rows: [["`--json`", "Return JSON output"]],
      },
    ]);
    expect(result.markdown).toContain("# API Reference");
    expect(result.markdown).toContain("```ts");
    expect(result.markdown).toContain("CLI Options");
  });

  it("wraps fetch failures", async () => {
    const reader = createFetchWebDocsReader({
      fetchImplementation: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    await expect(
      reader.read({
        timeoutMs: 1_000,
        url: "https://example.com/docs/reference",
      }),
    ).rejects.toThrowError("Web request failed: network down");
  });

  it("throws WebDocsReadError instances", async () => {
    const reader = createFetchWebDocsReader({
      fetchImplementation: vi.fn(async () => {
        return new Response("{}", {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        });
      }),
    });

    await expect(
      reader.read({
        timeoutMs: 1_000,
        url: "https://example.com/docs/reference",
      }),
    ).rejects.toBeInstanceOf(WebDocsReadError);
  });
});
