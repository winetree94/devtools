import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { supportedSkillInstallAgents } from "#app/services/skills/agents.ts";
import {
  createSkillInstaller,
  formatSkillInstallResult,
  runInstallSkillsCommand,
  SkillInstallError,
} from "#app/services/skills/install.ts";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "devtools-skill-test-"));

  temporaryDirectories.push(directory);

  return directory;
};

const createSkillDirectory = async (skillsDirectory: string, name: string) => {
  const skillDirectory = join(skillsDirectory, name);

  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${name} description.`,
      "---",
      "",
      `# ${name}`,
      "",
      "```bash",
      `devtools ${name}`,
      "```",
      "",
    ].join("\n"),
  );

  return skillDirectory;
};

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();

    if (directory !== undefined) {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

describe("formatSkillInstallResult", () => {
  it("formats a readable installation summary", () => {
    const output = formatSkillInstallResult({
      agent: "common",
      dryRun: false,
      skillsDirectory: "/repo/skills",
      targetDirectory: "/home/example/.agents/skills",
      installedSkills: [
        {
          name: "web-research",
          sourcePath: "/repo/skills/web-research",
          targetPath: "/home/example/.agents/skills/web-research",
          status: "installed",
        },
      ],
    });

    expect(output).toContain("Installed 1 skills for common.");
    expect(output).toContain("Summary: 1 installed, 0 replaced, 0 skipped.");
    expect(output).toContain("- web-research: installed ->");
  });

  it("formats a dry-run summary", () => {
    const output = formatSkillInstallResult({
      agent: "common",
      dryRun: true,
      skillsDirectory: "/repo/skills",
      targetDirectory: "/home/example/.agents/skills",
      installedSkills: [
        {
          name: "web-research",
          sourcePath: "/repo/skills/web-research",
          targetPath: "/home/example/.agents/skills/web-research",
          status: "would-install",
        },
      ],
    });

    expect(output).toContain("Dry run for common: 1 skills evaluated.");
    expect(output).toContain(
      "Summary: 1 would install, 0 would replace, 0 skipped.",
    );
    expect(output).toContain("No filesystem changes were made.");
  });
});

describe("runInstallSkillsCommand", () => {
  it("maps validated input to the installer and formats the result", async () => {
    const requests: Array<{
      agent: (typeof supportedSkillInstallAgents)[number];
      dryRun: boolean;
      force: boolean;
      targetDirectory?: string;
    }> = [];

    const output = await runInstallSkillsCommand(
      {
        agent: "common",
        options: {
          dryRun: true,
          force: true,
          targetDir: "/tmp/common-skills",
        },
      },
      {
        skillInstaller: {
          install: async (request) => {
            requests.push(request);

            return {
              agent: request.agent,
              dryRun: request.dryRun,
              skillsDirectory: "/repo/skills",
              targetDirectory: request.targetDirectory ?? "/tmp/common-skills",
              installedSkills: [
                {
                  name: "web-research",
                  sourcePath: "/repo/skills/web-research",
                  targetPath: "/tmp/common-skills/web-research",
                  status: request.dryRun ? "would-install" : "installed",
                },
              ],
            };
          },
        },
      },
    );

    expect(output).toContain("Dry run for common: 1 skills evaluated.");
    expect(requests).toEqual([
      {
        agent: "common",
        dryRun: true,
        force: true,
        targetDirectory: "/tmp/common-skills",
      },
    ]);
  });
});

describe("createSkillInstaller", () => {
  it.each(
    supportedSkillInstallAgents,
  )("installs discovered %s skills as directory copies", async (agent) => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");

    await createSkillDirectory(skillsDirectory, "web-research");

    const installer = createSkillInstaller({ skillsDirectory });
    const result = await installer.install({
      agent,
      dryRun: false,
      force: false,
      targetDirectory,
    });

    expect(result.installedSkills.map((skill) => skill.name)).toEqual([
      "web-research",
    ]);
    expect(result.installedSkills.map((skill) => skill.status)).toEqual([
      "installed",
    ]);

    const installedPath = join(targetDirectory, "web-research");
    const installedStats = await lstat(installedPath);

    expect(installedStats.isDirectory()).toBe(true);
    expect(installedStats.isSymbolicLink()).toBe(false);
    expect(await readFile(join(installedPath, "SKILL.md"), "utf8")).toContain(
      "name: web-research",
    );
  });

  it.each(
    supportedSkillInstallAgents,
  )("supports dry-run %s installation without creating files", async (agent) => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");

    await createSkillDirectory(skillsDirectory, "web-research");

    const installer = createSkillInstaller({ skillsDirectory });
    const result = await installer.install({
      agent,
      dryRun: true,
      force: false,
      targetDirectory,
    });

    expect(result.installedSkills).toEqual([
      {
        name: "web-research",
        sourcePath: join(skillsDirectory, "web-research"),
        targetPath: join(targetDirectory, "web-research"),
        status: "would-install",
      },
    ]);

    await expect(lstat(targetDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("skips skills that are already installed as a directory copy", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");
    const skillDirectory = await createSkillDirectory(
      skillsDirectory,
      "web-research",
    );

    await mkdir(join(targetDirectory, "web-research"), { recursive: true });
    await writeFile(
      join(targetDirectory, "web-research", "SKILL.md"),
      "existing SKILL.md",
    );

    const installer = createSkillInstaller({ skillsDirectory });
    const result = await installer.install({
      agent: "common",
      dryRun: false,
      force: false,
      targetDirectory,
    });

    expect(result.installedSkills).toEqual([
      {
        name: "web-research",
        sourcePath: skillDirectory,
        targetPath: join(targetDirectory, "web-research"),
        status: "skipped",
      },
    ]);
  });

  it("returns would-replace in dry-run mode when force is enabled", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const replacementSkillsDirectory = join(workspaceDirectory, "replacement");
    const targetDirectory = join(workspaceDirectory, "target");
    const originalSkillDirectory = await createSkillDirectory(
      replacementSkillsDirectory,
      "web-research",
    );

    await createSkillDirectory(skillsDirectory, "web-research");
    await mkdir(targetDirectory, { recursive: true });
    await symlink(
      originalSkillDirectory,
      join(targetDirectory, "web-research"),
      "dir",
    );

    const installer = createSkillInstaller({ skillsDirectory });
    const result = await installer.install({
      agent: "common",
      dryRun: true,
      force: true,
      targetDirectory,
    });

    expect(result.installedSkills[0]).toMatchObject({
      name: "web-research",
      status: "would-replace",
    });
    const existingStats = await lstat(join(targetDirectory, "web-research"));
    expect(existingStats.isSymbolicLink()).toBe(true);
  });

  it("replaces existing targets when force is enabled", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const replacementSkillsDirectory = join(workspaceDirectory, "replacement");
    const targetDirectory = join(workspaceDirectory, "target");
    const _originalSkillDirectory = await createSkillDirectory(
      replacementSkillsDirectory,
      "web-research",
    );
    await createSkillDirectory(skillsDirectory, "web-research");

    await mkdir(targetDirectory, { recursive: true });
    await symlink(
      _originalSkillDirectory,
      join(targetDirectory, "web-research"),
      "dir",
    );

    const installer = createSkillInstaller({ skillsDirectory });
    const result = await installer.install({
      agent: "common",
      dryRun: false,
      force: true,
      targetDirectory,
    });

    expect(result.installedSkills[0]).toMatchObject({
      name: "web-research",
      status: "replaced",
    });

    const installedPath = join(targetDirectory, "web-research");
    const installedStats = await lstat(installedPath);

    expect(installedStats.isDirectory()).toBe(true);
    expect(installedStats.isSymbolicLink()).toBe(false);
    expect(await readFile(join(installedPath, "SKILL.md"), "utf8")).toContain(
      "name: web-research",
    );
  });

  it("throws when an existing target would be overwritten without force", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const skillsDirectory = join(workspaceDirectory, "skills");
    const targetDirectory = join(workspaceDirectory, "target");

    await createSkillDirectory(skillsDirectory, "web-research");
    await mkdir(join(targetDirectory, "web-research"), { recursive: true });

    const installer = createSkillInstaller({ skillsDirectory });

    await expect(
      installer.install({
        agent: "common",
        dryRun: false,
        force: false,
        targetDirectory,
      }),
    ).rejects.toThrowError(
      `Skill target already exists: ${join(targetDirectory, "web-research")}. Use --force to replace it.`,
    );
  });

  it("throws when the skills directory is missing or empty", async () => {
    const workspaceDirectory = await createTemporaryDirectory();
    const missingSkillsDirectory = join(workspaceDirectory, "missing-skills");
    const emptySkillsDirectory = join(workspaceDirectory, "empty-skills");

    await mkdir(emptySkillsDirectory, { recursive: true });

    await expect(
      createSkillInstaller({ skillsDirectory: missingSkillsDirectory }).install(
        {
          agent: "common",
          dryRun: false,
          force: false,
          targetDirectory: join(workspaceDirectory, "target-a"),
        },
      ),
    ).rejects.toBeInstanceOf(SkillInstallError);

    await expect(
      createSkillInstaller({ skillsDirectory: emptySkillsDirectory }).install({
        agent: "common",
        dryRun: false,
        force: false,
        targetDirectory: join(workspaceDirectory, "target-b"),
      }),
    ).rejects.toThrowError(
      `No installable skills found in ${emptySkillsDirectory}.`,
    );
  });
});
