import { homedir } from "node:os";
import { resolve } from "node:path";

export const supportedSkillInstallAgents = [
  "common",
  "claude",
  "opencode",
  "copilot",
] as const;

export type SupportedSkillInstallAgent =
  (typeof supportedSkillInstallAgents)[number];

const skillInstallTargetDirectoryResolvers = {
  common: (_environment: NodeJS.ProcessEnv) =>
    resolve(homedir(), ".agents", "skills"),
  claude: (_environment: NodeJS.ProcessEnv) =>
    resolve(homedir(), ".claude", "skills"),
  opencode: (_environment: NodeJS.ProcessEnv) =>
    resolve(homedir(), ".config", "opencode", "skills"),
  copilot: (_environment: NodeJS.ProcessEnv) =>
    resolve(homedir(), ".copilot", "skills"),
} satisfies Record<
  SupportedSkillInstallAgent,
  (environment: NodeJS.ProcessEnv) => string
>;

export const resolveSkillInstallTargetDirectory = (
  agent: SupportedSkillInstallAgent,
  environment: NodeJS.ProcessEnv,
  targetDirectory?: string,
) => {
  if (targetDirectory !== undefined && targetDirectory !== "") {
    return resolve(targetDirectory);
  }

  return skillInstallTargetDirectoryResolvers[agent](environment);
};
