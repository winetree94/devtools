import { buildCommand, numberParser } from "@stricli/core";

import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.js";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.js";
import {
  createBraveSearchEngine,
  createSearchEngineRegistry,
  runWebSearchCommand,
} from "#app/services/web/search.js";

const createCommandSearchEngineRegistry = (
  env: NodeJS.ProcessEnv,
  apiKeyOverride?: string,
) => {
  const { BRAVE_SEARCH_API_KEY: braveSearchApiKey } = env;

  return createSearchEngineRegistry("brave", [
    createBraveSearchEngine({
      apiKey: apiKeyOverride ?? braveSearchApiKey,
      fetchImplementation: fetch,
    }),
  ]);
};

type WebSearchFlags = Readonly<{
  apiKey?: string;
  engine?: string;
  json: boolean;
  limit: number;
  site?: string;
  timeout: number;
}>;

export const webSearchCommand = buildCommand({
  docs: {
    brief: "Search the web",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebSearchFlags,
    query: string,
  ): Promise<void> {
    const output = await runWebSearchCommand(
      {
        options: flags,
        query,
      },
      {
        createSearchEngineRegistry: (apiKeyOverride?: string) => {
          return createCommandSearchEngineRegistry(
            this.process.env,
            apiKeyOverride,
          );
        },
      },
    );

    this.process.stdout.write(output);
  },
  parameters: {
    aliases: {
      e: "engine",
      l: "limit",
      s: "site",
      t: "timeout",
    },
    flags: {
      apiKey: {
        brief: "Override the API key for the selected engine",
        kind: "parsed",
        optional: true,
        parse: String,
        placeholder: "api-key",
      },
      engine: {
        brief: "Search engine to use",
        kind: "parsed",
        optional: true,
        parse: String,
        placeholder: "engine",
      },
      json: {
        brief: "Print results as JSON",
        kind: "boolean",
      },
      limit: {
        brief: "Maximum number of results to return",
        default: "5",
        kind: "parsed",
        parse: numberParser,
      },
      site: {
        brief:
          "Restrict results to a hostname or docs path, e.g. nodejs.org/docs",
        kind: "parsed",
        optional: true,
        parse: String,
        placeholder: "site",
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
          brief: "Keywords to search for",
          parse: String,
          placeholder: "query",
        },
      ],
    },
  },
});
