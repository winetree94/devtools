#!/usr/bin/env node
import { runCli } from "#app/application.ts";

void runCli(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`${String(error)}\n`);
  }

  process.exitCode = 1;
});
