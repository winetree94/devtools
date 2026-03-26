#!/usr/bin/env node
import { ExitCode, run } from "@stricli/core";

import { app } from "#app/cli/app.ts";
import { buildCliContext } from "#app/cli/context.ts";
import { loadEnvironment } from "#app/config/env.ts";

loadEnvironment();
await run(app, process.argv.slice(2), buildCliContext(process));

if (process.exitCode === ExitCode.UnknownCommand) {
  process.exitCode = 2;
} else if (process.exitCode === ExitCode.InvalidArgument) {
  process.exitCode = 2;
} else if (typeof process.exitCode === "number" && process.exitCode < 0) {
  process.exitCode = 1;
}
