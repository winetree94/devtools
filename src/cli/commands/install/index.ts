import { buildRouteMap } from "@stricli/core";

import { installSkillsCommand } from "#app/cli/commands/install/skills.ts";

export const installRoutes = buildRouteMap({
  docs: {
    brief: "Install packaged resources",
  },
  routes: {
    skills: installSkillsCommand,
  },
});
