import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { StricliAutoCompleteContext } from "@stricli/auto-complete";
import type { CommandContext } from "@stricli/core";

export interface DevtoolsCliContext
  extends CommandContext,
    StricliAutoCompleteContext {
  readonly process: NodeJS.Process;
}

export const buildCliContext = (
  process: NodeJS.Process,
): DevtoolsCliContext => {
  return {
    fs,
    os,
    path,
    process,
  };
};
