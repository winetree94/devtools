import { buildCommand, numberParser } from "@stricli/core";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/services/terminal/batch.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";
import {
  createFetchWebDocsReader,
  runWebDocsFetchCommand,
  webDocsOutputFormats,
} from "#app/services/web/docs-fetch.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";

const webDocsReader = createFetchWebDocsReader({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

type WebDocsFetchFlags = Readonly<{
  batchOutput: (typeof batchOutputFormats)[number];
  format: (typeof webDocsOutputFormats)[number];
  inputFormat: (typeof batchInputFormats)[number];
  stdin: boolean;
  timeout: number;
}>;

export const webDocsFetchCommand = buildCommand({
  docs: {
    brief: "Fetch a documentation page and extract structured sections",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebDocsFetchFlags,
    url?: string,
  ): Promise<void> {
    const inputs = await resolveUrlCommandInputs({
      inputFormat: flags.inputFormat,
      missingInputMessage: "URL is required unless stdin is provided.",
      providedUrl: url,
      stdin: flags.stdin,
    });

    if (inputs.mode === "single") {
      const output = await runWebDocsFetchCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webDocsReader,
        },
      );

      this.process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags.batchOutput,
      commandId: "web:docs-fetch",
      execute: async (nextUrl) => {
        return runWebDocsFetchCommand(
          {
            options: flags,
            url: nextUrl,
          },
          {
            webDocsReader,
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
        default: "json",
        kind: "enum",
        values: webDocsOutputFormats,
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
          brief: "Documentation page URL",
          optional: true,
          parse: String,
          placeholder: "url",
        },
      ],
    },
  },
});
