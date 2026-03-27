import { buildCommand, numberParser } from "@stricli/core";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/services/terminal/batch.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";
import {
  createWebCrawler,
  defaultWebCrawlConcurrency,
  defaultWebCrawlMaxDepth,
  defaultWebCrawlMaxPages,
  runWebCrawlCommand,
} from "#app/services/web/crawl.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";

const webCrawler = createWebCrawler({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

type WebCrawlFlags = Readonly<{
  batchOutput: (typeof batchOutputFormats)[number];
  concurrency: number;
  inputFormat: (typeof batchInputFormats)[number];
  json: boolean;
  maxDepth: number;
  maxPages: number;
  sameOrigin: boolean;
  stdin: boolean;
  timeout: number;
}>;

export const webCrawlCommand = buildCommand({
  docs: {
    brief: "Crawl a website and summarize discovered pages",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebCrawlFlags,
    url?: string,
  ): Promise<void> {
    if (flags.stdin && flags.json) {
      throw new Error(
        "--json is not supported with batch input. Use --batch-output jsonl instead.",
      );
    }

    const inputs = await resolveUrlCommandInputs({
      inputFormat: flags.inputFormat,
      missingInputMessage: "URL is required unless stdin is provided.",
      providedUrl: url,
      stdin: flags.stdin,
    });

    if (inputs.mode === "single") {
      const output = await runWebCrawlCommand(
        {
          options: {
            "max-depth": flags.maxDepth,
            "max-pages": flags.maxPages,
            "same-origin": flags.sameOrigin,
            concurrency: flags.concurrency,
            json: flags.json,
            timeout: flags.timeout,
          },
          url: inputs.url,
        },
        {
          webCrawler,
        },
      );

      this.process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags.batchOutput,
      commandId: "web:crawl",
      execute: async (nextUrl) => {
        return runWebCrawlCommand(
          {
            options: {
              "max-depth": flags.maxDepth,
              "max-pages": flags.maxPages,
              "same-origin": flags.sameOrigin,
              concurrency: flags.concurrency,
              json: false,
              timeout: flags.timeout,
            },
            url: nextUrl,
          },
          {
            webCrawler,
          },
        );
      },
      urls: inputs.urls,
    });

    if (result.hadErrors) {
      this.process.exitCode = 1;
    }

    this.process.stdout.write(result.output);
  },
  parameters: {
    aliases: {
      c: "concurrency",
      t: "timeout",
    },
    flags: {
      batchOutput: {
        brief: "Batch output format",
        default: "text",
        kind: "enum",
        values: batchOutputFormats,
      },
      concurrency: {
        brief: "Maximum number of page requests to run at once",
        default: defaultWebCrawlConcurrency,
        kind: "parsed",
        parse: numberParser,
      },
      inputFormat: {
        brief: "Stdin batch input format",
        default: "text",
        kind: "enum",
        values: batchInputFormats,
      },
      json: {
        brief: "Print crawl results as JSON",
        kind: "boolean",
      },
      maxDepth: {
        brief: "Maximum crawl depth",
        default: defaultWebCrawlMaxDepth,
        kind: "parsed",
        parse: numberParser,
      },
      maxPages: {
        brief: "Maximum pages to visit",
        default: defaultWebCrawlMaxPages,
        kind: "parsed",
        parse: numberParser,
      },
      sameOrigin: {
        brief: "Only follow same-origin links",
        kind: "boolean",
      },
      stdin: {
        brief: "Read newline-delimited URLs from stdin",
        kind: "boolean",
      },
      timeout: {
        brief: "Request timeout in milliseconds",
        default: defaultWebRequestTimeoutMs,
        kind: "parsed",
        parse: numberParser,
      },
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Seed URL",
          optional: true,
          parse: String,
          placeholder: "url",
        },
      ],
    },
  },
});
