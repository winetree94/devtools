import { buildRouteMap } from "@stricli/core";

import { autocompleteRoutes } from "#app/cli/commands/autocomplete/index.ts";
import { installRoutes } from "#app/cli/commands/install/index.ts";
import { uninstallRoutes } from "#app/cli/commands/uninstall/index.ts";
import { webRoutes } from "#app/cli/commands/web/index.ts";

export const rootRoutes = buildRouteMap({
  docs: {
    brief: "Web utilities and reusable skill workflows",
  },
  routes: {
    autocomplete: autocompleteRoutes,
    install: installRoutes,
    uninstall: uninstallRoutes,
    web: webRoutes,
  },
});
