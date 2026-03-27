import { buildRouteMap } from "@stricli/core";

import { installSkillsCommand } from "#app/cli/install-skills.js";

const installRoutes = buildRouteMap({
  docs: {
    brief: "Install packaged resources",
  },
  routes: {
    skills: installSkillsCommand,
  },
});

export default installRoutes;
