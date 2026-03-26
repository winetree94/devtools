import {
  buildInstallCommand,
  buildUninstallCommand,
} from "@stricli/auto-complete";
import { buildRouteMap } from "@stricli/core";

import type { DevtoolsCliContext } from "#app/cli/context.ts";

export const autocompleteRoutes = buildRouteMap({
  docs: {
    brief: "Manage shell autocomplete support",
  },
  routes: {
    install: buildInstallCommand<DevtoolsCliContext>("devtools", {
      bash: "__devtools_bash_complete",
    }),
    uninstall: buildUninstallCommand<DevtoolsCliContext>("devtools", {
      bash: true,
    }),
  },
});
