import { fileURLToPath } from "node:url";

import { buildChoiceParser, buildCommand } from "@stricli/core";
import {
  createSkillInstaller,
  formatSkillInstallResult,
  runInstallSkillsCommand,
  SkillInstallError,
  type SupportedSkillInstallAgent,
  supportedSkillInstallAgents,
} from "#app/services/skills/install.ts";
import type { DevtoolsCliContext } from "#app/services/terminal/cli-runtime.ts";

const bundledSkillsDirectory = fileURLToPath(
  new URL("../../skills", import.meta.url),
);

const skillInstaller = createSkillInstaller({
  skillsDirectory: bundledSkillsDirectory,
});

type InstallSkillsFlags = Readonly<{
  all: boolean;
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
    agent?: SupportedSkillInstallAgent,
  ): Promise<void> {
    if (flags.all && flags.targetDir !== undefined) {
      throw new SkillInstallError(
        "--all and --target-dir cannot be used together.",
      );
    }

    if (flags.all && agent !== undefined) {
      throw new SkillInstallError(
        "--all and a specific agent cannot be used together.",
      );
    }

    if (!flags.all && agent === undefined) {
      throw new SkillInstallError(
        "Specify an agent to install for, or use --all to install for all agents.",
      );
    }

    if (flags.all) {
      for (const target of supportedSkillInstallAgents) {
        const result = await skillInstaller.install({
          agent: target,
          dryRun: flags.dryRun,
          force: flags.force,
        });
        this.process.stdout.write(formatSkillInstallResult(result));
      }

      return;
    }

    const output = await runInstallSkillsCommand(
      {
        agent: agent as SupportedSkillInstallAgent,
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
      all: {
        brief: "Install skills for all supported agent harnesses",
        kind: "boolean",
      },
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
          optional: true,
          parse: buildChoiceParser(supportedSkillInstallAgents),
          placeholder: "agent",
        },
      ],
    },
  },
});
