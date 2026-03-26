#!/usr/bin/env node
import { proposeCompletions } from "@stricli/core";

import { app } from "#app/cli/app.ts";
import { buildCliContext } from "#app/cli/context.ts";

const inputs = process.argv.slice(3);
const completionLine = process.env["COMP_LINE"];

if (completionLine?.endsWith(" ")) {
  inputs.push("");
}

try {
  const completions = await proposeCompletions(
    app,
    inputs,
    buildCliContext(process),
  );

  for (const { completion } of completions) {
    process.stdout.write(`${completion}\n`);
  }
} catch (error: unknown) {
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Autocomplete failed.\n");
  }

  process.exitCode = 1;
}
