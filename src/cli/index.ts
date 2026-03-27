import { type Application, buildRouteMap } from "@stricli/core";

import { buildAutocompleteRoute } from "#app/cli/autocomplete.ts";
import installRoutes from "#app/cli/install.ts";
import uninstallRoutes from "#app/cli/uninstall.ts";
import webRoutes from "#app/cli/web/index.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";

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
