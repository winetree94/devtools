import { fileURLToPath } from "node:url";

import { buildChoiceParser, buildCommand } from "@stricli/core";
import {
  createSkillUninstaller,
  formatSkillUninstallResult,
  runUninstallSkillsCommand,
  SkillUninstallError,
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
  all: boolean;
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
    agent?: SupportedSkillInstallAgent,
  ): Promise<void> {
    if (flags.all && flags.targetDir !== undefined) {
      throw new SkillUninstallError(
        "--all and --target-dir cannot be used together.",
      );
    }

    if (flags.all && agent !== undefined) {
      throw new SkillUninstallError(
        "--all and a specific agent cannot be used together.",
      );
    }

    if (!flags.all && agent === undefined) {
      throw new SkillUninstallError(
        "Specify an agent to uninstall for, or use --all to uninstall for all agents.",
      );
    }

    if (flags.all) {
      for (const target of supportedSkillInstallAgents) {
        const result = await skillUninstaller.uninstall({
          agent: target,
          dryRun: flags.dryRun,
        });
        this.process.stdout.write(formatSkillUninstallResult(result));
      }

      return;
    }

    const output = await runUninstallSkillsCommand(
      {
        agent: agent as SupportedSkillInstallAgent,
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
      all: {
        brief: "Uninstall skills for all supported agent harnesses",
        kind: "boolean",
      },
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
          optional: true,
          parse: buildChoiceParser(supportedSkillInstallAgents),
          placeholder: "agent",
        },
      ],
    },
  },
});
