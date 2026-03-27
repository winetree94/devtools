import { buildCommand, numberParser } from "@stricli/core";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/services/terminal/batch.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";
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

type WebFetchFlags = Readonly<{
  batchOutput: (typeof batchOutputFormats)[number];
  format: (typeof webPageOutputFormats)[number];
  inputFormat: (typeof batchInputFormats)[number];
  stdin: boolean;
  timeout: number;
}>;

export const webFetchCommand = buildCommand({
  docs: {
    brief: "Fetch a web page and convert it to structured output",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebFetchFlags,
    url?: string,
  ): Promise<void> {
    const inputs = await resolveUrlCommandInputs({
      inputFormat: flags.inputFormat,
      missingInputMessage: "URL is required unless stdin is provided.",
      providedUrl: url,
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

      this.process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags.batchOutput,
      commandId: "web:fetch",
      execute: async (nextUrl) => {
        return runWebFetchCommand(
          {
            options: flags,
            url: nextUrl,
          },
          {
            webPageReader,
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
      f: "format",
      t: "timeout",
    },
    flags: {
      batchOutput: {
        brief: "Batch output format",
        default: "text",
        kind: "enum",
        values: batchOutputFormats,
      },
      format: {
        brief: "Output format",
        default: "markdown",
        kind: "enum",
        values: webPageOutputFormats,
      },
      inputFormat: {
        brief: "Stdin batch input format",
        default: "text",
        kind: "enum",
        values: batchInputFormats,
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
