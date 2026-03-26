import { buildRouteMap } from "@stricli/core";

import { uninstallSkillsCommand } from "#app/cli/commands/uninstall/skills.ts";

export const uninstallRoutes = buildRouteMap({
  docs: {
    brief: "Uninstall packaged resources",
  },
  routes: {
    skills: uninstallSkillsCommand,
  },
});
