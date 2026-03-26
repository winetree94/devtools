import { fileURLToPath } from "node:url";

import { buildChoiceParser, buildCommand } from "@stricli/core";

import type { DevtoolsCliContext } from "#app/cli/context.ts";
import {
  createSkillInstaller,
  runInstallSkillsCommand,
  type SupportedSkillInstallAgent,
  supportedSkillInstallAgents,
} from "#app/services/skills/install.ts";

const bundledSkillsDirectory = fileURLToPath(
  new URL("../../../../skills", import.meta.url),
);

const skillInstaller = createSkillInstaller({
  skillsDirectory: bundledSkillsDirectory,
});

type InstallSkillsFlags = Readonly<{
  dryRun: boolean;
  force: boolean;
  targetDir?: string;
}>;

export const installSkillsCommand = buildCommand({
  docs: {
    brief: "Install bundled skill templates for an agent harness",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: InstallSkillsFlags,
    agent: SupportedSkillInstallAgent,
  ): Promise<void> {
    const output = await runInstallSkillsCommand(
      {
        agent,
        options: flags,
      },
      {
        skillInstaller,
      },
    );

    this.process.stdout.write(output);
  },
  parameters: {
    flags: {
      dryRun: {
        brief: "Show what would be installed without changing files",
        kind: "boolean",
      },
      force: {
        brief: "Replace existing skill targets",
        kind: "boolean",
      },
      targetDir: {
        brief: "Override the destination directory for installed skills",
        kind: "parsed",
        optional: true,
        parse: String,
        placeholder: "path",
      },
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Agent harness to install skills for",
          parse: buildChoiceParser(supportedSkillInstallAgents),
          placeholder: "agent",
        },
      ],
    },
  },
});
