import { Args, Command, Flags } from "@oclif/core";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/cli/web/batch.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";
import {
  createWebPageInspector,
  runWebInspectCommand,
} from "#app/services/web/inspect.ts";

const webPageInspector = createWebPageInspector({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

export default class WebInspect extends Command {
  public static override summary =
    "Fetch a web page and print metadata without article extraction";

  public static override args = {
    url: Args.string({
      description: "Web page URL",
      required: false,
    }),
  };

  public static override flags = {
    json: Flags.boolean({
      default: false,
      description: "Print inspection results as JSON",
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
    const { args, flags } = await this.parse(WebInspect);

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
      const output = await runWebInspectCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webPageInspector,
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
      commandId: "web:inspect",
      execute: async (url) => {
        return runWebInspectCommand(
          {
            options: {
              json: false,
              timeout: flags.timeout,
            },
            url,
          },
          {
            webPageInspector,
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
