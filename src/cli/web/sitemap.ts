import { buildCommand, numberParser } from "@stricli/core";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/services/terminal/batch.js";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.js";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.js";
import {
  createWebSitemapReader,
  defaultSitemapConcurrency,
  runWebSitemapCommand,
} from "#app/services/web/sitemap.js";

const webSitemapReader = createWebSitemapReader({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

type WebSitemapFlags = Readonly<{
  batchOutput: (typeof batchOutputFormats)[number];
  concurrency: number;
  inputFormat: (typeof batchInputFormats)[number];
  json: boolean;
  sameOrigin: boolean;
  stdin: boolean;
  timeout: number;
}>;

export const webSitemapCommand = buildCommand({
  docs: {
    brief: "Read a sitemap.xml file or discover sitemap URLs for a site",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebSitemapFlags,
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
      const output = await runWebSitemapCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webSitemapReader,
        },
      );

      this.process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags.batchOutput,
      commandId: "web:sitemap",
      execute: async (nextUrl) => {
        return runWebSitemapCommand(
          {
            options: {
              concurrency: flags.concurrency,
              json: false,
              sameOrigin: flags.sameOrigin,
              timeout: flags.timeout,
            },
            url: nextUrl,
          },
          {
            webSitemapReader,
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
        brief: "Maximum number of sitemap requests to run at once",
        default: defaultSitemapConcurrency,
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
        brief: "Print sitemap results as JSON",
        kind: "boolean",
      },
      sameOrigin: {
        brief: "Only include same-origin sitemap URLs",
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
          brief: "Site URL or sitemap XML URL",
          optional: true,
          parse: String,
          placeholder: "url",
        },
      ],
    },
  },
});
