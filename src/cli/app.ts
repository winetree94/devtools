import { ArgumentScannerError, buildApplication } from "@stricli/core";

import { rootRoutes } from "#app/cli/commands/index.ts";
import { readPackageVersion } from "#app/config/package.ts";

export const app = buildApplication(rootRoutes, {
  determineExitCode: (error) => {
    return error instanceof ArgumentScannerError ? 2 : 1;
  },
  documentation: {
    caseStyle: "convert-camel-to-kebab",
  },
  name: "devtools",
  scanner: {
    caseStyle: "allow-kebab-for-camel",
  },
  versionInfo: {
    getCurrentVersion: readPackageVersion,
  },
});
