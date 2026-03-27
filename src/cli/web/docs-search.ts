import { buildCommand, numberParser } from "@stricli/core";

import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";
import { defaultWebRequestTimeoutMs } from "#app/services/web/http.ts";
import {
  createBraveSearchEngine,
  createSearchEngineRegistry,
  runWebDocsSearchCommand,
} from "#app/services/web/search.ts";

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

type WebDocsSearchFlags = Readonly<{
  apiKey?: string;
  engine?: string;
  json: boolean;
  limit: number;
  timeout: number;
}>;

export const webDocsSearchCommand = buildCommand({
  docs: {
    brief: "Search documentation within a specific site or docs path",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: WebDocsSearchFlags,
    site: string,
    query: string,
  ): Promise<void> {
    const output = await runWebDocsSearchCommand(
      {
        options: flags,
        query,
        site,
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
          brief: "Hostname or docs base path, e.g. nodejs.org/docs",
          parse: String,
          placeholder: "site",
        },
        {
          brief: "Keywords to search for",
          parse: String,
          placeholder: "query",
        },
      ],
    },
  },
});
