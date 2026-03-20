import { Args, Command, Flags } from "@oclif/core";

import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/cli/web/batch.ts";
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

export default class WebCrawl extends Command {
  public static override summary =
    "Crawl a website and summarize discovered pages";

  public static override args = {
    url: Args.string({
      description: "Seed URL",
      required: false,
    }),
  };

  public static override flags = {
    json: Flags.boolean({
      default: false,
      description: "Print crawl results as JSON",
    }),
    "same-origin": Flags.boolean({
      default: false,
      description: "Only follow same-origin links",
    }),
    concurrency: Flags.integer({
      char: "c",
      default: Number.parseInt(defaultWebCrawlConcurrency, 10),
      description: "Maximum number of page requests to run at once",
    }),
    "max-depth": Flags.integer({
      default: Number.parseInt(defaultWebCrawlMaxDepth, 10),
      description: "Maximum crawl depth",
    }),
    "max-pages": Flags.integer({
      default: Number.parseInt(defaultWebCrawlMaxPages, 10),
      description: "Maximum pages to visit",
    }),
    timeout: Flags.integer({
      char: "t",
      default: Number.parseInt(defaultWebRequestTimeoutMs, 10),
      description: "Request timeout in milliseconds",
    }),
    stdin: Flags.boolean({
      default: false,
      description: "Read newline-delimited URLs from stdin",
    }),
    "input-format": Flags.string({
      default: "text",
      description: "Stdin batch input format",
      options: [...batchInputFormats],
    }),
    "batch-output": Flags.string({
      default: "text",
      description: "Batch output format",
      options: [...batchOutputFormats],
    }),
  };

  public override async run(): Promise<void> {
    const { args, flags } = await this.parse(WebCrawl);

    if (flags.stdin && flags.json) {
      throw new Error(
        "--json is not supported with batch input. Use --batch-output jsonl instead.",
      );
    }

    const inputs = await resolveUrlCommandInputs({
      inputFormat: flags["input-format"],
      missingInputMessage: "URL is required unless stdin is provided.",
      providedUrl: args.url,
      stdin: flags.stdin,
    });

    if (inputs.mode === "single") {
      const output = await runWebCrawlCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webCrawler,
        },
      );

      process.stdout.write(output);
      return;
    }

    if (flags.json) {
      throw new Error(
        "--json is not supported with batch input. Use --batch-output jsonl instead.",
      );
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags["batch-output"],
      commandId: "web:crawl",
      execute: async (url) => {
        return runWebCrawlCommand(
          {
            options: {
              concurrency: flags.concurrency,
              json: false,
              "max-depth": flags["max-depth"],
              "max-pages": flags["max-pages"],
              "same-origin": flags["same-origin"],
              timeout: flags.timeout,
            },
            url,
          },
          {
            webCrawler,
          },
        );
      },
      urls: inputs.urls,
    });

    if (result.hadErrors) {
      process.exitCode = 1;
    }

    process.stdout.write(result.output);
  }
}
