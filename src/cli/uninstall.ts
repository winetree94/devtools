import { buildRouteMap } from "@stricli/core";

import { uninstallSkillsCommand } from "#app/cli/uninstall-skills.js";

const uninstallRoutes = buildRouteMap({
  docs: {
    brief: "Uninstall packaged resources",
  },
  routes: {
    skills: uninstallSkillsCommand,
  },
});

export default uninstallRoutes;
