import { fileURLToPath } from "node:url";

import { buildChoiceParser, buildCommand } from "@stricli/core";
import {
  createSkillUninstaller,
  runUninstallSkillsCommand,
  type SupportedSkillInstallAgent,
  supportedSkillInstallAgents,
} from "#app/services/skills/install.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";

const bundledSkillsDirectory = fileURLToPath(
  new URL("../../skills", import.meta.url),
);

const skillUninstaller = createSkillUninstaller({
  skillsDirectory: bundledSkillsDirectory,
});

type UninstallSkillsFlags = Readonly<{
  dryRun: boolean;
  targetDir?: string;
}>;

export const uninstallSkillsCommand = buildCommand({
  docs: {
    brief: "Uninstall bundled skill templates for an agent harness",
  },
  func: async function (
    this: DevtoolsCliContext,
    flags: UninstallSkillsFlags,
    agent: SupportedSkillInstallAgent,
  ): Promise<void> {
    const output = await runUninstallSkillsCommand(
      {
        agent,
        options: flags,
      },
      {
        skillUninstaller,
      },
    );

    this.process.stdout.write(output);
  },
  parameters: {
    flags: {
      dryRun: {
        brief: "Show what would be uninstalled without changing files",
        kind: "boolean",
      },
      targetDir: {
        brief: "Override the destination directory for uninstalled skills",
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
          brief: "Agent harness to uninstall skills for",
          parse: buildChoiceParser(supportedSkillInstallAgents),
          placeholder: "agent",
        },
      ],
    },
  },
});
