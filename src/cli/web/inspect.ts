import { buildCommand, numberParser } from "@stricli/core";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/services/terminal/batch.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";
import {
  createWebPageInspector,
  runWebInspectCommand,
} from "#app/services/web/inspect.ts";

const webPageInspector = createWebPageInspector({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

type WebInspectFlags = Readonly<{
  batchOutput: (typeof batchOutputFormats)[number];
  inputFormat: (typeof batchInputFormats)[number];
  json: boolean;
  stdin: boolean;
  timeout: number;
}>;

export const webInspectCommand = buildCommand({
  docs: {
    brief: "Fetch a web page and print metadata without article extraction",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebInspectFlags,
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
      const output = await runWebInspectCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webPageInspector,
        },
      );

      this.process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags.batchOutput,
      commandId: "web:inspect",
      execute: async (nextUrl) => {
        return runWebInspectCommand(
          {
            options: {
              json: false,
              timeout: flags.timeout,
            },
            url: nextUrl,
          },
          {
            webPageInspector,
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
      t: "timeout",
    },
    flags: {
      batchOutput: {
        brief: "Batch output format",
        default: "text",
        kind: "enum",
        values: batchOutputFormats,
      },
      inputFormat: {
        brief: "Stdin batch input format",
        default: "text",
        kind: "enum",
        values: batchInputFormats,
      },
      json: {
        brief: "Print inspection results as JSON",
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
          brief: "Web page URL",
          optional: true,
          parse: String,
          placeholder: "url",
        },
      ],
    },
  },
});
