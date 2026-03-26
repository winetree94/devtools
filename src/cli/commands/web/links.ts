import { buildCommand, numberParser } from "@stricli/core";

import type { DevtoolsCliContext } from "#app/cli/context.ts";
import {
  batchInputFormats,
  batchOutputFormats,
  resolveUrlCommandInputs,
  runUrlBatchCommand,
} from "#app/cli/web/batch.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";
import {
  createWebPageLinkReader,
  runWebLinksCommand,
} from "#app/services/web/links.ts";

const webPageLinkReader = createWebPageLinkReader({
  fetchImplementation: fetch,
  userAgent: "devtools/0.1.0",
});

type WebLinksFlags = Readonly<{
  batchOutput: (typeof batchOutputFormats)[number];
  inputFormat: (typeof batchInputFormats)[number];
  json: boolean;
  sameOrigin: boolean;
  stdin: boolean;
  timeout: number;
}>;

export const webLinksCommand = buildCommand({
  docs: {
    brief: "Fetch a web page and extract normalized links",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebLinksFlags,
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
      const output = await runWebLinksCommand(
        {
          options: flags,
          url: inputs.url,
        },
        {
          webPageLinkReader,
        },
      );

      this.process.stdout.write(output);
      return;
    }

    const result = await runUrlBatchCommand({
      batchOutput: flags.batchOutput,
      commandId: "web:links",
      execute: async (nextUrl) => {
        return runWebLinksCommand(
          {
            options: {
              json: false,
              sameOrigin: flags.sameOrigin,
              timeout: flags.timeout,
            },
            url: nextUrl,
          },
          {
            webPageLinkReader,
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
        brief: "Print links as JSON",
        kind: "boolean",
      },
      sameOrigin: {
        brief: "Only include same-origin links",
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
