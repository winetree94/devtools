import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { writeStdout } from "#app/lib/output.ts";

export type DevtoolsCliContext = {
  fs: {
    promises: typeof fs.promises;
  };
  os: typeof os;
  path: typeof path;
  process: NodeJS.Process;
};

export const createCliContext = (): DevtoolsCliContext => {
  return {
    fs: {
      promises: fs.promises,
    },
    os,
    path,
    process,
  };
};

export const print = (output: string) => {
  writeStdout(output);
};
