import { Args, Command, Flags } from "@oclif/core";

import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/cli/web/batch.ts";
import {
  createFetchWebPageReader,
  runWebFetchCommand,
  webPageOutputFormats,
} from "#app/services/web/fetch.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";

const webPageReader = createFetchWebPageReader({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

export default class WebFetch extends Command {
  public static override summary =
    "Fetch a web page and convert it to structured output";

  public static override args = {
    url: Args.string({
      description: "Web page URL",
      required: false,
    }),
  };

  public static override flags = {
    format: Flags.string({
      char: "f",
      default: "markdown",
      description: "Output format",
      options: [...webPageOutputFormats],
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
    const { args, flags } = await this.parse(WebFetch);
    const inputs = await resolveUrlCommandInputs({
      inputFormat: flags["input-format"],
      missingInputMessage: "URL is required unless stdin is provided.",
      providedUrl: args.url,
      stdin: flags.stdin,
    });

    if (inputs.mode === "single") {
      const output = await runWebFetchCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webPageReader,
        },
      );

      process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags["batch-output"],
      commandId: "web:fetch",
      execute: async (url) => {
        return runWebFetchCommand(
          {
            options: flags,
            url,
          },
          {
            webPageReader,
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
