import { type Application, buildRouteMap } from "@stricli/core";

import { buildAutocompleteRoute } from "#app/cli/autocomplete.js";
import installRoutes from "#app/cli/install.js";
import uninstallRoutes from "#app/cli/uninstall.js";
import webRoutes from "#app/cli/web/index.js";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.js";

export const buildRootRoute = (
  getApplication: () => Application<DevtoolsCliContext>,
) => {
  const { autocompleteRoute, completeCommand } =
    buildAutocompleteRoute(getApplication);

  return buildRouteMap({
    docs: {
      brief: "Web utilities and reusable skill workflows",
      fullDescription:
        "Search the web, inspect pages, extract structured content, and manage bundled agent skills from the terminal.",
      hideRoute: {
        __complete: true,
      },
    },
    routes: {
      __complete: completeCommand,
      autocomplete: autocompleteRoute,
      install: installRoutes,
      uninstall: uninstallRoutes,
      web: webRoutes,
    },
  });
};
