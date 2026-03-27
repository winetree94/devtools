import {
  type Application,
  type ApplicationText,
  ArgumentScannerError,
  buildApplication,
  ExitCode,
  run,
  text_en,
} from "@stricli/core";

import { buildRootRoute } from "#app/cli/index.ts";
import { loadEnvironment } from "#app/config/env.ts";
import { formatErrorMessage } from "#app/lib/output.ts";
import { currentVersion } from "#app/lib/version.ts";
import {
  createCliContext,
  type DevtoolsCliContext,
} from "#app/services/terminal/cli-runtime.ts";

type CommandError = Error & {
  exitCode?: number;
};

const formatRuntimeError = (error: unknown) => {
  return formatErrorMessage(
    error instanceof Error ? error : new Error(String(error)),
  );
};

const devtoolsText: ApplicationText = {
  ...text_en,
  commandErrorResult: (error) => {
    return formatErrorMessage(error);
  },
  exceptionWhileLoadingCommandContext: (error) => {
    return formatRuntimeError(error);
  },
  exceptionWhileLoadingCommandFunction: (error) => {
    return formatRuntimeError(error);
  },
  exceptionWhileRunningCommand: (error) => {
    return formatRuntimeError(error);
  },
  noCommandRegisteredForInput: ({ corrections, input }) => {
    const suggestion =
      corrections.length === 0
        ? ""
        : ` Did you mean ${corrections.map((entry) => `"${entry}"`).join(", ")}?`;

    return `Command "${input}" not found.${suggestion}\n`;
  },
};

const resolveExitCode = (error: unknown) => {
  if (error instanceof ArgumentScannerError) {
    return 2;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "exitCode" in error &&
    typeof error.exitCode === "number"
  ) {
    return (error as CommandError).exitCode ?? 1;
  }

  return 1;
};

let application: Application<DevtoolsCliContext> | undefined;

const getApplication = () => {
  if (application === undefined) {
    throw new Error("CLI application has not been initialized.");
  }

  return application;
};

const rootRoute = buildRootRoute(getApplication);

application = buildApplication(rootRoute, {
  completion: {
    includeAliases: false,
  },
  determineExitCode: resolveExitCode,
  documentation: {
    caseStyle: "convert-camel-to-kebab",
  },
  localization: {
    defaultLocale: "en",
    loadText: () => devtoolsText,
  },
  name: "devtools",
  scanner: {
    caseStyle: "allow-kebab-for-camel",
  },
  versionInfo: {
    currentVersion,
  },
});

export const cliApplication = application;

export const runCli = async (inputs: readonly string[]) => {
  loadEnvironment();
  await run(cliApplication, inputs, createCliContext());

  if (process.exitCode === ExitCode.UnknownCommand) {
    process.exitCode = 2;
  } else if (process.exitCode === ExitCode.InvalidArgument) {
    process.exitCode = 2;
  } else if (typeof process.exitCode === "number" && process.exitCode < 0) {
    process.exitCode = 1;
  }
};
